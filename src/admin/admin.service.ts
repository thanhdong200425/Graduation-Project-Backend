import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  Admin,
  Prisma,
  UserActivityAction,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AdminChangePasswordDto } from './dto/admin-change-password.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminUpdateProfileDto } from './dto/admin-update-profile.dto';
import { AdminJwtPayload } from './interfaces/admin-jwt-payload.interface';
import { MailService } from '../mail/mail.service';
import {
  AdminAnalyticsOverviewDto,
  AdminDauChartDto,
  DauPointDto,
} from './dto/admin-analytics.dto';
import { startOfDay, startOfMonth, startOfWeek } from 'date-fns';

export const safeAdminSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AdminSelect;

export type SafeAdmin = Prisma.AdminGetPayload<{
  select: typeof safeAdminSelect;
}>;

const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async login(loginDto: AdminLoginDto) {
    const email = loginDto.email.trim().toLowerCase();
    const admin = await this.findByEmail(email);

    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      admin.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResponse(admin);
  }

  async findById(id: string): Promise<SafeAdmin | null> {
    return this.prisma.admin.findUnique({
      select: safeAdminSelect,
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({
      where: { email },
    });
  }

  private async buildAuthResponse(admin: Admin) {
    const payload: AdminJwtPayload = {
      sub: admin.id,
      email: admin.email,
      isAdmin: true,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      admin: this.toSafeAdmin(admin),
    };
  }

  toSafeAdmin(admin: Admin): SafeAdmin {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    };
  }

  async updateProfile(
    adminId: string,
    dto: AdminUpdateProfileDto,
  ): Promise<SafeAdmin> {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();

    const existing = await this.prisma.admin.findUnique({
      where: { email },
    });

    if (existing && existing.id !== adminId) {
      throw new ConflictException('An account with this email already exists');
    }

    return this.prisma.admin.update({
      where: { id: adminId },
      data: { email, name },
      select: safeAdminSelect,
    });
  }

  async changePassword(
    adminId: string,
    dto: AdminChangePasswordDto,
  ): Promise<void> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new NotFoundException('Administrator not found');
    }

    const isCurrentValid = await bcrypt.compare(
      dto.currentPassword,
      admin.passwordHash,
    );

    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      BCRYPT_SALT_ROUNDS,
    );

    await this.prisma.admin.update({
      where: { id: adminId },
      data: { passwordHash },
    });
  }

  /* ── User management ── */

  private readonly adminUserSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { studentSubmissions: true } },
  } satisfies Prisma.UserSelect;

  async findAllUsers() {
    return this.prisma.user.findMany({
      select: this.adminUserSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async suspendUser(id: string) {
    await this.ensureUserExists(id);
    return this.prisma.user.update({
      select: this.adminUserSelect,
      where: { id },
      data: { status: UserStatus.SUSPENDED },
    });
  }

  async activateUser(id: string) {
    await this.ensureUserExists(id);
    return this.prisma.user.update({
      select: this.adminUserSelect,
      where: { id },
      data: { status: UserStatus.ACTIVE },
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.ensureUserExists(id);
    await this.prisma.user.delete({ where: { id } });
  }

  async sendPasswordResetLink(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.passwordResetToken.create({
      data: { token, userId, expiresAt },
    });

    const frontendUrl =
      this.configService.getOrThrow<string>('FRONTEND_URL') ??
      'http://localhost:5173';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;
    await this.mailService.sendPasswordResetEmail(
      user.email,
      user.name,
      resetLink,
    );

    return { message: 'Reset link sent' };
  }

  private async ensureUserExists(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
  }

  /* ── Analytics ── */

  async getAnalyticsOverview(): Promise<AdminAnalyticsOverviewDto> {
    const todayUTC = startOfDay(new Date());
    const weekStart = startOfWeek(todayUTC);
    const monthStart = startOfMonth(todayUTC);

    const [
      totalUsers,
      teachers,
      students,
      dauGroups,
      examToday,
      examThisWeek,
      examThisMonth,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: UserRole.TEACHER } }),
      this.prisma.user.count({ where: { role: UserRole.STUDENT } }),
      this.prisma.userActivity.groupBy({
        by: ['userId'],
        where: {
          action: UserActivityAction.LOGIN,
          createdAt: { gte: todayUTC },
        },
      }),
      this.prisma.exam.count({ where: { createdAt: { gte: todayUTC } } }),
      this.prisma.exam.count({ where: { createdAt: { gte: weekStart } } }),
      this.prisma.exam.count({ where: { createdAt: { gte: monthStart } } }),
    ]);

    return {
      totalUsers,
      teachers,
      students,
      dau: dauGroups.length,
      examToday,
      examThisWeek,
      examThisMonth,
    };
  }

  async getDauChart(range: '7d' | '30d' | '90d'): Promise<AdminDauChartDto> {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const now = new Date();
    const todayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const rangeStart = new Date(
      todayUTC.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
    );

    const activities = await this.prisma.userActivity.findMany({
      where: {
        action: UserActivityAction.LOGIN,
        createdAt: { gte: rangeStart },
      },
      select: { userId: true, createdAt: true },
    });

    const byDay = new Map<string, Set<string>>();
    for (const a of activities) {
      const dayKey = a.createdAt.toISOString().slice(0, 10);
      if (!byDay.has(dayKey)) byDay.set(dayKey, new Set());
      byDay.get(dayKey)!.add(a.userId);
    }

    const data: DauPointDto[] = Array.from({ length: days }, (_, i) => {
      const d = new Date(rangeStart.getTime() + i * 24 * 60 * 60 * 1000);
      const dayKey = d.toISOString().slice(0, 10);
      return { date: dayKey, value: byDay.get(dayKey)?.size ?? 0 };
    });

    return { data };
  }
}

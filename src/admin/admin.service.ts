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
import { AdminAnalyticsQueryDto } from './dto/admin-analytics-query.dto';

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

  private resolveAnalyticsMonth(query: AdminAnalyticsQueryDto): {
    year: number;
    month: number;
    monthStart: Date;
    monthEndExclusive: Date;
    daysInMonth: number;
    elapsedDays: number;
  } {
    const now = new Date();
    const year = query.year ?? now.getUTCFullYear();
    const month = query.month ?? now.getUTCMonth() + 1;

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    if (monthStart > currentMonthStart) {
      throw new BadRequestException('Cannot query analytics for future months');
    }

    const monthEndExclusive = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const isCurrentMonth =
      year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
    const elapsedDays = isCurrentMonth ? now.getUTCDate() : daysInMonth;

    return {
      year,
      month,
      monthStart,
      monthEndExclusive,
      daysInMonth,
      elapsedDays,
    };
  }

  private buildDailyDauPoints(
    activities: { userId: string; createdAt: Date }[],
    monthStart: Date,
    daysInMonth: number,
  ): DauPointDto[] {
    const byDay = new Map<string, Set<string>>();
    for (const activity of activities) {
      const dayKey = activity.createdAt.toISOString().slice(0, 10);
      if (!byDay.has(dayKey)) byDay.set(dayKey, new Set());
      byDay.get(dayKey)!.add(activity.userId);
    }

    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = new Date(monthStart.getTime() + i * 24 * 60 * 60 * 1000);
      const dayKey = day.toISOString().slice(0, 10);
      return { date: dayKey, value: byDay.get(dayKey)?.size ?? 0 };
    });
  }

  private averageDau(points: DauPointDto[], elapsedDays: number): number {
    if (elapsedDays <= 0) return 0;
    const total = points
      .slice(0, elapsedDays)
      .reduce((sum, point) => sum + point.value, 0);
    return Math.round((total / elapsedDays) * 10) / 10;
  }

  async getAnalyticsOverview(
    query: AdminAnalyticsQueryDto,
  ): Promise<AdminAnalyticsOverviewDto> {
    const { monthStart, monthEndExclusive, daysInMonth, elapsedDays } =
      this.resolveAnalyticsMonth(query);
    const createdInMonth = {
      createdAt: { gte: monthStart, lt: monthEndExclusive },
    };

    const submittedInMonth = {
      submittedAt: { gte: monthStart, lt: monthEndExclusive },
    };

    const [
      totalUsers,
      teachers,
      students,
      examCount,
      sessionCount,
      submissionCount,
      loginActivities,
    ] = await Promise.all([
      this.prisma.user.count({ where: createdInMonth }),
      this.prisma.user.count({
        where: { ...createdInMonth, role: UserRole.TEACHER },
      }),
      this.prisma.user.count({
        where: { ...createdInMonth, role: UserRole.STUDENT },
      }),
      this.prisma.exam.count({ where: createdInMonth }),
      this.prisma.examSession.count({ where: createdInMonth }),
      this.prisma.submission.count({ where: submittedInMonth }),
      this.prisma.userActivity.findMany({
        where: {
          action: UserActivityAction.LOGIN,
          createdAt: { gte: monthStart, lt: monthEndExclusive },
        },
        select: { userId: true, createdAt: true },
      }),
    ]);

    const dailyPoints = this.buildDailyDauPoints(
      loginActivities,
      monthStart,
      daysInMonth,
    );

    return {
      totalUsers,
      teachers,
      students,
      dau: this.averageDau(dailyPoints, elapsedDays),
      examCount,
      sessionCount,
      submissionCount,
    };
  }

  async getDauChart(query: AdminAnalyticsQueryDto): Promise<AdminDauChartDto> {
    const { monthStart, monthEndExclusive, daysInMonth } =
      this.resolveAnalyticsMonth(query);

    const activities = await this.prisma.userActivity.findMany({
      where: {
        action: UserActivityAction.LOGIN,
        createdAt: { gte: monthStart, lt: monthEndExclusive },
      },
      select: { userId: true, createdAt: true },
    });

    return {
      data: this.buildDailyDauPoints(activities, monthStart, daysInMonth),
    };
  }
}

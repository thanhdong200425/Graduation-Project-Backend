import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Admin, Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminJwtPayload } from './interfaces/admin-jwt-payload.interface';
import { MailService } from '../mail/mail.service';

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
}

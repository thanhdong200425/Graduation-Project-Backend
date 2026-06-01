import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Admin, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminJwtPayload } from './interfaces/admin-jwt-payload.interface';

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
}

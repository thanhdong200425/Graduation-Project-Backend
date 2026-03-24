import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';

export const safeUserSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{
  select: typeof safeUserSelect;
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  async findAll(): Promise<SafeUser[]> {
    return this.prisma.user.findMany({
      select: safeUserSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string): Promise<SafeUser | null> {
    return this.prisma.user.findUnique({
      select: safeUserSelect,
      where: { id },
    });
  }

  async findSafeById(id: string): Promise<SafeUser | null> {
    return this.findOne(id);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<SafeUser> {
    return this.prisma.user.update({
      select: safeUserSelect,
      where: { id },
      data,
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.user.delete({
      where: { id },
    });
  }

  toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

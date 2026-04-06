import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Subject } from '@prisma/client';

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Subject[]> {
    return this.prisma.subject.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string): Promise<Subject | null> {
    return this.prisma.subject.findUnique({
      where: { id },
    });
  }
}

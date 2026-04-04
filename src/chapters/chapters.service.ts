import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Chapter } from '@prisma/client';

@Injectable()
export class ChaptersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Chapter[]> {
    return this.prisma.chapter.findMany({
      orderBy: { orderIndex: 'asc' },
    });
  }

  async findBySubject(subjectId: string): Promise<Chapter[]> {
    return this.prisma.chapter.findMany({
      where: { subjectId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async findOne(id: string): Promise<Chapter | null> {
    return this.prisma.chapter.findUnique({
      where: { id },
    });
  }
}

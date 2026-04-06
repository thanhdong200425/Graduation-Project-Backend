import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeneratedQuestion, Prisma } from '@prisma/client';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.GeneratedQuestionCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<GeneratedQuestion> {
    const prisma = tx || this.prisma;
    return prisma.generatedQuestion.create({
      data,
    });
  }

  async findAll(): Promise<GeneratedQuestion[]> {
    return this.prisma.generatedQuestion.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByChapter(chapterId: string): Promise<GeneratedQuestion[]> {
    return this.prisma.generatedQuestion.findMany({
      where: { chapterId },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string): Promise<GeneratedQuestion | null> {
    return this.prisma.generatedQuestion.findUnique({
      where: { id },
    });
  }

  async update(id: string, data: Prisma.GeneratedQuestionUpdateInput): Promise<GeneratedQuestion> {
    return this.prisma.generatedQuestion.update({
      where: { id },
      data,
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.generatedQuestion.delete({
      where: { id },
    });
  }
}

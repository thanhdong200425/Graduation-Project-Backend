import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Question, Prisma } from '@prisma/client';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.QuestionCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Question> {
    const prisma = tx || this.prisma;
    return prisma.question.create({
      data,
    });
  }

  async findAll(): Promise<Question[]> {
    return this.prisma.question.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByChapter(chapterId: string): Promise<Question[]> {
    return this.prisma.question.findMany({
      where: { chapterId },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string): Promise<Question | null> {
    return this.prisma.question.findUnique({
      where: { id },
    });
  }

  async update(
    id: string,
    data: Prisma.QuestionUpdateInput,
  ): Promise<Question> {
    return this.prisma.question.update({
      where: { id },
      data,
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.question.delete({
      where: { id },
    });
  }
}

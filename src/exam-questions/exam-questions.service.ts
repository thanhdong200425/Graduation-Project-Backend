import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExamQuestion, Prisma } from '@prisma/client';

@Injectable()
export class ExamQuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.ExamQuestionCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ExamQuestion> {
    const prisma = tx || this.prisma;
    return prisma.examQuestion.create({
      data,
    });
  }

  async findByExam(examId: string): Promise<ExamQuestion[]> {
    return this.prisma.examQuestion.findMany({
      where: { examId },
      include: {
        question: true,
      },
      orderBy: {
        orderIndex: 'asc',
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.examQuestion.delete({
      where: { id },
    });
  }

  /**
   * Remove all questions from an exam.
   */
  async removeByExam(examId: string): Promise<void> {
    await this.prisma.examQuestion.deleteMany({
      where: { examId },
    });
  }
}

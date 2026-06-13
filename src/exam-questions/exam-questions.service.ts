import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExamItem, Prisma } from '@prisma/client';

@Injectable()
export class ExamItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.ExamItemCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ExamItem> {
    const prisma = tx || this.prisma;
    return prisma.examItem.create({
      data,
    });
  }

  async findByExam(examId: string): Promise<ExamItem[]> {
    return this.prisma.examItem.findMany({
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
    await this.prisma.examItem.delete({
      where: { id },
    });
  }

  /**
   * Remove all questions from an exam.
   */
  async removeByExam(examId: string): Promise<void> {
    await this.prisma.examItem.deleteMany({
      where: { examId },
    });
  }

  /**
   * Persist a new question order for an exam by writing each ExamItem's
   * `orderIndex` to match its position in `orderedItemIds`.
   */
  async reorder(examId: string, orderedItemIds: string[]): Promise<ExamItem[]> {
    await this.prisma.$transaction(
      orderedItemIds.map((id, index) =>
        this.prisma.examItem.update({
          where: { id },
          data: { orderIndex: index },
        }),
      ),
    );
    return this.findByExam(examId);
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Exam, Prisma } from '@prisma/client';
import { QuestionsService } from '../questions/questions.service';
import { ExamQuestionsService } from '../exam-questions/exam-questions.service';
import { SaveCompleteExamDto } from './dto/save-complete-exam.dto';

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionsService: QuestionsService,
    private readonly examQuestionsService: ExamQuestionsService,
  ) {}

  async create(data: Prisma.ExamCreateInput): Promise<Exam> {
    return this.prisma.exam.create({
      data,
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async createComplete(dto: SaveCompleteExamDto): Promise<Exam> {
    const { questions, subjectId, chapterId, ...examMeta } = dto;

    return this.prisma.$transaction(async (tx) => {
      // 1. Create Exam record
      const exam = await tx.exam.create({
        data: {
          title: examMeta.title,
          totalQuestions: examMeta.totalQuestions,
          difficultyEasy: examMeta.difficultyEasy,
          difficultyMedium: examMeta.difficultyMedium,
          difficultyHard: examMeta.difficultyHard,
          ...(subjectId ? { subject: { connect: { id: subjectId } } } : {}),
          ...(chapterId ? { chapter: { connect: { id: chapterId } } } : {}),
        },
      });

      // 2. Process each question
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];

        // 2a. Create GeneratedQuestion using QuestionsService
        const question = await this.questionsService.create(
          {
            question: q.question,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            correctAnswer: q.correctAnswer,
            difficulty: q.difficulty || 'MEDIUM',
            ...(chapterId ? { chapter: { connect: { id: chapterId } } } : {}),
            status: 'APPROVED',
          },
          tx,
        );

        // 2b. Link Question to Exam via ExamQuestionsService
        await this.examQuestionsService.create(
          {
            exam: { connect: { id: exam.id } },
            question: { connect: { id: question.id } },
            orderIndex: i + 1,
          },
          tx,
        );
      }

      return tx.exam.findUnique({
        where: { id: exam.id },
        include: {
          examQuestions: {
            include: {
              question: true,
            },
          },
        },
      });
    }) as unknown as Exam;
  }

  async findAll() {
    return this.prisma.exam.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        subject: true,
      },
    });
  }

  async findOne(id: string): Promise<Exam | null> {
    return this.prisma.exam.findUnique({
      where: { id },
      include: {
        examQuestions: {
          include: {
            question: true,
          },
        },
      },
    });
  }

  async update(id: string, data: Prisma.ExamUpdateInput): Promise<Exam> {
    return this.prisma.exam.update({
      where: { id },
      data,
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.exam.delete({
      where: { id },
    });
  }
}

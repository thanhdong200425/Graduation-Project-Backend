import { Injectable, ConflictException, NotFoundException, GoneException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExamSessionDto } from './dto/create-exam-session.dto';
import { SubmitExamDto } from './dto/submit-exam.dto';
import type {
  AnalyticsOverviewResponseDto,
  QuestionAccuracyDto,
  SessionAnalyticsDetailDto,
  SessionAnalyticsSummaryDto,
  SessionSubmissionAnalyticsDto,
  SubmissionAnswerDto,
} from './dto/session-analytics.dto';

type SubmissionWithScore = {
  submittedAt: Date | null;
  score: number | null;
};

function computeSubmissionStats(submissions: SubmissionWithScore[]) {
  const startedCount = submissions.length;
  const submitted = submissions.filter((s) => s.submittedAt != null && s.score != null);
  const submittedCount = submitted.length;
  const scores = submitted.map((s) => s.score as number);

  if (scores.length === 0) {
    return {
      startedCount,
      submittedCount,
      avgScore: null as number | null,
      minScore: null as number | null,
      maxScore: null as number | null,
    };
  }

  const sum = scores.reduce((a, b) => a + b, 0);
  return {
    startedCount,
    submittedCount,
    avgScore: Math.round((sum / scores.length) * 10) / 10,
    minScore: Math.min(...scores),
    maxScore: Math.max(...scores),
  };
}

@Injectable()
export class ExamSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(teacherId: string, dto: CreateExamSessionDto) {
    const { examId, timeLimitMins, showAnswers, startsAt, endsAt } = dto;

    // 1. Check if exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    // 2. Handle invite code
    let inviteCode = dto.inviteCode;
    
    if (inviteCode) {
      // Check if provided code is unique
      const existing = await this.prisma.examSession.findUnique({
        where: { inviteCode },
      });
      if (existing) {
        throw new ConflictException('Invite code already exists');
      }
    } else {
      // Generate unique invite code
      let exists = true;
      let attempts = 0;
      
      while (exists && attempts < 10) {
        inviteCode = `EXAM-${Math.floor(1000 + Math.random() * 9000)}`;
        const existing = await this.prisma.examSession.findUnique({
          where: { inviteCode },
        });
        if (!existing) {
          exists = false;
        }
        attempts++;
      }

      if (exists) {
        throw new ConflictException('Could not generate a unique invite code');
      }
    }

    const publicLink = `http://localhost:5173/join/${inviteCode}`;

    return this.prisma.examSession.create({
      data: {
        examId,
        teacherId,
        inviteCode: inviteCode!,
        publicLink,
        timeLimitMins,
        showAnswers: showAnswers ?? false,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        status: 'ACTIVE',
      },
    });
  }

  async generateUniqueCode() {
    let inviteCode = '';
    let exists = true;
    let attempts = 0;
    
    while (exists && attempts < 10) {
      inviteCode = `EXAM-${Math.floor(1000 + Math.random() * 9000)}`;
      const existing = await this.prisma.examSession.findUnique({
        where: { inviteCode },
      });
      if (!existing) {
        exists = false;
      }
      attempts++;
    }

    if (exists) {
      throw new ConflictException('Could not generate a unique invite code');
    }

    return { inviteCode };
  }

  async findByCode(inviteCode: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { inviteCode },
      include: {
        exam: {
          include: {
            subject: true,
            examItems: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return {
      id: session.id,
      inviteCode: session.inviteCode,
      status: session.status,
      timeLimitMins: session.timeLimitMins,
      examTitle: session.exam.title,
      subjectName: session.exam.subject?.name,
      grade: session.exam.subject?.grade,
      questionCount: session.exam.examItems.length,
    };
  }

  async start(sessionId: string, studentId: string) {
    // 1. Find session
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        exam: {
          include: {
            examItems: {
              include: {
                question: true,
              },
              orderBy: {
                orderIndex: 'asc',
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // 2. Check if session is ACTIVE
    if (session.status !== 'ACTIVE') {
      throw new GoneException('Session is not active');
    }

    // 3. Check if already started/submitted
    const existingSubmission = await this.prisma.submission.findUnique({
      where: {
        sessionId_studentId: {
          sessionId,
          studentId,
        },
      },
    });

    if (existingSubmission) {
      throw new ConflictException('You have already started or submitted this exam');
    }

    // 4. Create submission
    const totalQuestions = session.exam.examItems.length;
    
    const submission = await this.prisma.submission.create({
      data: {
        sessionId,
        studentId,
        totalQuestions,
        startedAt: new Date(),
      },
    });

    // 5. Return questions WITHOUT correct answers
    const questions = session.exam.examItems.map((item) => ({
      questionId: item.question.id,
      text: item.question.name, // The field is called 'name' in schema for the question text!
      options: [
        item.question.optionA,
        item.question.optionB,
        item.question.optionC,
        item.question.optionD,
      ],
      order: item.orderIndex,
    }));

    return {
      submissionId: submission.id,
      startedAt: submission.startedAt,
      timeLimitMins: session.timeLimitMins,
      questions,
    };
  }

  async submit(sessionId: string, studentId: string, dto: SubmitExamDto) {
    // 1. Find the submission
    const submission = await this.prisma.submission.findUnique({
      where: {
        sessionId_studentId: {
          sessionId,
          studentId,
        },
      },
      include: {
        session: {
          include: {
            exam: {
              include: {
                examItems: {
                  include: {
                    question: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found or you have not started the exam');
    }

    if (submission.submittedAt) {
      throw new ConflictException('You have already submitted this exam');
    }

    // 2. Grading Logic
    let totalCorrect = 0;
    const examItems = submission.session.exam.examItems;
    const totalQuestions = examItems.length;

    const answerDetails: Array<{
      questionId: string;
      selectedOption: number;
      isCorrect: boolean;
    }> = [];
    const optionMap = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };

    console.log(`[Grade] Bắt đầu chấm bài cho học sinh ${studentId} trong phiên ${sessionId}`);
    console.log(`[Grade] Tổng số câu hỏi trong đề: ${totalQuestions}`);
    console.log(`[Grade] Danh sách đáp án học sinh gửi lên:`, dto.answers);

    for (const item of examItems) {
      const studentAnswer = dto.answers.find(
        (a) => a.questionId === item.question.id,
      );
      
      const selectedOptionStr = studentAnswer ? studentAnswer.selectedOption : null;
      const selectedOptionInt = selectedOptionStr ? optionMap[selectedOptionStr] : -1;
      
      const correctOptionStr = item.question.correctAnswer;
      const correctOptionInt = optionMap[correctOptionStr];
      
      const isCorrect = selectedOptionStr === correctOptionStr;
      
      console.log(`[Grade] Câu hỏi ID: ${item.question.id.substring(0, 8)}...`);
      console.log(`  - Học sinh chọn: ${selectedOptionStr} (${selectedOptionInt})`);
      console.log(`  - Đáp án đúng: ${correctOptionStr} (${correctOptionInt})`);
      console.log(`  - Kết quả: ${isCorrect ? "ĐÚNG" : "SAI"}`);
      
      if (isCorrect) {
        totalCorrect++;
      }
      
      answerDetails.push({
        questionId: item.question.id,
        selectedOption: selectedOptionInt,
        isCorrect,
      });
    }

    const score = (totalCorrect / totalQuestions) * 10;
    const now = new Date();
    const timeTakenSeconds = Math.floor((now.getTime() - submission.startedAt.getTime()) / 1000);
    
    console.log(`[Grade] Kết quả cuối cùng:`);
    console.log(`  - Số câu đúng: ${totalCorrect}`);
    console.log(`  - Số câu sai: ${totalQuestions - totalCorrect}`);
    console.log(`  - Điểm số: ${score}/10`);
    console.log(`  - Thời gian làm bài: ${timeTakenSeconds} giây`);

    // 3. Save results
    await this.prisma.$transaction(async (tx) => {
      // Update submission
      await tx.submission.update({
        where: { id: submission.id },
        data: {
          submittedAt: now,
          score,
          totalCorrect,
          isAutoSubmit: dto.isAutoSubmit || false,
        },
      });

      // Create answer details
      for (const detail of answerDetails) {
        await tx.answerDetail.create({
          data: {
            submissionId: submission.id,
            questionId: detail.questionId,
            selectedOption: detail.selectedOption,
            isCorrect: detail.isCorrect,
          },
        });
      }
    });

    // 4. Return result
    console.log(`[Grade] showAnswers of session: ${submission.session.showAnswers}`);
    
    if (submission.session.showAnswers) {
      return {
        score,
        totalCorrect,
        totalQuestions,
        timeTakenSeconds,
        questions: examItems.map((item) => {
          const detail = answerDetails.find((d) => d.questionId === item.question.id);
          return {
            questionId: item.question.id,
            text: item.question.name,
            options: [
              item.question.optionA,
              item.question.optionB,
              item.question.optionC,
              item.question.optionD,
            ],
            selectedOption: detail ? detail.selectedOption : -1,
            correctOption: optionMap[item.question.correctAnswer],
            explanation: item.question.explanation,
            isCorrect: detail ? detail.isCorrect : false,
          };
        }),
      };
    } else {
      return {
        score,
        totalCorrect,
        totalQuestions,
        timeTakenSeconds,
        questions: examItems.map((item) => {
          const detail = answerDetails.find((d) => d.questionId === item.question.id);
          return {
            questionId: item.question.id,
            text: item.question.name,
            options: [
              item.question.optionA,
              item.question.optionB,
              item.question.optionC,
              item.question.optionD,
            ],
            selectedOption: detail ? detail.selectedOption : -1,
            correctOption: -1, // Ẩn đáp án đúng
            explanation: null, // Ẩn giải thích
            isCorrect: detail ? detail.isCorrect : false, // Vẫn cho biết câu đó đúng hay sai
          };
        }),
      };
    }
  }

  async getAnalyticsOverview(teacherId: string): Promise<AnalyticsOverviewResponseDto> {
    const sessions = await this.prisma.examSession.findMany({
      where: { teacherId },
      include: {
        exam: {
          include: {
            subject: true,
            examItems: true,
          },
        },
        submissions: {
          select: {
            submittedAt: true,
            score: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sessionSummaries: SessionAnalyticsSummaryDto[] = sessions.map((session) => {
      const stats = computeSubmissionStats(session.submissions);
      return {
        sessionId: session.id,
        examId: session.examId,
        title: session.exam.title,
        subjectName: session.exam.subject?.name ?? null,
        grade: session.exam.subject?.grade ?? null,
        questionCount: session.exam.examItems.length,
        inviteCode: session.inviteCode,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
        ...stats,
      };
    });

    const allSubmissions = sessions.flatMap((s) => s.submissions);
    const totalsStats = computeSubmissionStats(allSubmissions);

    return {
      sessions: sessionSummaries,
      totals: {
        submittedCount: totalsStats.submittedCount,
        startedCount: totalsStats.startedCount,
        avgScore: totalsStats.avgScore,
        sessionCount: sessions.length,
      },
    };
  }

  async getSessionAnalytics(
    sessionId: string,
    teacherId: string,
  ): Promise<SessionAnalyticsDetailDto> {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, teacherId },
      include: {
        exam: {
          include: {
            subject: true,
            examItems: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        submissions: {
          include: {
            student: { select: { id: true, name: true } },
            answerDetails: true,
          },
          orderBy: { startedAt: 'desc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const now = Date.now();
    const examItems = session.exam.examItems;

    const submittedSubmissions = session.submissions.filter((s) => s.submittedAt != null);

    const questionAccuracy: QuestionAccuracyDto[] = examItems.map((item) => {
      if (submittedSubmissions.length === 0) {
        return {
          orderIndex: item.orderIndex,
          questionId: item.questionId,
          correctRate: 0,
        };
      }

      let correctCount = 0;
      for (const sub of submittedSubmissions) {
        const detail = sub.answerDetails.find((d) => d.questionId === item.questionId);
        if (detail?.isCorrect) {
          correctCount++;
        }
      }

      return {
        orderIndex: item.orderIndex,
        questionId: item.questionId,
        correctRate: correctCount / submittedSubmissions.length,
      };
    });

    const submissions: SessionSubmissionAnalyticsDto[] = session.submissions.map((sub) => {
      const endMs = sub.submittedAt ? sub.submittedAt.getTime() : now;
      const timeSecs = Math.floor((endMs - sub.startedAt.getTime()) / 1000);

      let answers: SubmissionAnswerDto[] = [];
      if (sub.submittedAt) {
        answers = examItems.map((item) => {
          const detail = sub.answerDetails.find((d) => d.questionId === item.questionId);
          return {
            orderIndex: item.orderIndex,
            questionId: item.questionId,
            isCorrect: detail?.isCorrect ?? false,
          };
        });
      }

      return {
        id: sub.id,
        studentId: sub.studentId,
        studentName: sub.student.name,
        score: sub.score,
        totalCorrect: sub.totalCorrect,
        totalQuestions: sub.totalQuestions,
        startedAt: sub.startedAt.toISOString(),
        submittedAt: sub.submittedAt?.toISOString() ?? null,
        timeSecs,
        answers,
      };
    });

    const stats = computeSubmissionStats(session.submissions);

    return {
      sessionId: session.id,
      examId: session.examId,
      title: session.exam.title,
      subjectName: session.exam.subject?.name ?? null,
      grade: session.exam.subject?.grade ?? null,
      questionCount: examItems.length,
      inviteCode: session.inviteCode,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      ...stats,
      submissions,
      questionAccuracy,
    };
  }
}

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
import type {
  TeacherDashboardActivityPointDto,
  TeacherDashboardDeltaDir,
  TeacherDashboardExamStatus,
  TeacherDashboardResponseDto,
  TeacherDashboardStatDto,
} from './dto/teacher-dashboard.dto';

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

const SUBJECT_PALETTE = [
  '#0485F7',
  '#7C3AED',
  '#00BC7D',
  '#F59E0B',
  '#EF4444',
  '#06B6D4',
  '#8B5CF6',
  '#EC4899',
];

function subjectColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SUBJECT_PALETTE[Math.abs(hash) % SUBJECT_PALETTE.length];
}

function formatRelativeTime(date: Date, now = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function bucketSparkline(
  dates: Date[],
  bucketCount = 8,
  now = new Date(),
): number[] {
  if (dates.length === 0) {
    return Array.from({ length: bucketCount }, () => 0);
  }

  const dayMs = 86_400_000;
  const oldest = dates.reduce(
    (min, d) => (d.getTime() < min ? d.getTime() : min),
    dates[0].getTime(),
  );
  const spanDays = Math.max(
    1,
    Math.ceil((now.getTime() - oldest) / dayMs),
  );
  const bucketDays = Math.max(1, Math.ceil(spanDays / bucketCount));

  return Array.from({ length: bucketCount }, (_, i) => {
    const bucketEnd = now.getTime() - i * bucketDays * dayMs;
    const bucketStart = bucketEnd - bucketDays * dayMs;
    return dates.filter((d) => {
      const t = d.getTime();
      return t >= bucketStart && t < bucketEnd;
    }).length;
  }).reverse();
}

function computeDelta(
  current: number,
  previous: number,
): { delta: string; deltaDir: TeacherDashboardDeltaDir } {
  const diff = current - previous;
  if (diff === 0) {
    return { delta: 'No change', deltaDir: 'flat' };
  }
  if (diff > 0) {
    return { delta: `+${diff} this period`, deltaDir: 'up' };
  }
  return { delta: `${diff} this period`, deltaDir: 'down' };
}

function formatActivityAxisLabel(date: Date, range: '7d' | '30d' | '90d'): string {
  const monthDay = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  if (range === '7d') {
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `${weekday} ${monthDay}`;
  }

  return monthDay;
}

function buildActivitySeries(
  dates: Date[],
  range: '7d' | '30d' | '90d',
  now = new Date(),
): TeacherDashboardActivityPointDto[] {
  const dayMs = 86_400_000;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const from = new Date(now.getTime() - days * dayMs);

  const inRange = dates.filter((d) => d.getTime() >= from.getTime());

  if (range === '7d') {
    return Array.from({ length: 7 }, (_, i) => {
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - (6 - i));
      const dayEnd = new Date(dayStart.getTime() + dayMs);
      const value = inRange.filter(
        (d) => d.getTime() >= dayStart.getTime() && d.getTime() < dayEnd.getTime(),
      ).length;
      return {
        label: formatActivityAxisLabel(dayStart, '7d'),
        value,
      };
    });
  }

  const pointCount = range === '30d' ? 30 : 90;
  return Array.from({ length: pointCount }, (_, i) => {
    const dayStart = new Date(from.getTime() + i * dayMs);
    const dayEnd = new Date(dayStart.getTime() + dayMs);
    const value = inRange.filter(
      (d) => d.getTime() >= dayStart.getTime() && d.getTime() < dayEnd.getTime(),
    ).length;
    return {
      label: formatActivityAxisLabel(dayStart, range),
      value,
    };
  });
}

function resolveExamStatus(
  sessionStatuses: string[],
): TeacherDashboardExamStatus {
  if (sessionStatuses.length === 0) return 'draft';
  if (sessionStatuses.some((s) => s === 'DRAFT')) return 'draft';
  if (sessionStatuses.some((s) => s === 'ACTIVE')) return 'ready';
  return 'ready';
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

  async getTeacherDashboard(
    teacherId: string,
  ): Promise<TeacherDashboardResponseDto> {
    const now = new Date();
    const weekMs = 7 * 86_400_000;
    const periodStart = new Date(now.getTime() - weekMs);
    const previousStart = new Date(now.getTime() - 2 * weekMs);

    const user = await this.prisma.user.findUnique({
      where: { id: teacherId },
      select: { name: true },
    });

    const [exams, sessions] = await Promise.all([
      this.prisma.exam.findMany({
        where: {
          sessions: { some: { teacherId } },
        },
        include: {
          subject: true,
          examItems: true,
          sessions: {
            where: { teacherId },
            include: {
              submissions: {
                select: {
                  studentId: true,
                  submittedAt: true,
                  score: true,
                },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.examSession.findMany({
        where: { teacherId },
        include: {
          submissions: {
            select: {
              studentId: true,
              submittedAt: true,
              score: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const allSubmissions = sessions.flatMap((s) => s.submissions);
    const submittedRows = allSubmissions.filter(
      (s): s is typeof s & { submittedAt: Date; score: number } =>
        s.submittedAt != null && s.score != null,
    );

    const activeStudentIds = new Set(
      submittedRows.map((s) => s.studentId),
    );

    const avgScore =
      submittedRows.length > 0
        ? submittedRows.reduce((sum, s) => sum + s.score, 0) /
          submittedRows.length
        : null;

    const examCreatedDates = exams.map((e) => e.createdAt);
    const submissionDates = submittedRows.map((s) => s.submittedAt);

    const examsThisWeek = exams.filter(
      (e) => e.createdAt.getTime() >= periodStart.getTime(),
    ).length;
    const examsPrevWeek = exams.filter(
      (e) =>
        e.createdAt.getTime() >= previousStart.getTime() &&
        e.createdAt.getTime() < periodStart.getTime(),
    ).length;

    const questionsThisWeek = examsThisWeek
      ? exams
          .filter((e) => e.createdAt.getTime() >= periodStart.getTime())
          .reduce((sum, e) => sum + e.totalQuestions, 0)
      : 0;
    const questionsPrevWeek = exams
      .filter(
        (e) =>
          e.createdAt.getTime() >= previousStart.getTime() &&
          e.createdAt.getTime() < periodStart.getTime(),
      )
      .reduce((sum, e) => sum + e.totalQuestions, 0);

    const subsThisWeek = submittedRows.filter(
      (s) => s.submittedAt.getTime() >= periodStart.getTime(),
    );
    const subsPrevWeek = submittedRows.filter(
      (s) =>
        s.submittedAt.getTime() >= previousStart.getTime() &&
        s.submittedAt.getTime() < periodStart.getTime(),
    );
    const avgThisWeek =
      subsThisWeek.length > 0
        ? subsThisWeek.reduce((sum, s) => sum + s.score, 0) / subsThisWeek.length
        : null;
    const avgPrevWeek =
      subsPrevWeek.length > 0
        ? subsPrevWeek.reduce((sum, s) => sum + s.score, 0) / subsPrevWeek.length
        : null;

    const studentsThisWeek = new Set(
      subsThisWeek.map((s) => s.studentId),
    ).size;
    const studentsPrevWeek = new Set(
      subsPrevWeek.map((s) => s.studentId),
    ).size;

    const totalQuestions = exams.reduce((sum, e) => sum + e.totalQuestions, 0);

    const examDelta = computeDelta(examsThisWeek, examsPrevWeek);
    const questionDelta = computeDelta(questionsThisWeek, questionsPrevWeek);
    const scoreDelta =
      avgThisWeek != null && avgPrevWeek != null
        ? computeDelta(
            Math.round(avgThisWeek * 10),
            Math.round(avgPrevWeek * 10),
          )
        : { delta: 'No data yet', deltaDir: 'flat' as TeacherDashboardDeltaDir };
    const studentDelta = computeDelta(studentsThisWeek, studentsPrevWeek);

    const stats: TeacherDashboardStatDto[] = [
      {
        label: 'Total exams',
        value: String(exams.length),
        delta: examDelta.delta,
        deltaDir: examDelta.deltaDir,
        sparkline: bucketSparkline(examCreatedDates),
      },
      {
        label: 'Questions generated',
        value: totalQuestions.toLocaleString('en-US'),
        delta: questionDelta.delta,
        deltaDir: questionDelta.deltaDir,
        sparkline: bucketSparkline(
          exams.flatMap((e) =>
            Array.from({ length: e.totalQuestions }, () => e.createdAt),
          ),
        ),
      },
      {
        label: 'Avg. score',
        value: avgScore != null ? `${Math.round(avgScore * 10)}%` : '—',
        delta:
          avgThisWeek != null && avgPrevWeek != null
            ? `${avgThisWeek >= avgPrevWeek ? '+' : ''}${(
                (avgThisWeek - avgPrevWeek) *
                10
              ).toFixed(1)} pts`
            : scoreDelta.delta,
        deltaDir:
          avgThisWeek != null && avgPrevWeek != null
            ? avgThisWeek >= avgPrevWeek
              ? 'up'
              : 'down'
            : scoreDelta.deltaDir,
        sparkline: bucketSparkline(submissionDates),
      },
      {
        label: 'Active students',
        value: String(activeStudentIds.size),
        delta: studentDelta.delta,
        deltaDir: studentDelta.deltaDir,
        sparkline: bucketSparkline(submissionDates),
      },
    ];

    const subjectCounts = new Map<string, number>();
    for (const exam of exams) {
      const name = exam.subject?.name ?? 'Math';
      subjectCounts.set(name, (subjectCounts.get(name) ?? 0) + 1);
    }

    const subjects = [...subjectCounts.entries()]
      .map(([name, count]) => ({
        name,
        count,
        color: subjectColor(name),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const recentExams = exams.slice(0, 12).map((exam) => {
      const teacherSessions = exam.sessions;
      const assigned = teacherSessions.reduce((sum, session) => {
        const submitted = session.submissions.filter(
          (s) => s.submittedAt != null,
        ).length;
        return sum + submitted;
      }, 0);

      return {
        id: exam.id,
        title: exam.title,
        subject: exam.subject?.name ?? 'Math',
        questions: exam.examItems.length || exam.totalQuestions,
        assigned,
        status: resolveExamStatus(teacherSessions.map((s) => s.status)),
        updated: formatRelativeTime(exam.updatedAt, now),
        thumbColor: subjectColor(exam.subject?.name ?? 'Math'),
      };
    });

    return {
      teacherName: user?.name ?? 'Instructor',
      hero: {
        pendingReviewCount: sessions.filter((s) => s.status === 'DRAFT').length,
        activeStudentCount: activeStudentIds.size,
      },
      stats,
      activity: {
        '7d': buildActivitySeries(examCreatedDates, '7d', now),
        '30d': buildActivitySeries(examCreatedDates, '30d', now),
        '90d': buildActivitySeries(examCreatedDates, '90d', now),
      },
      subjects,
      recentExams,
    };
  }
}

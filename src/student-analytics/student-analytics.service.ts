import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  StudentAnalyticsMetricsDto,
  StudentAnalyticsRange,
} from './dto/student-analytics-metrics.dto';
import type {
  ScoreHistoryByRangeDto,
  ScoreHistoryPointDto,
  StudentScoreHistoryResponseDto,
} from './dto/student-score-history.dto';
import type {
  StudentTestComparisonResponseDto,
  TestComparisonAttemptDto,
  TestComparisonTestDto,
} from './dto/student-test-comparison.dto';
import type {
  StudentMyTestDifficulty,
  StudentMyTestItemDto,
  StudentMyTestsResponseDto,
} from './dto/student-my-tests.dto';
import type {
  StudentTestResultQuestionDto,
  StudentTestResultResponseDto,
} from './dto/student-test-result.dto';

const SCORE_HISTORY_RANGES: StudentAnalyticsRange[] = [
  '7d',
  '30d',
  '3m',
  'all',
];

const MAX_CHART_POINTS = 14;

type SubmissionRow = {
  submissionId: string;
  submittedAt: Date;
  startedAt: Date;
  score: number;
  totalCorrect: number | null;
  totalQuestions: number;
  sessionId: string;
  examId: string;
  examTitle: string;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function completionMinutes(startedAt: Date, submittedAt: Date): number {
  return (submittedAt.getTime() - startedAt.getTime()) / 60_000;
}

function meanScore(rows: SubmissionRow[]): number | null {
  return mean(rows.map((r) => r.score));
}

function weightedAccuracy(rows: SubmissionRow[]): number | null {
  const totalQuestions = rows.reduce((sum, r) => sum + r.totalQuestions, 0);
  if (totalQuestions === 0) return null;
  const totalCorrect = rows.reduce(
    (sum, r) => sum + (r.totalCorrect ?? 0),
    0,
  );
  return (totalCorrect / totalQuestions) * 10;
}

function getPeriodBounds(range: StudentAnalyticsRange, now = new Date()) {
  const dayMs = 86_400_000;

  if (range === 'all') {
    return {
      currentFrom: new Date(0),
      previousFrom: new Date(now.getTime() - 60 * dayMs),
      previousTo: new Date(now.getTime() - 30 * dayMs),
    };
  }

  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const currentFrom = new Date(now.getTime() - days * dayMs);
  const previousTo = currentFrom;
  const previousFrom = new Date(currentFrom.getTime() - days * dayMs);

  return { currentFrom, previousFrom, previousTo };
}

function filterByPeriod(
  rows: SubmissionRow[],
  from: Date,
  to?: Date,
): SubmissionRow[] {
  return rows.filter((row) => {
    const t = row.submittedAt.getTime();
    if (t < from.getTime()) return false;
    if (to && t >= to.getTime()) return false;
    return true;
  });
}

/**
 * Compare current period vs previous period.
 * Fallbacks when the calendar "previous" window is empty:
 * 1) any submissions before current period starts
 * 2) second half vs first half within the current period (needs ≥2 rows)
 */
function computePeriodDelta(
  current: SubmissionRow[],
  previous: SubmissionRow[],
  allRows: SubmissionRow[],
  currentFrom: Date,
  metric: (rows: SubmissionRow[]) => number | null,
): number | null {
  const currentVal = metric(current);
  if (currentVal == null) return null;

  let baselineVal = metric(previous);

  if (baselineVal == null) {
    const beforeCurrent = allRows.filter(
      (r) => r.submittedAt.getTime() < currentFrom.getTime(),
    );
    baselineVal = metric(beforeCurrent);
  }

  if (baselineVal == null && current.length >= 2) {
    const sorted = [...current].sort(
      (a, b) => a.submittedAt.getTime() - b.submittedAt.getTime(),
    );
    const mid = Math.floor(sorted.length / 2);
    const earlier = sorted.slice(0, mid);
    const later = sorted.slice(mid);
    const earlierVal = metric(earlier);
    const laterVal = metric(later);
    if (earlierVal != null && laterVal != null && earlier.length > 0) {
      return round1(currentVal - earlierVal);
    }
  }

  if (baselineVal == null) return null;
  return round1(currentVal - baselineVal);
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function downsamplePoints<T>(items: T[], maxPoints: number): T[] {
  if (items.length <= maxPoints) return items;
  const result: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const index = Math.round((i / (maxPoints - 1)) * (items.length - 1));
    result.push(items[index]);
  }
  return result;
}

function formatScoreHistoryLabel(
  date: Date,
  range: StudentAnalyticsRange,
  isLast: boolean,
  now: Date,
): string {
  if (isLast && isSameCalendarDay(date, now)) {
    return 'Today';
  }

  if (range === '7d') {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatComparisonDate(
  date: Date,
  isLast: boolean,
  now: Date,
): string {
  if (isLast && isSameCalendarDay(date, now)) {
    return 'Today';
  }

  return date
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .replace(/^(\w{3})/, (m) => m.toUpperCase());
}

function buildTestComparisonAttempts(
  rows: SubmissionRow[],
  now: Date,
): TestComparisonAttemptDto[] {
  const sorted = [...rows].sort(
    (a, b) => a.submittedAt.getTime() - b.submittedAt.getTime(),
  );

  return sorted.map((row, index) => {
    const score = round1(row.score);
    const accuracy =
      row.totalQuestions > 0
        ? round1(((row.totalCorrect ?? 0) / row.totalQuestions) * 100)
        : 0;

    return {
      n: index + 1,
      date: formatComparisonDate(row.submittedAt, index === sorted.length - 1, now),
      score,
      time: round1(completionMinutes(row.startedAt, row.submittedAt)),
      accuracy,
      submissionId: row.submissionId,
      sessionId: row.sessionId,
    };
  });
}

function buildScoreHistorySeries(
  rows: SubmissionRow[],
  range: StudentAnalyticsRange,
  now = new Date(),
): ScoreHistoryPointDto[] {
  const { currentFrom } = getPeriodBounds(range, now);
  const inRange = filterByPeriod(rows, currentFrom);

  if (inRange.length === 0) {
    return [];
  }

  const sampled = downsamplePoints(inRange, MAX_CHART_POINTS);

  return sampled.map((row, index) => ({
    date: formatScoreHistoryLabel(
      row.submittedAt,
      range,
      index === sampled.length - 1,
      now,
    ),
    score: round1(row.score),
  }));
}

function deriveExamDifficulty(
  easy: number,
  medium: number,
  hard: number,
): StudentMyTestDifficulty {
  const max = Math.max(easy, medium, hard);
  if (max === hard) return 'Hard';
  if (max === medium) return 'Medium';
  return 'Easy';
}

function questionOptionText(
  question: {
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
  },
  index: number,
): string {
  const options = [
    question.optionA,
    question.optionB,
    question.optionC,
    question.optionD,
  ];
  return options[index] ?? '—';
}

function letterToOptionIndex(letter: string): number {
  const map: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
  return map[letter.toUpperCase()] ?? 0;
}

function emptyMetrics(studentName: string): StudentAnalyticsMetricsDto {
  return {
    studentName,
    hasData: false,
    averageScore: null,
    averageScoreDelta: null,
    highestScore: null,
    highestScoreExamTitle: null,
    avgCompletionMinutes: null,
    avgCompletionDeltaMinutes: null,
    accuracyRate: null,
    accuracyRateDelta: null,
  };
}

@Injectable()
export class StudentAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadSubmissionRows(studentId: string): Promise<SubmissionRow[]> {
    const submissions = await this.prisma.submission.findMany({
      where: {
        studentId,
        submittedAt: { not: null },
        score: { not: null },
      },
      include: {
        session: {
          include: {
            exam: { select: { title: true } },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    return submissions
      .filter(
        (s): s is typeof s & { submittedAt: Date; score: number } =>
          s.submittedAt != null && s.score != null,
      )
      .map((s) => ({
        submissionId: s.id,
        submittedAt: s.submittedAt,
        startedAt: s.startedAt,
        score: s.score,
        totalCorrect: s.totalCorrect,
        totalQuestions: s.totalQuestions,
        sessionId: s.sessionId,
        examId: s.session.examId,
        examTitle: s.session.exam.title,
      }));
  }

  async getMyTests(studentId: string): Promise<StudentMyTestsResponseDto> {
    const submissions = await this.prisma.submission.findMany({
      where: { studentId },
      include: {
        session: {
          include: {
            exam: {
              include: {
                subject: true,
                examItems: true,
              },
            },
            teacher: { select: { name: true } },
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    const tests: StudentMyTestItemDto[] = submissions.map((submission) => {
      const session = submission.session;
      const exam = session.exam;
      const submitted = submission.submittedAt != null && submission.score != null;

      return {
        sessionId: session.id,
        examId: session.examId,
        title: exam.title,
        subject: exam.subject?.name ?? 'Math',
        status: submitted ? 'completed' : 'in-progress',
        durationSecs: submission.submittedAt
          ? Math.floor(
              (submission.submittedAt.getTime() - submission.startedAt.getTime()) /
                1000,
            )
          : null,
        questions: exam.examItems.length || exam.totalQuestions,
        timeLimit: session.timeLimitMins,
        attempts: 1,
        bestScore: submitted ? round1(submission.score as number) : null,
        difficulty: deriveExamDifficulty(
          exam.difficultyEasy,
          exam.difficultyMedium,
          exam.difficultyHard,
        ),
        assignedBy: session.teacher.name,
      };
    });

    const inProgressCount = tests.filter((t) => t.status === 'in-progress').length;

    return {
      tests,
      totalCount: tests.length,
      inProgressCount,
    };
  }

  async getTestResults(
    studentId: string,
    sessionId: string,
  ): Promise<StudentTestResultResponseDto> {
    const submission = await this.prisma.submission.findUnique({
      where: {
        sessionId_studentId: { sessionId, studentId },
      },
      include: {
        answerDetails: true,
        session: {
          include: {
            exam: {
              include: {
                subject: true,
                examItems: {
                  orderBy: { orderIndex: 'asc' },
                  include: { question: true },
                },
              },
            },
            teacher: { select: { name: true } },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Test results not found');
    }

    const session = submission.session;
    const exam = session.exam;
    const submitted =
      submission.submittedAt != null && submission.score != null;
    const score = submitted ? round1(submission.score as number) : null;
    const passingScore = 6;

    const items: StudentTestResultQuestionDto[] = submitted
      ? exam.examItems.map((item, index) => {
          const detail = submission.answerDetails.find(
            (d) => d.questionId === item.questionId,
          );
          const q = item.question;
          const correctIndex = letterToOptionIndex(q.correctAnswer);
          const selectedIndex = detail?.selectedOption ?? -1;
          const studentAnswer =
            selectedIndex >= 0 && selectedIndex <= 3
              ? questionOptionText(q, selectedIndex)
              : '—';
          const correctAnswer = questionOptionText(q, correctIndex);

          return {
            n: index + 1,
            text: q.name,
            studentAnswer,
            correctAnswer,
            correct: detail?.isCorrect ?? false,
          };
        })
      : [];

    return {
      sessionId: session.id,
      examId: session.examId,
      title: exam.title,
      subject: exam.subject?.name ?? 'Math',
      difficulty: deriveExamDifficulty(
        exam.difficultyEasy,
        exam.difficultyMedium,
        exam.difficultyHard,
      ),
      assignedBy: session.teacher.name,
      questionCount: exam.examItems.length || exam.totalQuestions,
      timeLimitMins: session.timeLimitMins,
      durationSecs: submission.submittedAt
        ? Math.floor(
            (submission.submittedAt.getTime() - submission.startedAt.getTime()) /
              1000,
          )
        : null,
      score,
      totalCorrect: submission.totalCorrect,
      totalQuestions: submission.totalQuestions,
      submitted,
      passed: score != null && score >= passingScore,
      teacherFeedback: null,
      items,
    };
  }

  async getTestComparison(
    studentId: string,
  ): Promise<StudentTestComparisonResponseDto> {
    const rows = await this.loadSubmissionRows(studentId);
    const now = new Date();
    const byExam = new Map<string, SubmissionRow[]>();

    for (const row of rows) {
      const group = byExam.get(row.examId) ?? [];
      group.push(row);
      byExam.set(row.examId, group);
    }

    const tests: TestComparisonTestDto[] = [];

    for (const [examId, examRows] of byExam) {
      const attempts = buildTestComparisonAttempts(examRows, now);
      const scores = attempts.map((a) => a.score);

      tests.push({
        examId,
        name: examRows[0].examTitle,
        attemptCount: attempts.length,
        bestScore: Math.max(...scores),
        attempts,
      });
    }

    tests.sort((a, b) => {
      const aLast = byExam.get(a.examId)?.at(-1)?.submittedAt.getTime() ?? 0;
      const bLast = byExam.get(b.examId)?.at(-1)?.submittedAt.getTime() ?? 0;
      return bLast - aLast;
    });

    const defaultExamId =
      tests.find((t) => t.attemptCount >= 2)?.examId ?? tests[0]?.examId ?? null;

    return { tests, defaultExamId };
  }

  async getScoreHistory(
    studentId: string,
  ): Promise<StudentScoreHistoryResponseDto> {
    const rows = await this.loadSubmissionRows(studentId);
    const now = new Date();

    const scoreHistory = SCORE_HISTORY_RANGES.reduce((acc, range) => {
      acc[range] = buildScoreHistorySeries(rows, range, now);
      return acc;
    }, {} as ScoreHistoryByRangeDto);

    return { scoreHistory };
  }

  async getMetrics(
    studentId: string,
    range: StudentAnalyticsRange = '30d',
  ): Promise<StudentAnalyticsMetricsDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { name: true },
    });

    const studentName = user?.name ?? 'Student';
    const rows = await this.loadSubmissionRows(studentId);

    const { currentFrom, previousFrom, previousTo } = getPeriodBounds(range);
    const current = filterByPeriod(rows, currentFrom);
    const previous = filterByPeriod(rows, previousFrom, previousTo);

    if (current.length === 0) {
      return emptyMetrics(studentName);
    }

    const avgScore = meanScore(current);
    const averageScoreDelta = computePeriodDelta(
      current,
      previous,
      rows,
      currentFrom,
      meanScore,
    );

    const highestRow = current.reduce((best, row) =>
      row.score > best.score ? row : best,
    );

    const completionTimes = current.map((r) =>
      completionMinutes(r.startedAt, r.submittedAt),
    );
    const avgCompletion = mean(completionTimes);

    const sessionIds = [...new Set(current.map((r) => r.sessionId))];
    const classSubmissions = await this.prisma.submission.findMany({
      where: {
        sessionId: { in: sessionIds },
        studentId: { not: studentId },
        submittedAt: { not: null },
      },
      select: {
        startedAt: true,
        submittedAt: true,
      },
    });

    const classCompletion = classSubmissions
      .filter((s): s is typeof s & { submittedAt: Date } => s.submittedAt != null)
      .map((s) => completionMinutes(s.startedAt, s.submittedAt));

    const classAvgCompletion = mean(classCompletion);
    let avgCompletionDelta: number | null = null;
    if (
      avgCompletion != null &&
      classAvgCompletion != null &&
      classCompletion.length > 0
    ) {
      avgCompletionDelta = round1(avgCompletion - classAvgCompletion);
    }

    const accuracy = weightedAccuracy(current);
    const accuracyRateDelta = computePeriodDelta(
      current,
      previous,
      rows,
      currentFrom,
      weightedAccuracy,
    );

    return {
      studentName,
      hasData: true,
      averageScore: avgScore != null ? round1(avgScore) : null,
      averageScoreDelta,
      highestScore: round1(highestRow.score),
      highestScoreExamTitle: highestRow.examTitle,
      avgCompletionMinutes:
        avgCompletion != null ? round1(avgCompletion) : null,
      avgCompletionDeltaMinutes: avgCompletionDelta,
      accuracyRate: accuracy != null ? round1(accuracy) : null,
      accuracyRateDelta,
    };
  }
}

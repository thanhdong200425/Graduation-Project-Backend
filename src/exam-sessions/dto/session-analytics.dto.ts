export interface SessionAnalyticsSummaryDto {
  sessionId: string;
  examId: string;
  title: string;
  subjectName: string | null;
  grade: number | null;
  questionCount: number;
  inviteCode: string;
  status: string;
  createdAt: string;
  submittedCount: number;
  startedCount: number;
  avgScore: number | null;
  minScore: number | null;
  maxScore: number | null;
}

export interface AnalyticsOverviewTotalsDto {
  submittedCount: number;
  startedCount: number;
  avgScore: number | null;
  sessionCount: number;
}

export interface AnalyticsOverviewResponseDto {
  sessions: SessionAnalyticsSummaryDto[];
  totals: AnalyticsOverviewTotalsDto;
}

export interface SubmissionAnswerDto {
  orderIndex: number;
  questionId: string;
  isCorrect: boolean;
}

export interface SessionSubmissionAnalyticsDto {
  id: string;
  studentId: string;
  studentName: string;
  score: number | null;
  totalCorrect: number | null;
  totalQuestions: number;
  startedAt: string;
  submittedAt: string | null;
  timeSecs: number;
  answers: SubmissionAnswerDto[];
}

export interface QuestionAccuracyDto {
  orderIndex: number;
  questionId: string;
  correctRate: number;
}

export interface SessionAnalyticsDetailDto extends SessionAnalyticsSummaryDto {
  submissions: SessionSubmissionAnalyticsDto[];
  questionAccuracy: QuestionAccuracyDto[];
}

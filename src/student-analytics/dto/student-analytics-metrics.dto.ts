export type StudentAnalyticsRange = '7d' | '30d' | '3m' | 'all';

export interface StudentAnalyticsMetricsDto {
  studentName: string;
  hasData: boolean;
  averageScore: number | null;
  averageScoreDelta: number | null;
  highestScore: number | null;
  highestScoreExamTitle: string | null;
  avgCompletionMinutes: number | null;
  avgCompletionDeltaMinutes: number | null;
  accuracyRate: number | null;
  accuracyRateDelta: number | null;
}

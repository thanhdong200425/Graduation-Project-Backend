import type { StudentAnalyticsRange } from './student-analytics-metrics.dto';

export interface ScoreHistoryPointDto {
  date: string;
  score: number;
}

export type ScoreHistoryByRangeDto = Record<
  StudentAnalyticsRange,
  ScoreHistoryPointDto[]
>;

export interface StudentScoreHistoryResponseDto {
  scoreHistory: ScoreHistoryByRangeDto;
}

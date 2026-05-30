import { IsIn, IsOptional } from 'class-validator';
import type { StudentAnalyticsRange } from './student-analytics-metrics.dto';

export class StudentAnalyticsQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '3m', 'all'])
  range?: StudentAnalyticsRange = '30d';
}

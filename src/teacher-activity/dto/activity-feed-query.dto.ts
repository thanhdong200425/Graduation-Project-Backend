import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const ACTIVITY_FILTERS = [
  'all',
  'exam',
  'session',
  'upload',
  'credit',
] as const;

export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export class ActivityFeedQueryDto {
  @IsOptional()
  @IsIn(ACTIVITY_FILTERS)
  filter?: ActivityFilter = 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}

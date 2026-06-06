import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateCreditSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  defaultQuota?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(99)
  alertThresholdPct?: number;
}

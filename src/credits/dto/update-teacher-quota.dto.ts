import { IsInt, Max, Min } from 'class-validator';

export class UpdateTeacherQuotaDto {
  @IsInt()
  @Min(1)
  @Max(100000)
  quota: number;
}

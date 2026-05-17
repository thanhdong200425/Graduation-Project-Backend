import { IsString, IsOptional, IsNumber, IsBoolean, IsDateString } from 'class-validator';

export class CreateExamSessionDto {
  @IsString()
  examId: string;

  @IsOptional()
  @IsString()
  inviteCode?: string;

  @IsOptional()
  @IsNumber()
  timeLimitMins?: number;

  @IsOptional()
  @IsBoolean()
  showAnswers?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class DifficultyDistributionDto {
  @IsNumber()
  easy!: number;

  @IsNumber()
  medium!: number;

  @IsNumber()
  hard!: number;
}

export class GenerateQuestionsDto {
  @IsString()
  subject_code!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  chapter_no!: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  num_questions!: number;

  @IsObject()
  @ValidateNested()
  @Type(() => DifficultyDistributionDto)
  difficulty_dist!: DifficultyDistributionDto;
}

export { DifficultyDistributionDto };

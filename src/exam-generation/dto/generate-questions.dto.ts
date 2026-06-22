import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
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
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  uploadIds!: string[];

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  numQuestions!: number;

  @IsObject()
  @ValidateNested()
  @Type(() => DifficultyDistributionDto)
  difficultyDist!: DifficultyDistributionDto;

  /**
   * Optional teacher-supplied focus describing what the exam should cover
   * (e.g. "sorting algorithms, recursion, time complexity"). When present it
   * becomes the semantic retrieval + rerank query and steers generation;
   * when empty, the pipeline falls back to a generic query.
   */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  focus?: string;
}

export { DifficultyDistributionDto };

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsObject,
  IsPositive,
  IsString,
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
}

export { DifficultyDistributionDto };

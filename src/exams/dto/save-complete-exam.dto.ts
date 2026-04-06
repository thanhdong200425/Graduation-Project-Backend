import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { DifficultyLevel } from '@prisma/client';

class QuestionInputDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsString()
  @IsNotEmpty()
  optionA: string;

  @IsString()
  @IsNotEmpty()
  optionB: string;

  @IsString()
  @IsNotEmpty()
  optionC: string;

  @IsString()
  @IsNotEmpty()
  optionD: string;

  @IsString()
  @IsNotEmpty()
  correctAnswer: string;

  @IsEnum(DifficultyLevel)
  @IsOptional()
  difficulty: DifficultyLevel = DifficultyLevel.MEDIUM;

  @IsString()
  @IsOptional()
  explanation?: string;

  @IsNumber()
  @IsOptional()
  difficultyScore?: number;

  @IsInt()
  @IsOptional()
  bloomLevel?: number;
}

export class SaveCompleteExamDto {
  @IsUUID()
  @IsNotEmpty()
  subjectId: string;

  @IsUUID()
  @IsNotEmpty()
  chapterId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsInt()
  @Min(1)
  totalQuestions: number;

  @IsInt()
  @Min(0)
  difficultyEasy: number;

  @IsInt()
  @Min(0)
  difficultyMedium: number;

  @IsInt()
  @Min(0)
  difficultyHard: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionInputDto)
  questions: QuestionInputDto[];
}

import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { DifficultyLevel, QuestionStatus } from '@prisma/client';

export class CreateQuestionDto {
  @IsUUID()
  @IsNotEmpty()
  chapterId!: string;

  @IsUUID()
  @IsOptional()
  chunkId?: string;

  @IsString()
  @IsNotEmpty()
  question!: string;

  @IsString()
  @IsNotEmpty()
  optionA!: string;

  @IsString()
  @IsNotEmpty()
  optionB!: string;

  @IsString()
  @IsNotEmpty()
  optionC!: string;

  @IsString()
  @IsNotEmpty()
  optionD!: string;

  @IsString()
  @IsNotEmpty()
  correctAnswer!: string;

  @IsEnum(DifficultyLevel)
  @IsNotEmpty()
  difficulty!: DifficultyLevel;

  @IsString()
  @IsOptional()
  explanation?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsEnum(QuestionStatus)
  @IsOptional()
  status?: QuestionStatus;
}

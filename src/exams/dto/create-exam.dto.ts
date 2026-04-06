import { IsInt, IsNotEmpty, IsString, IsUUID, Min } from 'class-validator';

export class CreateExamDto {
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
}

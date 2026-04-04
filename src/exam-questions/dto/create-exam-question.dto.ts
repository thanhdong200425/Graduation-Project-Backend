import { IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';

export class CreateExamQuestionDto {
  @IsUUID()
  @IsNotEmpty()
  examId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsInt()
  @Min(0)
  orderIndex: number;
}

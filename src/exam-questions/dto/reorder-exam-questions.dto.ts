import { ArrayNotEmpty, IsArray, IsNotEmpty, IsUUID } from 'class-validator';

export class ReorderExamQuestionsDto {
  @IsUUID()
  @IsNotEmpty()
  examId!: string;

  /** ExamItem ids in the desired display order. */
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  orderedItemIds!: string[];
}

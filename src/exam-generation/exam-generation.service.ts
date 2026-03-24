import { Injectable } from '@nestjs/common';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { QuestionGenerationGraphService } from './services/question-generation-graph.service';
import { GeneratedQuestion } from './types/question.types';

@Injectable()
export class ExamGenerationService {
  constructor(
    private readonly questionGenerationGraphService: QuestionGenerationGraphService,
  ) {}

  async generateQuestions(
    dto: GenerateQuestionsDto,
  ): Promise<GeneratedQuestion[]> {
    return this.questionGenerationGraphService.run({
      subjectCode: dto.subject_code,
      chapterNo: dto.chapter_no,
      numQuestions: dto.num_questions,
      difficultyDist: dto.difficulty_dist,
    });
  }
}

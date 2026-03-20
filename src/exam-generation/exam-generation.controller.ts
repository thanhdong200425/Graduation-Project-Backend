import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { ExamGenerationService } from './exam-generation.service';
import { GeneratedQuestion } from './types/question.types';

@UseGuards(JwtAuthGuard)
@Controller()
export class ExamGenerationController {
  constructor(private readonly examGenerationService: ExamGenerationService) {}

  @Post('generate-questions')
  async generateQuestions(
    @Body() body: GenerateQuestionsDto,
  ): Promise<GeneratedQuestion[]> {
    return this.examGenerationService.generateQuestions(body);
  }
}

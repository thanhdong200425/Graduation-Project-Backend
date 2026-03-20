import { Module } from '@nestjs/common';
import { ExamGenerationController } from './exam-generation.controller';
import { ExamGenerationService } from './exam-generation.service';
import { ChapterRetrievalService } from './services/chapter-retrieval.service';
import { QuestionGenerationGraphService } from './services/question-generation-graph.service';
import { QuestionPromptService } from './services/question-prompt.service';

@Module({
  controllers: [ExamGenerationController],
  providers: [
    ExamGenerationService,
    ChapterRetrievalService,
    QuestionPromptService,
    QuestionGenerationGraphService,
  ],
})
export class ExamGenerationModule {}

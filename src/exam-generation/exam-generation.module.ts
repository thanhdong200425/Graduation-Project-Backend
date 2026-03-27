import { Module } from '@nestjs/common';
import { ExamGenerationController } from './exam-generation.controller';
import { ExamGenerationService } from './exam-generation.service';
import { ChapterRetrievalService } from './services/chapter-retrieval.service';
import { QuestionGenerationGraphService } from './services/question-generation-graph.service';
import { QuestionPromptService } from './services/question-prompt.service';
import { ConfigModule } from '@nestjs/config';
import { QuestionValidationService } from './services/question-validation.service';

@Module({
  imports: [ConfigModule],
  controllers: [ExamGenerationController],
  providers: [
    ExamGenerationService,
    ChapterRetrievalService,
    QuestionPromptService,
    QuestionGenerationGraphService,
    QuestionValidationService,
  ],
})
export class ExamGenerationModule {}

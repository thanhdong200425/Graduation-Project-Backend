import { Module } from '@nestjs/common';
import { ExamGenerationController } from './exam-generation.controller';
import { ExamGenerationService } from './exam-generation.service';
import { ChapterRetrievalService } from './services/chapter-retrieval.service';
import { QuestionGenerationGraphService } from './services/question-generation-graph.service';
import { QuestionPromptService } from './services/question-prompt.service';
import { ConfigModule } from '@nestjs/config';
import { QuestionValidationService } from './services/question-validation.service';
import { QueryBuilderService } from './services/query-builder.service';
import { SubjectsModule } from '../subjects/subjects.module';
import { ChaptersModule } from '../chapters/chapters.module';

@Module({
  imports: [ConfigModule, SubjectsModule, ChaptersModule],
  controllers: [ExamGenerationController],
  providers: [
    ExamGenerationService,
    ChapterRetrievalService,
    QuestionPromptService,
    QuestionGenerationGraphService,
    QuestionValidationService,
    QueryBuilderService,
  ],
})
export class ExamGenerationModule {}

import { Module } from '@nestjs/common';
import { ExamGenerationController } from './exam-generation.controller';
import { ExamGenerationService } from './exam-generation.service';
import { ChapterRetrievalService } from './services/chapter-retrieval.service';
import { QuestionGenerationGraphService } from './services/question-generation-graph.service';
import { QuestionPromptService } from './services/question-prompt.service';
import { ConfigModule } from '@nestjs/config';
import { QuestionValidationService } from './services/question-validation.service';
import { DifficultyReconciliationService } from './services/difficulty-reconciliation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [ConfigModule, PrismaModule, CreditsModule],
  controllers: [ExamGenerationController],
  providers: [
    ExamGenerationService,
    ChapterRetrievalService,
    QuestionPromptService,
    QuestionGenerationGraphService,
    QuestionValidationService,
    DifficultyReconciliationService,
  ],
})
export class ExamGenerationModule {}

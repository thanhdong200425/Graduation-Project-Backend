import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CreditsModule } from '../credits/credits.module';
import { ChapterRetrievalService } from '../exam-generation/services/chapter-retrieval.service';
import { SlideGenerationController } from './slide-generation.controller';
import { SlideGenerationService } from './slide-generation.service';
import { SlideGenerationGraphService } from './services/slide-generation-graph.service';
import { SlidePromptService } from './services/slide-prompt.service';
import { SlideValidationService } from './services/slide-validation.service';

@Module({
  imports: [ConfigModule, PrismaModule, CreditsModule],
  controllers: [SlideGenerationController],
  providers: [
    SlideGenerationService,
    ChapterRetrievalService,
    SlidePromptService,
    SlideGenerationGraphService,
    SlideValidationService,
  ],
})
export class SlideGenerationModule {}

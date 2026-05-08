import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExamQuestionsController } from './exam-questions.controller';
import { ExamItemsService } from './exam-questions.service';

@Module({
  imports: [PrismaModule],
  controllers: [ExamQuestionsController],
  providers: [ExamItemsService],
  exports: [ExamItemsService],
})
export class ExamQuestionsModule {}

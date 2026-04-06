import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExamQuestionsController } from './exam-questions.controller';
import { ExamQuestionsService } from './exam-questions.service';

@Module({
  imports: [PrismaModule],
  controllers: [ExamQuestionsController],
  providers: [ExamQuestionsService],
  exports: [ExamQuestionsService],
})
export class ExamQuestionsModule {}

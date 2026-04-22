import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { QuestionsModule } from '../questions/questions.module';
import { ExamQuestionsModule } from '../exam-questions/exam-questions.module';

@Module({
  imports: [PrismaModule, QuestionsModule, ExamQuestionsModule],
  controllers: [ExamsController],
  providers: [ExamsService],
  exports: [ExamsService],
})
export class ExamsModule {}

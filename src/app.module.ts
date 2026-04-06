import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { ExamGenerationModule } from './exam-generation/exam-generation.module';
import { ConfigModule } from '@nestjs/config';
import { QuestionsModule } from './questions/questions.module';
import { ExamsModule } from './exams/exams.module';
import { ExamQuestionsModule } from './exam-questions/exam-questions.module';
import { SubjectsModule } from './subjects/subjects.module';
import { ChaptersModule } from './chapters/chapters.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    AuthModule,
    ExamGenerationModule,
    QuestionsModule,
    ExamsModule,
    ExamQuestionsModule,
    SubjectsModule,
    ChaptersModule,
    ConfigModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

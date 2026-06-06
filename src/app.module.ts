import { Module } from '@nestjs/common';
// Force reload after adding ExamSessionsModule
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
import { UploadModule } from './upload/upload.module';
import { MongodbModule } from './mongodb/mongodb.module';
import { QdrantModule } from './qdrant/qdrant.module';
import { ExamSessionsModule } from './exam-sessions/exam-sessions.module';
import { StudentAnalyticsModule } from './student-analytics/student-analytics.module';
import { AdminModule } from './admin/admin.module';
import { MailModule } from './mail/mail.module';
import { CreditsModule } from './credits/credits.module';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    UsersModule,
    AuthModule,
    ExamGenerationModule,
    QuestionsModule,
    ExamsModule,
    ExamQuestionsModule,
    SubjectsModule,
    ChaptersModule,
    ConfigModule.forRoot(),
    UploadModule,
    MongodbModule,
    QdrantModule,
    ExamSessionsModule,
    StudentAnalyticsModule,
    AdminModule,
    CreditsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

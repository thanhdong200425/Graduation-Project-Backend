import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StudentAnalyticsController } from './student-analytics.controller';
import { StudentAnalyticsService } from './student-analytics.service';

@Module({
  imports: [PrismaModule],
  controllers: [StudentAnalyticsController],
  providers: [StudentAnalyticsService],
})
export class StudentAnalyticsModule {}

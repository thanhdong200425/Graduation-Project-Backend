import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TeacherActivityController } from './teacher-activity.controller';
import { TeacherActivityService } from './teacher-activity.service';

@Module({
  imports: [PrismaModule, CreditsModule],
  controllers: [TeacherActivityController],
  providers: [TeacherActivityService],
})
export class TeacherActivityModule {}

import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { TeacherCreditsController } from './teacher-credits.controller';

@Module({
  imports: [CreditsModule],
  controllers: [TeacherCreditsController],
})
export class TeacherCreditsModule {}

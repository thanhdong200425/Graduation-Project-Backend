import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { AdminCreditsController } from './admin-credits.controller';

@Module({
  controllers: [AdminCreditsController],
  providers: [CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}

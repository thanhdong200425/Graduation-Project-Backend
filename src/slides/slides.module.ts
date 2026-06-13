import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlidesController } from './slides.controller';
import { SlidesService } from './slides.service';

@Module({
  imports: [PrismaModule],
  controllers: [SlidesController],
  providers: [SlidesService],
  exports: [SlidesService],
})
export class SlidesModule {}

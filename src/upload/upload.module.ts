import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { MongodbModule } from '../mongodb/mongodb.module';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { PdfPipelineService } from './pdf/pdf-pipiline.service';

@Module({
  imports: [PrismaModule, ConfigModule, MongodbModule],
  controllers: [UploadController],
  providers: [UploadService, PdfPipelineService],
})
export class UploadModule {}

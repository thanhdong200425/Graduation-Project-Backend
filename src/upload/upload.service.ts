import { ConflictException, Injectable } from '@nestjs/common';
import { PdfUpload } from '@prisma/client';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { PdfUploadResponseDto } from './upload.dto';
import { PdfPipelineService } from './pdf/pdf-pipiline.service';

const UPLOAD_DIR = join(process.cwd(), 'public', 'userUploads');

@Injectable()
export class UploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfPipeline: PdfPipelineService,
  ) {}

  async uploadPdf(
    file: Express.Multer.File,
    uploadedById: string,
    chapterId: string | null,
  ): Promise<PdfUploadResponseDto> {
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');

    let record: PdfUpload | null = await this.prisma.pdfUpload.findUnique({
      where: { fileHash },
    });

    // If a file with the same hash exists and is not marked as FAILED, throw a conflict error, otherwise continue to handle the new upload (re-uploading)
    if (record) {
      if (record.status !== 'FAILED') {
        throw new ConflictException(
          'A file with the same content has already been uploaded',
        );
      }
    } else {
      if (!existsSync(UPLOAD_DIR)) {
        mkdirSync(UPLOAD_DIR, { recursive: true });
      }

      const savedName = `${fileHash}.pdf`;
      const filePath = join(UPLOAD_DIR, savedName);
      writeFileSync(filePath, file.buffer);

      record = await this.prisma.pdfUpload.create({
        data: {
          uploadedById,
          fileName: file.originalname,
          fileHash,
          filePath,
        },
      });
    }

    try {
      await this.pdfPipeline.parsePdf(record.id, chapterId);
      await this.prisma.pdfUpload.update({
        where: { id: record.id },
        data: { status: 'INDEXED' },
      });
    } catch (error) {
      console.error('Error processing PDF:', error);
      await this.prisma.pdfUpload.update({
        where: { id: record.id },
        data: { status: 'FAILED' },
      });
    }

    return {
      id: record.id,
      status: record.status,
      fileName: record.fileName,
      createdAt: record.createdAt,
    };
  }
}

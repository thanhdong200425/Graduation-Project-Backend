import { ConflictException, Injectable } from '@nestjs/common';
import { PdfUpload } from '@prisma/client';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { PdfUploadResponseDto } from './upload.dto';

const UPLOAD_DIR = join(process.cwd(), 'public', 'userUploads');

@Injectable()
export class UploadService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadPdf(
    file: Express.Multer.File,
    uploadedById: string,
  ): Promise<PdfUploadResponseDto> {
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');

    const existing: PdfUpload | null = await this.prisma.pdfUpload.findUnique({
      where: { fileHash },
    });
    if (existing) {
      throw new ConflictException(
        'Duplicate file hash already indexed for this chapter',
      );
    }

    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const savedName = `${fileHash}.pdf`;
    const filePath = join(UPLOAD_DIR, savedName);
    writeFileSync(filePath, file.buffer);

    const record: PdfUpload = await this.prisma.pdfUpload.create({
      data: {
        uploadedById,
        fileName: file.originalname,
        fileHash,
        filePath,
      },
    });

    return {
      id: record.id,
      status: record.status,
      fileName: record.fileName,
      createdAt: record.createdAt,
    };
  }
}

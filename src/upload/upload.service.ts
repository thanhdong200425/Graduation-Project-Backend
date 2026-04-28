import { ConflictException, Injectable } from '@nestjs/common';
import { PdfUpload } from '@prisma/client';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { checkFileIsExists } from '../../helpers/file';
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
      const isFileExisted = await checkFileIsExists(UPLOAD_DIR, savedName);
      if (!isFileExisted) {
        writeFileSync(filePath, file.buffer);
      }

      record = await this.prisma.pdfUpload.create({
        data: {
          uploadedById,
          fileName: file.originalname,
          fileHash,
          filePath,
          ...(chapterId ? { chapterId } : {}),
        },
      });
    }

    return {
      id: record.id,
      status: record.status,
      fileName: record.fileName,
      createdAt: record.createdAt,
    };
  }

  async handlePdfProcessing(uploadId: string): Promise<void> {
    const record = await this.prisma.pdfUpload.findUnique({
      where: { id: uploadId },
    });

    if (!record) {
      throw new Error('PDF upload not found');
    }

    await this.pdfPipeline
      .parsePdf(record.id, record.chapterId)
      .catch((error) =>
        console.error(`Error processing PDF ${record.fileName}:`, error),
      );
  }

  async findAllByUser(userId: string): Promise<PdfUpload[]> {
    return this.prisma.pdfUpload.findMany({
      where: { uploadedById: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStatus(uploadId: string): Promise<PdfUpload> {
    return await this.prisma.pdfUpload.findUniqueOrThrow({
      where: { id: uploadId },
    });
  }
}

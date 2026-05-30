import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PdfUpload } from '@prisma/client';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { MongodbService } from '../mongodb/mongodb.service';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { PdfUploadResponseDto } from './upload.dto';
import { PdfPipelineService, ParsedPdfResult } from './pdf/pdf-pipiline.service';

const UPLOAD_DIR = join(process.cwd(), 'public', 'userUploads');

@Injectable()
export class UploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfPipeline: PdfPipelineService,
    private readonly mongodb: MongodbService,
    private readonly qdrant: QdrantService,
  ) {}

  /**
   * Lưu file lên disk + DB, trích xuất text, trả về cho frontend để user chỉnh sửa.
   */
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
      const isFileExisted = existsSync(filePath);
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

    // Lấy ảnh preview ngay lập tức (đồng bộ) để trả về cho frontend
    const extracted = await this.pdfPipeline.extractText(
      record.id,
    );

    return {
      id: record.id,
      status: record.status,
      fileName: record.fileName,
      createdAt: record.createdAt,
      extractedText: extracted.text,
      numPages: extracted.numPages,
      previews: extracted.previews,
    };
  }

  /**
   * Nhận danh sách trang đã chọn từ frontend → chạy trích xuất + Chunking + Embedding (bất đồng bộ).
   */
  async processSelectedPages(
    uploadId: string,
    selectedPages?: number[],
  ): Promise<void> {
    // Chạy ngầm — không await để trả về 202 ngay lập tức
    this.pdfPipeline.processSelectedPages(uploadId, selectedPages).catch((error) => {
      console.error(`Error processing selected pages for ${uploadId}:`, error);
    });
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

  async getExtractedText(uploadId: string): Promise<ParsedPdfResult> {
    return await this.pdfPipeline.extractText(uploadId);
  }

  async deletePdf(uploadId: string, userId: string): Promise<void> {
    const record = await this.prisma.pdfUpload.findUniqueOrThrow({
      where: { id: uploadId },
    });

    if (record.uploadedById !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this file',
      );
    }

    await this.mongodb.deleteChunksByUploadId(uploadId);
    await this.qdrant.deleteVectorsByUploadId(uploadId);

    if (existsSync(record.filePath)) {
      unlinkSync(record.filePath);
    }

    await this.prisma.pdfUpload.delete({ where: { id: uploadId } });
  }
}

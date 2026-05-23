import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CurrentStep } from '@prisma/client';
import { readFileSync } from 'fs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MongodbService } from '../../mongodb/mongodb.service';
import { QdrantService } from '../../qdrant/qdrant.service';

export interface ParsedPdfResult {
  pdfUploadId: string;
  text: string;
  numPages: number;
}

@Injectable()
export class PdfPipelineService {
  private readonly logger = new Logger(PdfPipelineService.name);
  private readonly fastApiBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mongodb: MongodbService,
    private readonly qdrant: QdrantService,
    private readonly configService: ConfigService,
  ) {
    this.fastApiBaseUrl = configService.getOrThrow<string>('FASTAPI_BASE_URL');
  }

  /**
   * Bước 1 — Lấy ảnh preview của từng trang từ Python API, trả về cho frontend để chọn trang.
   * Chưa trích xuất text / Chunk / Embed.
   */
  async extractText(
    pdfUploadId: string,
  ): Promise<
    ParsedPdfResult & { previews?: Array<{ page: number; thumbnail: string }> }
  > {
    const record = await this.prisma.pdfUpload.findUniqueOrThrow({
      where: { id: pdfUploadId },
    });

    await this.updateProgress(pdfUploadId, 20, 'PARSING');

    try {
      const buffer = readFileSync(record.filePath);
      const fileBlob = new Blob([buffer], { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', fileBlob, record.fileName);

      this.logger.log(
        `Sending PDF to Python previewer at ${this.fastApiBaseUrl}/pdf-previews`,
      );

      const response = await fetch(`${this.fastApiBaseUrl}/pdf-previews`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `Python PDF preview service failed with status ${response.status}`,
        );
      }

      const result = (await response.json()) as {
        numPages: number;
        previews: Array<{ page: number; thumbnail: string }>;
      };

      this.logger.log(
        `Generated ${result.numPages} preview pages successfully from Python`,
      );

      return {
        pdfUploadId,
        text: '',
        numPages: result.numPages,
        previews: result.previews,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate previews for PDF ${record.fileName}`,
        error,
      );
      await this.prisma.pdfUpload.update({
        where: { id: pdfUploadId },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  /**
   * Bước 2 — Trích xuất text cho các trang được chọn, sau đó Chunk + Store + Embed.
   */
  async processSelectedPages(
    pdfUploadId: string,
    selectedPages?: number[],
  ): Promise<void> {
    const record = await this.prisma.pdfUpload.findUniqueOrThrow({
      where: { id: pdfUploadId },
    });

    const chapter = record.chapterId
      ? await this.prisma.chapter.findUniqueOrThrow({
          where: { id: record.chapterId },
          include: { subject: true },
        })
      : null;

    try {
      await this.updateProgress(pdfUploadId, 30, 'PARSING');

      const buffer = readFileSync(record.filePath);
      const fileBlob = new Blob([buffer], { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', fileBlob, record.fileName);
      if (selectedPages && selectedPages.length > 0) {
        formData.append('pages', JSON.stringify(selectedPages));
      }

      this.logger.log(
        `Sending PDF to Python extractor at ${this.fastApiBaseUrl}/extract-pdf`,
      );

      const response = await fetch(`${this.fastApiBaseUrl}/extract-pdf`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `Python PDF extraction service failed with status ${response.status}`,
        );
      }

      const result = (await response.json()) as {
        text: string;
        numPages: number;
      };
      const cleanedText = this.cleanText(result.text);

      // Chia chunk
      await this.updateProgress(pdfUploadId, 40, 'CHUNKING');
      const chunks = this.chunkText(cleanedText);
      this.logger.log(`Chunked into ${chunks.length} chunks`);

      // Lưu vào MongoDB
      await this.updateProgress(pdfUploadId, 60, 'STORING');
      await this.mongodb.saveChunksToMongo({
        chunks,
        chapterId: record.chapterId ?? '',
        pdfUploadId,
      });

      // Embed + upsert Qdrant
      await this.updateProgress(pdfUploadId, 80, 'EMBEDDING');
      await this.qdrant.embedAndUpsert({
        chunks,
        subjectName: chapter?.subject.name ?? '',
        chapterIndex: chapter?.orderIndex ?? 0,
        pdfUploadId,
      });

      await this.updateProgress(pdfUploadId, 100, 'DONE');
      this.logger.log(`PDF ${record.fileName} fully processed`);
    } catch (error) {
      this.logger.error(`Failed to process PDF ${record.fileName}`, error);
      await this.prisma.pdfUpload.update({
        where: { id: pdfUploadId },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private cleanText(raw: string): string {
    return raw
      .replace(/\n{3,}/g, '\n\n') // nhiều dòng trống liên tiếp
      .trim();
  }

  private chunkText(text: string): string[] {
    const CHUNK_SIZE = 1000;
    const OVERLAP = 200;
    const step = CHUNK_SIZE - OVERLAP;
    const chunks: string[] = [];

    for (let start = 0; start < text.length; start += step) {
      const chunk = text.slice(start, start + CHUNK_SIZE).trim();
      if (chunk.length > 0) chunks.push(chunk);
    }

    return chunks;
  }

  async updateProgress(
    id: string,
    progress: number,
    currentStep: CurrentStep,
  ): Promise<void> {
    await this.prisma.pdfUpload.update({
      where: { id },
      data: {
        progress,
        currentStep,
        status: currentStep === 'DONE' ? 'INDEXED' : 'PENDING',
      },
    });
  }
}

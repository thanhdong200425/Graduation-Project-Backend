import { Injectable, Logger } from '@nestjs/common';
import { CurrentStep } from '@prisma/client';
import { PDFParse } from 'pdf-parse';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly mongodb: MongodbService,
    private readonly qdrant: QdrantService,
  ) {}

  async parsePdf(
    pdfUploadId: string,
    chapterId: string | null,
  ): Promise<ParsedPdfResult> {
    const record = await this.prisma.pdfUpload.findUniqueOrThrow({
      where: { id: pdfUploadId },
    });

    const chapter = chapterId
      ? await this.prisma.chapter.findUniqueOrThrow({
          where: { id: chapterId },
          include: { subject: true },
        })
      : null;

    try {
      const pdfParsed = new PDFParse({ url: record.filePath });
      await this.updateProgress(pdfUploadId, 20, 'PARSING');
      const pdfText = await pdfParsed.getText();

      const cleanedData = await this.cleanParsedData({
        pdfUploadId,
        text: pdfText.text,
        numPages: pdfText.pages.length,
      });

      await this.updateProgress(pdfUploadId, 40, 'CHUNKING');
      const chunks = this.chunkText(cleanedData.text);

      await this.updateProgress(pdfUploadId, 60, 'STORING');
      await this.mongodb.saveChunksToMongo({
        chunks,
        chapterId: chapterId ?? '',
        pdfUploadId,
      });

      await this.updateProgress(pdfUploadId, 80, 'EMBEDDING');
      await this.qdrant.embedAndUpsert({
        chunks,
        subjectName: chapter?.subject.name ?? '',
        chapterIndex: chapter?.orderIndex ?? 0,
        pdfUploadId,
      });

      await this.updateProgress(pdfUploadId, 100, 'DONE');
      return cleanedData;
    } catch (error) {
      this.logger.error(`Failed to process PDF ${record.fileName}`, error);
      await this.prisma.pdfUpload.update({
        where: { id: pdfUploadId },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  private chunkText(text: string): string[] {
    const chunkSize = 1000;
    const overlap = 200;
    const step = chunkSize - overlap;
    const chunks: string[] = [];

    for (let start = 0; start < text.length; start += step) {
      const chunk = text.slice(start, start + chunkSize).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
    }

    return chunks;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async cleanParsedData(
    parsedData: ParsedPdfResult,
  ): Promise<ParsedPdfResult> {
    const cleanedText = parsedData.text
      .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '')
      .replace(/^\s*(Page|Trang)\s+\d+\s*$/gim, '')
      .replace(/^.{1,20}$/gm, (line) => (line.trim().length < 5 ? '' : line))
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[^\S\n]+/g, ' ')
      .trim();

    return {
      ...parsedData,
      text: cleanedText,
    };
  }

  async updateProgress(
    id: string,
    progress: number,
    currentStep: CurrentStep,
  ): Promise<void> {
    try {
      await this.prisma.pdfUpload.update({
        where: { id },
        data: {
          progress,
          currentStep,
          status: currentStep === 'DONE' ? 'INDEXED' : 'PENDING',
        },
      });
    } catch (error) {
      throw new Error(
        `Failed to update progress for PDF upload ${id}: ${error}`,
      );
    }
  }
}

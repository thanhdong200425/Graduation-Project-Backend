import { Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { PrismaService } from '../../prisma/prisma.service';

export interface ParsedPdfResult {
  pdfUploadId: string;
  text: string;
  numPages: number;
}

@Injectable()
export class PdfPipelineService {
  private readonly logger = new Logger(PdfPipelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  async parsePdf(pdfUploadId: string): Promise<ParsedPdfResult> {
    const record = await this.prisma.pdfUpload.findUniqueOrThrow({
      where: { id: pdfUploadId },
    });

    try {
      const pdfParsed = new PDFParse({ url: record.filePath });
      const pdfText = await pdfParsed.getText();

      const cleanedData = await this.cleanParsedData({
        pdfUploadId,
        text: pdfText.text,
        numPages: pdfText.pages.length,
      });

      return cleanedData;
    } catch (error) {
      this.logger.error(`Failed to parse PDF ${record.fileName}`, error);
      throw error;
    }
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
}

import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { AuthRequest } from '../auth/interfaces/auth-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { PdfUploadResponseDto } from './upload.dto';
import { ProcessTextBodyDto, UploadPdfBodyDto } from './upload.dto';
import { UploadService } from './upload.service';

const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50 MB

@Controller('pdf-upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * POST /pdf-upload
   * Upload file → trích xuất text → trả extractedText về frontend để user xem/sửa.
   */
  @Post('/')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadPdf(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: MAX_PDF_SIZE,
            errorMessage: `File size exceeds the limit of ${MAX_PDF_SIZE / (1024 * 1024)} MB`,
          }),
          new FileTypeValidator({
            fileType: 'application/pdf',
            errorMessage: 'Only PDF files are allowed',
          }),
        ],
        errorHttpStatusCode: HttpStatus.BAD_REQUEST,
      }),
    )
    file: Express.Multer.File,
    @Body() body: UploadPdfBodyDto,
    @Req() req: AuthRequest,
  ): Promise<PdfUploadResponseDto> {
    return this.uploadService.uploadPdf(
      file,
      req.user.id,
      body.chapterId ?? null,
    );
  }

  /**
   * POST /pdf-upload/:id/process-text
   * Nhận danh sách trang đã chọn → bắt đầu trích xuất + Chunking + Embedding ngầm (async).
   * Trả về 202 Accepted ngay lập tức, client dùng polling status.
   */
  @Post(':id/process-text')
  @HttpCode(HttpStatus.ACCEPTED)
  async processText(
    @Param('id') id: string,
    @Body() body: ProcessTextBodyDto,
  ): Promise<{ message: string }> {
    await this.uploadService.processSelectedPages(id, body.selectedPages);
    return { message: 'Processing started. Poll /status for progress.' };
  }

  @Get('/')
  async getMyUploads(@Req() req: AuthRequest) {
    const uploads = await this.uploadService.findAllByUser(req.user.id);
    return uploads.map((u) => ({
      id: u.id,
      fileName: u.fileName,
      status: u.status,
      progress: u.progress,
      currentStep: u.currentStep,
      createdAt: u.createdAt,
    }));
  }

  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    const upload = await this.uploadService.getStatus(id);
    return {
      id: upload.id,
      status: upload.status,
      currentStep: upload.currentStep,
      progress: upload.progress,
    };
  }

  @Get(':id/text')
  async getExtractedText(@Param('id') id: string) {
    return this.uploadService.getExtractedText(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePdf(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.uploadService.deletePdf(id, req.user.id);
  }
}

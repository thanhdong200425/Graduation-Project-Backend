import {
  Controller,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
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
import { UploadService } from './upload.service';

const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50 MB

@Controller('pdf-upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('/')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadPdf(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_PDF_SIZE }),
          new FileTypeValidator({ fileType: 'application/pdf' }),
        ],
        errorHttpStatusCode: HttpStatus.BAD_REQUEST,
      }),
    )
    file: Express.Multer.File,
    @Req() req: AuthRequest,
  ): Promise<PdfUploadResponseDto> {
    return await this.uploadService.uploadPdf(file, req.user.id);
  }
}

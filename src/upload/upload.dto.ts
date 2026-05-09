import { IsOptional, IsUUID } from 'class-validator';

export class UploadPdfBodyDto {
  @IsUUID()
  @IsOptional()
  chapterId?: string;
}

export class PdfUploadResponseDto {
  id!: string;
  status?: string;
  fileName!: string;
  createdAt!: Date;
}

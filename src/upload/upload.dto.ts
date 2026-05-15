import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsUUID } from 'class-validator';

export class UploadPdfBodyDto {
  @IsUUID()
  @IsOptional()
  chapterId?: string;
}

/** Trả về ngay sau khi upload - gồm previews để user chọn trang */
export class PdfUploadResponseDto {
  id!: string;
  status?: string;
  fileName!: string;
  createdAt!: Date;
  extractedText!: string;
  numPages!: number;
  previews?: Array<{ page: number; thumbnail: string }>;
}

/** Body gửi lên khi user xác nhận chọn trang */
export class ProcessTextBodyDto {
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  selectedPages?: number[];
}

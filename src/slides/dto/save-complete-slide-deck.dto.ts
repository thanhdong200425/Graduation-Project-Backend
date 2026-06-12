import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SLIDE_DENSITIES,
  SLIDE_LANGUAGES,
  type SlideDensity,
  type SlideLanguage,
} from '../../slide-generation/types/slide.types';

class SlideInputDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  bullets!: string[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class SaveCompleteSlideDeckDto {
  @IsUUID()
  @IsOptional()
  subjectId?: string;

  @IsUUID()
  @IsOptional()
  chapterId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsInt()
  @Min(1)
  numSlides!: number;

  @IsIn(SLIDE_DENSITIES)
  density!: SlideDensity;

  @IsIn(SLIDE_LANGUAGES)
  language!: SlideLanguage;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SlideInputDto)
  slides!: SlideInputDto[];
}

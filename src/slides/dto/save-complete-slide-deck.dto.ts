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
  SLIDE_LAYOUTS,
  type SlideDensity,
  type SlideLanguage,
  type SlideLayout,
} from '../../slide-generation/types/slide.types';

class SlideInputDto {
  @IsIn(SLIDE_LAYOUTS)
  layout!: SlideLayout;

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

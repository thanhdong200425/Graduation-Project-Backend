import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsPositive,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SLIDE_DENSITIES,
  SLIDE_LANGUAGES,
  type SlideDensity,
  type SlideLanguage,
} from '../types/slide.types';

export class GenerateSlidesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  uploadIds!: string[];

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  numSlides!: number;

  @IsIn(SLIDE_DENSITIES)
  density!: SlideDensity;

  @IsIn(SLIDE_LANGUAGES)
  language!: SlideLanguage;
}

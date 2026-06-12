import { Injectable } from '@nestjs/common';
import { GeneratedSlide } from '../types/slide.types';

export type SlideValidationIssue =
  | 'TITLE_EMPTY'
  | 'BULLETS_EMPTY'
  | 'BULLET_EMPTY_STRING'
  | 'NOTES_NOT_STRING';

export interface SlideValidationResult {
  isValid: boolean;
  issues: SlideValidationIssue[];
}

@Injectable()
export class SlideValidationService {
  /**
   * Validate generated slides. Returns the full set of distinct issues found
   * across the deck (empty array when every slide is well-formed).
   */
  validateSlides(slides: GeneratedSlide[]): SlideValidationResult {
    const issues = new Set<SlideValidationIssue>();

    for (const slide of slides) {
      if (typeof slide.title !== 'string' || !slide.title.trim()) {
        issues.add('TITLE_EMPTY');
      }
      if (!Array.isArray(slide.bullets) || slide.bullets.length === 0) {
        issues.add('BULLETS_EMPTY');
      } else if (
        slide.bullets.some((b) => typeof b !== 'string' || !b.trim())
      ) {
        issues.add('BULLET_EMPTY_STRING');
      }
      if (typeof slide.notes !== 'string') {
        issues.add('NOTES_NOT_STRING');
      }
    }

    return { isValid: issues.size === 0, issues: [...issues] };
  }
}

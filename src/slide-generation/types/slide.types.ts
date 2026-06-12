export const SLIDE_DENSITIES = ['concise', 'balanced', 'detailed'] as const;
export type SlideDensity = (typeof SLIDE_DENSITIES)[number];

export const SLIDE_LANGUAGES = ['en', 'vi'] as const;
export type SlideLanguage = (typeof SLIDE_LANGUAGES)[number];

export interface GenerateSlidesInput {
  uploadIds: string[];
  numSlides: number;
  density: SlideDensity;
  language: SlideLanguage;
}

/** One generated slide: a heading, body bullet points, and presenter notes. */
export interface GeneratedSlide {
  title: string;
  bullets: string[];
  notes: string;
}

export const SLIDE_DENSITIES = ['concise', 'balanced', 'detailed'] as const;
export type SlideDensity = (typeof SLIDE_DENSITIES)[number];

export const SLIDE_LANGUAGES = ['en', 'vi'] as const;
export type SlideLanguage = (typeof SLIDE_LANGUAGES)[number];

export const SLIDE_LAYOUTS = [
  'cover',
  'agenda',
  'bullets',
  'two-column',
  'quote',
  'big-stat',
] as const;
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

/** Layout used when the model omits or returns an unrecognised value. */
export const DEFAULT_SLIDE_LAYOUT: SlideLayout = 'bullets';

export interface GenerateSlidesInput {
  uploadIds: string[];
  numSlides: number;
  density: SlideDensity;
  language: SlideLanguage;
}

/** One generated slide: a layout, heading, body bullet points, and presenter notes. */
export interface GeneratedSlide {
  layout: SlideLayout;
  title: string;
  bullets: string[];
  notes: string;
}

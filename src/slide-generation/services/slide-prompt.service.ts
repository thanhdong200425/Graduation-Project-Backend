import { Injectable } from '@nestjs/common';
import type { RetrievedChunk } from '../../exam-generation/types/question.types';
import type { SlideDensity, SlideLanguage } from '../types/slide.types';

/** Bullet-count guidance per density level. */
const DENSITY_GUIDANCE: Record<SlideDensity, string> = {
  concise: '2-3 short bullet points per slide',
  balanced: '3-5 bullet points per slide',
  detailed: '5-7 detailed bullet points per slide',
};

const LANGUAGE_LABEL: Record<SlideLanguage, string> = {
  en: 'English',
  vi: 'Vietnamese',
};

/** When to use each slide layout, given to the model as guidance. */
const LAYOUT_GUIDANCE = [
  '- "cover": the opening title slide. Use it for the first slide.',
  '- "agenda": an overview of the topics the lecture will cover.',
  '- "quote": a single notable statement, law, or definition worth highlighting.',
  '- "big-stat": a single key number, figure, or measurement worth emphasising.',
  '- "two-column": when contrasting or pairing two related ideas.',
  '- "bullets": the default — explaining a concept with several supporting points.',
].join('\n');

@Injectable()
export class SlidePromptService {
  buildPrompt(params: {
    chunks: RetrievedChunk[];
    numSlides: number;
    density: SlideDensity;
    language: SlideLanguage;
  }): string {
    const context = params.chunks
      .map((chunk, index) => `Chunk ${index + 1}:\n${chunk.content}`)
      .join('\n\n');

    const language = LANGUAGE_LABEL[params.language];

    return [
      'You are a presentation slide generator for teachers.',
      `Generate exactly ${params.numSlides} lecture slides based ONLY on the provided context.`,
      'Use only the concepts and facts from the provided context. Do not invent facts not present in context.',
      `Each slide must have ${DENSITY_GUIDANCE[params.density]}.`,
      'Order the slides so they flow as a coherent lecture (introduction → core concepts → summary).',
      `All titles, bullets, and notes must be written in ${language}.`,
      'Each bullet must be a concise phrase, not a full paragraph.',
      'Field "notes" must contain short presenter speaking notes (1-3 sentences) for that slide.',
      'Assign each slide a "layout" chosen from: cover, agenda, bullets, two-column, quote, big-stat.',
      'Layout guidance:',
      LAYOUT_GUIDANCE,
      'Return ONLY valid JSON (no markdown, no backticks) as an array with this schema:',
      '[{"layout":"cover","title":"...","bullets":["...","..."],"notes":"..."}]',
      '',
      'Context:',
      context,
    ].join('\n');
  }
}

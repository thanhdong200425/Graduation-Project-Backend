import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DifficultyCounts,
  DifficultyDistribution,
  RetrievedChunk,
} from '../types/question.types';

@Injectable()
export class QuestionPromptService {
  normalizeDifficultyDistribution(
    dist: DifficultyDistribution,
  ): DifficultyDistribution {
    const easy = Number(dist.easy);
    const medium = Number(dist.medium);
    const hard = Number(dist.hard);

    if (
      ![easy, medium, hard].every(
        (value) => Number.isFinite(value) && value >= 0,
      )
    ) {
      throw new BadRequestException(
        'difficulty_dist must contain non-negative numeric values.',
      );
    }

    const total = easy + medium + hard;
    if (total <= 0) {
      throw new BadRequestException(
        'difficulty_dist total must be greater than 0.',
      );
    }

    // Accept both ratio-like (sum around 1.0) and percentage-like (sum around 100).
    return {
      easy: easy / total,
      medium: medium / total,
      hard: hard / total,
    };
  }

  /*
    This function allocates the number of questions for each difficulty level based on the specified distribution.
    If rounding down does not fully allocate all questions (due to decimals), the remaining questions are given to the levels with the highest decimal remainders.
  */
  allocateDifficultyCounts(
    numQuestions: number,
    distribution: DifficultyDistribution,
  ): DifficultyCounts {
    if (!Number.isInteger(numQuestions) || numQuestions <= 0) {
      throw new BadRequestException(
        'num_questions must be a positive integer.',
      );
    }

    const raw = {
      easy: distribution.easy * numQuestions,
      medium: distribution.medium * numQuestions,
      hard: distribution.hard * numQuestions,
    };

    const base = {
      easy: Math.floor(raw.easy),
      medium: Math.floor(raw.medium),
      hard: Math.floor(raw.hard),
    };

    let remaining = numQuestions - (base.easy + base.medium + base.hard);

    // Sort the percentage of difficulty ratio to insert remainders into the highest
    const remainders: Array<{ level: keyof DifficultyCounts; value: number }> =
      (
        [
          { level: 'easy', value: raw.easy - base.easy },
          { level: 'medium', value: raw.medium - base.medium },
          { level: 'hard', value: raw.hard - base.hard },
        ] as Array<{ level: keyof DifficultyCounts; value: number }>
      ).sort((a, b) => b.value - a.value);

    let idx = 0;
    while (remaining > 0) {
      const next = remainders[idx % remainders.length];
      base[next.level] += 1;
      remaining -= 1;
      idx += 1;
    }

    return base;
  }

  buildPrompt(params: {
    chunks: RetrievedChunk[];
    numQuestions: number;
    difficultyCounts: DifficultyCounts;
    subjectCode?: string;
    chapterNo?: number;
    focus?: string;
  }): string {
    const context = params.chunks
      .map((chunk, index) => `Chunk ${index + 1}:\n${chunk.content}`)
      .join('\n\n');

    const focus = params.focus?.trim();

    return [
      'You are an exam question generator.',
      `Generate exactly ${params.numQuestions} multiple-choice questions based on the provided context.`,
      ...(focus
        ? [
            `Prioritise the following teacher focus when choosing what to ask about: "${focus}". Stay within the provided context.`,
          ]
        : []),
      'Use only the concepts and facts from the provided context. Do not invent facts not present in context.',
      'When the context contains numerical values, you MAY vary those numbers to create distinct questions — always adjust the correct answer to match the changed values.',
      'Each question must have exactly 4 options in an array and exactly 1 correct option.',
      'Randomize the position of the correct answer across the 4 options — do not always place it at the same position (A, B, C, or D).',
      'Field "answer" must be a short direct answer or key explanation in Vietnamese — not the text of a choice.',
      'Field "correctOptions" must be a JSON array with exactly one string: the correct choice copied verbatim from "options".',
      'All questions, options, and answers must be written in Vietnamese.',
      'Return ONLY valid JSON (no markdown, no backticks) as an array with this schema:',
      '[{"question":"...","options":["A","B","C","D"],"answer":"...","correctOptions":["..."]}]',
      '',
      'Context:',
      context,
    ].join('\n');
  }
}

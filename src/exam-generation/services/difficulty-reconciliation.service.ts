import { Injectable } from '@nestjs/common';
import {
  ClassifiedDifficulty,
  DifficultyCounts,
  GeneratedQuestion,
} from '../types/question.types';

@Injectable()
export class DifficultyReconciliationService {
  /**
   * Decide each question's final difficulty from two sources:
   *  - `llmQuestions` — the questions as generated, carrying the difficulty the
   *    LLM was instructed to produce. This satisfies the requested distribution
   *    by construction.
   *  - `classified` — PhoBERT's classification of those same questions (the
   *    deep-learning step we keep for its own sake), which tends to collapse
   *    everything to "medium".
   *
   * We only trust PhoBERT's labels when its distribution matches the requested
   * counts exactly; otherwise we fall back to the LLM's labels so the final
   * exam still has the distribution the teacher asked for.
   *
   * PhoBERT's raw prediction is always kept in `predictedDifficulty` so it can
   * be compared against the final label later.
   */
  reconcile(params: {
    llmQuestions: GeneratedQuestion[];
    classified: ClassifiedDifficulty[];
    targetCounts: DifficultyCounts;
  }): GeneratedQuestion[] {
    const { llmQuestions, classified, targetCounts } = params;

    const predictionById = new Map(
      classified.map((item) => [item.id, item.difficulty]),
    );
    const usePhoBert = this.isDistributionSatisfied(targetCounts, classified);

    return llmQuestions.map((question, index) => {
      // Fall back to the LLM label when PhoBERT returned no row for this index.
      const predicted =
        predictionById.get(String(index)) ?? question.difficulty;
      return {
        ...question,
        difficulty: usePhoBert ? predicted : question.difficulty,
        predictedDifficulty: predicted,
      };
    });
  }

  /** Exact per-level count match between PhoBERT's labels and the request. */
  isDistributionSatisfied(
    targetCounts: DifficultyCounts,
    classified: ClassifiedDifficulty[],
  ): boolean {
    const counts = classified.reduce(
      (acc, item) => {
        acc[item.difficulty] += 1;
        return acc;
      },
      { easy: 0, medium: 0, hard: 0 } as DifficultyCounts,
    );

    return (
      Number(targetCounts.easy) === counts.easy &&
      Number(targetCounts.medium) === counts.medium &&
      Number(targetCounts.hard) === counts.hard
    );
  }
}

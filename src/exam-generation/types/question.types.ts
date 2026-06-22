export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface DifficultyDistribution {
  easy: number;
  medium: number;
  hard: number;
}

export type DifficultyCounts = DifficultyDistribution;

export interface RetrievedChunk {
  content: string;
  subject?: string;
  chapter?: number;
  lesson?: number;
  topic?: string;
}

export interface GeneratedQuestion {
  question: string;
  options: [string, string, string, string];
  /** Short direct answer or key explanation (not the option text). */
  answer: string;
  /** Verbatim text of each correct choice; for standard MCQ exactly one string matching an entry in `options`. */
  correctOptions: string[];
  /** Final difficulty used for the exam (reconciled from the LLM label and PhoBERT). */
  difficulty: DifficultyLevel;
  /** PhoBERT's raw classification, kept for comparison against the final difficulty. */
  predictedDifficulty?: DifficultyLevel;
}

/** A single question's difficulty as returned by the PhoBERT classifier. */
export interface ClassifiedDifficulty {
  id: string;
  difficulty: DifficultyLevel;
}

export interface GenerateQuestionsInput {
  uploadIds: string[];
  numQuestions: number;
  difficultyDist: DifficultyDistribution;
}

export interface ChunkScore {
  chunkContent: string;
  score: number;
}

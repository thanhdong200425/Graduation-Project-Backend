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
  difficulty: DifficultyLevel;
}

export interface GenerateQuestionsInput {
  subjectCode: string;
  chapterNo: number;
  numQuestions: number;
  difficultyDist: DifficultyDistribution;
}

export interface ChunkScore {
  chunkContent: string;
  score: number;
}

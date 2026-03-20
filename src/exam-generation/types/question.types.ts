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
  answer: string;
  difficulty: DifficultyLevel;
}

export interface GenerateQuestionsInput {
  subjectCode: string;
  chapterNo: number;
  numQuestions: number;
  difficultyDist: DifficultyDistribution;
}

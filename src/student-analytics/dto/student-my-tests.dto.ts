export type StudentMyTestStatus = 'completed' | 'in-progress';
export type StudentMyTestDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface StudentMyTestItemDto {
  sessionId: string;
  examId: string;
  title: string;
  subject: string;
  status: StudentMyTestStatus;
  /** Seconds from startedAt to submittedAt; null if not submitted yet */
  durationSecs: number | null;
  questions: number;
  timeLimit: number | null;
  attempts: number;
  bestScore: number | null;
  difficulty: StudentMyTestDifficulty;
  assignedBy: string;
}

export interface StudentMyTestsResponseDto {
  tests: StudentMyTestItemDto[];
  totalCount: number;
  inProgressCount: number;
}

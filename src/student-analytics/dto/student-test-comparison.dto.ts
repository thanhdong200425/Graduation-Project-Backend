export interface TestComparisonAttemptDto {
  n: number;
  date: string;
  score: number;
  time: number;
  accuracy: number;
  submissionId: string;
  sessionId: string;
}

export interface TestComparisonTestDto {
  examId: string;
  name: string;
  attemptCount: number;
  bestScore: number;
  attempts: TestComparisonAttemptDto[];
}

export interface StudentTestComparisonResponseDto {
  tests: TestComparisonTestDto[];
  defaultExamId: string | null;
}

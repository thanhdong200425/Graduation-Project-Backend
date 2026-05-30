import type { StudentMyTestDifficulty } from './student-my-tests.dto';

export interface StudentTestResultQuestionDto {
  n: number;
  text: string;
  studentAnswer: string;
  correctAnswer: string;
  correct: boolean;
}

export interface StudentTestResultResponseDto {
  sessionId: string;
  examId: string;
  title: string;
  subject: string;
  difficulty: StudentMyTestDifficulty;
  assignedBy: string;
  questionCount: number;
  timeLimitMins: number | null;
  durationSecs: number | null;
  score: number | null;
  totalCorrect: number | null;
  totalQuestions: number;
  submitted: boolean;
  passed: boolean;
  teacherFeedback: string | null;
  items: StudentTestResultQuestionDto[];
}

export type TeacherDashboardDeltaDir = 'up' | 'down' | 'flat';

export type TeacherDashboardExamStatus =
  | 'draft'
  | 'generating'
  | 'ready'
  | 'failed';

export interface TeacherDashboardHeroDto {
  pendingReviewCount: number;
  activeStudentCount: number;
}

export interface TeacherDashboardStatDto {
  label: string;
  value: string;
  delta: string;
  deltaDir: TeacherDashboardDeltaDir;
  sparkline: number[];
}

export interface TeacherDashboardActivityPointDto {
  label: string;
  value: number;
}

export interface TeacherDashboardSubjectDto {
  name: string;
  count: number;
  color: string;
}

export interface TeacherDashboardRecentExamDto {
  id: string;
  title: string;
  subject: string;
  questions: number;
  assigned: number;
  status: TeacherDashboardExamStatus;
  updated: string;
  thumbColor: string;
}

export interface TeacherDashboardResponseDto {
  teacherName: string;
  hero: TeacherDashboardHeroDto;
  stats: TeacherDashboardStatDto[];
  activity: Record<'7d' | '30d' | '90d', TeacherDashboardActivityPointDto[]>;
  subjects: TeacherDashboardSubjectDto[];
  recentExams: TeacherDashboardRecentExamDto[];
}

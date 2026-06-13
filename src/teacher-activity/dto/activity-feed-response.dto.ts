export type ActivityType =
  | 'EXAM_GENERATED'
  | 'EXAM_FAILED'
  | 'EXAM_REVIEW_PENDING'
  | 'SESSION_SUBMISSION'
  | 'SESSION_STARTED'
  | 'CREDIT_WARNING'
  | 'CREDIT_BLOCKED'
  | 'PDF_UPLOAD'
  | 'CREDIT_USAGE';

export interface ActivityActionDto {
  label: string;
  href: string;
}

export interface ActivityItemDto {
  id: string;
  teacherId: string;
  type: ActivityType;
  title: string;
  body: string;
  occurredAt: string;
  action?: ActivityActionDto;
  metadata?: Record<string, unknown>;
}

export interface ActivityFeedResponseDto {
  teacherId: string;
  needsAttention: ActivityItemDto[];
  items: ActivityItemDto[];
}

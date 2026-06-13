import { Injectable } from '@nestjs/common';
import {
  GenerationStatus,
  PdfUploadStatus,
  Prisma,
} from '@prisma/client';
import { TOKENS_PER_CREDIT } from '../credits/credits.constants';
import { CreditsService } from '../credits/credits.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ActivityFeedQueryDto } from './dto/activity-feed-query.dto';
import type {
  ActivityFeedResponseDto,
  ActivityItemDto,
  ActivityType,
} from './dto/activity-feed-response.dto';

const EXAM_TYPES: ActivityType[] = [
  'EXAM_GENERATED',
  'EXAM_FAILED',
  'EXAM_REVIEW_PENDING',
];

@Injectable()
export class TeacherActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditsService: CreditsService,
  ) {}

  async buildFeed(
    teacherId: string,
    query: ActivityFeedQueryDto,
  ): Promise<ActivityFeedResponseDto> {
    const limit = query.limit ?? 30;
    const filter = query.filter ?? 'all';

    const [jobItems, submissionItems, pdfItems, creditItems] =
      await Promise.all([
        this.loadGenerationJobItems(teacherId),
        this.loadSubmissionItems(teacherId),
        this.loadPdfUploadItems(teacherId),
        this.loadCreditUsageItems(teacherId),
      ]);

    const needsAttention = await this.buildNeedsAttention(
      teacherId,
      jobItems,
    );

    const dedupedCreditItems = this.dedupeCreditItems(jobItems, creditItems);

    const allFeedItems = [
      ...jobItems,
      ...submissionItems,
      ...pdfItems,
      ...dedupedCreditItems,
    ];

    const sortByNewest = (list: ActivityItemDto[]) =>
      [...list].sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );

    let items: ActivityItemDto[];
    if (filter === 'credit') {
      items = sortByNewest(creditItems).slice(0, limit);
    } else if (filter === 'all') {
      items = sortByNewest(allFeedItems).slice(0, limit);
    } else {
      items = sortByNewest(
        allFeedItems.filter((item) => matchesFilter(item.type, filter)),
      ).slice(0, limit);
    }

    return {
      teacherId,
      needsAttention,
      items,
    };
  }

  private async loadGenerationJobItems(
    teacherId: string,
  ): Promise<ActivityItemDto[]> {
    const jobs = await this.prisma.generationJob.findMany({
      where: {
        userId: teacherId,
        status: { in: [GenerationStatus.DONE, GenerationStatus.FAILED] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 15,
    });

    return jobs.map((job) => this.mapGenerationJob(teacherId, job));
  }

  private mapGenerationJob(
    teacherId: string,
    job: {
      id: string;
      status: GenerationStatus;
      result: Prisma.JsonValue;
      error: string | null;
      updatedAt: Date;
    },
  ): ActivityItemDto {
    const questionCount = Array.isArray(job.result) ? job.result.length : 0;

    if (job.status === GenerationStatus.FAILED) {
      const errorSnippet = job.error
        ? job.error.length > 120
          ? `${job.error.slice(0, 120)}…`
          : job.error
        : 'Unknown error';

      return {
        id: `job:${job.id}`,
        teacherId,
        type: 'EXAM_FAILED',
        title: 'Exam generation failed',
        body: errorSnippet,
        occurredAt: job.updatedAt.toISOString(),
        action: { label: 'Try again', href: '/upload-hub' },
        metadata: { jobId: job.id },
      };
    }

    return {
      id: `job:${job.id}`,
      teacherId,
      type: 'EXAM_GENERATED',
      title: 'Exam generation complete',
      body:
        questionCount > 0
          ? `Job finished — ${questionCount} questions ready for review.`
          : 'Job finished — questions ready for review.',
      occurredAt: job.updatedAt.toISOString(),
      action: { label: 'Open review', href: `/review?jobId=${job.id}` },
      metadata: { jobId: job.id },
    };
  }

  private async loadSubmissionItems(
    teacherId: string,
  ): Promise<ActivityItemDto[]> {
    const sessions = await this.prisma.examSession.findMany({
      where: { teacherId },
      select: {
        id: true,
        examId: true,
        exam: { select: { title: true } },
        submissions: {
          where: { submittedAt: { not: null } },
          select: { submittedAt: true },
          orderBy: { submittedAt: 'desc' },
        },
      },
    });

    const items: ActivityItemDto[] = [];

    for (const session of sessions) {
      const submitted = session.submissions.filter((s) => s.submittedAt != null);
      if (submitted.length === 0) continue;

      const latestAt = submitted[0]!.submittedAt!;
      const examTitle = session.exam.title;
      const count = submitted.length;

      items.push({
        id: `session-sub:${session.id}`,
        teacherId,
        type: 'SESSION_SUBMISSION',
        title:
          count === 1 ? 'Student submitted' : `${count} students submitted`,
        body: `${count} submission${count === 1 ? '' : 's'} on "${examTitle}".`,
        occurredAt: latestAt.toISOString(),
        action: { label: 'View results', href: '/analytics' },
        metadata: {
          examId: session.examId,
          sessionId: session.id,
        },
      });
    }

    return items.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  }

  private async loadPdfUploadItems(
    teacherId: string,
  ): Promise<ActivityItemDto[]> {
    const uploads = await this.prisma.pdfUpload.findMany({
      where: {
        uploadedById: teacherId,
        status: { in: [PdfUploadStatus.INDEXED, PdfUploadStatus.FAILED] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    return uploads.map((upload) => {
      if (upload.status === PdfUploadStatus.FAILED) {
        return {
          id: `pdf:${upload.id}`,
          teacherId,
          type: 'PDF_UPLOAD' as const,
          title: 'PDF processing failed',
          body: `"${upload.fileName}" could not be processed.`,
          occurredAt: upload.updatedAt.toISOString(),
          action: { label: 'Upload Hub', href: '/upload-hub' },
          metadata: { uploadId: upload.id },
        };
      }

      return {
        id: `pdf:${upload.id}`,
        teacherId,
        type: 'PDF_UPLOAD' as const,
        title: 'Textbook indexed',
        body: `"${upload.fileName}" is ready for question generation.`,
        occurredAt: upload.updatedAt.toISOString(),
        action: { label: 'Upload Hub', href: '/upload-hub' },
        metadata: { uploadId: upload.id },
      };
    });
  }

  private async loadCreditUsageItems(
    teacherId: string,
  ): Promise<ActivityItemDto[]> {
    const logs = await this.prisma.tokenUsageLog.findMany({
      where: { userId: teacherId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        jobId: true,
        totalTokens: true,
        model: true,
        createdAt: true,
      },
    });

    return logs.map((log) => {
      const credits = Math.max(1, Math.floor(log.totalTokens / TOKENS_PER_CREDIT));

      return {
        id: `credit:${log.id}`,
        teacherId,
        type: 'CREDIT_USAGE' as const,
        title: 'AI run completed',
        body: `Used ${credits} credit${credits === 1 ? '' : 's'} (${log.totalTokens.toLocaleString('en-US')} tokens) — ${log.model}.`,
        occurredAt: log.createdAt.toISOString(),
        action: { label: 'View quota', href: '/settings' },
        metadata: {
          jobId: log.jobId ?? undefined,
          creditUsed: credits,
        },
      };
    });
  }

  /** Hide per-run credit rows when the same job already has an exam feed item. */
  private dedupeCreditItems(
    jobItems: ActivityItemDto[],
    creditItems: ActivityItemDto[],
  ): ActivityItemDto[] {
    const jobIds = new Set(
      jobItems
        .map((item) => item.metadata?.jobId)
        .filter((id): id is string => typeof id === 'string'),
    );

    return creditItems.filter((item) => {
      const jobId = item.metadata?.jobId;
      if (typeof jobId !== 'string') return true;
      return !jobIds.has(jobId);
    });
  }

  private async buildNeedsAttention(
    teacherId: string,
    jobItems: ActivityItemDto[],
  ): Promise<ActivityItemDto[]> {
    const attention: ActivityItemDto[] = [];

    const creditAttention = await this.buildCreditAttention(teacherId);
    if (creditAttention) {
      attention.push(creditAttention);
    }

    const latestFailed = jobItems.find((j) => j.type === 'EXAM_FAILED');
    if (latestFailed) {
      attention.push({
        ...latestFailed,
        id: `attention:${latestFailed.id}`,
      });
    }

    const running = await this.prisma.generationJob.findFirst({
      where: { userId: teacherId, status: GenerationStatus.RUNNING },
      orderBy: { updatedAt: 'desc' },
    });

    if (running) {
      attention.push({
        id: `attention:job:${running.id}`,
        teacherId,
        type: 'EXAM_GENERATED',
        title: 'Generation in progress',
        body: `Question pipeline running — ${running.progress}% complete.`,
        occurredAt: running.updatedAt.toISOString(),
        action: {
          label: 'View progress',
          href: `/generating?jobId=${running.id}`,
        },
        metadata: { jobId: running.id },
      });
    }

    return attention;
  }

  private async buildCreditAttention(
    teacherId: string,
  ): Promise<ActivityItemDto | null> {
    const [quota, usage, settings] = await Promise.all([
      this.creditsService.getResolvedQuota(teacherId),
      this.creditsService.getMonthlyUsage(teacherId),
      this.creditsService.getSettings(),
    ]);

    const used = Math.floor(usage.totalTokens / TOKENS_PER_CREDIT);
    const pct =
      quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

    if (used >= quota) {
      return {
        id: `attention:credit:blocked:${teacherId}`,
        teacherId,
        type: 'CREDIT_BLOCKED',
        title: 'AI credits exhausted',
        body: `Monthly quota reached ${used}/${quota} credits. Contact your administrator to increase the limit.`,
        occurredAt: new Date().toISOString(),
        action: { label: 'View quota', href: '/settings' },
        metadata: { creditUsed: used, creditQuota: quota },
      };
    }

    const threshold = Math.floor(
      (quota * settings.alertThresholdPct) / 100,
    );
    if (used >= threshold) {
      return {
        id: `attention:credit:warning:${teacherId}`,
        teacherId,
        type: 'CREDIT_WARNING',
        title: 'AI credits running low',
        body: `${used}/${quota} credits used this month (${pct}%).`,
        occurredAt: new Date().toISOString(),
        action: { label: 'View quota', href: '/settings' },
        metadata: { creditUsed: used, creditQuota: quota },
      };
    }

    return null;
  }
}

function matchesFilter(type: ActivityType, filter: string): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'exam':
      return EXAM_TYPES.includes(type);
    case 'session':
      return type === 'SESSION_SUBMISSION' || type === 'SESSION_STARTED';
    case 'upload':
      return type === 'PDF_UPLOAD';
    case 'credit':
      return (
        type === 'CREDIT_USAGE' ||
        type === 'CREDIT_WARNING' ||
        type === 'CREDIT_BLOCKED'
      );
    default:
      return true;
  }
}

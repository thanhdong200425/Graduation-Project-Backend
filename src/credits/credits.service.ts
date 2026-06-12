import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { startOfMonth } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCreditSettingsDto } from './dto/update-credit-settings.dto';
import { computeCostUsd, TOKENS_PER_CREDIT } from './credits.constants';

const GLOBAL_SETTINGS_ID = 'global';
const DEFAULT_QUOTA = 100;
const DEFAULT_ALERT_THRESHOLD_PCT = 80;

export interface MonthlyUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

export interface LogUsageInput {
  userId: string;
  jobId?: string | null;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read the singleton global settings. Write-free: returns in-memory defaults
   * when the row doesn't exist yet (it's first persisted on updateSettings),
   * which avoids a create race when several requests load concurrently.
   */
  async getSettings() {
    const existing = await this.prisma.creditSetting.findUnique({
      where: { id: GLOBAL_SETTINGS_ID },
    });
    return (
      existing ?? {
        id: GLOBAL_SETTINGS_ID,
        defaultQuota: DEFAULT_QUOTA,
        alertThresholdPct: DEFAULT_ALERT_THRESHOLD_PCT,
        updatedAt: new Date(),
      }
    );
  }

  async updateSettings(dto: UpdateCreditSettingsDto) {
    return this.prisma.creditSetting.upsert({
      where: { id: GLOBAL_SETTINGS_ID },
      update: { ...dto },
      create: { id: GLOBAL_SETTINGS_ID, ...dto },
    });
  }

  /** A teacher's resolved monthly quota (their override, else the global default). */
  async getResolvedQuota(userId: string): Promise<number> {
    const [user, settings] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { creditQuota: true },
      }),
      this.getSettings(),
    ]);
    return user?.creditQuota ?? settings.defaultQuota;
  }

  /** Monthly credit summary for the authenticated teacher settings UI. */
  async getTeacherSummary(userId: string) {
    const [quota, usage, settings] = await Promise.all([
      this.getResolvedQuota(userId),
      this.getMonthlyUsage(userId),
      this.getSettings(),
    ]);

    const used = Math.floor(usage.totalTokens / TOKENS_PER_CREDIT);
    const percentUsed =
      quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

    return {
      used,
      quota,
      alertThresholdPct: settings.alertThresholdPct,
      percentUsed,
    };
  }

  /** Aggregate token/cost usage for the current calendar month (on-the-fly reset). */
  async getMonthlyUsage(userId: string): Promise<MonthlyUsage> {
    const monthStart = startOfMonth(new Date());
    const agg = await this.prisma.tokenUsageLog.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        costUsd: true,
      },
    });
    return {
      promptTokens: agg._sum.promptTokens ?? 0,
      completionTokens: agg._sum.completionTokens ?? 0,
      totalTokens: agg._sum.totalTokens ?? 0,
      cost: agg._sum.costUsd ?? 0,
    };
  }

  /** Throws 403 when the teacher has already consumed their monthly token budget. */
  async assertWithinQuota(userId: string): Promise<void> {
    const [quota, usage] = await Promise.all([
      this.getResolvedQuota(userId),
      this.getMonthlyUsage(userId),
    ]);
    if (usage.totalTokens >= quota * TOKENS_PER_CREDIT) {
      throw new ForbiddenException('Monthly AI credit quota exceeded');
    }
  }

  /** Record one pipeline run's Gemini token usage + computed cost. */
  async logUsage(input: LogUsageInput) {
    const totalTokens = input.promptTokens + input.completionTokens;
    const costUsd = computeCostUsd(input.promptTokens, input.completionTokens);
    return this.prisma.tokenUsageLog.create({
      data: {
        userId: input.userId,
        jobId: input.jobId ?? null,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens,
        costUsd,
        model: input.model,
      },
    });
  }

  async setTeacherQuota(userId: string, quota: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return this.prisma.user.update({
      where: { id: userId },
      data: { creditQuota: quota },
      select: { id: true, creditQuota: true },
    });
  }

  /** Teacher list with current-month credit usage for the admin dashboard. */
  async listTeacherCredits() {
    const monthStart = startOfMonth(new Date());
    const [teachers, settings, grouped] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: UserRole.TEACHER },
        select: { id: true, name: true, email: true, creditQuota: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.getSettings(),
      this.prisma.tokenUsageLog.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: monthStart } },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          costUsd: true,
        },
      }),
    ]);

    const byUser = new Map(grouped.map((g) => [g.userId, g._sum]));

    return teachers.map((t) => {
      const sum = byUser.get(t.id);
      const totalTokens = sum?.totalTokens ?? 0;
      return {
        id: t.id,
        name: t.name,
        email: t.email,
        quota: t.creditQuota ?? settings.defaultQuota,
        used: Math.floor(totalTokens / TOKENS_PER_CREDIT),
        promptTokens: sum?.promptTokens ?? 0,
        completionTokens: sum?.completionTokens ?? 0,
        cost: sum?.costUsd ?? 0,
      };
    });
  }

  /** A teacher's per-call usage log for the current month (newest first). */
  async getTeacherLogs(userId: string) {
    const monthStart = startOfMonth(new Date());
    const logs = await this.prisma.tokenUsageLog.findMany({
      where: { userId, createdAt: { gte: monthStart } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        promptTokens: true,
        completionTokens: true,
        costUsd: true,
      },
    });
    return logs.map((l) => ({
      id: l.id,
      createdAt: l.createdAt,
      promptTokens: l.promptTokens,
      completionTokens: l.completionTokens,
      cost: l.costUsd,
    }));
  }
}

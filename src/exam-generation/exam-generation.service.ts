import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { QuestionGenerationGraphService } from './services/question-generation-graph.service';

@Injectable()
export class ExamGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionGenerationGraphService: QuestionGenerationGraphService,
    private readonly creditsService: CreditsService,
  ) {}

  async createJob(
    userId: string,
    dto: GenerateQuestionsDto,
  ): Promise<{ jobId: string }> {
    // Block the run up front if the teacher is already over their monthly quota.
    await this.creditsService.assertWithinQuota(userId);

    const job = await this.prisma.generationJob.create({ data: { userId } });

    this.runPipeline(job.id, userId, dto).catch((err: unknown) => {
      console.error(`Generation job ${job.id} failed:`, err);
    });

    return { jobId: job.id };
  }

  async getJob(jobId: string) {
    const job = await this.prisma.generationJob.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException(`Generation job ${jobId} not found`);
    return job;
  }

  private async runPipeline(
    jobId: string,
    userId: string,
    dto: GenerateQuestionsDto,
  ): Promise<void> {
    await this.prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', progress: 0 },
    });

    try {
      const { questions, usage, model } =
        await this.questionGenerationGraphService.run(
          {
            uploadIds: dto.uploadIds,
            numQuestions: dto.numQuestions,
            difficultyDist: dto.difficultyDist,
          },
          {
            onProgress: async (progress: number) => {
              await this.prisma.generationJob.update({
                where: { id: jobId },
                data: { progress },
              });
            },
          },
        );

      // Record this run's Gemini token usage + cost against the teacher's credits.
      await this.creditsService.logUsage({
        userId,
        jobId,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        model,
      });

      await this.prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: 'DONE',
          progress: 100,
          result: questions as unknown as Prisma.JsonArray,
        },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      await this.prisma.generationJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: message },
      });
    }
  }
}

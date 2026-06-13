import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { GenerateSlidesDto } from './dto/generate-slides.dto';
import { SlideGenerationGraphService } from './services/slide-generation-graph.service';

@Injectable()
export class SlideGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slideGenerationGraphService: SlideGenerationGraphService,
    private readonly creditsService: CreditsService,
  ) {}

  async createJob(
    userId: string,
    dto: GenerateSlidesDto,
  ): Promise<{ jobId: string }> {
    // Slides share the teacher's monthly AI quota with exam generation —
    // block up front when already over budget.
    await this.creditsService.assertWithinQuota(userId);

    const job = await this.prisma.generationJob.create({ data: { userId } });

    this.runPipeline(job.id, userId, dto).catch((err: unknown) => {
      console.error(`Slide generation job ${job.id} failed:`, err);
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
    dto: GenerateSlidesDto,
  ): Promise<void> {
    await this.prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', progress: 0 },
    });

    try {
      const { slides, usage, model } =
        await this.slideGenerationGraphService.run(
          {
            uploadIds: dto.uploadIds,
            numSlides: dto.numSlides,
            density: dto.density,
            language: dto.language,
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

      // Record token usage against the SAME monthly credit pool as exams.
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
          result: slides as unknown as Prisma.JsonArray,
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

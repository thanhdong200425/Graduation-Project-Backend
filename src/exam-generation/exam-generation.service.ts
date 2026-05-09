import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { QuestionGenerationGraphService } from './services/question-generation-graph.service';

@Injectable()
export class ExamGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionGenerationGraphService: QuestionGenerationGraphService,
  ) {}

  async createJob(dto: GenerateQuestionsDto): Promise<{ jobId: string }> {
    const job = await this.prisma.generationJob.create({ data: {} });

    this.runPipeline(job.id, dto).catch((err: unknown) => {
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
    dto: GenerateQuestionsDto,
  ): Promise<void> {
    await this.prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', progress: 0 },
    });

    try {
      const questions = await this.questionGenerationGraphService.run(
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

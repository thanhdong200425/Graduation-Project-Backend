import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { ExamGenerationService } from './exam-generation.service';

@Controller('generate-questions')
@UseGuards(JwtAuthGuard)
export class ExamGenerationController {
  constructor(private readonly examGenerationService: ExamGenerationService) {}

  @Post('/')
  @HttpCode(HttpStatus.CREATED)
  async generateQuestions(
    @Body() body: GenerateQuestionsDto,
  ): Promise<{ jobId: string }> {
    return this.examGenerationService.createJob(body);
  }

  @Get('/jobs/:id')
  async getJobStatus(@Param('id') id: string) {
    return this.examGenerationService.getJob(id);
  }
}

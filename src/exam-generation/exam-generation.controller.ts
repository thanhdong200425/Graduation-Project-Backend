import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthRequest } from '../auth/interfaces/auth-request.interface';
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
    @Req() req: AuthRequest,
  ): Promise<{ jobId: string }> {
    return this.examGenerationService.createJob(req.user.id, body);
  }

  @Get('/jobs/:id')
  async getJobStatus(@Param('id') id: string) {
    return this.examGenerationService.getJob(id);
  }
}

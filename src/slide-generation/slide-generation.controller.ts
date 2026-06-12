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
import { GenerateSlidesDto } from './dto/generate-slides.dto';
import { SlideGenerationService } from './slide-generation.service';

@Controller('generate-slides')
@UseGuards(JwtAuthGuard)
export class SlideGenerationController {
  constructor(
    private readonly slideGenerationService: SlideGenerationService,
  ) {}

  @Post('/')
  @HttpCode(HttpStatus.CREATED)
  async generateSlides(
    @Body() body: GenerateSlidesDto,
    @Req() req: AuthRequest,
  ): Promise<{ jobId: string }> {
    return this.slideGenerationService.createJob(req.user.id, body);
  }

  @Get('/jobs/:id')
  async getJobStatus(@Param('id') id: string) {
    return this.slideGenerationService.getJob(id);
  }
}

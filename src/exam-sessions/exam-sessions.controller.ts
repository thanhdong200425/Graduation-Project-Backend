import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ExamSessionsService } from './exam-sessions.service';
import { CreateExamSessionDto } from './dto/create-exam-session.dto';
import { SubmitExamDto } from './dto/submit-exam.dto';
import type { AuthRequest } from '../auth/interfaces/auth-request.interface';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('exam-sessions')
export class ExamSessionsController {
  constructor(private readonly examSessionsService: ExamSessionsService) {}

  @Post()
  async create(
    @Body() createExamSessionDto: CreateExamSessionDto,
    @Req() req: AuthRequest,
  ) {
    return this.examSessionsService.create(req.user.id, createExamSessionDto);
  }

  @Get('generate-code')
  async generateCode() {
    return this.examSessionsService.generateUniqueCode();
  }

  @Get('analytics/overview')
  async getAnalyticsOverview(@Req() req: AuthRequest) {
    return this.examSessionsService.getAnalyticsOverview(req.user.id);
  }

  @Get('analytics/dashboard')
  async getTeacherDashboard(@Req() req: AuthRequest) {
    return this.examSessionsService.getTeacherDashboard(req.user.id);
  }

  @Get(':id/analytics')
  async getSessionAnalytics(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    return this.examSessionsService.getSessionAnalytics(id, req.user.id);
  }

  @Get('code/:code')
  async getByCode(@Param('code') code: string) {
    return this.examSessionsService.findByCode(code);
  }

  @Post(':id/start')
  @Roles(UserRole.STUDENT)
  async start(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    return this.examSessionsService.start(id, req.user.id);
  }

  @Post(':id/submit')
  @Roles(UserRole.STUDENT)
  async submit(
    @Param('id') id: string,
    @Body() submitDto: SubmitExamDto,
    @Req() req: AuthRequest,
  ) {
    return this.examSessionsService.submit(id, req.user.id, submitDto);
  }
}

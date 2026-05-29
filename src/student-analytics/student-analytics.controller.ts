import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthRequest } from '../auth/interfaces/auth-request.interface';
import { StudentAnalyticsQueryDto } from './dto/student-analytics-query.dto';
import { StudentAnalyticsService } from './student-analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('student/analytics')
export class StudentAnalyticsController {
  constructor(
    private readonly studentAnalyticsService: StudentAnalyticsService,
  ) {}

  @Get('metrics')
  getMetrics(
    @Req() req: AuthRequest,
    @Query() query: StudentAnalyticsQueryDto,
  ) {
    return this.studentAnalyticsService.getMetrics(
      req.user.id,
      query.range ?? '30d',
    );
  }

  @Get('score-history')
  getScoreHistory(@Req() req: AuthRequest) {
    return this.studentAnalyticsService.getScoreHistory(req.user.id);
  }

  @Get('test-comparison')
  getTestComparison(@Req() req: AuthRequest) {
    return this.studentAnalyticsService.getTestComparison(req.user.id);
  }

  @Get('my-tests')
  getMyTests(@Req() req: AuthRequest) {
    return this.studentAnalyticsService.getMyTests(req.user.id);
  }

  @Get('my-tests/:sessionId/results')
  getTestResults(
    @Req() req: AuthRequest,
    @Param('sessionId') sessionId: string,
  ) {
    return this.studentAnalyticsService.getTestResults(
      req.user.id,
      sessionId,
    );
  }
}

import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthRequest } from '../auth/interfaces/auth-request.interface';
import { ActivityFeedQueryDto } from './dto/activity-feed-query.dto';
import { TeacherActivityService } from './teacher-activity.service';

@UseGuards(JwtAuthGuard)
@Controller('teacher')
export class TeacherActivityController {
  constructor(private readonly teacherActivityService: TeacherActivityService) {}

  @Get('activity-feed')
  getActivityFeed(
    @Req() req: AuthRequest,
    @Query() query: ActivityFeedQueryDto,
  ) {
    return this.teacherActivityService.buildFeed(req.user.id, query);
  }
}

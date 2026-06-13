import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthRequest } from '../auth/interfaces/auth-request.interface';
import { CreditsService } from '../credits/credits.service';

@UseGuards(JwtAuthGuard)
@Controller('teacher/credits')
export class TeacherCreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get('summary')
  getSummary(@Req() req: AuthRequest) {
    return this.creditsService.getTeacherSummary(req.user.id);
  }
}

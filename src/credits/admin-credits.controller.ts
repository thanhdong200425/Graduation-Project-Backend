import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../admin/admin-jwt.guard';
import { CreditsService } from './credits.service';
import { UpdateTeacherQuotaDto } from './dto/update-teacher-quota.dto';
import { UpdateCreditSettingsDto } from './dto/update-credit-settings.dto';

@UseGuards(AdminJwtGuard)
@Controller('admin/credits')
export class AdminCreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get('teachers')
  listTeachers() {
    return this.creditsService.listTeacherCredits();
  }

  @Get('teachers/:id/logs')
  getTeacherLogs(@Param('id') id: string) {
    return this.creditsService.getTeacherLogs(id);
  }

  @Patch('teachers/:id/quota')
  updateTeacherQuota(
    @Param('id') id: string,
    @Body() dto: UpdateTeacherQuotaDto,
  ) {
    return this.creditsService.setTeacherQuota(id, dto.quota);
  }

  @Get('settings')
  getSettings() {
    return this.creditsService.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateCreditSettingsDto) {
    return this.creditsService.updateSettings(dto);
  }
}

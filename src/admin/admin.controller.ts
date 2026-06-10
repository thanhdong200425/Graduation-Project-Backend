import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminHealthService } from './admin-health.service';
import { AdminService } from './admin.service';
import { AdminChangePasswordDto } from './dto/admin-change-password.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminUpdateProfileDto } from './dto/admin-update-profile.dto';
import { AdminJwtGuard } from './admin-jwt.guard';
import type { AdminAuthRequest } from './interfaces/admin-auth-request.interface';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminHealthService: AdminHealthService,
  ) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: AdminLoginDto) {
    return this.adminService.login(loginDto);
  }

  @Get('auth/me')
  @UseGuards(AdminJwtGuard)
  getMe(@Req() req: AdminAuthRequest) {
    return req.user;
  }

  @Get('health')
  @UseGuards(AdminJwtGuard)
  getHealth() {
    return this.adminHealthService.getStatus();
  }

  @Patch('auth/profile')
  @UseGuards(AdminJwtGuard)
  updateProfile(
    @Req() req: AdminAuthRequest,
    @Body() dto: AdminUpdateProfileDto,
  ) {
    return this.adminService.updateProfile(req.user.id, dto);
  }

  @Patch('auth/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminJwtGuard)
  changePassword(
    @Req() req: AdminAuthRequest,
    @Body() dto: AdminChangePasswordDto,
  ) {
    return this.adminService.changePassword(req.user.id, dto);
  }

  /* ── User management ── */

  @Get('users')
  @UseGuards(AdminJwtGuard)
  findAllUsers() {
    return this.adminService.findAllUsers();
  }

  @Patch('users/:id/suspend')
  @UseGuards(AdminJwtGuard)
  suspendUser(@Param('id') id: string) {
    return this.adminService.suspendUser(id);
  }

  @Patch('users/:id/activate')
  @UseGuards(AdminJwtGuard)
  activateUser(@Param('id') id: string) {
    return this.adminService.activateUser(id);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminJwtGuard)
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Post('users/:id/send-reset-link')
  @UseGuards(AdminJwtGuard)
  sendPasswordResetLink(@Param('id') id: string) {
    return this.adminService.sendPasswordResetLink(id);
  }

  /* ── Analytics ── */

  @Get('analytics/overview')
  @UseGuards(AdminJwtGuard)
  getAnalyticsOverview() {
    return this.adminService.getAnalyticsOverview();
  }

  @Get('analytics/dau-chart')
  @UseGuards(AdminJwtGuard)
  getDauChart(@Query('range') range?: string) {
    const validRange = range === '7d' || range === '30d' ? range : '90d';
    return this.adminService.getDauChart(validRange);
  }
}

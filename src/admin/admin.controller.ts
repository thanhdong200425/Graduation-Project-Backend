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
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminJwtGuard } from './admin-jwt.guard';
import type { AdminAuthRequest } from './interfaces/admin-auth-request.interface';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: AdminLoginDto) {
    return this.adminService.login(loginDto);
  }

  @Get('auth/me')
  @UseGuards(AdminJwtGuard)
  getMe(@Req() req: AdminAuthRequest) {
    return req.admin;
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
}

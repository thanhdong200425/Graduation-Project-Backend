import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleOAuthGuard } from './google-oauth.guard';
import type { AuthRequest } from './interfaces/auth-request.interface';
import type { GoogleProfile } from './interfaces/google-profile.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: AuthRequest) {
    return req.user;
  }

  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  changePassword(@Req() req: AuthRequest, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // Generic response so callers can't tell whether the email is registered.
    return {
      message:
        'If an account exists for that email, a password reset link has been sent.',
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  /**
   * Step 1: the "Continue with Google" button hits this. The guard redirects to
   * Google's consent screen, carrying ?role=TEACHER|STUDENT as OAuth state.
   */
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  googleAuth() {
  }

  /**
   * Step 2: Google redirects back here. The guard runs GoogleStrategy.validate
   * (populating req.user), we mint a JWT, then bounce to the frontend handler.
   */
  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';

    try {
      const profile = req.user as GoogleProfile;
      // State is the param we passed to Google in the first step, because this process is stateless
      const state =
        typeof req.query.state === 'string' ? req.query.state : undefined;
      const { accessToken } = await this.authService.loginWithGoogle(
        profile,
        state,
      );
      res.redirect(
        `${frontendUrl}/auth/callback?token=${encodeURIComponent(accessToken)}`,
      );
    } catch (err) {
      const code =
        err instanceof ForbiddenException
          ? 'account_suspended'
          : 'google_failed';
      res.redirect(`${frontendUrl}/auth/callback?error=${code}`);
    }
  }
}

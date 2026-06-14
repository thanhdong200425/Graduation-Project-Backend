import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { UsersModule } from '../users/users.module';

// Only register the Google strategy when credentials are configured, otherwise
// passport-google-oauth20 throws at construction and the whole app fails to
// boot. Without these the /auth/google routes simply return an error.
const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

@Module({
  imports: [
    UsersModule,
    ConfigModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const jwtSecret = process.env.JWT_SECRET;

        if (!jwtSecret) {
          throw new Error('JWT_SECRET is not defined in environment variables');
        }

        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: (process.env.JWT_EXPIRES_IN || '1d') as StringValue,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    ...(googleConfigured ? [GoogleStrategy] : []),
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}

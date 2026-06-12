import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import type { StringValue } from 'ms';
import { QdrantModule } from '../qdrant/qdrant.module';
import { AdminController } from './admin.controller';
import { AdminHealthService } from './admin-health.service';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminJwtStrategy } from './admin-jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    QdrantModule,
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
  controllers: [AdminController],
  providers: [AdminService, AdminHealthService, AdminJwtStrategy, AdminJwtGuard],
  exports: [AdminService, AdminJwtGuard],
})
export class AdminModule {}

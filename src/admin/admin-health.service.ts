import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../qdrant/qdrant.service';
import type {
  AdminHealthResponseDto,
  ServiceHealthStatus,
} from './dto/admin-health-response.dto';

@Injectable()
export class AdminHealthService {
  private readonly logger = new Logger(AdminHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qdrantService: QdrantService,
    private readonly configService: ConfigService,
  ) {}

  async getStatus(): Promise<AdminHealthResponseDto> {
    const [postgresql, qdrant, pipeline] = await Promise.all([
      this.checkPostgresql(),
      this.checkQdrant(),
      this.checkPipeline(),
    ]);

    return {
      checkedAt: new Date().toISOString(),
      services: { postgresql, qdrant, pipeline },
    };
  }

  private async checkPostgresql(): Promise<ServiceHealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch (error) {
      this.logger.warn('PostgreSQL health check failed', error);
      return 'down';
    }
  }

  private async checkQdrant(): Promise<ServiceHealthStatus> {
    const ok = await this.qdrantService.ping();
    return ok ? 'ok' : 'down';
  }

  private async checkPipeline(): Promise<ServiceHealthStatus> {
    const baseUrl = this.configService.get<string>('FASTAPI_BASE_URL');
    if (!baseUrl) {
      return 'down';
    }

    const url = baseUrl.replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok ? 'ok' : 'down';
    } catch (error) {
      this.logger.warn(`Pipeline health check failed for ${url}`, error);
      return 'down';
    } finally {
      clearTimeout(timeout);
    }
  }
}

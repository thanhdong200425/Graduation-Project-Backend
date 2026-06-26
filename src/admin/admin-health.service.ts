import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantService } from '../qdrant/qdrant.service';
import type {
  AdminHealthResponseDto,
  ServiceHealthStatus,
} from './dto/admin-health-response.dto';

@Injectable()
export class AdminHealthService {
  private readonly logger = new Logger(AdminHealthService.name);

  constructor(
    private readonly qdrantService: QdrantService,
    private readonly configService: ConfigService,
  ) {}

  async getStatus(): Promise<AdminHealthResponseDto> {
    const [qdrant, pipeline] = await Promise.all([
      this.checkQdrant(),
      this.checkPipeline(),
    ]);

    return {
      checkedAt: new Date().toISOString(),
      services: { qdrant, pipeline },
    };
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

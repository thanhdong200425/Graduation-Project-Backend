export type ServiceHealthStatus = 'ok' | 'down';

export class AdminHealthResponseDto {
  checkedAt!: string;
  services!: {
    postgresql: ServiceHealthStatus;
    qdrant: ServiceHealthStatus;
    pipeline: ServiceHealthStatus;
  };
}

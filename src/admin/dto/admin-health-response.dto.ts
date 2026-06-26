export type ServiceHealthStatus = 'ok' | 'down';

export class AdminHealthResponseDto {
  checkedAt!: string;
  services!: {
    qdrant: ServiceHealthStatus;
    pipeline: ServiceHealthStatus;
  };
}

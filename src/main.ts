import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function getCorsOrigins(): string | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    return 'http://localhost:5173';
  }
  const list = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (list.length === 1) {
    return list[0] ?? 'http://localhost:5173';
  }
  return list;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: getCorsOrigins(),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  // Enable shutdown hooks for Prisma
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3333;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port} 🚀`);
}
void bootstrap();

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadEnvFile, loadServerEnv } from '@family-app/config';
import { createLogger } from '@family-app/observability';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';

async function bootstrap() {
  // `nest start` does not auto-load .env* files (unlike Next.js) — without
  // this, apps/api/.env.local is silently ignored, loadServerEnv() below
  // fails on the required SUPABASE_* vars, and the whole process exits
  // before it ever binds API_PORT. From the browser that shows up as
  // "Failed to fetch" on any apiFetch() call (e.g. /onboarding/bootstrap
  // during cadastro) — connection refused, not a real CORS/network issue.
  loadEnvFile();
  const env = loadServerEnv();
  const logger = createLogger({ name: 'api', level: env.LOG_LEVEL });

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(CorrelationIdMiddleware);
  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS.length > 0 ? env.CORS_ALLOWED_ORIGINS : false,
    credentials: true,
  });
  app.setGlobalPrefix('api/v1', { exclude: ['/health'] });
  app.useGlobalFilters(new HttpExceptionFilter(logger));

  const config = new DocumentBuilder()
    .setTitle('Family Intelligence Platform API')
    .setDescription('API v1 — see ARCHITECTURE.md and SECURITY.md for design rationale.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);

  await app.listen(env.API_PORT);
  logger.info({ port: env.API_PORT, appEnv: env.APP_ENV }, 'API listening');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});

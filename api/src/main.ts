import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '');
}

function parseConfiguredOrigins(): string[] {
  const configured = process.env.FRONTEND_URL || '';

  return configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // FRONTEND_URL should be set to your Netlify URL in production.
  // Supports one or multiple comma-separated values.
  const allowedOrigins = new Set<string>([
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    ...parseConfiguredOrigins(),
  ]);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser calls (curl, health checks) that do not send Origin.
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);

      // Explicit allowlist first.
      if (allowedOrigins.has(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      // Helpful fallback for Netlify preview/production domains in demos.
      if (/^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed by CORS: ${normalizedOrigin}`));
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

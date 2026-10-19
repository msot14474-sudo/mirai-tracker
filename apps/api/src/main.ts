import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { validateEnvironment } from './config/environment';

config({ path: resolve(process.cwd(), '../../.env') });
validateEnvironment(process.env);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(helmet());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'Server-Timing', 'X-Response-Time'],
  });
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();

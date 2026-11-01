import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module';
import { AUTH } from './auth/auth.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  // Goes before the body parser, because better-auth reads the request body itself.
  app.getHttpAdapter().getInstance().all('/api/auth/*splat', toNodeHandler(app.get(AUTH)));
  app.useBodyParser('json');
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();

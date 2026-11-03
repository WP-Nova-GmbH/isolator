import 'reflect-metadata';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const server = app.getHttpAdapter().getInstance();
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  // The production image serves the web app from here, so it shares one address with the API.
  const webDir = process.env.WEB_DIR;
  if (webDir) {
    app.useStaticAssets(webDir);
    // The web app has its own routes, but a missing file in assets/ stays a 404.
    server.get(/^\/(?!api(\/|$)|assets\/)/, (_req: unknown, res: { sendFile(path: string): void }) =>
      res.sendFile(join(webDir, 'index.html')),
    );
  }

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();

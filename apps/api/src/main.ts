import 'reflect-metadata';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module';
import { AUTH } from './auth/auth.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const server = app.getHttpAdapter().getInstance();
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  // Goes before the body parser, because better-auth reads the request body itself.
  server.all('/api/auth/*splat', toNodeHandler(app.get(AUTH)));
  app.useBodyParser('json');

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

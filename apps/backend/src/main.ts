import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const config = env(); // fail-fast: variáveis inválidas impedem a inicialização
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app, { swagger: true });
  app.enableShutdownHooks();
  await app.listen(config.PORT);
}

void bootstrap();

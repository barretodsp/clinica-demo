import { StandardSchemaValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { requestIdMiddleware } from './common/request-context.js';

/** Configuração compartilhada por main.ts e pelos testes. */
export function configureApp(app: INestApplication, options: { swagger?: boolean } = {}): void {
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1); // um proxy na frente (nginx ou Vite)
  express.disable('x-powered-by');
  express.use(requestIdMiddleware); // primeiro: requestId para tudo, inclusive 401/403/429
  express.useBodyParser('json', { limit: '200kb' }); // laudo: até ~100 KB de JSON
  app.setGlobalPrefix('api');
  // CSRF: checagem de origem (Sec-Fetch-Site / Origin x Host) nas requisições de escrita
  app.enableCsrfProtection();
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  if (options.swagger) {
    const config = new DocumentBuilder()
      .setTitle('Clínica — Agendamento de exames e laudos')
      .setDescription(
        'API do desafio técnico. Autenticação por cookie HttpOnly: chame POST /api/auth/login nesta página ' +
          'e o navegador passa a enviar o cookie. A rota FHIR usa o token de serviço (Bearer).',
      )
      .setVersion('1.0')
      .addCookieAuth('clinic_session')
      .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'Token de serviço (somente rota FHIR)' })
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config));
  }
}

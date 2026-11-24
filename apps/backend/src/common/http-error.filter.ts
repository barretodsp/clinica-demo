import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { QueryFailedError } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.js';
import { actorFields } from '../observability/logger.config.js';
import { currentRequestId } from './request-context.js';

const DEFAULT_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE',
  429: 'TOO_MANY_ATTEMPTS',
};

const DEFAULT_MESSAGES: Record<number, string> = {
  401: 'Autenticação necessária.',
  403: 'Acesso negado.',
  404: 'Recurso não encontrado.',
  429: 'Muitas tentativas. Aguarde um minuto e tente novamente.',
};

/**
 * LGPD: o QueryFailedError do TypeORM carrega `query`, `parameters` e `driverError`
 * (com `detail`), ou seja, os valores gravados — corpo do laudo, título, dados do
 * paciente. O serializer de erro do Pino copiaria tudo para o log, e o REDACT_PATHS
 * não alcança `err.parameters[n]`. Nem a `message` é segura: o Postgres às vezes
 * inclui o valor recebido nela (ex.: `invalid input syntax for type uuid: "…"`).
 * Para esse erro, só vão para o log o SQLSTATE e a constraint. O `name` fica de fora:
 * o REDACT_PATHS tem '*.name' (nome de pessoa), que o apagaria de qualquer forma.
 */
export function loggableError(exception: unknown): unknown {
  if (!(exception instanceof QueryFailedError)) return exception;
  const driver = exception.driverError as { code?: string; constraint?: string } | undefined;
  return { code: driver?.code, constraint: driver?.constraint };
}

/** Corpo de erro único: { statusCode, code, message, details? } — inclusive para 401/429 dos guards. */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext('http');
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { user?: AuthUser; route?: { path?: string } }>();

    if (!(exception instanceof HttpException)) {
      this.logger.error({ err: loggableError(exception), requestId: currentRequestId() }, 'unhandled error');
      res.status(500).json({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno.' });
      return;
    }

    const status = exception.getStatus();
    const raw = exception.getResponse();
    const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    let code = typeof obj.code === 'string' ? obj.code : (DEFAULT_CODES[status] ?? `HTTP_${status}`);
    if (exception instanceof ThrottlerException) code = 'TOO_MANY_ATTEMPTS';
    let message = typeof obj.message === 'string' ? obj.message : (DEFAULT_MESSAGES[status] ?? exception.message);
    let details = obj.details as Record<string, unknown> | undefined;

    // erros de validação do schema (StandardSchemaValidationPipe)
    if (status === 400 && Array.isArray(obj.message)) {
      details = { issues: obj.message };
      message = 'Requisição inválida.';
    }
    if (status === 429) message = DEFAULT_MESSAGES[429];
    if (!obj.code && DEFAULT_MESSAGES[status] && status !== 400) message = DEFAULT_MESSAGES[status];

    if (status === HttpStatus.FORBIDDEN) {
      this.logger.warn({ event: 'access.denied', code, route: req.route?.path, method: req.method, requestId: currentRequestId(), ...actorFields(req.user) }, 'access.denied');
    } else if (status === HttpStatus.CONFLICT && req.route?.path?.includes('appointments')) {
      this.logger.warn({ event: 'appointment.conflict', code, requestId: currentRequestId(), ...actorFields(req.user) }, 'appointment.conflict');
    }

    res.status(status).json({ statusCode: status, code, message, ...(details ? { details } : {}) });
  }
}

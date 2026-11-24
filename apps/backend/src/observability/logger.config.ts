import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { TransportTargetOptions } from 'pino';
import { env } from '../config/env.js';
import type { AuthUser } from '../auth/auth-user.js';

/**
 * LGPD: logs carregam somente IDs. Estes caminhos são removidos na origem,
 * caso algum dado sensível seja passado por engano.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'password', '*.password',
  'passwordHash', '*.passwordHash',
  'email', '*.email',
  'name', '*.name',
  'document', '*.document',
  'cpf', '*.cpf',
  'birthDate', '*.birthDate',
  'title', '*.title',
  'titleComplement', '*.titleComplement',
  'body', '*.body',
  'bodyText', '*.bodyText',
  'token', '*.token',
  'cookie', '*.cookie',
];

type Req = IncomingMessage & { id?: string; user?: AuthUser; route?: { path?: string }; baseUrl?: string; originalUrl?: string };

export function actorFields(user: AuthUser | null | undefined) {
  if (!user) return {};
  return user.kind === 'service'
    ? { actorType: 'SERVICE', actorId: user.id, authMethod: 'service-token' }
    : { actorType: 'USER', actorId: user.id, actorRole: user.role, authMethod: 'cookie' };
}

/** Rota "padrão" (com parâmetros), não a URL concreta: baixa cardinalidade e sem IDs. */
function routePattern(req: Req): string {
  if (req.route?.path) return `${req.baseUrl ?? ''}${req.route.path}`;
  return 'unmatched';
}

function httpLogObject(req: Req, res: ServerResponse, responseTime: number) {
  return {
    event: 'http.request',
    requestId: req.id,
    method: req.method,
    route: routePattern(req),
    statusCode: res.statusCode,
    responseTimeMs: Math.round(responseTime),
    ...actorFields(req.user),
  };
}

export function loggerParams(): Params {
  const e = env();
  const targets: TransportTargetOptions[] = [];
  if (e.NODE_ENV === 'development') {
    targets.push({ target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' }, level: e.LOG_LEVEL });
  } else {
    targets.push({ target: 'pino/file', options: { destination: 1 }, level: e.LOG_LEVEL });
  }
  if (e.LOKI_URL) {
    targets.push({
      target: 'pino-loki',
      level: e.LOG_LEVEL,
      options: {
        host: e.LOKI_URL,
        labels: { app: 'clinic-api', env: e.NODE_ENV },
        batching: { interval: 2 },
        silenceErrors: true,
      },
    });
  }

  return {
    // nossos próprios logs de requisição (abaixo) substituem os do Nest
    forRoutes: ['{*path}'],
    pinoHttp: {
      level: e.NODE_ENV === 'test' ? 'silent' : e.LOG_LEVEL,
      base: { app: 'clinic-api' },
      transport: e.NODE_ENV === 'test' ? undefined : { targets },
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      genReqId: (req) => (req as Req).id ?? 'unknown',
      quietReqLogger: true,
      quietResLogger: true,
      customAttributeKeys: { reqId: 'requestId' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      customSuccessMessage: () => 'request completed',
      customErrorMessage: () => 'request failed',
      // objeto plano, sem req/res completos (que teriam headers e query)
      customSuccessObject: (req, res, val: { responseTime: number }) => httpLogObject(req as Req, res, val.responseTime),
      customErrorObject: (req, res, _err, val: { responseTime: number }) => httpLogObject(req as Req, res, val.responseTime),
      // o healthcheck do Docker (a cada 10 s) não polui os logs
      autoLogging: { ignore: (req) => ((req as Req).originalUrl ?? req.url ?? '').startsWith('/api/health') },
    },
  };
}

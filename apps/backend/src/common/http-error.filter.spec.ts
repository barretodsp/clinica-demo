import { Writable } from 'node:stream';
import type { ArgumentsHost } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import pino from 'pino';
import { QueryFailedError } from 'typeorm';
import { REDACT_PATHS } from '../observability/logger.config.js';
import { notFound, unprocessable } from './errors.js';
import { HttpErrorFilter, loggableError } from './http-error.filter.js';

/**
 * Ponto 2 da revisão (LGPD): erro de banco vai para o log só com
 * { code, constraint } — sem nome, mensagem, query, parâmetros nem detail.
 */

const SECRETS = ['João', 'joao@mail.com', 'texto clínico', 'Laudo de João', 'UPDATE medical_report', '12345678901'];

function queryFailed(driver: Record<string, unknown>, message = 'erro do driver') {
  const driverError = Object.assign(new Error(message), driver);
  return new QueryFailedError(
    'UPDATE medical_report SET body = $1, title = $2, body_text = $3 WHERE id = $4',
    ['{"type":"doc","content":"texto clínico"}', 'Laudo de João', 'texto clínico', 'id-1'],
    driverError,
  );
}

/** Logger Pino real com a mesma redação da aplicação; devolve as linhas escritas. */
function realPino() {
  const lines: string[] = [];
  const out = new Writable({ write: (chunk, _enc, cb) => (lines.push(chunk.toString()), cb()) });
  return { logger: pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, out), output: () => lines.join('') };
}

function fakeHost(req: Record<string, unknown> = { method: 'PUT', route: { path: '/api/clinics/:clinicId/medical-reports/:id' } }) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) } as unknown as ArgumentsHost;
  return { host, res };
}

function fakeLogger() {
  const logger = { setContext: vi.fn(), error: vi.fn(), warn: vi.fn() };
  return { logger, filter: new HttpErrorFilter(logger as unknown as PinoLogger) };
}

describe('loggableError — QueryFailedError só com code e constraint', () => {
  it.each<[string, Record<string, unknown>, string, Record<string, unknown>]>([
    [
      'violação de CHECK (23514)',
      { code: '23514', constraint: 'medical_report_body_size', detail: 'Failing row contains (texto clínico, Laudo de João).' },
      'new row for relation "medical_report" violates check constraint "medical_report_body_size"',
      { code: '23514', constraint: 'medical_report_body_size' },
    ],
    [
      'violação de unicidade (23505) com valor no detail',
      { code: '23505', constraint: 'user_account_email_key', detail: 'Key (email)=(joao@mail.com) already exists.' },
      'duplicate key value violates unique constraint "user_account_email_key"',
      { code: '23505', constraint: 'user_account_email_key' },
    ],
    [
      'entrada inválida com o valor na própria mensagem (22P02)',
      { code: '22P02' },
      'invalid input syntax for type uuid: "João"',
      { code: '22P02', constraint: undefined },
    ],
    [
      'caractere nulo no jsonb (22P05)',
      { code: '22P05', detail: '\\u0000 cannot be converted to text.' },
      'unsupported Unicode escape sequence',
      { code: '22P05', constraint: undefined },
    ],
    [
      'falha sem SQLSTATE (conexão caída)',
      {},
      'Connection terminated unexpectedly — texto clínico',
      { code: undefined, constraint: undefined },
    ],
  ])('%s', (_label, driver, message, expected) => {
    const logged = loggableError(queryFailed(driver, message));
    expect(logged).toEqual(expected);
    expect(Object.keys(logged as object).sort()).toEqual(['code', 'constraint']);
    const json = JSON.stringify(logged);
    for (const secret of [...SECRETS, message]) expect(json).not.toContain(secret);
  });

  it.each<[string, unknown]>([
    ['Error comum', new Error('boom')],
    ['HttpException', notFound('X', 'y')],
    ['string', 'falha'],
    ['objeto', { motivo: 'x' }],
    ['undefined', undefined],
  ])('não altera %s', (_label, value) => {
    expect(loggableError(value)).toBe(value);
  });
});

describe('Pino real + REDACT_PATHS', () => {
  it('sem a correção, o QueryFailedError cru vazaria parâmetros e query (por isso o loggableError existe)', () => {
    const { logger, output } = realPino();
    logger.error({ err: queryFailed({ code: '23514' }) }, 'unhandled error');
    expect(output()).toContain('texto clínico');
    expect(output()).toContain('UPDATE medical_report');
  });

  it('com loggableError, a linha de log tem só code e constraint', () => {
    const { logger, output } = realPino();
    const message = 'invalid input syntax for type uuid: "João"';
    logger.error({ err: loggableError(queryFailed({ code: '23514', constraint: 'medical_report_body_size', detail: 'texto clínico' }, message)) }, 'unhandled error');
    const line = JSON.parse(output());
    expect(line.err).toEqual({ code: '23514', constraint: 'medical_report_body_size' });
    expect(output()).not.toContain('[REDACTED]'); // nada sensível chegou a ser redigido: nem entrou
    for (const secret of [...SECRETS, message]) expect(output()).not.toContain(secret);
  });
});

describe('HttpErrorFilter', () => {
  it('erro de banco: loga sanitizado e responde 500 genérico, sem nada do banco no corpo', () => {
    const { logger, filter } = fakeLogger();
    const { host, res } = fakeHost();
    filter.catch(queryFailed({ code: '23514', constraint: 'medical_report_body_size', detail: 'texto clínico' }, 'msg com João'), host);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [logObject, logMessage] = logger.error.mock.calls[0];
    expect(logMessage).toBe('unhandled error');
    expect(logObject).toEqual({ err: { code: '23514', constraint: 'medical_report_body_size' }, requestId: null });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno.' });
    const sent = JSON.stringify([logger.error.mock.calls, res.json.mock.calls]);
    for (const secret of [...SECRETS, 'msg com João', 'medical_report SET']) expect(sent).not.toContain(secret);
  });

  it('erro que não é de banco continua indo inteiro para o log', () => {
    const { logger, filter } = fakeLogger();
    const { host, res } = fakeHost();
    const error = new TypeError('x is undefined');
    filter.catch(error, host);
    expect(logger.error.mock.calls[0][0]).toEqual({ err: error, requestId: null });
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('erro de domínio (422) não é logado como erro e devolve o código estável', () => {
    const { logger, filter } = fakeLogger();
    const { host, res } = fakeHost();
    filter.catch(unprocessable('INVALID_REPORT_BODY', 'O texto do laudo excede o tamanho máximo (100 KB).'), host);
    expect(logger.error).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 422, code: 'INVALID_REPORT_BODY', message: 'O texto do laudo excede o tamanho máximo (100 KB).' });
  });
});

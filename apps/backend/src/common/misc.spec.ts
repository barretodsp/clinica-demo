import { Writable } from 'node:stream';
import pino from 'pino';
import { truncateIp } from '../auth/auth.controller.js';
import { parseDurationSeconds } from '../auth/token.service.js';
import { REDACT_PATHS } from '../observability/logger.config.js';
import { PATIENTS } from '../database/seed/seed.js';
import { cpfCheckDigits, formatCpf, isValidCpf, maskCpf } from './cpf.js';

describe('CPF', () => {
  it('mascara o CPF nas listagens', () => {
    expect(maskCpf('12345678901')).toBe('***.456.789-**');
    expect(formatCpf('12345678901')).toBe('123.456.789-01');
  });

  it('valida os dígitos verificadores', () => {
    expect(cpfCheckDigits('123456789')).toBe('09');
    expect(isValidCpf('123.456.789-09')).toBe(true);
    expect(isValidCpf('123.456.789-00')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });

  it('o seed usa apenas CPFs válidos e distintos', () => {
    for (const p of PATIENTS) expect(isValidCpf(p.document)).toBe(true);
    expect(new Set(PATIENTS.map((p) => p.document)).size).toBe(PATIENTS.length);
  });
});

describe('IP no log de login com falha', () => {
  it('zera o último octeto', () => {
    expect(truncateIp('203.0.113.45')).toBe('203.0.113.0');
    expect(truncateIp('::ffff:10.1.2.3')).toBe('10.1.2.0');
  });
});

describe('duração do token', () => {
  it('converte 1h em 3600 s', () => {
    expect(parseDurationSeconds('1h')).toBe(3600);
    expect(parseDurationSeconds('30m')).toBe(1800);
  });
});

describe('LGPD — redação de campos sensíveis nos logs', () => {
  it('remove nome, e-mail, CPF, senha, conteúdo do laudo e cookies', () => {
    const lines: string[] = [];
    const out = new Writable({ write: (chunk, _enc, cb) => (lines.push(chunk.toString()), cb()) });
    const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, out);
    logger.info({
      event: 'x',
      patientId: 'id-1',
      name: 'João',
      email: 'a@b.c',
      password: 'segredo',
      patient: { name: 'João', document: '12345678901' },
      report: { title: 'Laudo', body: { type: 'doc' }, bodyText: 'texto clínico' },
      req: { headers: { cookie: 'clinic_session=abc', authorization: 'Bearer x' } },
    });
    const line = lines.join('');
    expect(line).toContain('"patientId":"id-1"');
    for (const secret of ['João', 'a@b.c', 'segredo', '12345678901', 'texto clínico', 'clinic_session=abc', 'Bearer x', '"Laudo"']) {
      expect(line).not.toContain(secret);
    }
  });
});

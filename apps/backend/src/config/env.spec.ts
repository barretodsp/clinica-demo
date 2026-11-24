import { envSchema } from './env.js';

/** Mínimo obrigatório para o schema validar; o resto vem dos defaults. */
const BASE = {
  DATABASE_URL: 'postgres://u:p@localhost/db',
  AUTH_SECRET: 'a'.repeat(32),
  SERVICE_TOKEN_SECRET: 'b'.repeat(32),
};

const parse = (extra: Record<string, string | undefined>) => envSchema.safeParse({ ...BASE, ...extra });

describe('ajustes operacionais via ambiente', () => {
  it('usa os defaults quando as variáveis não estão definidas', () => {
    const e = envSchema.parse(BASE);
    expect(e.APPOINTMENT_LIST_LIMIT).toBe(50);
    expect(e.PATIENT_SEARCH_LIMIT).toBe(20);
    expect(e.HEALTH_DB_TIMEOUT_MS).toBe(2_000);
  });

  it('usa os defaults quando as variáveis estão vazias (como no .env.example)', () => {
    const e = envSchema.parse({ ...BASE, APPOINTMENT_LIST_LIMIT: '', PATIENT_SEARCH_LIMIT: '', HEALTH_DB_TIMEOUT_MS: '' });
    expect([e.APPOINTMENT_LIST_LIMIT, e.PATIENT_SEARCH_LIMIT, e.HEALTH_DB_TIMEOUT_MS]).toEqual([50, 20, 2_000]);
  });

  it('converte o valor do ambiente (string) para número', () => {
    const e = envSchema.parse({ ...BASE, APPOINTMENT_LIST_LIMIT: '120', PATIENT_SEARCH_LIMIT: '5', HEALTH_DB_TIMEOUT_MS: '750' });
    expect([e.APPOINTMENT_LIST_LIMIT, e.PATIENT_SEARCH_LIMIT, e.HEALTH_DB_TIMEOUT_MS]).toEqual([120, 5, 750]);
  });

  it.each<[string, string, string]>([
    ['APPOINTMENT_LIST_LIMIT', '1', '500'],
    ['PATIENT_SEARCH_LIMIT', '1', '100'],
    ['HEALTH_DB_TIMEOUT_MS', '100', '10000'],
  ])('%s aceita os extremos %s e %s', (name, min, max) => {
    expect(parse({ [name]: min }).success).toBe(true);
    expect(parse({ [name]: max }).success).toBe(true);
  });

  it.each<[string, string]>([
    ['APPOINTMENT_LIST_LIMIT', '0'],
    ['APPOINTMENT_LIST_LIMIT', '-1'],
    ['APPOINTMENT_LIST_LIMIT', '501'],
    ['APPOINTMENT_LIST_LIMIT', '10.5'],
    ['APPOINTMENT_LIST_LIMIT', 'cinquenta'],
    ['PATIENT_SEARCH_LIMIT', '0'],
    ['PATIENT_SEARCH_LIMIT', '101'],
    ['PATIENT_SEARCH_LIMIT', 'abc'],
    ['HEALTH_DB_TIMEOUT_MS', '99'],
    ['HEALTH_DB_TIMEOUT_MS', '10001'],
    ['HEALTH_DB_TIMEOUT_MS', '2s'],
  ])('recusa %s=%s (fail-fast na subida)', (name, value) => {
    const result = parse({ [name]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([name]);
  });
});

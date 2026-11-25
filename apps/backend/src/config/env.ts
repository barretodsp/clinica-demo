import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';

/**
 * Carrega o `.env` da raiz do repositório (execução no host: testes e scripts), sem
 * sobrescrever variáveis já definidas no ambiente (containers do docker compose).
 */
function loadDotEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      const parsed = parseEnv(readFileSync(candidate, 'utf8'));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');
/** Inteiro vindo do ambiente, com default quando a variável não está definida (ou está vazia). */
const intInRange = (min: number, max: number, fallback: number) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(min).max(max).default(fallback));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  DATABASE_MIGRATION_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().refine((s) => Buffer.byteLength(s) >= 32, 'AUTH_SECRET precisa de ao menos 32 bytes'),
  AUTH_TOKEN_TTL: z
    .string()
    .regex(/^\d+(ms|s|m|h|d|w)$/, 'use um valor como 1h ou 60m')
    .default('1h')
    .transform((v) => v as `${number}${'ms' | 's' | 'm' | 'h' | 'd' | 'w'}`),
  COOKIE_SECURE: booleanString.default(true),
  SERVICE_TOKEN_SECRET: z
    .string()
    .refine((s) => Buffer.byteLength(s) >= 32, 'SERVICE_TOKEN_SECRET precisa de ao menos 32 bytes'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOKI_URL: z.string().optional().transform((v) => (v ? v : undefined)),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  SERVICE_RATE_LIMIT: z.coerce.number().int().positive().default(60),
  FHIR_CPF_SYSTEM: z.string().default('https://saude.gov.br/fhir/sid/cpf'),
  FHIR_CRM_SYSTEM: z.string().default('https://clinica.localhost/fhir/sid/crm'),
  /** Itens por consulta na lista de agendamentos (não há paginação). */
  APPOINTMENT_LIST_LIMIT: intInRange(1, 500, 50),
  /** Resultados por busca de paciente (a busca nunca lista todos). */
  PATIENT_SEARCH_LIMIT: intInRange(1, 100, 20),
  /**
   * Tempo máximo do ping no banco em /api/health/ready. Precisa ficar abaixo do timeout
   * da sonda (docker/uptime, 5 s): acima disso a sonda desiste antes do 503 e registra
   * a API como fora do ar, quando quem caiu foi o banco.
   */
  HEALTH_DB_TIMEOUT_MS: intInRange(100, 4_500, 2_000),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Lê e valida o ambiente uma vez (fail-fast na inicialização). */
export function env(): Env {
  if (!cached) {
    loadDotEnv();
    if (process.env.AUTH_SECRET && process.env.AUTH_SECRET === process.env.SERVICE_TOKEN_SECRET) {
      throw new Error('SERVICE_TOKEN_SECRET deve ser diferente de AUTH_SECRET');
    }
    cached = envSchema.parse(process.env);
  }
  return cached;
}

/** Usado pelos testes, que trocam variáveis antes de criar o app. */
export function resetEnvCache(): void {
  cached = undefined;
}

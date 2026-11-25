import { z } from 'zod';

/**
 * Variáveis próprias do pacs-seed. Não passam pelo env() do backend, que exige
 * segredos (AUTH_SECRET etc.) que este container não recebe.
 */
const pacsEnvSchema = z.object({
  /** Tempo máximo de cada chamada à API REST do Orthanc. */
  PACS_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(30_000),
  /**
   * Quanto esperar o Orthanc subir antes de desistir. Não é teto rígido: o waitReady confere
   * o prazo só entre tentativas, então o pior caso é este valor + PACS_REQUEST_TIMEOUT_MS + 1 s.
   */
  PACS_READY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(120_000),
});

export function pacsEnv(source: NodeJS.ProcessEnv = process.env) {
  return pacsEnvSchema.parse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== '')));
}

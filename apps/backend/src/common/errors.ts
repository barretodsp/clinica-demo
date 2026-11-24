import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Erro de domínio com código estável, para o frontend tratar por `code`.
 * Corpo de erro padronizado: { statusCode, code, message, details? }.
 */
export class DomainError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super({ statusCode: status, code, message, ...(details ? { details } : {}) }, status);
  }
}

export const notFound = (code: string, message: string) => new DomainError(HttpStatus.NOT_FOUND, code, message);
export const forbidden = (code: string, message: string) => new DomainError(HttpStatus.FORBIDDEN, code, message);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new DomainError(HttpStatus.CONFLICT, code, message, details);
export const unprocessable = (code: string, message: string, details?: Record<string, unknown>) =>
  new DomainError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);

/** Código SQLSTATE de violação de unicidade e o nome da constraint violada. */
export function uniqueViolation(error: unknown): string | null {
  const e = error as { driverError?: { code?: string; constraint?: string }; code?: string; constraint?: string };
  const driver = e?.driverError ?? e;
  return driver?.code === '23505' ? (driver.constraint ?? 'unknown') : null;
}

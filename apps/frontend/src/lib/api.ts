/** Erro da API no formato padronizado { statusCode, code, message, details? }. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler = () => {};

/** Registrado no main.tsx: 401 em qualquer chamada → encerra a sessão e vai ao login. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

/**
 * Cliente HTTP: mesma origem (/api), cookie HttpOnly enviado pelo navegador.
 * O frontend nunca lê o token.
 */
export async function api<T>(path: string, init: RequestInit & { json?: unknown; skipAuthRedirect?: boolean } = {}): Promise<T> {
  const { json, skipAuthRedirect, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...rest,
    headers: { Accept: 'application/json', ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(res.status, data.code ?? `HTTP_${res.status}`, data.message ?? res.statusText, data.details);
    if (res.status === 401 && !skipAuthRedirect) onUnauthorized();
    throw err;
  }
  return data as T;
}

export const isApiError = (e: unknown, status?: number): e is ApiError =>
  e instanceof ApiError && (status === undefined || e.status === status);

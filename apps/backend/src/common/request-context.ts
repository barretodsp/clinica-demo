import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

interface RequestStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

/** requestId da requisição atual (gerado pelo nginx ou aqui), para logs e auditoria. */
export function currentRequestId(): string | null {
  return storage.getStore()?.requestId ?? null;
}

const VALID_ID = /^[\w.-]{1,128}$/;

/**
 * Primeiro middleware: adota o X-Request-Id do nginx (se bem formado) ou gera um,
 * devolve no header da resposta e o disponibiliza via AsyncLocalStorage.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  (req as Request & { id?: string }).id = requestId;
  res.setHeader('X-Request-Id', requestId);
  storage.run({ requestId }, () => next());
}

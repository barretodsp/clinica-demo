import { z } from 'zod';
import { isIsoDate } from './clinic-time.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);

export const uuidSchema = z.string().regex(UUID, 'id inválido');
export const isoDateSchema = z.string().refine(isIsoDate, 'data inválida (use YYYY-MM-DD)');

import { Param, type PipeTransform } from '@nestjs/common';
import { notFound } from './errors.js';

/** :id que não é UUID é tratado como "não encontrado" (404), não como 400. */
class UuidOr404Pipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !isUuid(value)) throw notFound('NOT_FOUND', 'Recurso não encontrado.');
    return value;
  }
}

export const IdParam = (name = 'id') => Param(name, new UuidOr404Pipe());

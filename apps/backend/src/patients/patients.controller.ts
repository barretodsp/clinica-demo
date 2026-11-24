import { Controller, Get, Query } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { RolePolicy } from '../auth/role.policy.js';
import { maskCpf } from '../common/cpf.js';
import { unprocessable } from '../common/errors.js';

const searchSchema = z.object({ search: z.string().trim().max(100).default('') });

export const PATIENT_SEARCH_MIN = 3;
export const PATIENT_SEARCH_LIMIT = 20;

@ApiTags('pacientes')
@Controller('patients')
export class PatientsController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Busca por nome (parcial, sem acento/caixa) ou CPF (11 dígitos, exato).
   * Mínimo 3 caracteres, máximo 20 resultados, CPF mascarado — nunca lista todos.
   */
  @Get()
  @Can(RolePolicy, 'staff')
  async search(@Query({ schema: searchSchema }) q: z.infer<typeof searchSchema>) {
    const term = q.search;
    if (term.length < PATIENT_SEARCH_MIN) {
      throw unprocessable('SEARCH_TOO_SHORT', `Digite ao menos ${PATIENT_SEARCH_MIN} caracteres.`);
    }
    const digits = term.replace(/[.\-\s]/g, '');
    let rows: { id: string; name: string; document: string }[];
    if (/^\d+$/.test(digits)) {
      rows =
        digits.length === 11
          ? await this.ds.query('SELECT id, name, document FROM patient WHERE document = $1', [digits])
          : [];
    } else {
      const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`);
      rows = await this.ds.query(
        `SELECT id, name, document FROM patient
         WHERE unaccent(lower(name)) LIKE '%' || unaccent(lower($1)) || '%'
         ORDER BY name LIMIT ${PATIENT_SEARCH_LIMIT}`,
        [escaped],
      );
    }
    return rows.map((r) => ({ id: r.id, name: r.name, documentMasked: maskCpf(r.document) }));
  }
}

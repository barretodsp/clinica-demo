import { Controller, Get, Query } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { z } from 'zod';
import { RolePolicy } from '../auth/role.policy.js';
import { BOOKING_WINDOW_END } from '../common/domain.js';
import { isoDateSchema } from '../common/validation.js';
import { ExamType, Holiday } from '../database/entities/index.js';

const rangeSchema = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() });

@ApiTags('catálogos')
@Controller()
export class CatalogController {
  constructor(
    @InjectRepository(ExamType) private readonly examTypes: Repository<ExamType>,
    @InjectRepository(Holiday) private readonly holidays: Repository<Holiday>,
  ) {}

  /** Catálogo global de tipos de exame. */
  @Get('exam-types')
  @Can(RolePolicy, 'staff')
  async listExamTypes() {
    const rows = await this.examTypes.find({ order: { name: 'ASC' } });
    return rows.map((e) => ({ id: e.id, name: e.name }));
  }

  /** Feriados nacionais (bloqueiam a agenda) e o último dia agendável. */
  @Get('holidays')
  @Can(RolePolicy, 'staff')
  async listHolidays(@Query({ schema: rangeSchema }) q: z.infer<typeof rangeSchema>) {
    const rows = await this.holidays.find({
      where: { date: Between(q.from ?? '1900-01-01', q.to ?? '2999-12-31') },
      order: { date: 'ASC' },
    });
    return { bookingWindowEnd: BOOKING_WINDOW_END, holidays: rows.map((h) => ({ date: h.date, name: h.name })) };
  }
}

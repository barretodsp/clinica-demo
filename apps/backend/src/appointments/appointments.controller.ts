import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { SessionUser } from '../auth/auth-user.js';
import { RolePolicy } from '../auth/role.policy.js';
import { ClinicAccessGuard, CurrentClinic } from '../clinics/clinic-access.guard.js';
import { IdParam, isoDateSchema, uuidSchema } from '../common/validation.js';
import type { Clinic } from '../database/entities/index.js';
import { AppointmentsService } from './appointments.service.js';

const listSchema = z.object({ date: isoDateSchema.optional(), patientId: uuidSchema.optional() });
const slotsSchema = z.object({ date: isoDateSchema });
const createSchema = z.object({
  patientId: uuidSchema,
  examTypeId: uuidSchema,
  /** Instante ISO 8601 com fuso (ex.: 2026-12-01T12:00:00.000Z). */
  startsAt: z.iso.datetime({ offset: true }),
});

@ApiTags('agendamentos')
@Controller('clinics/:clinicId/appointments')
@UseGuards(ClinicAccessGuard)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @Can(RolePolicy, 'staff')
  list(
    @CurrentClinic() clinic: Clinic,
    @CurrentUser() user: SessionUser,
    @Query({ schema: listSchema }) q: z.infer<typeof listSchema>,
  ) {
    return this.appointments.list(clinic, user, q);
  }

  // rota estática antes de ':id'
  @Get('available-slots')
  @Can(RolePolicy, 'attendant')
  slots(@CurrentClinic() clinic: Clinic, @Query({ schema: slotsSchema }) q: z.infer<typeof slotsSchema>) {
    return this.appointments.availableSlots(clinic, q.date);
  }

  @Post()
  @Can(RolePolicy, 'attendant')
  create(
    @CurrentClinic() clinic: Clinic,
    @CurrentUser() user: SessionUser,
    @Body({ schema: createSchema }) body: z.infer<typeof createSchema>,
  ) {
    return this.appointments.create(clinic, user, body);
  }

  @Get(':id')
  @Can(RolePolicy, 'staff')
  findOne(@CurrentClinic() clinic: Clinic, @CurrentUser() user: SessionUser, @IdParam() id: string) {
    return this.appointments.findOne(clinic, user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Can(RolePolicy, 'attendant')
  cancel(@CurrentClinic() clinic: Clinic, @CurrentUser() user: SessionUser, @IdParam() id: string) {
    return this.appointments.cancel(clinic, user, id);
  }
}

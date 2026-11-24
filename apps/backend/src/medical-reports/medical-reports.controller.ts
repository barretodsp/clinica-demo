import { Body, Controller, Delete, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { SessionUser } from '../auth/auth-user.js';
import { RolePolicy } from '../auth/role.policy.js';
import { ClinicAccessGuard, CurrentClinic } from '../clinics/clinic-access.guard.js';
import { IdParam } from '../common/validation.js';
import type { Clinic } from '../database/entities/index.js';
import { MedicalReportsService } from './medical-reports.service.js';

const draftSchema = z.object({
  titleComplement: z.string().trim().max(200).nullable().optional(),
  // validado no serviço contra a lista fechada (422 INVALID_REPORT_BODY)
  body: z.unknown(),
});

@ApiTags('laudos')
@Controller('clinics/:clinicId')
@UseGuards(ClinicAccessGuard)
export class MedicalReportsController {
  constructor(private readonly reports: MedicalReportsService) {}

  /** Inicia o laudo (rascunho vazio, título com o tipo do exame). O médico vira o dono. */
  @Post('appointments/:id/medical-report')
  @Can(RolePolicy, 'doctor')
  start(@CurrentClinic() clinic: Clinic, @CurrentUser() user: SessionUser, @IdParam() appointmentId: string) {
    return this.reports.start(clinic, user, appointmentId);
  }

  @Get('medical-reports/:id')
  @Can(RolePolicy, 'staff')
  findOne(@CurrentClinic() clinic: Clinic, @CurrentUser() user: SessionUser, @IdParam() id: string) {
    return this.reports.findForStaff(clinic, user, id);
  }

  @Put('medical-reports/:id')
  @Can(RolePolicy, 'doctor')
  update(
    @CurrentClinic() clinic: Clinic,
    @CurrentUser() user: SessionUser,
    @IdParam() id: string,
    @Body({ schema: draftSchema }) body: z.infer<typeof draftSchema>,
  ) {
    return this.reports.updateDraft(clinic, user, id, body);
  }

  @Delete('medical-reports/:id')
  @HttpCode(204)
  @Can(RolePolicy, 'doctor')
  async discard(@CurrentClinic() clinic: Clinic, @CurrentUser() user: SessionUser, @IdParam() id: string) {
    await this.reports.discardDraft(clinic, user, id);
  }

  @Post('medical-reports/:id/publish')
  @HttpCode(200)
  @Can(RolePolicy, 'doctor')
  publish(@CurrentClinic() clinic: Clinic, @CurrentUser() user: SessionUser, @IdParam() id: string) {
    return this.reports.publish(clinic, user, id);
  }
}

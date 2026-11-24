import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ServiceTokenOnly } from '../auth/providers.js';
import { RolePolicy } from '../auth/role.policy.js';
import { AuditService } from '../audit/audit.service.js';
import { forbidden, notFound } from '../common/errors.js';
import { IdParam } from '../common/validation.js';
import { env } from '../config/env.js';
import { SELECT_REPORT, type ReportRow } from '../medical-reports/report-view.js';
import { buildFhirBundle } from './fhir.mapper.js';

/**
 * Exportação FHIR R4 (bônus): exclusiva do serviço de integração (token de serviço fixo
 * no header Authorization). Sessões de usuários não são aceitas nesta rota (401).
 */
@ApiTags('fhir (integração)')
@ApiBearerAuth()
@Controller('fhir/medical-reports')
@ServiceTokenOnly()
export class FhirController {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  @Get(':id')
  @Can(RolePolicy, 'service')
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ 'login-ip': true, 'login-account': true })
  @Header('Content-Type', 'application/fhir+json; charset=utf-8')
  async export(@IdParam() id: string) {
    const rows: ReportRow[] = await this.ds.query(`${SELECT_REPORT} WHERE r.id = $1`, [id]);
    const row = rows[0];
    if (!row) throw notFound('REPORT_NOT_FOUND', 'Laudo não encontrado.');
    if (row.status !== 'PUBLISHED') throw forbidden('REPORT_NOT_PUBLISHED', 'Somente laudos publicados podem ser exportados.');
    const bundle = buildFhirBundle(row, { cpfSystem: env().FHIR_CPF_SYSTEM, crmSystem: env().FHIR_CRM_SYSTEM });
    await this.audit.record({
      event: 'medical_report.exported_fhir',
      clinicId: row.clinic_id,
      patientId: row.patient_id,
      appointmentId: row.appointment_id,
      medicalReportId: row.id,
      doctorId: row.doctor_id,
    });
    return bundle;
  }
}

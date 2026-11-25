import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { SessionUser } from '../auth/auth-user.js';
import { RolePolicy } from '../auth/role.policy.js';
import { AuditService } from '../audit/audit.service.js';
import { TIMEZONE_LABELS, type ClinicTimezone } from '../common/domain.js';
import { forbidden, notFound } from '../common/errors.js';
import { IdParam } from '../common/validation.js';
import { SELECT_REPORT, toReportDto, type ReportRow } from '../medical-reports/report-view.js';

/**
 * Portal do paciente: tudo filtrado pelo patientId da SESSÃO, nunca por parâmetro.
 * Rascunhos nunca aparecem (nem título, nem texto): só `hasPublishedMedicalReport`.
 */
@ApiTags('paciente')
@Controller('me')
@Can(RolePolicy, 'patient')
export class PatientPortalController {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  @Get('appointments')
  async appointments(@CurrentUser() user: SessionUser) {
    const rows: {
      id: string; starts_at: Date; status: string; exam_type_name: string;
      clinic_id: string; clinic_name: string; clinic_city: string; clinic_timezone: ClinicTimezone;
      published_report_id: string | null; published_at: Date | null;
    }[] = await this.ds.query(
      `SELECT a.id, a.starts_at, a.status, e.name AS exam_type_name,
              c.id AS clinic_id, c.name AS clinic_name, c.city AS clinic_city, c.timezone AS clinic_timezone,
              r.id AS published_report_id, r.published_at
       FROM appointment a
       JOIN exam_type e ON e.id = a.exam_type_id
       JOIN clinic c ON c.id = a.clinic_id
       LEFT JOIN medical_report r ON r.appointment_id = a.id AND r.status = 'PUBLISHED'
       WHERE a.patient_id = $1
       ORDER BY a.starts_at DESC`,
      [user.patientId],
    );
    return rows.map((r) => ({
      id: r.id,
      startsAt: r.starts_at.toISOString(),
      status: r.status,
      examType: { name: r.exam_type_name },
      clinic: {
        id: r.clinic_id,
        name: r.clinic_name,
        city: r.clinic_city,
        timezone: r.clinic_timezone,
        timezoneLabel: TIMEZONE_LABELS[r.clinic_timezone],
      },
      hasPublishedMedicalReport: !!r.published_report_id,
      medicalReportId: r.published_report_id,
      publishedAt: r.published_at?.toISOString() ?? null,
    }));
  }

  @Get('medical-reports/:id')
  async medicalReport(@CurrentUser() user: SessionUser, @IdParam() id: string) {
    const rows: ReportRow[] = await this.ds.query(`${SELECT_REPORT} WHERE r.id = $1`, [id]);
    const row = rows[0];
    if (!row) throw notFound('REPORT_NOT_FOUND', 'Laudo não encontrado.');
    if (row.patient_id !== user.patientId) throw forbidden('REPORT_ACCESS_DENIED', 'Este laudo não pertence a você.');
    if (row.status !== 'PUBLISHED') throw forbidden('REPORT_NOT_PUBLISHED', 'Este laudo ainda não foi publicado.');
    await this.audit.record({
      event: 'medical_report.viewed',
      clinicId: row.clinic_id,
      patientId: row.patient_id,
      appointmentId: row.appointment_id,
      medicalReportId: row.id,
      doctorId: row.doctor_id,
    });
    return {
      ...toReportDto(row),
      /**
       * Extra de demonstração (PP-08): link para as imagens no PACS, só no laudo publicado do próprio
       * paciente (as verificações acima) e nunca para cancelado. O PACS de demonstração é aberto,
       * então quem chega ao host dele vê todos os estudos: limitação aceita por simplicidade.
       */
      imageViewerUrl: row.appointment_status === 'CANCELLED' ? null : row.image_viewer_url,
    };
  }
}

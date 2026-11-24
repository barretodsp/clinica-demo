import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { SessionUser } from '../auth/auth-user.js';
import { AuditService } from '../audit/audit.service.js';
import { conflict, forbidden, notFound, uniqueViolation, unprocessable } from '../common/errors.js';
import { MedicalReport, type Clinic } from '../database/entities/index.js';
import {
  emptyReportDocument,
  extractPlainText,
  isEffectivelyEmpty,
  jsonbTextBytes,
  MAX_BODY_BYTES,
  reportDocumentSchema,
  type ReportDocument,
} from './report-body.js';
import { buildTitle, SELECT_REPORT, toReportDto, type ReportDto, type ReportRow, type SignaturePreview } from './report-view.js';

export interface DraftInput {
  titleComplement?: string | null;
  body: unknown;
}

/** Valida o corpo do laudo contra a lista fechada de formatações. */
export function parseReportBody(body: unknown): { doc: ReportDocument; text: string } {
  const parsed = reportDocumentSchema.safeParse(body);
  if (!parsed.success) {
    throw unprocessable('INVALID_REPORT_BODY', 'O texto do laudo contém formatação não permitida ou é inválido.', {
      issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (jsonbTextBytes(parsed.data) > MAX_BODY_BYTES) {
    throw unprocessable('INVALID_REPORT_BODY', 'O texto do laudo excede o tamanho máximo (100 KB).');
  }
  return { doc: parsed.data, text: extractPlainText(parsed.data) };
}

@Injectable()
export class MedicalReportsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  /**
   * "Iniciar laudo": cria o rascunho vazio e torna o médico o DONO — o rascunho é a trava
   * do atendimento. A linha do agendamento é travada (FOR UPDATE) e o índice único
   * medical_report.appointment_id é a garantia final contra dois médicos simultâneos.
   */
  async start(clinic: Clinic, user: SessionUser, appointmentId: string): Promise<ReportDto> {
    const doctorId = user.doctorId!;
    let reportId: string;
    try {
      reportId = await this.audit.transaction(async (m, record) => {
        const [appt] = await m.query(
          `SELECT a.id, a.clinic_id, a.patient_id, a.status, e.name AS exam_type_name
           FROM appointment a JOIN exam_type e ON e.id = a.exam_type_id WHERE a.id = $1 FOR UPDATE OF a`,
          [appointmentId],
        );
        if (!appt) throw notFound('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado.');
        if (appt.clinic_id !== clinic.id) throw forbidden('APPOINTMENT_OTHER_CLINIC', 'Agendamento de outra clínica.');
        if (appt.status === 'CANCELLED') throw conflict('APPOINTMENT_CANCELLED', 'Agendamentos cancelados não podem receber laudos.');
        await this.assertNoReport(appointmentId, m.query.bind(m));
        const repo = m.getRepository(MedicalReport);
        const saved = await repo.save(
          repo.create({
            appointmentId,
            doctorId,
            title: buildTitle(appt.exam_type_name, null),
            titleComplement: null,
            body: emptyReportDocument(),
            bodyText: '',
            status: 'DRAFT',
          }),
        );
        await record({
          event: 'medical_report.draft_created',
          clinicId: clinic.id,
          patientId: appt.patient_id,
          appointmentId,
          medicalReportId: saved.id,
          doctorId,
        });
        return saved.id;
      });
    } catch (error) {
      if (uniqueViolation(error) === 'medical_report_appointment_unique') {
        await this.assertNoReport(appointmentId, this.ds.query.bind(this.ds));
      }
      throw error;
    }
    return this.findForStaff(clinic, user, reportId);
  }

  /**
   * Conteúdo: publicado → equipe da clínica; rascunho → só o dono.
   * `recordView`: só leituras pedidas pelo usuário contam como visualização na auditoria
   * (a resposta de uma publicação, por exemplo, não é uma visualização).
   */
  async findForStaff(clinic: Clinic, user: SessionUser, id: string, recordView = true): Promise<ReportDto> {
    const row = await this.load(id);
    if (row.clinic_id !== clinic.id) throw forbidden('REPORT_OTHER_CLINIC', 'Laudo de outra clínica.');
    const isMine = row.doctor_id === user.doctorId;
    if (row.status === 'DRAFT') {
      if (!isMine) {
        throw forbidden('REPORT_DRAFT_RESTRICTED', `Laudo em elaboração por ${row.doctor_name}: o rascunho é visível só para o responsável.`);
      }
      return toReportDto(row, { isMine, signaturePreview: await this.signaturePreview(row, clinic) });
    }
    if (recordView) await this.audit.record({
      event: 'medical_report.viewed',
      clinicId: row.clinic_id,
      patientId: row.patient_id,
      appointmentId: row.appointment_id,
      medicalReportId: row.id,
      doctorId: row.doctor_id,
    });
    return toReportDto(row, { isMine });
  }

  async updateDraft(clinic: Clinic, user: SessionUser, id: string, input: DraftInput): Promise<ReportDto> {
    const row = await this.loadOwnDraft(clinic, user, id);
    const { doc, text } = parseReportBody(input.body);
    const complement = input.titleComplement?.trim() || null;
    await this.audit.transaction(async (m, record) => {
      // título sempre montado pelo backend: o tipo do exame não pode ser removido/alterado
      const result = await m.getRepository(MedicalReport).update(
        { id, status: 'DRAFT', doctorId: user.doctorId! },
        { titleComplement: complement, title: buildTitle(row.exam_type_name, complement), body: doc, bodyText: text },
      );
      if (!result.affected) throw conflict('REPORT_PUBLISHED', 'Laudos publicados não podem ser editados.');
      await record({ event: 'medical_report.draft_updated', ...this.ids(row) });
    });
    return this.findForStaff(clinic, user, id);
  }

  /** Descarta o rascunho: apaga e libera o atendimento para outro médico (e para cancelamento). */
  async discardDraft(clinic: Clinic, user: SessionUser, id: string): Promise<void> {
    const row = await this.loadOwnDraft(clinic, user, id);
    await this.audit.transaction(async (m, record) => {
      const result = await m.getRepository(MedicalReport).delete({ id, status: 'DRAFT', doctorId: user.doctorId! });
      if (!result.affected) throw conflict('REPORT_PUBLISHED', 'Laudos publicados não podem ser descartados.');
      await record({ event: 'medical_report.draft_discarded', ...this.ids(row) });
    });
  }

  /**
   * Publica: exige texto não vazio e registro (CRM) do médico na UF da clínica.
   * Grava publishedAt e os snapshots de assinatura; UPDATE condicional (WHERE status = 'DRAFT').
   */
  async publish(clinic: Clinic, user: SessionUser, id: string): Promise<ReportDto> {
    const row = await this.loadOwnDraft(clinic, user, id);
    if (isEffectivelyEmpty(row.body_text)) {
      throw unprocessable('EMPTY_REPORT_BODY', 'O laudo está vazio: escreva o texto antes de publicar.');
    }
    const registration = await this.registrationFor(user.doctorId!, clinic.state);
    if (!registration) {
      throw unprocessable(
        'NO_REGISTRATION_IN_STATE',
        `Você não possui registro (CRM) em ${clinic.state}, UF desta clínica: não é possível publicar.`,
      );
    }
    await this.audit.transaction(async (m, record) => {
      const result = await m.query(
        `UPDATE medical_report
         SET status = 'PUBLISHED', published_at = now(), registration_id = $3,
             professional_name = $4, professional_registration = $5
         WHERE id = $1 AND doctor_id = $2 AND status = 'DRAFT'`,
        [id, user.doctorId, registration.id, row.doctor_name, registration.label],
      );
      if (!result[1]) throw conflict('REPORT_PUBLISHED', 'Este laudo já foi publicado.');
      await record({ event: 'medical_report.published', ...this.ids(row), metadata: { registrationId: registration.id } });
    });
    return this.findForStaff(clinic, user, id, false);
  }

  // --------------------------------------------------------------------------

  private ids(row: ReportRow) {
    return {
      clinicId: row.clinic_id,
      patientId: row.patient_id,
      appointmentId: row.appointment_id,
      medicalReportId: row.id,
      doctorId: row.doctor_id,
    };
  }

  private async load(id: string): Promise<ReportRow> {
    const rows: ReportRow[] = await this.ds.query(`${SELECT_REPORT} WHERE r.id = $1`, [id]);
    if (!rows[0]) throw notFound('REPORT_NOT_FOUND', 'Laudo não encontrado.');
    return rows[0];
  }

  /** Regras comuns de edição/descarte/publicação: mesma clínica, rascunho, dono. */
  private async loadOwnDraft(clinic: Clinic, user: SessionUser, id: string): Promise<ReportRow> {
    const row = await this.load(id);
    if (row.clinic_id !== clinic.id) throw forbidden('REPORT_OTHER_CLINIC', 'Laudo de outra clínica.');
    if (row.status === 'PUBLISHED') throw conflict('REPORT_PUBLISHED', 'Laudos publicados não podem ser alterados.');
    if (row.doctor_id !== user.doctorId) {
      throw forbidden('REPORT_NOT_OWNER', `Laudo em elaboração por ${row.doctor_name}: só o responsável pode alterá-lo.`);
    }
    return row;
  }

  /** Já existe laudo no atendimento? → 409 com o responsável (rascunho) ou REPORT_EXISTS (publicado). */
  private async assertNoReport(appointmentId: string, query: (sql: string, params: unknown[]) => Promise<any[]>) {
    const [existing] = await query(
      `SELECT r.id, r.status, u.name AS doctor_name FROM medical_report r
       JOIN doctor d ON d.id = r.doctor_id JOIN "user" u ON u.id = d.user_id WHERE r.appointment_id = $1`,
      [appointmentId],
    );
    if (!existing) return;
    if (existing.status === 'PUBLISHED') {
      throw conflict('REPORT_EXISTS', 'Este atendimento já possui laudo publicado.', { medicalReportId: existing.id });
    }
    throw conflict('REPORT_IN_PROGRESS', `Laudo em elaboração por ${existing.doctor_name}.`, {
      medicalReportId: existing.id,
      doctorName: existing.doctor_name,
    });
  }

  /** Registro do médico na UF da clínica (o que vai na assinatura). */
  async registrationFor(doctorId: string, uf: string): Promise<{ id: string; label: string } | null> {
    const [reg] = await this.ds.query(
      `SELECT dr.id, pc.code, dr.state, dr.number FROM doctor_registration dr
       JOIN professional_council pc ON pc.id = dr.council_id
       WHERE dr.doctor_id = $1 AND dr.state = $2 AND pc.code = 'CRM' ORDER BY dr.created_at LIMIT 1`,
      [doctorId, uf],
    );
    return reg ? { id: reg.id, label: `${reg.code}/${reg.state} ${reg.number}` } : null;
  }

  private async signaturePreview(row: ReportRow, clinic: Clinic): Promise<SignaturePreview> {
    const reg = await this.registrationFor(row.doctor_id, clinic.state);
    return { professionalName: row.doctor_name, professionalRegistration: reg?.label ?? null, canPublish: !!reg };
  }
}

import { TIMEZONE_LABELS, type ClinicTimezone } from '../common/domain.js';
import type { ReportDocument } from './report-body.js';

/** Linha completa de um laudo com o contexto do agendamento (consultas de leitura). */
export interface ReportRow {
  id: string;
  appointment_id: string;
  doctor_id: string;
  title: string;
  title_complement: string | null;
  body: ReportDocument;
  body_text: string;
  status: 'DRAFT' | 'PUBLISHED';
  published_at: Date | null;
  registration_id: string | null;
  professional_name: string | null;
  professional_registration: string | null;
  created_at: Date;
  updated_at: Date;
  doctor_name: string;
  doctor_user_id: string;
  appointment_status: 'SCHEDULED' | 'CANCELLED';
  starts_at: Date;
  clinic_id: string;
  clinic_name: string;
  clinic_city: string;
  clinic_state: string;
  clinic_timezone: ClinicTimezone;
  patient_id: string;
  patient_name: string;
  patient_birth_date: string;
  patient_document: string;
  exam_type_id: string;
  exam_type_name: string;
  exam_loinc_code: string | null;
  exam_loinc_display: string | null;
}

export const SELECT_REPORT = `
  SELECT r.id, r.appointment_id, r.doctor_id, r.title, r.title_complement, r.body, r.body_text, r.status,
         r.published_at, r.registration_id, r.professional_name, r.professional_registration,
         r.created_at, r.updated_at,
         du.name AS doctor_name, du.id AS doctor_user_id,
         a.status AS appointment_status, a.starts_at,
         c.id AS clinic_id, c.name AS clinic_name, c.city AS clinic_city, c.state AS clinic_state,
         c.timezone AS clinic_timezone,
         p.id AS patient_id, p.name AS patient_name, to_char(p.birth_date, 'YYYY-MM-DD') AS patient_birth_date,
         p.document AS patient_document,
         e.id AS exam_type_id, e.name AS exam_type_name, e.loinc_code AS exam_loinc_code,
         e.loinc_display AS exam_loinc_display
  FROM medical_report r
  JOIN appointment a ON a.id = r.appointment_id
  JOIN clinic c ON c.id = a.clinic_id
  JOIN patient p ON p.id = a.patient_id
  JOIN exam_type e ON e.id = a.exam_type_id
  JOIN doctor d ON d.id = r.doctor_id
  JOIN "user" du ON du.id = d.user_id`;

export interface SignaturePreview {
  professionalName: string;
  professionalRegistration: string | null;
  canPublish: boolean;
}

/** Laudo completo (equipe autorizada, dono do rascunho ou paciente com laudo publicado). */
export function toReportDto(row: ReportRow, extras: { signaturePreview?: SignaturePreview; isMine?: boolean } = {}) {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    status: row.status,
    title: row.title,
    titleComplement: row.title_complement,
    body: row.body,
    publishedAt: row.published_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
    examType: { id: row.exam_type_id, name: row.exam_type_name },
    startsAt: row.starts_at.toISOString(),
    clinic: {
      id: row.clinic_id,
      name: row.clinic_name,
      timezone: row.clinic_timezone,
      timezoneLabel: TIMEZONE_LABELS[row.clinic_timezone],
    },
    patient: { id: row.patient_id, name: row.patient_name },
    doctor: { id: row.doctor_id, name: row.doctor_name },
    /** Assinatura gravada na publicação (null em rascunho). */
    signature:
      row.status === 'PUBLISHED'
        ? { professionalName: row.professional_name!, professionalRegistration: row.professional_registration! }
        : null,
    ...(extras.signaturePreview ? { signaturePreview: extras.signaturePreview } : {}),
    ...(extras.isMine !== undefined ? { isMine: extras.isMine } : {}),
  };
}

export type ReportDto = ReturnType<typeof toReportDto>;

export function buildTitle(examTypeName: string, complement: string | null | undefined): string {
  const c = complement?.trim();
  return c ? `${examTypeName} — ${c}` : examTypeName;
}

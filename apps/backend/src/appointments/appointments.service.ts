import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { businessSlots, localDayRange, localParts } from '../common/clinic-time.js';
import { maskCpf } from '../common/cpf.js';
import { conflict, forbidden, notFound, uniqueViolation, unprocessable } from '../common/errors.js';
import type { SessionUser } from '../auth/auth-user.js';
import { AuditService } from '../audit/audit.service.js';
import { Appointment, type Clinic } from '../database/entities/index.js';
import { BOOKING_VIOLATION_MESSAGES, checkBookable, isBusinessDay } from './booking-rules.js';

export interface AppointmentListFilter {
  date?: string;
  patientId?: string;
}

interface AppointmentRow {
  id: string;
  clinic_id: string;
  starts_at: Date;
  status: Appointment['status'];
  cancelled_at: Date | null;
  created_at: Date;
  image_viewer_url: string | null;
  exam_type_id: string;
  exam_type_name: string;
  patient_id: string;
  patient_name: string;
  patient_document: string;
  report_id: string | null;
  report_status: 'DRAFT' | 'PUBLISHED' | null;
  report_doctor_id: string | null;
  report_doctor_name: string | null;
  report_published_at: Date | null;
}

const SELECT_APPOINTMENTS = `
  SELECT a.id, a.clinic_id, a.starts_at, a.status, a.cancelled_at, a.created_at, a.image_viewer_url,
         e.id AS exam_type_id, e.name AS exam_type_name,
         p.id AS patient_id, p.name AS patient_name, p.document AS patient_document,
         r.id AS report_id, r.status AS report_status, r.doctor_id AS report_doctor_id,
         du.name AS report_doctor_name, r.published_at AS report_published_at
  FROM appointment a
  JOIN exam_type e ON e.id = a.exam_type_id
  JOIN patient p ON p.id = a.patient_id
  LEFT JOIN medical_report r ON r.appointment_id = a.id
  LEFT JOIN doctor d ON d.id = r.doctor_id
  LEFT JOIN "user" du ON du.id = d.user_id`;

/** Visão da equipe: rascunho aparece só como status + responsável (sem conteúdo). */
function toStaffDto(row: AppointmentRow, user: SessionUser) {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    startsAt: row.starts_at.toISOString(),
    status: row.status,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    /** Stone Web Viewer do PACS de demonstração (aberto direto pelo navegador). */
    imageViewerUrl: row.image_viewer_url,
    examType: { id: row.exam_type_id, name: row.exam_type_name },
    patient: { id: row.patient_id, name: row.patient_name, documentMasked: maskCpf(row.patient_document) },
    medicalReport: row.report_id
      ? {
          id: row.report_id,
          status: row.report_status!,
          doctorId: row.report_doctor_id!,
          doctorName: row.report_doctor_name!,
          isMine: !!user.doctorId && user.doctorId === row.report_doctor_id,
          publishedAt: row.report_published_at?.toISOString() ?? null,
        }
      : null,
  };
}

export type StaffAppointmentDto = ReturnType<typeof toStaffDto>;

/** Tamanho máximo da lista de agendamentos (não há paginação). */
export const APPOINTMENT_LIST_LIMIT = 50;

const CONSTRAINT_CONFLICTS: Record<string, { code: string; message: string }> = {
  appointment_clinic_slot_active: { code: 'SLOT_TAKEN', message: 'Este horário já está ocupado nesta clínica.' },
  appointment_patient_slot_active: {
    code: 'PATIENT_BUSY',
    message: 'O paciente já tem um exame agendado neste horário (em alguma clínica).',
  },
};

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  /**
   * Agendamentos da clínica (escopo sempre pelo clinic_id), filtrados por dia local e paciente.
   * Sem paginação: no máximo APPOINTMENT_LIST_LIMIT itens.
   * - Com data: o dia em ordem de horário.
   * - Sem data: a partir do início do dia de hoje (no fuso da clínica) em ordem de horário,
   *   e só depois os anteriores, do mais recente para o mais antigo. Assim os atendimentos
   *   de hoje ficam no topo e os novos agendamentos nunca somem atrás do histórico.
   */
  async list(clinic: Clinic, user: SessionUser, filter: AppointmentListFilter, now = new Date()): Promise<StaffAppointmentDto[]> {
    const where = ['a.clinic_id = $1'];
    const params: unknown[] = [clinic.id];
    if (filter.date) {
      const { start, end } = localDayRange(filter.date, clinic.timezone);
      params.push(start, end);
      where.push(`a.starts_at >= $${params.length - 1} AND a.starts_at < $${params.length}`);
    }
    if (filter.patientId) {
      params.push(filter.patientId);
      where.push(`a.patient_id = $${params.length}`);
    }
    let orderBy = 'a.starts_at, a.created_at';
    if (!filter.date) {
      params.push(localDayRange(localParts(now, clinic.timezone).date, clinic.timezone).start);
      const today = `$${params.length}::timestamptz`;
      // false (de hoje em diante) vem antes de true (dias anteriores)
      orderBy = `a.starts_at < ${today}, CASE WHEN a.starts_at >= ${today} THEN a.starts_at END, a.starts_at DESC, a.created_at`;
    }
    params.push(APPOINTMENT_LIST_LIMIT);
    const rows: AppointmentRow[] = await this.ds.query(
      `${SELECT_APPOINTMENTS} WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT $${params.length}`,
      params,
    );
    return rows.map((r) => toStaffDto(r, user));
  }

  async findOne(clinic: Clinic, user: SessionUser, id: string): Promise<StaffAppointmentDto> {
    const rows: AppointmentRow[] = await this.ds.query(`${SELECT_APPOINTMENTS} WHERE a.id = $1`, [id]);
    const row = rows[0];
    if (!row) throw notFound('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado.');
    if (row.clinic_id !== clinic.id) throw forbidden('APPOINTMENT_OTHER_CLINIC', 'Agendamento de outra clínica.');
    return toStaffDto(row, user);
  }

  /** Slots do dia local da clínica com disponibilidade (dia sem atendimento → lista vazia). */
  async availableSlots(clinic: Clinic, date: string, now = new Date()) {
    const holidays = await this.holidaySet();
    if (!isBusinessDay(date, holidays)) return { date, timezone: clinic.timezone, businessDay: false, slots: [] };
    const { start, end } = localDayRange(date, clinic.timezone);
    const taken: { starts_at: Date }[] = await this.ds.query(
      `SELECT starts_at FROM appointment WHERE clinic_id = $1 AND status = 'SCHEDULED' AND starts_at >= $2 AND starts_at < $3`,
      [clinic.id, start, end],
    );
    const takenSet = new Set(taken.map((t) => t.starts_at.getTime()));
    const slots = businessSlots(date, clinic.timezone).map((s) => {
      const violation = checkBookable({ startsAt: s, timezone: clinic.timezone, now, holidays });
      const local = localParts(s, clinic.timezone);
      return {
        startsAt: s.toISOString(),
        localTime: `${String(Math.floor(local.minutes / 60)).padStart(2, '0')}:${String(local.minutes % 60).padStart(2, '0')}`,
        available: violation === null && !takenSet.has(s.getTime()),
        reason: violation ?? (takenSet.has(s.getTime()) ? 'SLOT_TAKEN' : null),
      };
    });
    return { date, timezone: clinic.timezone, businessDay: true, slots };
  }

  async create(
    clinic: Clinic,
    user: SessionUser,
    input: { patientId: string; examTypeId: string; startsAt: string },
    now = new Date(),
  ): Promise<StaffAppointmentDto> {
    const startsAt = new Date(input.startsAt);
    const violation = checkBookable({ startsAt, timezone: clinic.timezone, now, holidays: await this.holidaySet() });
    if (violation) throw unprocessable(violation, BOOKING_VIOLATION_MESSAGES[violation]);

    const [patient] = await this.ds.query('SELECT id FROM patient WHERE id = $1', [input.patientId]);
    if (!patient) throw unprocessable('PATIENT_NOT_FOUND', 'Paciente não encontrado.');
    const [exam] = await this.ds.query('SELECT id FROM exam_type WHERE id = $1', [input.examTypeId]);
    if (!exam) throw unprocessable('EXAM_TYPE_NOT_FOUND', 'Tipo de exame não encontrado.');

    let id: string;
    try {
      id = await this.audit.transaction(async (m, record) => {
        const repo = m.getRepository(Appointment);
        const saved = await repo.save(
          repo.create({
            clinicId: clinic.id,
            patientId: input.patientId,
            examTypeId: input.examTypeId,
            startsAt,
            createdByUserId: user.id,
          }),
        );
        await record({
          event: 'appointment.scheduled',
          clinicId: clinic.id,
          patientId: input.patientId,
          appointmentId: saved.id,
          metadata: { examTypeId: input.examTypeId, startsAt: startsAt.toISOString() },
        });
        return saved.id;
      });
    } catch (error) {
      // a unicidade é garantida pelo banco (índices parciais): duas requisições simultâneas → uma 201, outra 409
      const constraint = uniqueViolation(error);
      const mapped = constraint ? CONSTRAINT_CONFLICTS[constraint] : undefined;
      if (mapped) throw conflict(mapped.code, mapped.message);
      throw error;
    }
    return this.findOne(clinic, user, id);
  }

  /**
   * Cancela: só SCHEDULED e sem nenhum laudo (rascunho ou publicado).
   * A linha do agendamento é travada (FOR UPDATE) — a mesma trava usada ao iniciar um laudo —,
   * então cancelamento e início de laudo concorrentes são serializados.
   */
  async cancel(clinic: Clinic, user: SessionUser, id: string): Promise<StaffAppointmentDto> {
    await this.audit.transaction(async (m, record) => {
      const [appt] = await m.query('SELECT id, clinic_id, patient_id, status FROM appointment WHERE id = $1 FOR UPDATE', [id]);
      if (!appt) throw notFound('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado.');
      if (appt.clinic_id !== clinic.id) throw forbidden('APPOINTMENT_OTHER_CLINIC', 'Agendamento de outra clínica.');
      if (appt.status !== 'SCHEDULED') throw conflict('APPOINTMENT_NOT_SCHEDULED', 'O agendamento já está cancelado.');
      const [report] = await m.query('SELECT status FROM medical_report WHERE appointment_id = $1', [id]);
      if (report) {
        throw conflict(
          'APPOINTMENT_HAS_REPORT',
          report.status === 'PUBLISHED'
            ? 'Agendamentos com laudo publicado não podem ser cancelados.'
            : 'Agendamentos com laudo em elaboração não podem ser cancelados.',
        );
      }
      await m.query(
        `UPDATE appointment SET status = 'CANCELLED', cancelled_at = now(), cancelled_by_user_id = $2 WHERE id = $1`,
        [id, user.id],
      );
      await record({ event: 'appointment.cancelled', clinicId: clinic.id, patientId: appt.patient_id, appointmentId: id });
    });
    return this.findOne(clinic, user, id);
  }

  private async holidaySet(): Promise<Set<string>> {
    const rows: { date: string }[] = await this.ds.query(`SELECT to_char(date, 'YYYY-MM-DD') AS date FROM holiday`);
    return new Set(rows.map((r) => r.date));
  }
}

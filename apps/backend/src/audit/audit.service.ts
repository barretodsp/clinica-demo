import { Injectable } from '@nestjs/common';
import { AuthenticationContext } from '@nestjs/authentication';
import { InjectDataSource } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { DataSource, type EntityManager } from 'typeorm';
import { actorFields } from '../observability/logger.config.js';
import { currentRequestId } from '../common/request-context.js';
import { AuditEvent } from '../database/entities/index.js';

export type AuditEventName =
  | 'appointment.scheduled'
  | 'appointment.cancelled'
  | 'medical_report.draft_created'
  | 'medical_report.draft_updated'
  | 'medical_report.draft_discarded'
  | 'medical_report.published'
  | 'medical_report.viewed'
  | 'medical_report.exported_fhir';

export interface AuditInput {
  event: AuditEventName;
  clinicId?: string | null;
  patientId?: string | null;
  appointmentId?: string | null;
  medicalReportId?: string | null;
  doctorId?: string | null;
  /** Somente IDs e metadados técnicos — nunca dados pessoais ou conteúdo clínico. */
  metadata?: Record<string, unknown>;
}

export type Recorder = (input: AuditInput) => Promise<void>;

/**
 * Trilha de auditoria: o evento é gravado NA MESMA TRANSAÇÃO da operação
 * (operação que falha não gera evento) e logado só depois do commit.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly auth: AuthenticationContext,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext('audit');
  }

  async transaction<T>(work: (manager: EntityManager, record: Recorder) => Promise<T>): Promise<T> {
    const recorded: AuditEvent[] = [];
    const result = await this.ds.transaction(async (manager) =>
      work(manager, async (input) => {
        recorded.push(await this.insert(manager, input));
      }),
    );
    recorded.forEach((e) => this.log(e));
    return result;
  }

  /** Evento isolado (ex.: leitura de laudo), fora de transação de escrita. */
  async record(input: AuditInput): Promise<void> {
    this.log(await this.insert(this.ds.manager, input));
  }

  private async insert(manager: EntityManager, input: AuditInput): Promise<AuditEvent> {
    const user = this.auth.user;
    const actor = actorFields(user);
    const row = manager.getRepository(AuditEvent).create({
      event: input.event,
      requestId: currentRequestId(),
      actorType: user?.kind === 'service' ? 'SERVICE' : 'USER',
      actorId: user?.id ?? 'anonymous',
      actorRole: 'actorRole' in actor ? actor.actorRole : null,
      clinicId: input.clinicId ?? null,
      patientId: input.patientId ?? null,
      appointmentId: input.appointmentId ?? null,
      medicalReportId: input.medicalReportId ?? null,
      doctorId: input.doctorId ?? null,
      metadata: input.metadata ?? {},
    });
    // insert (não save): a aplicação não tem UPDATE na audit_event
    await manager.getRepository(AuditEvent).insert(row as never);
    return row;
  }

  private log(e: AuditEvent): void {
    this.logger.info(
      {
        event: e.event,
        requestId: e.requestId,
        actorType: e.actorType,
        actorId: e.actorId,
        actorRole: e.actorRole ?? undefined,
        clinicId: e.clinicId ?? undefined,
        patientId: e.patientId ?? undefined,
        appointmentId: e.appointmentId ?? undefined,
        medicalReportId: e.medicalReportId ?? undefined,
        doctorId: e.doctorId ?? undefined,
      },
      e.event,
    );
  }
}

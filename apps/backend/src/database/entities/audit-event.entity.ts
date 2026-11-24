import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export type AuditActorType = 'USER' | 'SERVICE';

/** Trilha de auditoria append-only: só createdAt (sem updatedAt). */
@Entity('audit_event')
export class AuditEvent {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column('text')
  event: string;

  @Column('text', { name: 'request_id', nullable: true })
  requestId: string | null;

  @Column('text', { name: 'actor_type' })
  actorType: AuditActorType;

  @Column('text', { name: 'actor_id' })
  actorId: string;

  @Column('text', { name: 'actor_role', nullable: true })
  actorRole: string | null;

  @Column('uuid', { name: 'clinic_id', nullable: true })
  clinicId: string | null;

  @Column('uuid', { name: 'patient_id', nullable: true })
  patientId: string | null;

  @Column('uuid', { name: 'appointment_id', nullable: true })
  appointmentId: string | null;

  @Column('uuid', { name: 'medical_report_id', nullable: true })
  medicalReportId: string | null;

  @Column('uuid', { name: 'doctor_id', nullable: true })
  doctorId: string | null;

  @Column('jsonb', { default: {} })
  metadata: Record<string, unknown>;
}

import { Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import type { ReportStatus } from '../../common/domain.js';
import type { ReportDocument } from '../../medical-reports/report-body.js';
import { Appointment } from './appointment.entity.js';
import { Doctor, DoctorRegistration } from './doctor.entity.js';
import { TimestampedEntity } from './timestamped.entity.js';

@Entity('medical_report')
export class MedicalReport extends TimestampedEntity {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  @Column('uuid', { name: 'appointment_id' })
  appointmentId: string;

  @OneToOne(() => Appointment, (a) => a.medicalReport)
  @JoinColumn({ name: 'appointment_id' })
  appointment?: Relation<Appointment>;

  /** Dono do laudo: o médico que o iniciou. */
  @Column('uuid', { name: 'doctor_id' })
  doctorId: string;

  @ManyToOne(() => Doctor)
  @JoinColumn({ name: 'doctor_id' })
  doctor?: Relation<Doctor>;

  /** Montado pelo backend: tipo do exame + complemento opcional. */
  @Column('text')
  title: string;

  @Column('text', { name: 'title_complement', nullable: true })
  titleComplement: string | null;

  /** JSON do Tiptap, validado contra a lista fechada de formatações. */
  @Column('jsonb')
  body: ReportDocument;

  /** Texto puro extraído do body (bloqueia publicação vazia). */
  @Column('text', { name: 'body_text', default: '' })
  bodyText: string;

  @Column('text', { default: 'DRAFT' })
  status: ReportStatus;

  @Column('timestamptz', { name: 'published_at', nullable: true })
  publishedAt: Date | null;

  /** Snapshots gravados na publicação (assinatura imutável). */
  @Column('uuid', { name: 'registration_id', nullable: true })
  registrationId: string | null;

  @ManyToOne(() => DoctorRegistration)
  @JoinColumn({ name: 'registration_id' })
  registration?: Relation<DoctorRegistration> | null;

  @Column('text', { name: 'professional_name', nullable: true })
  professionalName: string | null;

  @Column('text', { name: 'professional_registration', nullable: true })
  professionalRegistration: string | null;
}

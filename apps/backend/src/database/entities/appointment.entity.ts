import { Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import type { AppointmentStatus } from '../../common/domain.js';
import { ExamType } from './catalog.entity.js';
import { Clinic } from './clinic.entity.js';
import { MedicalReport } from './medical-report.entity.js';
import { Patient } from './patient.entity.js';
import { TimestampedEntity } from './timestamped.entity.js';

@Entity('appointment')
export class Appointment extends TimestampedEntity {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  @Column('uuid', { name: 'clinic_id' })
  clinicId: string;

  @ManyToOne(() => Clinic)
  @JoinColumn({ name: 'clinic_id' })
  clinic?: Relation<Clinic>;

  @Column('uuid', { name: 'patient_id' })
  patientId: string;

  @ManyToOne(() => Patient)
  @JoinColumn({ name: 'patient_id' })
  patient?: Relation<Patient>;

  @Column('uuid', { name: 'exam_type_id' })
  examTypeId: string;

  @ManyToOne(() => ExamType)
  @JoinColumn({ name: 'exam_type_id' })
  examType?: Relation<ExamType>;

  /** Instante do início do slot, em UTC. */
  @Column('timestamptz', { name: 'starts_at' })
  startsAt: Date;

  @Column('text', { default: 'SCHEDULED' })
  status: AppointmentStatus;

  @Column('uuid', { name: 'created_by_user_id' })
  createdByUserId: string;

  @Column('uuid', { name: 'cancelled_by_user_id', nullable: true })
  cancelledByUserId: string | null;

  @Column('timestamptz', { name: 'cancelled_at', nullable: true })
  cancelledAt: Date | null;

  /** URL do Stone Web Viewer (PACS de demonstração), gravada pelo pacs-seed. */
  @Column('text', { name: 'image_viewer_url', nullable: true })
  imageViewerUrl: string | null;

  @OneToOne(() => MedicalReport, (r) => r.appointment)
  medicalReport?: Relation<MedicalReport> | null;
}

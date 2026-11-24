import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Clinic } from './clinic.entity.js';
import { TimestampedEntity } from './timestamped.entity.js';

/** Atendente: exatamente uma clínica (clinic_id NOT NULL, user_id único). */
@Entity('attendant')
export class Attendant extends TimestampedEntity {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column('uuid', { name: 'clinic_id' })
  clinicId: string;

  @ManyToOne(() => Clinic)
  @JoinColumn({ name: 'clinic_id' })
  clinic?: Relation<Clinic>;
}

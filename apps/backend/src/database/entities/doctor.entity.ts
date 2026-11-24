import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import type { Uf } from '../../common/domain.js';
import { Clinic } from './clinic.entity.js';
import { TimestampedEntity } from './timestamped.entity.js';
import { User } from './user.entity.js';

@Entity('doctor')
export class Doctor extends TimestampedEntity {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column('text')
  specialty: string;

  @OneToMany(() => DoctorRegistration, (r) => r.doctor)
  registrations?: Relation<DoctorRegistration[]>;
}

/** Conselho profissional (CRM, CRO...). Cadastro: por ora, só CRM. */
@Entity('professional_council')
export class ProfessionalCouncil extends TimestampedEntity {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  @Column('text')
  code: string;

  @Column('text')
  name: string;
}

/** Registro profissional: um médico pode ter vários (um por UF/conselho). */
@Entity('doctor_registration')
export class DoctorRegistration extends TimestampedEntity {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  @Column('uuid', { name: 'doctor_id' })
  doctorId: string;

  @ManyToOne(() => Doctor, (d) => d.registrations)
  @JoinColumn({ name: 'doctor_id' })
  doctor?: Relation<Doctor>;

  @Column('uuid', { name: 'council_id' })
  councilId: string;

  @ManyToOne(() => ProfessionalCouncil)
  @JoinColumn({ name: 'council_id' })
  council?: Relation<ProfessionalCouncil>;

  @Column('varchar', { length: 20 })
  number: string;

  @Column('char', { length: 2 })
  state: Uf;
}

/** Vínculo médico ↔ clínica (N:N). */
@Entity('doctor_clinic')
export class DoctorClinic extends TimestampedEntity {
  @PrimaryColumn('uuid', { name: 'doctor_id' })
  doctorId: string;

  @PrimaryColumn('uuid', { name: 'clinic_id' })
  clinicId: string;

  @ManyToOne(() => Clinic)
  @JoinColumn({ name: 'clinic_id' })
  clinic?: Relation<Clinic>;
}

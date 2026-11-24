import { Column, Entity, PrimaryColumn } from 'typeorm';
import { TimestampedEntity } from './timestamped.entity.js';

/** Paciente: global (não pertence a uma clínica). */
@Entity('patient')
export class Patient extends TimestampedEntity {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column('text')
  name: string;

  /** Data civil (YYYY-MM-DD), sem fuso. */
  @Column('date', { name: 'birth_date' })
  birthDate: string;

  /** CPF fictício, só dígitos. */
  @Column('char', { length: 11 })
  document: string;
}

import { Column, Entity, PrimaryColumn } from 'typeorm';
import { TimestampedEntity } from './timestamped.entity.js';

@Entity('exam_type')
export class ExamType extends TimestampedEntity {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  @Column('text')
  name: string;

  /** Código LOINC (opcional), usado na exportação FHIR. */
  @Column('text', { name: 'loinc_code', nullable: true })
  loincCode: string | null;

  @Column('text', { name: 'loinc_display', nullable: true })
  loincDisplay: string | null;
}

/** Feriado nacional (lista estática). A data é civil (sem fuso). */
@Entity('holiday')
export class Holiday extends TimestampedEntity {
  @PrimaryColumn('date')
  date: string;

  @Column('text')
  name: string;
}

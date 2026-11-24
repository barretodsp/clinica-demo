import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { ClinicTimezone, Uf } from '../../common/domain.js';
import { TimestampedEntity } from './timestamped.entity.js';

@Entity('clinic')
export class Clinic extends TimestampedEntity {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  city: string;

  @Column('char', { length: 2 })
  state: Uf;

  @Column('text')
  timezone: ClinicTimezone;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;
}

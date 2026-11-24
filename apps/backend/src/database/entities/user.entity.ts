import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { UserRole } from '../../common/domain.js';
import { TimestampedEntity } from './timestamped.entity.js';

@Entity('user')
export class User extends TimestampedEntity {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  @Column('text')
  email: string;

  @Column('text', { name: 'password_hash', select: false })
  passwordHash: string;

  @Column('text')
  name: string;

  @Column('text')
  role: UserRole;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;
}

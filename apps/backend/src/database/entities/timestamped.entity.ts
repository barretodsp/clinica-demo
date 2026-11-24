import { CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * createdAt/updatedAt de todas as tabelas (exceto audit_event).
 * O banco também mantém updated_at por trigger (set_updated_at), o que cobre
 * SQL direto, seed e updates atômicos feitos com query builder.
 */
export abstract class TimestampedEntity {
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

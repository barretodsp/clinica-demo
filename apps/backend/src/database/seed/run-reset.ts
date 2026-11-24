import { env } from '../../config/env.js';
import { createDataSource } from '../data-source.js';
import { seedDatabase } from './seed.js';

/**
 * Somente desenvolvimento: apaga TODOS os dados (mantém o schema) e recarrega o seed.
 * Recusa rodar com NODE_ENV=production.
 */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('db:reset é só para desenvolvimento.');
  const url = process.env.DATABASE_MIGRATION_URL ?? env().DATABASE_MIGRATION_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL não definida');
  const ds = await createDataSource(url).initialize();
  try {
    await ds.query(`
      DO $$ DECLARE t text; BEGIN
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'typeorm_migrations' LOOP
          EXECUTE format('TRUNCATE TABLE %I CASCADE', t);
        END LOOP;
      END $$;`);
    await seedDatabase(ds);
    console.log('Banco limpo e seed recarregado.');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

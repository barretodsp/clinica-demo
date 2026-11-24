import { env } from '../src/config/env.js';
import { createDataSource } from '../src/database/data-source.js';

/**
 * Recria o schema do banco de teste (clinic_test) aplicando as migrations reais,
 * com o papel dono (clinic_owner). Os testes conectam como clinic_app.
 */
export default async function setup(): Promise<void> {
  env(); // carrega o .env da raiz
  const url = process.env.DATABASE_MIGRATION_URL_TEST;
  if (!url || !process.env.DATABASE_URL_TEST) {
    throw new Error('Defina DATABASE_URL_TEST e DATABASE_MIGRATION_URL_TEST (veja .env.example)');
  }
  const ds = await createDataSource(url).initialize();
  try {
    await ds.query(`
      DO $$ DECLARE t text; BEGIN
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
          EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', t);
        END LOOP;
      END $$;
      DROP FUNCTION IF EXISTS set_updated_at() CASCADE;`);
    await ds.runMigrations({ transaction: 'each' });
  } finally {
    await ds.destroy();
  }
}

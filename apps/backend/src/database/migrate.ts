import { env } from '../config/env.js';
import { createDataSource } from './data-source.js';

/** Aplica as migrations pendentes com o papel dono do schema (clinic_owner). */
async function main(): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL ?? env().DATABASE_MIGRATION_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL não definida');
  const ds = await createDataSource(url).initialize();
  try {
    const applied = await ds.runMigrations({ transaction: 'each' });
    console.log(applied.length ? `Migrations aplicadas: ${applied.map((m) => m.name).join(', ')}` : 'Nenhuma migration pendente.');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

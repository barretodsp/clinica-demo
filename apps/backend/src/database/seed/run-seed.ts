import { env } from '../../config/env.js';
import { createDataSource } from '../data-source.js';
import { seedDatabase } from './seed.js';

/** Carrega os dados fictícios usando o papel dono do schema. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL ?? env().DATABASE_MIGRATION_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL não definida');
  const ds = await createDataSource(url).initialize();
  try {
    const { skipped } = await seedDatabase(ds);
    console.log(skipped ? 'Seed já aplicado (há clínicas cadastradas): nada a fazer.' : 'Seed aplicado com sucesso.');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

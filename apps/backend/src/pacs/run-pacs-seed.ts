import { readFile } from 'node:fs/promises';
import { env } from '../config/env.js';
import { createDataSource } from '../database/data-source.js';
import { OrthancClient } from './orthanc-client.js';
import { seedPacsImages } from './pacs-seed.js';

/**
 * One-shot do docker compose: gera as imagens do PACS de demonstração (Orthanc efêmero)
 * para os agendamentos ativos e grava a URL do Stone Web Viewer em appointment.image_viewer_url.
 */
async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_MIGRATION_URL ?? env().DATABASE_MIGRATION_URL;
  const orthancUrl = process.env.PACS_URL ?? 'http://orthanc:8042';
  const publicBase = process.env.PACS_PUBLIC_URL ?? 'http://pacs.clinica.localhost';
  const templatePath = process.env.PACS_TEMPLATE ?? 'pacs/raio-x.dcm';
  if (!dbUrl) throw new Error('DATABASE_MIGRATION_URL não definida');

  const template = new Uint8Array(await readFile(templatePath));
  const orthanc = new OrthancClient(orthancUrl);
  await orthanc.waitReady();

  const ds = await createDataSource(dbUrl).initialize();
  try {
    const r = await seedPacsImages(ds, orthanc, template, publicBase);
    console.log(`PACS: ${r.appointments} agendamentos ativos; ${r.created} estudos gerados, ${r.alreadyInPacs} já existiam.`);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

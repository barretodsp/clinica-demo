import type { INestApplication } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { Test } from '@nestjs/testing';
import type { DataSource } from 'typeorm';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { SESSION_COOKIE } from '../src/auth/auth-user.js';
import { SessionTokenService } from '../src/auth/token.service.js';
import { addDays, localParts, localToUtc } from '../src/common/clinic-time.js';
import { env, resetEnvCache } from '../src/config/env.js';
import { createDataSource } from '../src/database/data-source.js';
import { SEED_FILLED_BUSINESS_DAYS, seedDatabase } from '../src/database/seed/seed.js';
import { nextBusinessDays } from '../src/appointments/booking-rules.js';
import { HOLIDAYS } from '../src/database/seed/holidays.data.js';

export const fastHasher = new PasswordHasher({ logN: 10 });

export interface TestContext {
  app: INestApplication;
  http: ReturnType<typeof request>;
  /** Conexão como clinic_owner (fixtures/limpeza). */
  owner: DataSource;
  close: () => Promise<void>;
}

/** App real (AppModule) contra o banco clinic_test, conectado como clinic_app. */
export async function createTestApp(): Promise<TestContext> {
  env();
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!;
  process.env.DATABASE_MIGRATION_URL = process.env.DATABASE_MIGRATION_URL_TEST!;
  resetEnvCache();
  const { AppModule } = await import('../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PasswordHasher)
    .useValue(fastHasher)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  const owner = await createDataSource(process.env.DATABASE_MIGRATION_URL_TEST!).initialize();
  return {
    app,
    http: request(app.getHttpServer()),
    owner,
    close: async () => {
      await app.close();
      await owner.destroy();
    },
  };
}

/** Limpa todas as tabelas e aplica o seed de demonstração (dados conhecidos). */
/** Apaga os dados e recarrega o seed; `now` permite fixar o "dia da subida". */
export async function resetAndSeed(owner: DataSource, now = new Date()): Promise<void> {
  await owner.query(`
    DO $$ DECLARE t text; BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'typeorm_migrations' LOOP
        EXECUTE format('TRUNCATE TABLE %I CASCADE', t);
      END LOOP;
    END $$;`);
  await seedDatabase(owner, now, fastHasher);
}

export interface Ids {
  clinics: Record<'SP' | 'BH' | 'MAO' | 'RBR', { id: string; timezone: string; state: string }>;
  users: Record<string, { userId: string; patientId?: string; doctorId?: string }>;
  examTypes: Record<string, string>;
}

const CLINIC_KEYS: Record<string, keyof Ids['clinics']> = {
  'Clínica Demo São Paulo': 'SP',
  'Clínica Demo Belo Horizonte': 'BH',
  'Clínica Demo Manaus': 'MAO',
  'Clínica Demo Rio Branco': 'RBR',
};

export async function loadIds(owner: DataSource): Promise<Ids> {
  const clinics = {} as Ids['clinics'];
  for (const c of await owner.query('SELECT id, name, timezone, state FROM clinic')) {
    clinics[CLINIC_KEYS[c.name]] = { id: c.id, timezone: c.timezone, state: c.state };
  }
  const users: Ids['users'] = {};
  for (const u of await owner.query(
    `SELECT u.id, u.email, p.id AS patient_id, d.id AS doctor_id FROM "user" u
     LEFT JOIN patient p ON p.user_id = u.id LEFT JOIN doctor d ON d.user_id = u.id`,
  )) {
    users[u.email] = { userId: u.id, patientId: u.patient_id ?? undefined, doctorId: u.doctor_id ?? undefined };
  }
  const examTypes: Record<string, string> = {};
  for (const e of await owner.query('SELECT id, name FROM exam_type')) examTypes[e.name] = e.id;
  return { clinics, users, examTypes };
}

/** Cookie de sessão emitido direto pelo serviço de tokens (sem passar pela rota de login). */
export function sessionCookie(app: INestApplication, userId: string): string {
  return `${SESSION_COOKIE}=${app.get(SessionTokenService).issue(userId)}`;
}

const holidaySet = new Set(HOLIDAYS.map((h) => h.date));

/**
 * Um slot futuro válido (horário local HH:MM) no fuso da clínica, no N-ésimo dia útil
 * DEPOIS da janela que o seed preenche (assim os testes não colidem com os dados fictícios).
 */
export function futureSlot(timezone: string, nthBusinessDay: number, hhmm: string): string {
  const today = localParts(new Date(), timezone).date;
  const n = nthBusinessDay + SEED_FILLED_BUSINESS_DAYS + 1;
  const day = nextBusinessDays(addDays(today, 1), n + 1, holidaySet)[n];
  const [h, m] = hhmm.split(':').map(Number);
  return localToUtc(day, h * 60 + m, timezone).toISOString();
}

/** Próxima data (local) que satisfaz o predicado, a partir de amanhã. */
export function nextLocalDate(timezone: string, predicate: (date: string) => boolean): string {
  let d = addDays(localParts(new Date(), timezone).date, 1);
  while (!predicate(d)) d = addDays(d, 1);
  return d;
}

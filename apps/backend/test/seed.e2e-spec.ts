import { SEED_APPOINTMENTS_PER_PATIENT_PER_DAY, SEED_FILLED_BUSINESS_DAYS } from '../src/database/seed/seed.js';
import { HOLIDAYS } from '../src/database/seed/holidays.data.js';
import { createTestApp, resetAndSeed, type TestContext } from './helpers.js';

describe('Dados fictícios (seed)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetAndSeed(ctx.owner);
  });
  afterAll(() => ctx.close());

  it('cria 21 contas: 4 atendentes (1 por clínica), 5 médicos e 12 pacientes', async () => {
    const rows = await ctx.owner.query(`SELECT role, count(*)::int AS n FROM "user" GROUP BY role ORDER BY role`);
    expect(rows).toEqual([
      { role: 'ATTENDANT', n: 4 },
      { role: 'DOCTOR', n: 5 },
      { role: 'PATIENT', n: 12 },
    ]);
    const [{ n }] = await ctx.owner.query(`SELECT count(DISTINCT clinic_id)::int AS n FROM attendant`);
    expect(n).toBe(4);
  });

  it('2 médicos atuam em uma clínica só', async () => {
    const rows = await ctx.owner.query(
      `SELECT count(*)::int AS n FROM (SELECT doctor_id FROM doctor_clinic GROUP BY doctor_id HAVING count(*) = 1) x`,
    );
    expect(rows[0].n).toBe(2);
  });

  it('cada clínica tem 2 ou 3 pacientes; 2 pacientes em mais de uma clínica; 2 sem agendamentos', async () => {
    const perClinic = await ctx.owner.query(`SELECT count(DISTINCT patient_id)::int AS n FROM appointment GROUP BY clinic_id`);
    expect(perClinic).toHaveLength(4);
    for (const { n } of perClinic) expect([2, 3]).toContain(n);
    const perPatient: { clinics: number }[] = await ctx.owner.query(
      `SELECT count(DISTINCT a.clinic_id)::int AS clinics FROM patient p LEFT JOIN appointment a ON a.patient_id = p.id GROUP BY p.id`,
    );
    expect(perPatient.filter((p) => p.clinics > 1)).toHaveLength(2);
    expect(perPatient.filter((p) => p.clinics === 0)).toHaveLength(2);
  });

  it(`cada paciente agendado tem ${SEED_APPOINTMENTS_PER_PATIENT_PER_DAY} agendamentos por dia nos ${SEED_FILLED_BUSINESS_DAYS} próximos dias úteis`, async () => {
    const rows: { patient_id: string; day: string; n: number }[] = await ctx.owner.query(
      `SELECT a.patient_id, to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day, count(*)::int AS n
       FROM appointment a WHERE a.starts_at > now() AND a.status = 'SCHEDULED' GROUP BY 1, 2`,
    );
    const patients = new Set(rows.map((r) => r.patient_id));
    expect(patients.size).toBe(10); // 12 pacientes, 2 sem agendamentos
    for (const r of rows) expect(r.n).toBe(SEED_APPOINTMENTS_PER_PATIENT_PER_DAY);
    for (const p of patients) expect(rows.filter((r) => r.patient_id === p)).toHaveLength(SEED_FILLED_BUSINESS_DAYS);
    // a agenda continua majoritariamente livre para testar agendamentos
    const [{ max }] = await ctx.owner.query(
      `SELECT max(n)::int AS max FROM (SELECT count(*) AS n FROM appointment a JOIN clinic c ON c.id = a.clinic_id
       WHERE a.starts_at > now() AND a.status = 'SCHEDULED'
       GROUP BY a.clinic_id, to_char(a.starts_at AT TIME ZONE c.timezone, 'YYYY-MM-DD')) x`,
    );
    expect(max).toBeLessThanOrEqual(6);
  });
});

/**
 * Os "3 próximos dias úteis" do seed pulam fins de semana e feriados nacionais (mesma regra da agenda).
 * Semeia em datas fixas que caem em cima deles e confere os dias de todos os agendamentos.
 */
describe('Dados fictícios (seed) — dias úteis em torno de feriados e fins de semana', () => {
  let ctx: TestContext;
  const holidays = new Set(HOLIDAYS.map((h) => h.date));
  const isWorkday = (day: string) => ![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()) && !holidays.has(day);

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await resetAndSeed(ctx.owner); // devolve o banco de teste ao seed do dia
    await ctx.close();
  });

  /** Dias (no fuso de cada clínica) com agendamentos, separados em passados e futuros em relação a `now`. */
  async function seededDays(now: Date) {
    const rows: { uf: string; day: string; future: boolean }[] = await ctx.owner.query(
      `SELECT DISTINCT c.state AS uf, to_char(a.starts_at AT TIME ZONE c.timezone, 'YYYY-MM-DD') AS day, a.starts_at > $1 AS future
       FROM appointment a JOIN clinic c ON c.id = a.clinic_id ORDER BY 1, 2`,
      [now],
    );
    const futureBy = (uf: string) => rows.filter((r) => r.uf === uf && r.future).map((r) => r.day);
    return { all: rows.map((r) => r.day), futureBy };
  }

  it.each([
    {
      caso: 'véspera de Natal: pula o feriado (sex 25/12) e o fim de semana',
      now: '2026-12-23T15:00:00Z', // quarta
      expected: { SP: ['2026-12-24', '2026-12-28', '2026-12-29'], AC: ['2026-12-24', '2026-12-28', '2026-12-29'] },
    },
    {
      caso: 'sexta antes do Carnaval: pula sábado, domingo e as segunda e terça de Carnaval',
      now: '2027-02-05T15:00:00Z',
      expected: { SP: ['2027-02-10', '2027-02-11', '2027-02-12'], AC: ['2027-02-10', '2027-02-11', '2027-02-12'] },
    },
    {
      caso: 'virada de dia entre fusos: já é 24/12 em SP e ainda 23/12 em Rio Branco',
      now: '2026-12-24T03:30:00Z', // 00:30 em SP, 22:30 em Rio Branco
      expected: { SP: ['2026-12-28', '2026-12-29', '2026-12-30'], AC: ['2026-12-24', '2026-12-28', '2026-12-29'] },
    },
  ])('$caso', async ({ now, expected }) => {
    const at = new Date(now);
    await resetAndSeed(ctx.owner, at);
    const { all, futureBy } = await seededDays(at);
    // nenhum agendamento (passado ou futuro) cai em fim de semana ou feriado
    expect(all.filter((d) => !isWorkday(d))).toEqual([]);
    expect(futureBy('SP')).toEqual(expected.SP);
    expect(futureBy('AC')).toEqual(expected.AC);
  });
});

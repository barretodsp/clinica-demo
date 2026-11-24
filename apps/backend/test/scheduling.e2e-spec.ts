import { createTestApp, futureSlot, loadIds, nextLocalDate, resetAndSeed, sessionCookie, type Ids, type TestContext } from './helpers.js';
import { localToUtc, weekdayOf } from '../src/common/clinic-time.js';
import { HOLIDAYS } from '../src/database/seed/holidays.data.js';

describe('Agendamentos (integração)', () => {
  let ctx: TestContext;
  let ids: Ids;
  let attSP: string;
  let attBH: string;
  let attRBR: string;
  let doctor1: string;
  let patient1: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    await resetAndSeed(ctx.owner);
    ids = await loadIds(ctx.owner);
    attSP = sessionCookie(ctx.app, ids.users['paula@mail.com'].userId);
    attBH = sessionCookie(ctx.app, ids.users['marcos@mail.com'].userId);
    attRBR = sessionCookie(ctx.app, ids.users['tiago@mail.com'].userId);
    doctor1 = sessionCookie(ctx.app, ids.users['carlos@mail.com'].userId);
    patient1 = sessionCookie(ctx.app, ids.users['joao@mail.com'].userId);
  });

  const book = (cookie: string, clinic: keyof Ids['clinics'], body: Record<string, unknown>) =>
    ctx.http.post(`/api/clinics/${ids.clinics[clinic].id}/appointments`).set('Cookie', cookie).send(body);

  const body = (patientEmail: string, startsAt: string, exam = 'Ultrassonografia') => ({
    patientId: ids.users[patientEmail].patientId,
    examTypeId: ids.examTypes[exam],
    startsAt,
  });

  it('[obrigatório 1] duas (ou mais) tentativas simultâneas no mesmo horário: só uma é aceita', async () => {
    const slot = futureSlot(ids.clinics.SP.timezone, 4, '10:00');
    const patients = ['joao@mail.com', 'silvia@mail.com', 'jose@mail.com', 'lucia@mail.com'];
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, i) => book(attSP, 'SP', body(patients[i % 4], slot))),
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    for (const r of responses.filter((x) => x.status === 409)) expect(['SLOT_TAKEN', 'PATIENT_BUSY']).toContain(r.body.code);
    const [{ count }] = await ctx.owner.query(
      `SELECT count(*)::int AS count FROM appointment WHERE clinic_id = $1 AND starts_at = $2 AND status = 'SCHEDULED'`,
      [ids.clinics.SP.id, slot],
    );
    expect(count).toBe(1);
  });

  it('[obrigatório 5] agendamento no passado é rejeitado (422 IN_PAST)', async () => {
    const past = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    past.setUTCMinutes(0, 0, 0);
    const res = await book(attSP, 'SP', body('joao@mail.com', past.toISOString())).expect(422);
    expect(res.body.code).toBe('IN_PAST');
  });

  it('cria agendamento válido e registra auditoria na mesma transação', async () => {
    const res = await book(attSP, 'SP', body('silvia@mail.com', futureSlot(ids.clinics.SP.timezone, 3, '14:30'))).expect(201);
    expect(res.body).toMatchObject({ status: 'SCHEDULED', examType: { name: 'Ultrassonografia' } });
    expect(res.body.patient.documentMasked).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
    const events = await ctx.owner.query(`SELECT event, actor_type, actor_role FROM audit_event WHERE appointment_id = $1`, [res.body.id]);
    expect(events).toEqual([{ event: 'appointment.scheduled', actor_type: 'USER', actor_role: 'ATTENDANT' }]);
  });

  it('agendamento rejeitado não gera evento de auditoria', async () => {
    const before = await ctx.owner.query(`SELECT count(*)::int AS c FROM audit_event`);
    const slot = futureSlot(ids.clinics.SP.timezone, 4, '11:00');
    await book(attSP, 'SP', body('joao@mail.com', slot)).expect(201);
    await book(attSP, 'SP', body('silvia@mail.com', slot)).expect(409);
    const after = await ctx.owner.query(`SELECT count(*)::int AS c FROM audit_event`);
    expect(after[0].c - before[0].c).toBe(1);
  });

  it('permite reutilizar o horário de um agendamento cancelado', async () => {
    const slot = futureSlot(ids.clinics.SP.timezone, 5, '15:00');
    const first = await book(attSP, 'SP', body('joao@mail.com', slot)).expect(201);
    await ctx.http.post(`/api/clinics/${ids.clinics.SP.id}/appointments/${first.body.id}/cancel`).set('Cookie', attSP).expect(200);
    await book(attSP, 'SP', body('silvia@mail.com', slot)).expect(201);
  });

  it('mesmo horário em clínicas diferentes é aceito; mesmo paciente no mesmo horário em outra clínica → 409 PATIENT_BUSY', async () => {
    const slotSP = futureSlot(ids.clinics.SP.timezone, 6, '10:00');
    await book(attSP, 'SP', body('joao@mail.com', slotSP)).expect(201);
    await book(attBH, 'BH', body('silvia@mail.com', slotSP)).expect(201);
    // 10:00 em SP = 08:00 em Rio Branco: o mesmo instante
    const busy = await book(attRBR, 'RBR', body('joao@mail.com', slotSP)).expect(409);
    expect(busy.body.code).toBe('PATIENT_BUSY');
  });

  it('rejeita fim de semana, feriado, fora do expediente (no fuso local) e após 31/12/2028', async () => {
    const tz = ids.clinics.RBR.timezone;
    const saturday = nextLocalDate(tz, (d) => weekdayOf(d) === 6);
    expect((await book(attRBR, 'RBR', body('joao@mail.com', localToUtc(saturday, 600, tz).toISOString())).expect(422)).body.code).toBe('WEEKEND');
    const holiday = HOLIDAYS.find((h) => h.date > new Date().toISOString().slice(0, 10) && weekdayOf(h.date) % 6 !== 0)!.date;
    expect((await book(attRBR, 'RBR', body('joao@mail.com', localToUtc(holiday, 600, tz).toISOString())).expect(422)).body.code).toBe('HOLIDAY');
    // 07:30 em Rio Branco (09:30 em Brasília) → fora do expediente da clínica
    const early = futureSlot(tz, 2, '07:30');
    expect((await book(attRBR, 'RBR', body('joao@mail.com', early)).expect(422)).body.code).toBe('OUTSIDE_BUSINESS_HOURS');
    expect((await book(attRBR, 'RBR', body('joao@mail.com', futureSlot(tz, 2, '19:00'))).expect(422)).body.code).toBe('OUTSIDE_BUSINESS_HOURS');
    await book(attRBR, 'RBR', body('joao@mail.com', futureSlot(tz, 2, '18:30'))).expect(201);
    expect((await book(attRBR, 'RBR', body('joao@mail.com', localToUtc('2029-01-03', 600, tz).toISOString())).expect(422)).body.code).toBe('BEYOND_BOOKING_WINDOW');
    expect((await book(attRBR, 'RBR', body('joao@mail.com', futureSlot(tz, 2, '10:15'))).expect(422)).body.code).toBe('NOT_ALIGNED');
  });

  it('filtra por data (dia local da clínica) e por paciente', async () => {
    const slot = futureSlot(ids.clinics.SP.timezone, 7, '08:00');
    await book(attSP, 'SP', body('jose@mail.com', slot)).expect(201);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: ids.clinics.SP.timezone }).format(new Date(slot));
    const byDate = await ctx.http.get(`/api/clinics/${ids.clinics.SP.id}/appointments?date=${date}`).set('Cookie', attSP).expect(200);
    expect(byDate.body.map((a: { startsAt: string }) => a.startsAt)).toEqual([slot]);
    const byPatient = await ctx.http
      .get(`/api/clinics/${ids.clinics.SP.id}/appointments?patientId=${ids.users['jose@mail.com'].patientId}`)
      .set('Cookie', attSP)
      .expect(200);
    expect(byPatient.body.every((a: { patient: { id: string } }) => a.patient.id === ids.users['jose@mail.com'].patientId)).toBe(true);
  });

  it('slots disponíveis: 22 no dia útil, ocupados marcados', async () => {
    const slot = futureSlot(ids.clinics.SP.timezone, 8, '09:00');
    await book(attSP, 'SP', body('joao@mail.com', slot)).expect(201);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: ids.clinics.SP.timezone }).format(new Date(slot));
    const res = await ctx.http.get(`/api/clinics/${ids.clinics.SP.id}/appointments/available-slots?date=${date}`).set('Cookie', attSP).expect(200);
    expect(res.body.slots).toHaveLength(22);
    expect(res.body.slots.find((s: { startsAt: string }) => s.startsAt === slot)).toMatchObject({ available: false, reason: 'SLOT_TAKEN' });
  });

  describe('multi-tenant e papéis', () => {
    it('atendente da clínica A não lista, não abre e não cancela agendamento da clínica B (403)', async () => {
      const b = await book(attBH, 'BH', body('joao@mail.com', futureSlot(ids.clinics.BH.timezone, 3, '10:00'))).expect(201);
      expect((await ctx.http.get(`/api/clinics/${ids.clinics.BH.id}/appointments`).set('Cookie', attSP).expect(403)).body.code).toBe('CLINIC_ACCESS_DENIED');
      await ctx.http.get(`/api/clinics/${ids.clinics.BH.id}/appointments/${b.body.id}`).set('Cookie', attSP).expect(403);
      await ctx.http.post(`/api/clinics/${ids.clinics.BH.id}/appointments/${b.body.id}/cancel`).set('Cookie', attSP).expect(403);
      // pela URL da própria clínica, com o id de outra
      expect((await ctx.http.get(`/api/clinics/${ids.clinics.SP.id}/appointments/${b.body.id}`).set('Cookie', attSP).expect(403)).body.code).toBe('APPOINTMENT_OTHER_CLINIC');
      await ctx.http.post(`/api/clinics/${ids.clinics.SP.id}/appointments/${b.body.id}/cancel`).set('Cookie', attSP).expect(403);
    });

    it('médico vê só as clínicas vinculadas e não agenda (403)', async () => {
      await ctx.http.get(`/api/clinics/${ids.clinics.BH.id}/appointments`).set('Cookie', doctor1).expect(200);
      await ctx.http.get(`/api/clinics/${ids.clinics.MAO.id}/appointments`).set('Cookie', doctor1).expect(403);
      await book(doctor1, 'SP', body('joao@mail.com', futureSlot(ids.clinics.SP.timezone, 3, '16:00'))).expect(403);
    });

    it('paciente não acessa rotas da clínica (403) e sem sessão é 401', async () => {
      await ctx.http.get(`/api/clinics/${ids.clinics.SP.id}/appointments`).set('Cookie', patient1).expect(403);
      await ctx.http.get('/api/patients?search=maria').set('Cookie', patient1).expect(403);
      await ctx.http.get(`/api/clinics/${ids.clinics.SP.id}/appointments`).expect(401);
    });
  });

  describe('busca de pacientes', () => {
    it('busca por nome sem acento e por CPF; exige 3 caracteres; mascara o CPF', async () => {
      const byName = await ctx.http.get('/api/patients?search=jose').set('Cookie', attSP).expect(200);
      expect(byName.body).toEqual([{ id: ids.users['jose@mail.com'].patientId, name: 'José Antônio Silva', documentMasked: '***.763.148-**' }]);
      const byCpf = await ctx.http.get('/api/patients?search=694.031.527-61').set('Cookie', attSP).expect(200);
      expect(byCpf.body[0].name).toBe('Maria Oliveira');
      expect((await ctx.http.get('/api/patients?search=jo').set('Cookie', attSP).expect(422)).body.code).toBe('SEARCH_TOO_SHORT');
    });
  });
});

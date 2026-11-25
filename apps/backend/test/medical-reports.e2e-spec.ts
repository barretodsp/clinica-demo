import { jsonbTextBytes } from '../src/medical-reports/report-body.js';
import { createTestApp, futureSlot, loadIds, resetAndSeed, sessionCookie, type Ids, type TestContext } from './helpers.js';

const BODY = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Exame sem alterações.', marks: [{ type: 'bold' }] }] }],
};

describe('Laudos e acesso do paciente (integração)', () => {
  let ctx: TestContext;
  let ids: Ids;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    await resetAndSeed(ctx.owner);
    ids = await loadIds(ctx.owner);
    for (const email of Object.keys(ids.users)) cookies[email] = sessionCookie(ctx.app, ids.users[email].userId);
  });

  const c = (k: keyof Ids['clinics']) => ids.clinics[k].id;

  /** Agenda um exame (atendente da clínica) e devolve o id. */
  async function schedule(clinic: keyof Ids['clinics'], attendant: string, patient: string, nth = 3, hhmm = '10:00', exam = 'Ressonância Magnética') {
    const res = await ctx.http
      .post(`/api/clinics/${c(clinic)}/appointments`)
      .set('Cookie', cookies[attendant])
      .send({ patientId: ids.users[patient].patientId, examTypeId: ids.examTypes[exam], startsAt: futureSlot(ids.clinics[clinic].timezone, nth, hhmm) })
      .expect(201);
    return res.body.id as string;
  }

  const start = (clinic: keyof Ids['clinics'], doctor: string, appointmentId: string) =>
    ctx.http.post(`/api/clinics/${c(clinic)}/appointments/${appointmentId}/medical-report`).set('Cookie', cookies[doctor]);
  const save = (clinic: keyof Ids['clinics'], doctor: string, reportId: string, payload: unknown) =>
    ctx.http.put(`/api/clinics/${c(clinic)}/medical-reports/${reportId}`).set('Cookie', cookies[doctor]).send(payload);
  const publish = (clinic: keyof Ids['clinics'], doctor: string, reportId: string) =>
    ctx.http.post(`/api/clinics/${c(clinic)}/medical-reports/${reportId}/publish`).set('Cookie', cookies[doctor]);

  async function draft(clinic: keyof Ids['clinics'] = 'SP', doctor = 'carlos@mail.com', patient = 'joao@mail.com', attendant = 'paula@mail.com', nth = 3) {
    const appointmentId = await schedule(clinic, attendant, patient, nth);
    const report = await start(clinic, doctor, appointmentId).expect(201);
    return { appointmentId, reportId: report.body.id as string };
  }

  it('[obrigatório 4] laudo publicado passa a estar disponível para o paciente correto', async () => {
    const { appointmentId, reportId } = await draft();
    // antes de publicar: paciente não vê
    await ctx.http.get(`/api/me/medical-reports/${reportId}`).set('Cookie', cookies['joao@mail.com']).expect(403);
    let mine = await ctx.http.get('/api/me/appointments').set('Cookie', cookies['joao@mail.com']).expect(200);
    expect(mine.body.find((a: { id: string }) => a.id === appointmentId)).toMatchObject({ hasPublishedMedicalReport: false, medicalReportId: null });

    await save('SP', 'carlos@mail.com', reportId, { titleComplement: 'Joelho direito', body: BODY }).expect(200);
    const published = await publish('SP', 'carlos@mail.com', reportId).expect(200);
    expect(published.body.status).toBe('PUBLISHED');
    expect(published.body.signature).toEqual({ professionalName: 'Dr. Carlos Mendes', professionalRegistration: 'CRM/SP 778899' });

    // publicar não conta como visualização; a leitura do paciente, sim
    const viewsBefore = await ctx.owner.query(`SELECT count(*)::int AS n FROM audit_event WHERE event = 'medical_report.viewed' AND medical_report_id = $1`, [reportId]);
    expect(viewsBefore[0].n).toBe(0);
    const view = await ctx.http.get(`/api/me/medical-reports/${reportId}`).set('Cookie', cookies['joao@mail.com']).expect(200);
    const viewsAfter = await ctx.owner.query(`SELECT actor_role FROM audit_event WHERE event = 'medical_report.viewed' AND medical_report_id = $1`, [reportId]);
    expect(viewsAfter).toEqual([{ actor_role: 'PATIENT' }]);
    expect(view.body).toMatchObject({ title: 'Ressonância Magnética — Joelho direito', status: 'PUBLISHED', body: BODY });
    expect(Date.parse(view.body.publishedAt)).not.toBeNaN();
    mine = await ctx.http.get('/api/me/appointments').set('Cookie', cookies['joao@mail.com']).expect(200);
    expect(mine.body.find((a: { id: string }) => a.id === appointmentId)).toMatchObject({ hasPublishedMedicalReport: true, medicalReportId: reportId });
    // outro paciente continua sem acesso
    await ctx.http.get(`/api/me/medical-reports/${reportId}`).set('Cookie', cookies['silvia@mail.com']).expect(403);
  });

  it('[obrigatório 2] paciente tentando consultar laudo de outro paciente: acesso negado (403)', async () => {
    const [{ id }] = await ctx.owner.query(
      `SELECT r.id FROM medical_report r JOIN appointment a ON a.id = r.appointment_id
       WHERE r.status = 'PUBLISHED' AND a.patient_id = $1 LIMIT 1`,
      [ids.users['silvia@mail.com'].patientId],
    );
    const res = await ctx.http.get(`/api/me/medical-reports/${id}`).set('Cookie', cookies['joao@mail.com']).expect(403);
    expect(res.body.code).toBe('REPORT_ACCESS_DENIED');
    expect(JSON.stringify(res.body)).not.toContain('body');
    // e o dono consegue
    await ctx.http.get(`/api/me/medical-reports/${id}`).set('Cookie', cookies['silvia@mail.com']).expect(200);
  });

  describe('imagens do exame no laudo do paciente (extra de demonstração, PP-08)', () => {
    const viewer = 'http://pacs.clinica.localhost/stone-webviewer/index.html?study=2.25.123';

    /** Laudo publicado da Silvia, com a URL do viewer gravada no agendamento. */
    async function publishedWithImage(url: string | null = viewer) {
      const [row] = await ctx.owner.query(
        `SELECT r.id, r.appointment_id FROM medical_report r JOIN appointment a ON a.id = r.appointment_id
         WHERE r.status = 'PUBLISHED' AND a.patient_id = $1 LIMIT 1`,
        [ids.users['silvia@mail.com'].patientId],
      );
      await ctx.owner.query('UPDATE appointment SET image_viewer_url = $2 WHERE id = $1', [row.appointment_id, url]);
      return row as { id: string; appointment_id: string };
    }

    it('o paciente dono recebe imageViewerUrl no laudo publicado', async () => {
      const { id } = await publishedWithImage();
      const res = await ctx.http.get(`/api/me/medical-reports/${id}`).set('Cookie', cookies['silvia@mail.com']).expect(200);
      expect(res.body.imageViewerUrl).toBe(viewer);
    });

    it('sem imagem gerada, imageViewerUrl vem nulo (a tela não mostra o botão)', async () => {
      const { id } = await publishedWithImage(null);
      const res = await ctx.http.get(`/api/me/medical-reports/${id}`).set('Cookie', cookies['silvia@mail.com']).expect(200);
      expect(res.body.imageViewerUrl).toBeNull();
    });

    it('outro paciente não recebe o link: 403 sem nenhum dado do laudo', async () => {
      const { id } = await publishedWithImage();
      const res = await ctx.http.get(`/api/me/medical-reports/${id}`).set('Cookie', cookies['joao@mail.com']).expect(403);
      expect(JSON.stringify(res.body)).not.toContain('stone-webviewer');
    });

    it('rascunho do próprio paciente não expõe o link', async () => {
      const { reportId, appointmentId } = await draft(); // rascunho do Dr. Carlos para o João
      await ctx.owner.query('UPDATE appointment SET image_viewer_url = $2 WHERE id = $1', [appointmentId, viewer]);
      const res = await ctx.http.get(`/api/me/medical-reports/${reportId}`).set('Cookie', cookies['joao@mail.com']).expect(403);
      expect(JSON.stringify(res.body)).not.toContain('stone-webviewer');
    });

    it('a lista de agendamentos do paciente não traz o link (só a tela do laudo)', async () => {
      await publishedWithImage();
      const res = await ctx.http.get('/api/me/appointments').set('Cookie', cookies['silvia@mail.com']).expect(200);
      expect(JSON.stringify(res.body)).not.toContain('stone-webviewer');
    });
  });

  it('[obrigatório 3] paciente tentando acessar um rascunho: o conteúdo não é disponibilizado', async () => {
    const { appointmentId, reportId } = await draft();
    await save('SP', 'carlos@mail.com', reportId, { titleComplement: 'Segredo do rascunho', body: BODY }).expect(200);
    const res = await ctx.http.get(`/api/me/medical-reports/${reportId}`).set('Cookie', cookies['joao@mail.com']).expect(403);
    expect(res.body.code).toBe('REPORT_NOT_PUBLISHED');
    const list = await ctx.http.get('/api/me/appointments').set('Cookie', cookies['joao@mail.com']).expect(200);
    const raw = JSON.stringify(list.body);
    expect(raw).not.toContain('Segredo do rascunho');
    expect(raw).not.toContain('Exame sem alterações');
    expect(list.body.find((a: { id: string }) => a.id === appointmentId).medicalReportId).toBeNull();
  });

  it('paciente vê agendamentos de todas as suas clínicas e nada de outro paciente', async () => {
    const list = await ctx.http.get('/api/me/appointments').set('Cookie', cookies['joao@mail.com']).expect(200);
    const clinics = new Set(list.body.map((a: { clinic: { name: string } }) => a.clinic.name));
    expect(clinics.size).toBeGreaterThan(1);
    const [{ count }] = await ctx.owner.query('SELECT count(*)::int AS count FROM appointment WHERE patient_id = $1', [ids.users['joao@mail.com'].patientId]);
    expect(list.body).toHaveLength(count);
    // equipe não usa o portal do paciente
    await ctx.http.get('/api/me/appointments').set('Cookie', cookies['paula@mail.com']).expect(403);
  });

  it('dois médicos iniciando laudo no mesmo atendimento ao mesmo tempo: só um consegue (409 REPORT_IN_PROGRESS)', async () => {
    const appointmentId = await schedule('SP', 'paula@mail.com', 'silvia@mail.com');
    const responses = await Promise.all([
      start('SP', 'carlos@mail.com', appointmentId),
      start('SP', 'daniela@mail.com', appointmentId),
      start('SP', 'ana@mail.com', appointmentId),
    ]);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    const losers = responses.filter((r) => r.status === 409);
    expect(losers).toHaveLength(2);
    for (const l of losers) expect(['REPORT_IN_PROGRESS', 'REPORT_EXISTS']).toContain(l.body.code);
  });

  it('o dono é o único que edita, publica, descarta e vê o conteúdo do rascunho; após descartar, outro médico inicia', async () => {
    const { appointmentId, reportId } = await draft('SP', 'carlos@mail.com');
    const other = 'daniela@mail.com';
    expect((await start('SP', other, appointmentId).expect(409)).body).toMatchObject({ code: 'REPORT_IN_PROGRESS', details: { doctorName: 'Dr. Carlos Mendes' } });
    expect((await save('SP', other, reportId, { body: BODY }).expect(403)).body.code).toBe('REPORT_NOT_OWNER');
    await publish('SP', other, reportId).expect(403);
    await ctx.http.delete(`/api/clinics/${c('SP')}/medical-reports/${reportId}`).set('Cookie', cookies[other]).expect(403);
    expect((await ctx.http.get(`/api/clinics/${c('SP')}/medical-reports/${reportId}`).set('Cookie', cookies[other]).expect(403)).body.code).toBe('REPORT_DRAFT_RESTRICTED');
    await ctx.http.get(`/api/clinics/${c('SP')}/medical-reports/${reportId}`).set('Cookie', cookies['paula@mail.com']).expect(403);
    // lista mostra só status + responsável
    const appt = await ctx.http.get(`/api/clinics/${c('SP')}/appointments/${appointmentId}`).set('Cookie', cookies[other]).expect(200);
    expect(appt.body.medicalReport).toMatchObject({ status: 'DRAFT', doctorName: 'Dr. Carlos Mendes', isMine: false });
    expect(JSON.stringify(appt.body)).not.toContain('"body"');

    await ctx.http.delete(`/api/clinics/${c('SP')}/medical-reports/${reportId}`).set('Cookie', cookies['carlos@mail.com']).expect(204);
    await start('SP', other, appointmentId).expect(201);
  });

  it('médico sem vínculo com a clínica não cria laudo (403)', async () => {
    const appointmentId = await schedule('MAO', 'iara@mail.com', 'jose@mail.com');
    await start('MAO', 'carlos@mail.com', appointmentId).expect(403);
    await start('SP', 'carlos@mail.com', appointmentId).expect(403); // id de outra clínica pela URL da sua
  });

  it('valida o corpo (lista fechada) e não publica laudo vazio', async () => {
    const { reportId } = await draft();
    const bad = await save('SP', 'carlos@mail.com', reportId, { body: { type: 'doc', content: [{ type: 'image', attrs: { src: 'http://x' } }] } }).expect(422);
    expect(bad.body.code).toBe('INVALID_REPORT_BODY');
    await save('SP', 'carlos@mail.com', reportId, { body: '<p>html</p>' }).expect(422);
    expect((await publish('SP', 'carlos@mail.com', reportId).expect(422)).body.code).toBe('EMPTY_REPORT_BODY');
  });

  it('mede o tamanho do corpo como o CHECK do banco (jsonb::text): acima do limite → 422, nunca 500', async () => {
    const { reportId } = await draft();
    // muitos nós pequenos: 102026 bytes em JSON compacto (passava no limite antigo), 112028 no texto do jsonb (espaços após ':' e ',')
    const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Sem alterações.', marks: [{ type: 'bold' }] }] };
    const body = { type: 'doc', content: Array.from({ length: 1_000 }, () => paragraph) };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(102_400);
    const [{ bytes }] = await ctx.owner.query('SELECT octet_length($1::jsonb::text)::int AS bytes', [JSON.stringify(body)]);
    expect(bytes).toBeGreaterThan(102_400);
    expect(jsonbTextBytes(body)).toBe(bytes);

    const res = await save('SP', 'carlos@mail.com', reportId, { body }).expect(422);
    expect(res.body.code).toBe('INVALID_REPORT_BODY');
  });

  it('jsonbTextBytes bate byte a byte com octet_length(body::text) do Postgres', async () => {
    const cases: unknown[] = [
      BODY,
      { t: '"\\/\b\f\n\r\t' },
      { t: '\u0001\u001f\u007f' },
      { t: 'é😀\u2028\u2029 ç ã' },
      { a: [], b: {}, c: null, d: true, e: [1, 0, -5, 1000] },
      { type: 'heading', attrs: { textAlign: null, level: 3 }, content: [{ type: 'text', text: 'Conclusão' }] },
      { type: 'doc', content: [{ type: 'orderedList', attrs: { start: 7, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] },
    ];
    for (const value of cases) {
      const [{ bytes }] = await ctx.owner.query('SELECT octet_length($1::jsonb::text)::int AS bytes', [JSON.stringify(value)]);
      expect({ value, bytes: jsonbTextBytes(value) }).toEqual({ value, bytes });
    }
  });

  it('caractere nulo no texto do laudo → 422, nunca 500 (o jsonb recusa \\u0000)', async () => {
    const { reportId } = await draft();
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a\u0000b' }] }] };
    const res = await save('SP', 'carlos@mail.com', reportId, { body }).expect(422);
    expect(res.body.code).toBe('INVALID_REPORT_BODY');
  });

  it('o título sempre contém o tipo do exame, mesmo que o cliente envie outro título', async () => {
    const { reportId } = await draft();
    const res = await save('SP', 'carlos@mail.com', reportId, { title: 'Título forjado', titleComplement: 'Crânio', body: BODY }).expect(200);
    expect(res.body.title).toBe('Ressonância Magnética — Crânio');
  });

  it('publicação exige CRM na UF da clínica e grava o registro correto', async () => {
    // Dra. Ana (só CRM/SP) vinculada também a BH, sem CRM/MG
    await ctx.owner.query('INSERT INTO doctor_clinic (doctor_id, clinic_id) VALUES ($1, $2)', [ids.users['ana@mail.com'].doctorId, c('BH')]);
    const { reportId } = await draft('BH', 'ana@mail.com', 'lucia@mail.com', 'marcos@mail.com');
    await save('BH', 'ana@mail.com', reportId, { body: BODY }).expect(200);
    const view = await ctx.http.get(`/api/clinics/${c('BH')}/medical-reports/${reportId}`).set('Cookie', cookies['ana@mail.com']).expect(200);
    expect(view.body.signaturePreview).toEqual({ professionalName: 'Dra. Ana Souza', professionalRegistration: null, canPublish: false });
    expect((await publish('BH', 'ana@mail.com', reportId).expect(422)).body.code).toBe('NO_REGISTRATION_IN_STATE');

    // Dr. Carlos tem CRM/SP e CRM/MG: em BH assina com o de MG
    const ok = await draft('BH', 'carlos@mail.com', 'joao@mail.com', 'marcos@mail.com', 5);
    await save('BH', 'carlos@mail.com', ok.reportId, { body: BODY }).expect(200);
    const pub = await publish('BH', 'carlos@mail.com', ok.reportId).expect(200);
    expect(pub.body.signature.professionalRegistration).toBe('CRM/MG 654321');
  });

  it('publicado não pode ser editado; agendamento com laudo (rascunho ou publicado) não pode ser cancelado; cancelado não recebe laudo', async () => {
    const { appointmentId, reportId } = await draft();
    const cancel = () => ctx.http.post(`/api/clinics/${c('SP')}/appointments/${appointmentId}/cancel`).set('Cookie', cookies['paula@mail.com']);
    expect((await cancel().expect(409)).body.code).toBe('APPOINTMENT_HAS_REPORT');
    await save('SP', 'carlos@mail.com', reportId, { body: BODY }).expect(200);
    await publish('SP', 'carlos@mail.com', reportId).expect(200);
    expect((await save('SP', 'carlos@mail.com', reportId, { body: BODY }).expect(409)).body.code).toBe('REPORT_PUBLISHED');
    await publish('SP', 'carlos@mail.com', reportId).expect(409);
    expect((await cancel().expect(409)).body.code).toBe('APPOINTMENT_HAS_REPORT');

    const other = await schedule('SP', 'paula@mail.com', 'silvia@mail.com', 4);
    await ctx.http.post(`/api/clinics/${c('SP')}/appointments/${other}/cancel`).set('Cookie', cookies['paula@mail.com']).expect(200);
    expect((await start('SP', 'carlos@mail.com', other).expect(409)).body.code).toBe('APPOINTMENT_CANCELLED');
  });

  it('atendente não cria laudo (403); id inválido é 404', async () => {
    const appointmentId = await schedule('SP', 'paula@mail.com', 'lucia@mail.com');
    await start('SP', 'paula@mail.com', appointmentId).expect(403);
    await ctx.http.get(`/api/clinics/${c('SP')}/medical-reports/nao-e-uuid`).set('Cookie', cookies['carlos@mail.com']).expect(404);
    await ctx.http.get('/api/me/medical-reports/0190a0a0-0000-7000-8000-000000000000').set('Cookie', cookies['joao@mail.com']).expect(404);
  });
});

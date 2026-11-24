import { signServiceToken } from '../src/auth/service-token.js';
import { SessionTokenService } from '../src/auth/token.service.js';
import { createTestApp, loadIds, resetAndSeed, sessionCookie, type Ids, type TestContext } from './helpers.js';

describe('Exportação FHIR com token de serviço (integração)', () => {
  let ctx: TestContext;
  let ids: Ids;
  let token: string;
  let publishedId: string;
  let draftId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetAndSeed(ctx.owner);
    ids = await loadIds(ctx.owner);
    token = signServiceToken(process.env.SERVICE_TOKEN_SECRET!);
    [{ id: publishedId }] = await ctx.owner.query(`SELECT id FROM medical_report WHERE status = 'PUBLISHED' LIMIT 1`);
    [{ id: draftId }] = await ctx.owner.query(`SELECT id FROM medical_report WHERE status = 'DRAFT' LIMIT 1`);
  });
  afterAll(() => ctx.close());

  const get = (id: string) => ctx.http.get(`/api/fhir/medical-reports/${id}`);

  it('token de serviço → 200 application/fhir+json com Bundle de laudo publicado (qualquer clínica)', async () => {
    const res = await get(publishedId).set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.headers['content-type']).toMatch(/^application\/fhir\+json/);
    expect(res.body.resourceType).toBe('Bundle');
    expect(res.body.entry[0].resource).toMatchObject({ resourceType: 'DiagnosticReport', id: publishedId, status: 'final' });
    const [audit] = await ctx.owner.query(
      `SELECT actor_type, actor_id FROM audit_event WHERE event = 'medical_report.exported_fhir' AND medical_report_id = $1`,
      [publishedId],
    );
    expect(audit).toEqual({ actor_type: 'SERVICE', actor_id: 'fhir-export-service' });
  });

  it('rascunho → 403; inexistente → 404', async () => {
    expect((await get(draftId).set('Authorization', `Bearer ${token}`).expect(403)).body.code).toBe('REPORT_NOT_PUBLISHED');
    await get('0190a0a0-0000-7000-8000-000000000000').set('Authorization', `Bearer ${token}`).expect(404);
  });

  it('sessão de usuário (cookie de paciente, atendente ou médico) não é aceita na rota FHIR → 401', async () => {
    for (const email of ['joao@mail.com', 'paula@mail.com', 'carlos@mail.com']) {
      await get(publishedId).set('Cookie', sessionCookie(ctx.app, ids.users[email].userId)).expect(401);
    }
    await get(publishedId).expect(401);
  });

  it('JWT de usuário no header, token com outro segredo ou sem scope → 401', async () => {
    const userJwt = ctx.app.get(SessionTokenService).issue(ids.users['joao@mail.com'].userId);
    await get(publishedId).set('Authorization', `Bearer ${userJwt}`).expect(401);
    await get(publishedId).set('Authorization', `Bearer ${signServiceToken('outro-segredo-qualquer-com-mais-de-32-bytes!!')}`).expect(401);
    await get(publishedId).set('Authorization', `Bearer ${signServiceToken(process.env.SERVICE_TOKEN_SECRET!, { scope: 'other' })}`).expect(401);
  });

  it('o token de serviço não vale em nenhum outro endpoint (401)', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await ctx.http.get('/api/me/appointments').set(auth).expect(401);
    await ctx.http.get(`/api/me/medical-reports/${publishedId}`).set(auth).expect(401);
    await ctx.http.get(`/api/clinics/${ids.clinics.SP.id}/appointments`).set(auth).expect(401);
    await ctx.http.get('/api/auth/me').set(auth).expect(401);
  });
});

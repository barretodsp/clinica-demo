import { createDataSource } from '../src/database/data-source.js';
import { DEMO_PASSWORD } from '../src/database/seed/seed.js';
import { createTestApp, loadIds, resetAndSeed, sessionCookie, type Ids, type TestContext } from './helpers.js';

describe('Autenticação e auditoria (integração)', () => {
  let ctx: TestContext;
  let ids: Ids;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetAndSeed(ctx.owner);
    ids = await loadIds(ctx.owner);
  });
  afterAll(() => ctx.close());

  it('login pela rota real: cookie HttpOnly/SameSite=Strict, sem token no corpo; a sessão funciona', async () => {
    const res = await ctx.http.post('/api/auth/login').send({ email: 'Carlos@mail.com', password: DEMO_PASSWORD }).expect(200);
    const cookie = res.headers['set-cookie'][0] as string;
    expect(cookie).toMatch(/^clinic_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Max-Age=3600/);
    expect(cookie).toMatch(/Secure/);
    const token = cookie.split(';')[0].split('=')[1];
    expect(JSON.stringify(res.body)).not.toContain(token);
    expect(res.body.user).toMatchObject({ role: 'DOCTOR', name: 'Dr. Carlos Mendes' });
    expect(res.body.user.clinics.map((c: { name: string }) => c.name).sort()).toEqual(['Clínica Demo Belo Horizonte', 'Clínica Demo São Paulo']);
    const me = await ctx.http.get('/api/auth/me').set('Cookie', cookie.split(';')[0]).expect(200);
    expect(me.body.email).toBe('carlos@mail.com');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('senha errada e e-mail inexistente respondem igual (401 INVALID_CREDENTIALS)', async () => {
    const a = await ctx.http.post('/api/auth/login').send({ email: 'silvia@mail.com', password: 'errada' }).expect(401);
    const b = await ctx.http.post('/api/auth/login').send({ email: 'ninguem@demo.local', password: 'errada' }).expect(401);
    expect(a.body).toEqual(b.body);
    expect(a.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('token inválido/adulterado → 401; logout apaga o cookie', async () => {
    await ctx.http.get('/api/auth/me').set('Cookie', 'clinic_session=abc.def.ghi').expect(401);
    const res = await ctx.http.post('/api/auth/logout').expect(204);
    expect(res.headers['set-cookie'][0]).toMatch(/clinic_session=;.*Expires=Thu, 01 Jan 1970/);
  });

  it('usuário desativado perde o acesso na hora, mesmo com token válido', async () => {
    const userId = ids.users['lucia@mail.com'].userId;
    const cookie = sessionCookie(ctx.app, userId);
    await ctx.http.get('/api/me/appointments').set('Cookie', cookie).expect(200);
    await ctx.owner.query('UPDATE "user" SET is_active = false WHERE id = $1', [userId]);
    await ctx.http.get('/api/me/appointments').set('Cookie', cookie).expect(401);
    await ctx.owner.query('UPDATE "user" SET is_active = true WHERE id = $1', [userId]);
  });

  it('a 11ª tentativa de login em 1 minuto para a mesma conta → 429 TOO_MANY_ATTEMPTS', async () => {
    // cada tentativa vem de um IP diferente (atrás do proxy): só o limite por conta atua
    const attempt = (i: number) =>
      ctx.http.post('/api/auth/login').set('X-Forwarded-For', `198.51.100.${i}`).send({ email: 'marcos@mail.com', password: 'errada' });
    for (let i = 0; i < 10; i++) await attempt(i).expect(401);
    const blocked = await attempt(99).expect(429);
    expect(blocked.body.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('a 11ª tentativa de login em 1 minuto vinda do mesmo IP (contas diferentes) → 429', async () => {
    const attempt = (i: number) =>
      ctx.http.post('/api/auth/login').set('X-Forwarded-For', '203.0.113.9').send({ email: `ninguem${i}@demo.local`, password: 'x' });
    for (let i = 0; i < 10; i++) await attempt(i).expect(401);
    await attempt(10).expect(429);
  });

  it('a aplicação (clinic_app) não consegue alterar nem apagar a trilha de auditoria', async () => {
    const app = await createDataSource(process.env.DATABASE_URL_TEST!).initialize();
    try {
      await app.query(
        `INSERT INTO audit_event (event, actor_type, actor_id) VALUES ('test.event', 'USER', 'x')`,
      );
      await expect(app.query(`UPDATE audit_event SET event = 'x'`)).rejects.toThrow(/permission denied/);
      await expect(app.query(`DELETE FROM audit_event`)).rejects.toThrow(/permission denied/);
      await expect(app.query(`CREATE TABLE hack (id int)`)).rejects.toThrow(/permission denied/);
    } finally {
      await app.destroy();
    }
  });

  it('updated_at é mantido pelo banco (trigger), inclusive em SQL direto', async () => {
    const [before] = await ctx.owner.query(`SELECT id, updated_at FROM clinic LIMIT 1`);
    await new Promise((r) => setTimeout(r, 20));
    await ctx.owner.query(`UPDATE clinic SET city = city WHERE id = $1`, [before.id]);
    const [after] = await ctx.owner.query(`SELECT updated_at FROM clinic WHERE id = $1`, [before.id]);
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });
});

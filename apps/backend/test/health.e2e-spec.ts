import { createTestApp, type TestContext } from './helpers.js';

describe('Health (integração)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.close());

  it('GET /api/health é público (liveness)', async () => {
    await ctx.http.get('/api/health').expect(200, { status: 'ok' });
  });

  it('GET /api/health/ready é público e pinga o Postgres (readiness)', async () => {
    const res = await ctx.http.get('/api/health/ready').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { database: { status: 'up' } } });
  });
});

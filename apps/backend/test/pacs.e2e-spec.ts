import { uidFromUuid } from '../src/pacs/dicom.js';
import type { OrthancClient } from '../src/pacs/orthanc-client.js';
import { seedPacsImages } from '../src/pacs/pacs-seed.js';
import { createTestApp, loadIds, resetAndSeed, sessionCookie, type Ids, type TestContext } from './helpers.js';

const BASE = 'http://pacs.clinica.localhost';

/** Orthanc falso em memória: guarda os StudyInstanceUIDs enviados. */
function fakeOrthanc() {
  const studies = new Set<string>();
  let template: string | null = null;
  const calls = { uploads: 0, modifies: 0, deleted: [] as string[] };
  const client = {
    async studyInstanceUids() {
      return new Set(studies);
    },
    async upload(file: Uint8Array) {
      calls.uploads++;
      const marker = new TextDecoder().decode(file);
      if (marker === 'TEMPLATE') return (template = 'tpl-1');
      studies.add(marker);
      return `inst-${studies.size}`;
    },
    async modifyInstance(id: string, replace: Record<string, string>) {
      calls.modifies++;
      expect(id).toBe(template);
      return new TextEncoder().encode(replace.StudyInstanceUID) as Uint8Array<ArrayBuffer>;
    },
    async deleteInstance(id: string) {
      calls.deleted.push(id);
    },
  };
  return { client: client as unknown as OrthancClient, studies, calls };
}

describe('PACS de demonstração (integração)', () => {
  let ctx: TestContext;
  let ids: Ids;
  const template = new TextEncoder().encode('TEMPLATE') as Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetAndSeed(ctx.owner);
    ids = await loadIds(ctx.owner);
  });
  afterAll(() => ctx.close());

  it('gera um estudo por agendamento ativo, grava a URL do viewer e remove o modelo', async () => {
    const pacs = fakeOrthanc();
    const result = await seedPacsImages(ctx.owner, pacs.client, template, BASE);

    const rows: { id: string; status: string; image_viewer_url: string | null }[] = await ctx.owner.query(
      'SELECT id, status, image_viewer_url FROM appointment',
    );
    const active = rows.filter((r) => r.status === 'SCHEDULED');
    expect(result).toEqual({ appointments: active.length, created: active.length, alreadyInPacs: 0 });
    for (const r of active) {
      expect(r.image_viewer_url).toBe(`${BASE}/stone-webviewer/index.html?study=${uidFromUuid(r.id)}`);
      expect(pacs.studies.has(uidFromUuid(r.id))).toBe(true);
    }
    for (const r of rows.filter((x) => x.status === 'CANCELLED')) expect(r.image_viewer_url).toBeNull();
    expect(pacs.calls.deleted).toEqual(['tpl-1']);
  });

  it('é idempotente: numa nova execução não regera estudos existentes nem toca nas linhas', async () => {
    const pacs = fakeOrthanc();
    await seedPacsImages(ctx.owner, pacs.client, template, BASE); // PACS "recriado" vazio → regera tudo
    const before = await ctx.owner.query('SELECT max(updated_at) AS t FROM appointment');
    const again = await seedPacsImages(ctx.owner, pacs.client, template, BASE);
    expect(again.created).toBe(0);
    expect(again.alreadyInPacs).toBe(again.appointments);
    expect(pacs.calls.modifies).toBe(again.appointments); // só da primeira passada
    expect(await ctx.owner.query('SELECT max(updated_at) AS t FROM appointment')).toEqual(before);
  });

  it('a API da equipe devolve imageViewerUrl', async () => {
    const res = await ctx.http
      .get(`/api/clinics/${ids.clinics.SP.id}/appointments`)
      .set('Cookie', sessionCookie(ctx.app, ids.users['paula@mail.com'].userId))
      .expect(200);
    const scheduled = res.body.filter((a: { status: string }) => a.status === 'SCHEDULED');
    expect(scheduled.length).toBeGreaterThan(0);
    for (const a of scheduled) expect(a.imageViewerUrl).toBe(`${BASE}/stone-webviewer/index.html?study=${uidFromUuid(a.id)}`);
  });
});

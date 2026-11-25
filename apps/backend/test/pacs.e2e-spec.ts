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

  describe('cancelado não tem imagem', () => {
    const cookie = () => sessionCookie(ctx.app, ids.users['paula@mail.com'].userId);
    const viewer = (id: string) => `${BASE}/stone-webviewer/index.html?study=${uidFromUuid(id)}`;

    /** Agendamento ativo de SP com a URL do viewer já gravada (cenário do pacs-seed). */
    async function scheduledWithImage(): Promise<string> {
      const [row] = await ctx.owner.query(
        `SELECT a.id FROM appointment a
         WHERE a.clinic_id = $1 AND a.status = 'SCHEDULED' AND a.starts_at > now()
           AND NOT EXISTS (SELECT 1 FROM medical_report r WHERE r.appointment_id = a.id)
         ORDER BY a.starts_at LIMIT 1`,
        [ids.clinics.SP.id],
      );
      await ctx.owner.query('UPDATE appointment SET image_viewer_url = $2 WHERE id = $1', [row.id, viewer(row.id)]);
      return row.id;
    }

    it('cancelar limpa a URL do viewer no banco e na resposta', async () => {
      const id = await scheduledWithImage();
      const res = await ctx.http.post(`/api/clinics/${ids.clinics.SP.id}/appointments/${id}/cancel`).set('Cookie', cookie()).expect(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(res.body.imageViewerUrl).toBeNull();
      const [row] = await ctx.owner.query('SELECT image_viewer_url FROM appointment WHERE id = $1', [id]);
      expect(row.image_viewer_url).toBeNull();
    });

    it('cancelado antes desta correção (URL ainda no banco): a API devolve imageViewerUrl nulo na lista e no detalhe', async () => {
      const id = await scheduledWithImage();
      // simula a linha antiga: cancelada sem limpar a URL
      await ctx.owner.query(
        `UPDATE appointment SET status = 'CANCELLED', cancelled_at = now(), cancelled_by_user_id = $2 WHERE id = $1`,
        [id, ids.users['paula@mail.com'].userId],
      );
      const [row] = await ctx.owner.query('SELECT image_viewer_url FROM appointment WHERE id = $1', [id]);
      expect(row.image_viewer_url).toBe(viewer(id));

      const list = await ctx.http.get(`/api/clinics/${ids.clinics.SP.id}/appointments`).set('Cookie', cookie()).expect(200);
      expect(list.body.find((a: { id: string }) => a.id === id).imageViewerUrl).toBeNull();
      const detail = await ctx.http.get(`/api/clinics/${ids.clinics.SP.id}/appointments/${id}`).set('Cookie', cookie()).expect(200);
      expect(detail.body.imageViewerUrl).toBeNull();
    });

    it('o pacs-seed não gera estudo para o cancelado', async () => {
      const id = await scheduledWithImage();
      await ctx.http.post(`/api/clinics/${ids.clinics.SP.id}/appointments/${id}/cancel`).set('Cookie', cookie()).expect(200);
      const pacs = fakeOrthanc();
      await seedPacsImages(ctx.owner, pacs.client, template, BASE);
      expect(pacs.studies.has(uidFromUuid(id))).toBe(false);
      const [row] = await ctx.owner.query('SELECT image_viewer_url FROM appointment WHERE id = $1', [id]);
      expect(row.image_viewer_url).toBeNull();
    });
  });
});

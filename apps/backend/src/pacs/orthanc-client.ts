/** Cliente mínimo da API REST do Orthanc (fetch nativo), só o que o pacs-seed usa. */
export class OrthancClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call(path: string, init?: RequestInit): Promise<Response> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Orthanc ${init?.method ?? 'GET'} ${path}: HTTP ${res.status} ${await res.text()}`);
    return res;
  }

  /** Espera o Orthanc responder (sobe em paralelo com o migrate). */
  async waitReady(timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        await this.call('/system');
        return;
      } catch (err) {
        if (Date.now() > deadline) throw err;
        await new Promise((r) => setTimeout(r, 1_000));
      }
    }
  }

  /** Envia um arquivo DICOM; devolve o ID Orthanc da instância. */
  async upload(dicom: Uint8Array<ArrayBuffer>): Promise<string> {
    const res = await this.call('/instances', {
      method: 'POST',
      headers: { 'content-type': 'application/dicom' },
      body: dicom,
    });
    return ((await res.json()) as { ID: string }).ID;
  }

  /** Cópia modificada da instância (não é gravada no Orthanc; volta como arquivo). */
  async modifyInstance(id: string, replace: Record<string, string>): Promise<Uint8Array<ArrayBuffer>> {
    const res = await this.call(`/instances/${id}/modify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ Replace: replace, Force: true }),
    });
    return new Uint8Array(await res.arrayBuffer());
  }

  async deleteInstance(id: string): Promise<void> {
    await this.call(`/instances/${id}`, { method: 'DELETE' });
  }

  /** StudyInstanceUIDs já presentes (para não regerar numa nova execução). */
  async studyInstanceUids(): Promise<Set<string>> {
    const res = await this.call('/studies?expand');
    const studies = (await res.json()) as { MainDicomTags: { StudyInstanceUID: string } }[];
    return new Set(studies.map((s) => s.MainDicomTags.StudyInstanceUID));
  }
}

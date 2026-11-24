import { OrthancClient } from './orthanc-client.js';
import { pacsEnv } from './pacs-env.js';

describe('pacsEnv — timeouts do pacs-seed', () => {
  it('usa os defaults quando as variáveis não estão definidas ou estão vazias', () => {
    expect(pacsEnv({})).toEqual({ PACS_REQUEST_TIMEOUT_MS: 30_000, PACS_READY_TIMEOUT_MS: 120_000 });
    expect(pacsEnv({ PACS_REQUEST_TIMEOUT_MS: '', PACS_READY_TIMEOUT_MS: '' })).toEqual({ PACS_REQUEST_TIMEOUT_MS: 30_000, PACS_READY_TIMEOUT_MS: 120_000 });
  });

  it('lê os valores do ambiente e ignora as outras variáveis', () => {
    expect(pacsEnv({ PACS_REQUEST_TIMEOUT_MS: '5000', PACS_READY_TIMEOUT_MS: '600000', PACS_URL: 'http://x' })).toEqual({
      PACS_REQUEST_TIMEOUT_MS: 5_000,
      PACS_READY_TIMEOUT_MS: 600_000,
    });
  });

  it.each<[string, string]>([
    ['PACS_REQUEST_TIMEOUT_MS', '999'],
    ['PACS_REQUEST_TIMEOUT_MS', '600001'],
    ['PACS_REQUEST_TIMEOUT_MS', 'trinta'],
    ['PACS_READY_TIMEOUT_MS', '0'],
    ['PACS_READY_TIMEOUT_MS', '3600001'],
    ['PACS_READY_TIMEOUT_MS', '2m'],
  ])('recusa %s=%s', (name, value) => {
    expect(() => pacsEnv({ [name]: value })).toThrow();
  });
});

describe('OrthancClient — timeout por chamada', () => {
  /** fetch que só termina quando o sinal aborta (Orthanc travado). */
  const hangingFetch = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))) as typeof fetch;

  it('aborta a chamada no tempo configurado', async () => {
    const client = new OrthancClient('http://orthanc', hangingFetch, 50);
    const started = Date.now();
    await expect(client.upload(new Uint8Array(new ArrayBuffer(1)))).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('waitReady desiste depois do tempo configurado', async () => {
    const client = new OrthancClient('http://orthanc', hangingFetch, 20);
    await expect(client.waitReady(10)).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});

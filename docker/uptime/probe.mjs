// Sonda de disponibilidade (black-box): de fora dos serviços, consulta a cada PROBE_INTERVAL_MS
//   - clinic-api: GET /api/health/ready (API + ping no banco)
//   - pacs:       GET /statistics do Orthanc (processo no ar + quantidade de estudos)
// e grava o resultado no Loki ({app="uptime", target=...}). O Grafana lê daí o UP/DOWN.
// Fica num container separado de propósito: se um serviço cair, quem registra a queda é a sonda.
// Sem dependências (Node 26: fetch nativo).

const API_URL = process.env.PROBE_TARGET ?? 'http://backend:3000/api/health/ready';
const PACS_URL = process.env.PROBE_PACS_TARGET ?? 'http://orthanc:8042/statistics';
const LOKI = process.env.LOKI_URL ?? 'http://loki:3100';
const INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? 15_000);
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 5_000);

async function get(url) {
  const started = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await res.json().catch(() => ({}));
    return { res, body, latencyMs: Math.round(performance.now() - started) };
  } catch (err) {
    return { res: null, body: {}, latencyMs: Math.round(performance.now() - started), error: err?.cause?.code ?? err?.name ?? 'error' };
  }
}

/** up: API pronta (200). apiUp: a API respondeu algo. dbUp: 1/0, ou -1 quando desconhecido (API sem resposta). */
async function probeApi() {
  const { res, body, latencyMs, error } = await get(API_URL);
  if (!res) return { up: 0, apiUp: 0, dbUp: -1, httpStatus: 0, latencyMs, error };
  const dbDown = body?.details?.database === 'down';
  return { up: res.status === 200 ? 1 : 0, apiUp: 1, dbUp: res.status === 200 ? 1 : dbDown ? 0 : -1, httpStatus: res.status, latencyMs };
}

/** up: Orthanc respondeu 200. studies: estudos no PACS (efêmero: 0 indica que o pacs-seed não rodou). */
async function probePacs() {
  const { res, body, latencyMs, error } = await get(PACS_URL);
  if (!res) return { up: 0, httpStatus: 0, latencyMs, error };
  return { up: res.status === 200 ? 1 : 0, httpStatus: res.status, latencyMs, studies: Number(body?.CountStudies ?? 0) };
}

const TARGETS = [
  { name: 'clinic-api', probe: probeApi, state: (r) => (r.up ? 'UP' : r.apiUp ? 'DOWN (banco)' : 'DOWN (sem resposta)') },
  { name: 'pacs', probe: probePacs, state: (r) => (r.up ? 'UP' : 'DOWN (sem resposta)') },
];

async function push(target, result) {
  const line = JSON.stringify({ event: 'uptime.probe', target, ...result });
  const payload = { streams: [{ stream: { app: 'uptime', target }, values: [[`${Date.now()}000000`, line]] }] };
  try {
    const res = await fetch(`${LOKI}/loki/api/v1/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.error(`loki push: HTTP ${res.status}`);
  } catch (err) {
    console.error(`loki push: ${err?.cause?.code ?? err?.message}`);
  }
}

const last = {};
async function tick() {
  await Promise.all(
    TARGETS.map(async (t) => {
      const result = await t.probe();
      await push(t.name, result);
      // stdout só nas transições, para não poluir `docker compose logs`
      const state = t.state(result);
      if (state !== last[t.name]) console.log(`${new Date().toISOString()} ${t.name} ${state}`, JSON.stringify(result));
      last[t.name] = state;
    }),
  );
}

let timer;
const loop = async () => {
  await tick();
  timer = setTimeout(loop, INTERVAL_MS);
};
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { clearTimeout(timer); process.exit(0); });
console.log(`sonda: ${API_URL} e ${PACS_URL} a cada ${INTERVAL_MS} ms → ${LOKI}`);
void loop();

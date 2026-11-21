// ── CONFIGURAÇÃO ──────────────────────────────────────────────────────────────
// Limiares, endereço da API, instrumentos e períodos. carregarConfig() sobrescreve
// os valores padrão com os do endpoint /config do Worker quando ele responde; se
// falhar, o painel segue com os valores abaixo.

export type Pz = { id: string; nome: string; lat: number; lng: number };

export const CFG = {
  poll: 10000,
  // Nível d'água ALTO = perigo. Normal < 12 m · Atenção 12–15 m · Crítico ≥ 15 m
  thrAtencao: 12.0,
  thrCritico: 15.0,
  // Janela de "sem sinal" (s): mais tolerante que o Worker por causa do Wokwi.
  staleSeg: 120,
  // Limiar de variação rápida (m/dia).
  taxaMaxMDia: 0.5,
  // Histerese (m) na descida de faixa: evita o selo piscar em cima do limite.
  histereseM: 0.2,
  // Intervalo de envio da UCT (s): base da disponibilidade de 24 h.
  intervaloEnvioSeg: 10,
};

// index.html?demo: dados fictícios, sempre identificados. O endereço normal só
// mostra o monitoramento real.
export const MODO_DEMO = typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");

// Coordenadas ilustrativas (Complexo de Germano, Mariana/MG). O array é mutado no
// lugar por carregarConfig() para que todos os módulos vejam a mesma lista.
export const PIEZOMETROS: Pz[] = [
  { id: "PZ-01", nome: "Dique Norte", lat: -20.1975, lng: -43.4653 },
  { id: "PZ-02", nome: "Galeria Sul", lat: -20.2043, lng: -43.459 },
  { id: "PZ-03", nome: "Talude Leste", lat: -20.2001, lng: -43.4521 },
];

// A chave é o valor aceito por /dados?range=. bucketMs serve só para achar lacunas.
export const PERIODOS: Record<string, { label: string; bucketMs: number }> = {
  "24h": { label: "24 h", bucketMs: 30 * 60 * 1000 },
  "7d": { label: "7 dias", bucketMs: 2 * 60 * 60 * 1000 },
  "30d": { label: "30 dias", bucketMs: 8 * 60 * 60 * 1000 },
  "90d": { label: "90 dias", bucketMs: 24 * 60 * 60 * 1000 },
};

export const API_URL = "https://piezometro-worker.willianloopes123.workers.dev";

export async function apiGet<T = unknown>(path: string, timeoutMs = 20000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API_URL}${path}`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

type RespostaConfig = {
  limiares?: { atencao?: number; critico?: number };
  stale_seg?: number;
  taxa_max_m_dia?: number;
  histerese_m?: number;
  piezometros?: Pz[];
};

export async function carregarConfig(): Promise<void> {
  try {
    const cfg = await apiGet<RespostaConfig>("/config");
    const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
    if (num(cfg?.limiares?.atencao)) CFG.thrAtencao = cfg.limiares.atencao;
    if (num(cfg?.limiares?.critico)) CFG.thrCritico = cfg.limiares.critico;
    if (num(cfg?.stale_seg)) CFG.staleSeg = cfg.stale_seg;
    if (num(cfg?.taxa_max_m_dia)) CFG.taxaMaxMDia = cfg.taxa_max_m_dia;
    if (num(cfg?.histerese_m)) CFG.histereseM = cfg.histerese_m;
    if (Array.isArray(cfg?.piezometros) && cfg.piezometros.length) {
      PIEZOMETROS.length = 0;
      cfg.piezometros.forEach(p => PIEZOMETROS.push({ id: p.id, nome: p.nome, lat: p.lat, lng: p.lng }));
    }
  } catch (e) {
    console.warn("Config:", (e as Error).message, "— usando limiares e instrumentos padrão");
  }
}

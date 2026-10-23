// ── CONFIG ────────────────────────────────────────────────────────────────────
// Constantes de configuração do dashboard: limiares de alerta, endereço da API,
// lista de piezômetros monitorados e períodos disponíveis para gráficos/stats.
// loadConfig() sobrescreve os valores hard-coded abaixo com os do endpoint /config
// do Worker, quando disponível (ver seção CONFIG DINÂMICA mais abaixo).

const CFG = {
  poll:       10000,
  // Limiares de NÍVEL D'ÁGUA (m), espelhados no firmware e no server.js:
  // NORMAL < 12 m · ATENÇÃO 12–15 m · CRÍTICO ≥ 15 m
  // (nível ALTO = perigo — lógica correta de piezômetro)
  thrAtencao: 12.0,
  thrCritico: 15.0,
  // P1 — janela de "sem sinal" (segundos) e P3 — limiar de taxa de variação (m/dia);
  // sobrescritos por loadConfig() quando /config responder com stale_seg/taxa_max_m_dia.
  // Default espelha STALE_SEG do worker, mas mais tolerante (120s): o Wokwi roda mais
  // devagar que o tempo real, então mesmo com base em recebido_em vale dar folga.
  staleSeg: 120,
  taxaMaxMDia: 0.5,
  // P4 — histerese (m) na detecção de borda entre faixas, evita repicar o badge/alarme
  // bem em cima do limiar; sobrescrita por /config `histerese_m`.
  histereseM: 0.2,
  // Intervalo de envio da UCT (INTERVALO_ENVIO do firmware): base da disponibilidade
  // (leituras recebidas ÷ esperadas em 24 h).
  intervaloEnvioSeg: 10,
};

// Endereço de demonstração (index.html?demo): dados fictícios com roteiro, sempre
// identificados. O endereço normal só mostra o monitoramento real.
const MODO_DEMO = typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");

// Piezômetros monitorados (coordenadas ilustrativas — Complexo de Germano, Mariana/MG)
const PIEZOMETROS = [
  { id: "PZ-01", nome: "Dique Norte",   lat: -20.1975, lng: -43.4653 },
  { id: "PZ-02", nome: "Galeria Sul",   lat: -20.2043, lng: -43.4590 },
  { id: "PZ-03", nome: "Talude Leste",  lat: -20.2001, lng: -43.4521 },
];

// Períodos disponíveis para os gráficos / stats / tabela / export
// (a chave já é o valor aceito pelo parâmetro `range` da API — /dados?range=24h|7d|30d|90d)
// `bucketMs` = espaçamento típico do range, usado só para detectar gap no gráfico (P1):
// intervalo entre pontos consecutivos > 2×bucketMs vira um corte visível na linha.
const PERIODOS = {
  "24h": { label: "24h",     bucketMs: 30 * 60 * 1000 },
  "7d":  { label: "7 dias",  bucketMs: 2  * 60 * 60 * 1000 },
  "30d": { label: "30 dias", bucketMs: 8  * 60 * 60 * 1000 },
  "90d": { label: "90 dias", bucketMs: 24 * 60 * 60 * 1000 },
};

// ── API ───────────────────────────────────────────────────────────────────────
// Dashboard consome a API do Cloudflare Worker (+ D1) diretamente.
// Troque pelo subdomínio real do seu Worker (Cloudflare → Workers & Pages).
const API_URL = "https://piezometro-worker.willianloopes123.workers.dev";

// ── CONFIG DINÂMICA (/config) ─────────────────────────────────────────────────
// O Worker expõe GET /config → { limiares:{atencao,critico}, ranges:[...], piezometros:[...] }.
// Em caso de sucesso, sobrescreve CFG.thrAtencao/thrCritico e PIEZOMETROS com os
// valores do servidor. Em caso de falha (endpoint ainda não implantado, rede fora,
// etc.), mantém os valores hard-coded no topo do arquivo como fallback — o dashboard
// precisa continuar funcionando mesmo sem esse endpoint.
async function loadConfig() {
  try {
    const cfg = await apiGet("/config");
    if (cfg && cfg.limiares) {
      if (Number.isFinite(cfg.limiares.atencao)) CFG.thrAtencao = cfg.limiares.atencao;
      if (Number.isFinite(cfg.limiares.critico)) CFG.thrCritico = cfg.limiares.critico;
    }
    if (cfg && Number.isFinite(cfg.stale_seg)) CFG.staleSeg = cfg.stale_seg;
    if (cfg && Number.isFinite(cfg.taxa_max_m_dia)) CFG.taxaMaxMDia = cfg.taxa_max_m_dia;
    if (cfg && Number.isFinite(cfg.histerese_m)) CFG.histereseM = cfg.histerese_m; // P4
    if (Array.isArray(cfg && cfg.piezometros) && cfg.piezometros.length) {
      // PIEZOMETROS é const — substitui o conteúdo do array in-place (não reatribui a variável)
      PIEZOMETROS.length = 0;
      cfg.piezometros.forEach(p => PIEZOMETROS.push({ id: p.id, nome: p.nome, lat: p.lat, lng: p.lng }));
      // Se o piezômetro selecionado por padrão não existir mais na lista do servidor, usa o primeiro
      if (!PIEZOMETROS.some(p => p.id === pzSelecionado)) pzSelecionado = PIEZOMETROS[0].id;
    }
  } catch (e) {
    console.warn("Config:", e.message, "— usando limiares/piezômetros hard-coded como fallback");
  }
}

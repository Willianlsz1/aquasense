// ── FONTES DE DADOS ───────────────────────────────────────────────────────────
// O seam de dados do dashboard: apiGet (wrapper de fetch), os dois adapters
// (FonteApi real e FonteSimulada) com a mesma interface { simulada, ultimos(),
// historico(pz, range) }, a variável `fonte` que aponta para a fonte ativa, e
// trocarFonte() — único ponto que troca a fonte e sincroniza a UI que depende disso.

// ── API (Cloudflare Worker + D1) ─────────────────────────────────────────────
// Wrapper simples de fetch com timeout, usado pelos dois endpoints abaixo.
async function apiGet(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${API_URL}${path}`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } finally { clearTimeout(timer); }
}

// Converte um array bruto de "pontos" (como devolvido por FonteApi/FonteSimulada.historico)
// no formato {label,value,time} que os gráficos/stats/tabela consomem, para um campo específico.
// Compartilhado pelos dois adapters — garante que real e simulado usem exatamente a mesma forma.
function pontosParaCampo(pontos, field) {
  // P5 — quando o campo é o nível d'água, propaga também o pico do intervalo (nivel_max),
  // devolvido pelo Worker em /dados junto da média — o pico nunca pode ficar escondido.
  // nivel_min e n_leituras (nº de amostras do bucket) só existem para nivel_agua e alimentam
  // a auditoria do CSV exportado (ver exportar.js) — ausentes viram `undefined` (fallback de
  // dados antigos/ao vivo), sem quebrar quem consome.
  const maxField = field === "nivel_agua" ? "nivel_max" : null;
  const minField = field === "nivel_agua" ? "nivel_min" : null;
  const nField = field === "nivel_agua" ? "n_leituras" : null;
  return (pontos || [])
    .filter(p => p[field] !== null && p[field] !== undefined && Number.isFinite(p[field]))
    .map(p => {
      const ms = p.ts * 1000;
      const out = {
        label: new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        value: parseFloat(Number(p[field]).toFixed(3)),
        time: ms,
      };
      if (maxField && Number.isFinite(p[maxField])) out.max = parseFloat(Number(p[maxField]).toFixed(3));
      if (minField && Number.isFinite(p[minField])) out.min = parseFloat(Number(p[minField]).toFixed(3));
      if (nField && Number.isFinite(p[nField])) out.n = p[nField];
      return out;
    });
}

// ── SEAM: FONTE DE LEITURAS ──────────────────────────────────────────────────
// Todo o resto do dashboard (poll, loadHistoryAndStats, ...) só conhece a
// interface abaixo — { simulada, ultimos(), historico(pz, range) } — e nunca
// sabe se está falando com o Worker de verdade ou com o gerador simulado.
// Trocar a fonte ativa é só reatribuir a variável `fonte` (feito em trocarFonte()).

// Adapter real: fala com o Cloudflare Worker (+D1) via apiGet().
const FonteApi = {
  simulada: false,

  // Último valor de CADA piezômetro — GET /ultimos
  // Resposta: { "PZ-01": {nivel_agua,pressao,temperatura,ts,recebido_em,taxa_m_dia}, ... }
  // (ts e recebido_em em segundos; recebido_em pode vir ausente/null em dados antigos —
  // ts é a hora da MEDIÇÃO no device, recebido_em é a hora em que o Worker RECEBEU a leitura)
  async ultimos() {
    const json = await apiGet("/ultimos");
    const ids = Object.keys(json || {});
    // API saudável sem leituras ainda é diferente de indisponibilidade. Devolve
    // um mapa vazio para o painel marcar cada instrumento como "Sem sinal".
    if (!ids.length) return {};
    const result = {};
    ids.forEach(id => {
      const row = json[id] || {};
      result[id] = {
        nivel: row.nivel_agua, pressao: row.pressao, temperatura: row.temperatura,
        ts: row.ts, recebidoEm: Number.isFinite(row.recebido_em) ? row.recebido_em : row.ts,
        taxa_m_dia: Number.isFinite(row.taxa_m_dia) ? row.taxa_m_dia : null,
      };
    });
    return result;
  },

  // Histórico bruto (todos os campos) de um piezômetro/período — GET /dados?pz=&range=
  // Resposta do Worker: { pz, range, bucket_seg, pontos: [{ts,nivel_agua,nivel_min,nivel_max,
  // n_leituras,pressao,temperatura}, ...] } (ts em segundos, ordem cronológica).
  // Interface devolvida ao chamador (mesma forma em FonteSimulada.historico, abaixo):
  // { pontos, bucket_seg } — bucket_seg é o tamanho (segundos) do intervalo de agregação,
  // usado só pelos metadados de auditoria do CSV exportado (ver exportar.js).
  async historico(pz, range) {
    const json = await apiGet(`/dados?pz=${encodeURIComponent(pz)}&range=${encodeURIComponent(range)}`);
    return { pontos: json.pontos || [], bucket_seg: json.bucket_seg };
  },
};

// ── SIMULAÇÃO ─────────────────────────────────────────────────────────────────
// Adapter simulado: mesma interface de FonteApi ({simulada, ultimos(), historico()}).
// É um modo de demonstração escolhido pelo operador; falhas da API real jamais o ativam.
// Cada piezômetro oscila de forma
// independente, para a visão geral e o mapa ficarem vivos na demonstração:
// PZ-01 ~10 m (faixa normal) · PZ-02 ~11,5 m (oscila até a faixa de atenção) · PZ-03 ~9 m (estável)
const FonteSimulada = {
  simulada: true,

  // Tabela ÚNICA de bases por piezômetro — usada tanto por ultimos() (drift ao vivo)
  // quanto por historico() (série simulada). Antes existiam duas tabelas divergentes
  // (10.2/11.5/9.0 aqui vs. 10/11.5/9 em loadHistoryAndStats); unificar elimina o
  // desalinhamento entre o "último valor" e o "histórico" mostrados na simulação.
  base: {
    "PZ-01": { n: 10.2, p: 1013, t: 24 },
    "PZ-02": { n: 11.5, p: 1013, t: 24 },
    "PZ-03": { n: 9.0,  p: 1013, t: 24 },
  },

  // Gera a leitura "ao vivo" de cada piezômetro (drift + ruído), avançando a base
  // um passo a cada chamada — é o antigo simTick(), agora chamado pelo poll normal
  // em vez de rodar num setInterval paralelo.
  async ultimos() {
    const b = this.base;
    // Parâmetros de drift por piezômetro; o drift é aplicado DENTRO do loop, com
    // nAnterior capturado ANTES — capturado depois, deltaPoll era sempre 0 e a
    // taxa_m_dia simulada nunca saía de 0.000 (chip/alarme de variação rápida
    // mortos justamente no modo demonstração).
    const drift = {
      "PZ-01": { vies: 0.48, amp: 0.25, min: 8.5,  max: 13.5 },
      "PZ-02": { vies: 0.5,  amp: 0.3,  min: 10.5, max: 13.2 },
      "PZ-03": { vies: 0.5,  amp: 0.15, min: 8.0,  max: 10.2 },
    };

    const todos = {};
    Object.keys(b).forEach(pz => {
      const s = b[pz];
      const nAnterior = s.n;
      const d = drift[pz];
      if (d) s.n = clamp(s.n + (Math.random() - d.vies) * d.amp, d.min, d.max);
      s.p = 1013.25 + (s.n - 10) * 10;  // coerente com a escala do firmware (10 hPa/m)
      s.t = clamp(s.t + (Math.random() - 0.5) * 0.3, 15, 40);
      // taxa_m_dia plausível: extrapola o drift do último passo do poll (CFG.poll ms) para m/dia,
      // mesma interface de FonteApi — nunca ligada de fato a um "dia" real na simulação.
      const deltaPoll = s.n - nAnterior;
      const taxa = parseFloat(((deltaPoll / (CFG.poll / 1000)) * 86400).toFixed(3));
      todos[pz] = {
        nivel: s.n, pressao: s.p, temperatura: s.t,
        ts: Math.floor(Date.now() / 1000), recebidoEm: Math.floor(Date.now() / 1000),
        taxa_m_dia: taxa,
      };
    });
    return todos;
  },

  // Gera uma série histórica simulada coerente com a base do piezômetro/período pedidos
  // (mesma tabela `base` usada por ultimos() — ver comentário acima).
  // Mesma interface de FonteApi.historico: { pontos, bucket_seg }. bucket_seg aqui é só o
  // stepMs/1000 da tabela de fallback abaixo — espelha (não consulta) o RANGES do Worker
  // (cloudflare-worker/src/config.js), já que a simulação não fala com o D1.
  async historico(pz, range) {
    const baseLevel = (this.base[pz] && this.base[pz].n) || 10;
    const fb = {
      "24h": { count: 48,  stepMs: 30 * 60 * 1000 },
      "7d":  { count: 84,  stepMs: 2  * 60 * 60 * 1000 },
      "30d": { count: 120, stepMs: 6  * 60 * 60 * 1000 },
    }[range] || { count: 48, stepMs: 30 * 60 * 1000 };
    const now = Date.now();
    const pontos = [];
    for (let i = fb.count; i >= 0; i--) {
      const time = now - i * fb.stepMs;
      const nivelAgua = parseFloat((baseLevel + (Math.random() - 0.5) * 1.6).toFixed(3));
      // P5 — pico/mín simulados do intervalo (máx ≥ média ≥ mín), para exercitar as mesmas
      // colunas de auditoria que a API real preenche via MAX/MIN/COUNT do D1.
      const nivelMax = parseFloat((nivelAgua + Math.random() * 0.3).toFixed(3));
      const nivelMin = parseFloat((nivelAgua - Math.random() * 0.3).toFixed(3));
      pontos.push({
        ts: Math.floor(time / 1000),
        nivel_agua: nivelAgua,
        nivel_max: nivelMax,
        nivel_min: nivelMin,
        // nº de leituras plausível dentro de um bucket de stepMs, num device que envia a
        // cada ~10s (INTERVALO_ENVIO do firmware) — só para preencher a coluna de auditoria.
        n_leituras: Math.max(1, Math.round(fb.stepMs / 10000)),
        pressao: null,
        temperatura: parseFloat((22 + Math.random() * 8).toFixed(1)),
      });
    }
    return { pontos, bucket_seg: fb.stepMs / 1000 };
  },
};

// Fonte de leituras ativa no momento — troca real↔simulação = trocar esta referência.
// Todo o resto do dashboard só enxerga a interface comum; ver seam acima (FonteApi/FonteSimulada).
let fonte = FonteApi;

// Único ponto que troca a fonte ativa. `app.js` invalida as requisições em voo e
// limpa o estado operacional antes de solicitar a nova fonte, impedindo misturas.
function trocarFonte(novaFonte) {
  if (fonte === novaFonte) return;
  fonte = novaFonte;
  simActive = fonte.simulada;
  const banner = document.getElementById("sim-banner");
  if (banner) banner.classList.toggle("on", fonte.simulada);
  const label = document.getElementById("fonte-label");
  if (label) label.textContent = fonte.simulada ? "Fonte: simulação" : "Fonte: monitoramento real";
  const botao = document.getElementById("btn-simulacao");
  if (botao) {
    botao.textContent = fonte.simulada ? "Voltar ao monitoramento" : "Entrar em simulação";
    botao.setAttribute("aria-pressed", String(fonte.simulada));
  }
  if (typeof aoTrocarFonte === "function") aoTrocarFonte();
}

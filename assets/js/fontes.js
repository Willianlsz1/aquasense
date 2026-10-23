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

  // Demonstração com roteiro (ver demo.js). Cada instrumento tem um nível de
  // referência, um nível-alvo do passo atual do roteiro e o nível corrente, que
  // anda até o alvo a cada consulta. Tempo acelerado: cada consulta representa
  // ~15 min de rede, e o histórico das últimas horas é montado com essas leituras.
  base: {
    "PZ-01": { n: 10.2 },
    "PZ-02": { n: 10.8 },
    "PZ-03": { n: 9.0 },
  },
  alvo: {},      // pz → nível-alvo do passo atual
  offline: {},   // pz → recebidoEm congelado (instrumento sem enviar)
  registro: {},  // pz → últimas leituras da demonstração [{ v, max }]

  estadoDe(pz) {
    if (!this.base[pz]) this.base[pz] = { n: 6 + (pz.charCodeAt(pz.length - 1) % 5) };
    const s = this.base[pz];
    if (!Number.isFinite(s.ref)) s.ref = s.n;
    return s;
  },

  reiniciar() {
    Object.values(this.base).forEach(s => { if (Number.isFinite(s.ref)) s.n = s.ref; });
    this.alvo = {}; this.offline = {}; this.registro = {};
  },

  // Gera a leitura "ao vivo" de cada piezômetro, avançando um passo até o alvo.
  async ultimos() {
    const ids = typeof PIEZOMETROS !== "undefined" && PIEZOMETROS.length ? PIEZOMETROS.map(p => p.id) : Object.keys(this.base);
    const agora = Math.floor(Date.now() / 1000);
    const todos = {};
    ids.forEach(pz => {
      const s = this.estadoDe(pz);
      if (this.offline[pz]) {
        todos[pz] = { nivel: s.n, pressao: null, temperatura: null, ts: this.offline[pz], recebidoEm: this.offline[pz], taxa_m_dia: null };
        return;
      }
      const alvo = Number.isFinite(this.alvo[pz]) ? this.alvo[pz] : s.ref;
      const passo = clamp(alvo - s.n, -0.42, 0.42);
      s.n = Math.max(0, s.n + passo + (Math.random() - 0.5) * 0.05);
      // Taxa coerente com o tempo acelerado (1 consulta ≈ 15 min → 96 por dia),
      // limitada a um valor plausível; parado, fica perto de zero.
      const taxa = Math.abs(alvo - s.n) > 0.08 ? clamp(passo * 6, -2.5, 2.5) : (Math.random() - 0.5) * 0.08;
      const reg = this.registro[pz] || (this.registro[pz] = []);
      reg.push({ v: s.n, max: s.n + Math.random() * 0.06 });
      if (reg.length > 32) reg.shift();
      todos[pz] = {
        nivel: s.n, pressao: null, temperatura: null, // a UCT envia só o nível
        ts: agora, recebidoEm: agora, taxa_m_dia: parseFloat(taxa.toFixed(3)),
      };
    });
    return todos;
  },

  // Série histórica coerente com a demonstração: fundo estável em torno da
  // referência (sempre igual para o mesmo instrumento e período) e, no fim, as
  // leituras da própria demonstração, uma a cada 15 min de rede.
  async historico(pz, range) {
    const s = this.estadoDe(pz);
    const fb = {
      "24h": { count: 48,  stepMs: 30 * 60 * 1000 },
      "7d":  { count: 84,  stepMs: 2  * 60 * 60 * 1000 },
      "30d": { count: 90,  stepMs: 8  * 60 * 60 * 1000 },
      "90d": { count: 90,  stepMs: 24 * 60 * 60 * 1000 },
    }[range] || { count: 48, stepMs: 30 * 60 * 1000 };
    let semente = [...(pz + range)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 2147483647, 7);
    const rnd = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
    const now = Date.now();
    const fimRecepcao = this.offline[pz] ? this.offline[pz] * 1000 : now;
    const pontos = [];
    let v = s.ref;
    for (let i = fb.count - 1; i >= 0; i--) {
      const time = now - i * fb.stepMs;
      v += (rnd() - 0.5) * 0.18 + (s.ref - v) * 0.12;
      if (time > fimRecepcao + fb.stepMs) continue; // sem sinal: o fim da série fica vazio
      pontos.push({ ts: Math.floor(time / 1000), nivel_agua: v, nivel_max: v + rnd() * 0.12, nivel_min: v - rnd() * 0.12,
        n_leituras: Math.round((fb.stepMs / 1000 / CFG.intervaloEnvioSeg) * (0.985 + rnd() * 0.015)) });
    }
    // Leituras da demonstração no fim da série (15 min de rede cada).
    const reg = this.registro[pz] || [];
    if (reg.length) {
      const passo = 15 * 60 * 1000, fim = Math.min(now, fimRecepcao);
      const inicio = fim - (reg.length - 1) * passo;
      const antes = pontos.filter(p => p.ts * 1000 < inicio - fb.stepMs / 2);
      const recentes = range === "24h"
        ? reg.map((r, i) => ({ ts: Math.floor((inicio + i * passo) / 1000), nivel_agua: r.v, nivel_max: r.max, nivel_min: r.v - 0.03, n_leituras: 90 }))
        : [{ ts: Math.floor(fim / 1000), nivel_agua: reg[reg.length - 1].v, nivel_max: Math.max(...reg.map(r => r.max)), nivel_min: Math.min(...reg.map(r => r.v)),
            n_leituras: Math.round(fb.stepMs / 1000 / CFG.intervaloEnvioSeg) }];
      pontos.length = 0;
      pontos.push(...antes, ...recentes);
    }
    pontos.forEach(p => {
      ["nivel_agua", "nivel_max", "nivel_min"].forEach(k => { p[k] = parseFloat(p[k].toFixed(3)); });
      p.pressao = null; p.temperatura = null; // a UCT não mede pressão atmosférica nem temperatura
    });
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
  if (typeof aoTrocarFonte === "function") aoTrocarFonte();
}

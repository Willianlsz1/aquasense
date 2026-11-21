// ── ESTADO ────────────────────────────────────────────────────────────────────
// Declarações de estado mutável do dashboard (seleção atual, histórico de
// leituras/gráficos/sparklines, janelas de estatísticas, alarmes e eventos) e os
// pequenos "pushers" que alimentam essas estruturas. `simActive` é um espelho
// legado de `fonte.simulada`, mantido só porque algum código ainda pode lê-lo
// por hábito — é escrito EXCLUSIVAMENTE em trocarFonte() (ver fontes.js).

let pzSelecionado = "PZ-01";
let periodoSelecionado = "24h";

// Token de requisição do histórico: incrementado a cada chamada de loadHistoryAndStats().
// A própria chamada guarda o valor lido ANTES do primeiro await; se, ao retomar depois de
// qualquer await, o valor global já tiver mudado (o operador trocou de pz/período e disparou
// uma chamada mais nova), a chamada antiga descarta seu resultado em silêncio — evita que uma
// resposta atrasada da seleção ANTERIOR sobrescreva gráficos/stats da seleção atual.
let histReqId = 0;

let lastLevel = null, failCount = 0, simActive = false;
// P4 — ISA-18.2: alarme (exige ação) e evento (informativo) em listas separadas,
// derivadas de um único ponto de entrada (pushHistorico) que classifica pelo campo `lv`.
let alarmes = [];
let eventos = [];
const HIST_MAX = 50;
let lastTaxaRapidaState = false; // edge-trigger do alarme de variação rápida (P3+P4)
let readingsHistory = []; // últimas leituras do piezômetro selecionado (mais recente primeiro)
let pzLatest = {};         // último valor conhecido de cada piezômetro: { "PZ-01": {nivel,pressao,temperatura,ts,recebidoEm,taxa_m_dia}, ... }
let pzComm = {};           // último estado de comunicação conhecido por pz ("ok"|"stale") — dedupe de eventos (P1)
let leafletMap = null;
const pzMarkers = {};      // marcadores do mapa por id de piezômetro

// Histórico de sparklines (últimos 20 pontos)
const sparks = { n: [], p: [], t: [] };

// Histórico de gráficos (período selecionado)
// charts.n ganha `maxData` (P5) — série do pico do intervalo, paralela a `data` (a média)
const charts = {
  n: { labels: [], data: [], times: [], maxData: [] },
  t: { labels: [], data: [], times: [] },
};

// Stats do período selecionado
const stats = {
  n: { min: null, max: null },
  p: { min: null, max: null },
  t: { min: null, max: null },
};

// Janela de estatísticas do período: semeada pelo histórico da API e
// alimentada pelo polling.
// (Os gráficos exibem só os últimos 60 pontos, mas mín/máx/variação
//  são calculados sobre esta janela completa.)
// `nMax` (P5) — janela paralela do pico do intervalo, usada só pelo stat "MÁX 24H" do
// nível (nunca substitui statsWin.n, que segue sendo a série de médias/leituras).
const statsWin = { n: [], p: [], t: [], nMax: [] };

// Série completa do histórico de nível carregado do período selecionado (sem o truncamento a
// 60 pontos que os gráficos aplicam) — usada só pela exportação de CSV, para que o arquivo
// cubra o período inteiro que o nome promete (ex.: "_30d.csv"), não apenas a janela visível
// no gráfico. Substituída inteira a cada loadHistoryAndStats(); itens:
// { label, value, maxValue, minValue, nLeituras, time } — minValue/nLeituras podem vir
// `undefined` (dados antigos/sem agregação); exportar.js trata isso sem quebrar.
// bucketSeg: tamanho (segundos) do intervalo de agregação do período carregado, usado só
// nos metadados de auditoria do CSV exportado — `undefined` quando a fonte não o informou.
let histPontos = { n: [], bucketSeg: undefined };
// true quando o histórico atual veio do fallback simulado de loadHistoryAndStats()
// (API de histórico fora do ar com a fonte global ainda = FonteApi). O export lê
// este flag: sem ele, um CSV/XLS gerado durante a queda carimbava "API real"
// sobre dados fictícios — exatamente o que o bloco de auditoria existe para impedir.
let histSimulado = false;
const STATS_MAX = 8640;
function pushStats(key, val) {
  statsWin[key].push(val);
  if (statsWin[key].length > STATS_MAX) statsWin[key].shift();
}

// P5 — sobrescreve o stat "MÁX 24H" do nível com o maior valor de statsWin.nMax (pico do
// intervalo) quando disponível; cai para statsWin.n (média) só na ausência de pico agregado.
function aplicarMaxNivelPico() {
  const el = document.getElementById("n-max");
  if (!el) return;
  const fonteMax = statsWin.nMax.length ? statsWin.nMax : statsWin.n;
  if (fonteMax.length) el.textContent = fmtBR(Math.max(...fonteMax));
}

function pushSpark(key, val) {
  sparks[key].push(val);
  if (sparks[key].length > 20) sparks[key].shift();
  // P6/ISA-101: sparkline é tendência, não alarme — cor neutra dessaturada.
  const colors = { n: "#8fa0bf", p: "#7c8196", t: "#7c8196" };
  drawSparkline("spark-" + key, sparks[key], colors[key]);
}

function pushChart(key, label, value, time, max) {
  charts[key].labels.push(label);
  charts[key].data.push(value);
  charts[key].times.push(time || new Date().toISOString());
  // P5 — leitura ao vivo é instantânea: na ausência de um pico agregado explícito,
  // o próprio valor é o "máximo" daquele instante (mantém a série alinhada em tamanho)
  if (charts[key].maxData) charts[key].maxData.push(Number.isFinite(max) ? max : value);
  if (charts[key].labels.length > 60) {
    charts[key].labels.shift(); charts[key].data.shift(); charts[key].times.shift();
    if (charts[key].maxData) charts[key].maxData.shift();
  }
}

// ── TABELA DE ALARMES / EVENTOS (P4 — ISA-18.2) ──────────────────────────────
// Alarme = exige uma ação definida do operador; evento = informativo. `ACOES` dá a ação
// esperada de cada faixa de alarme, mostrada na coluna "Ação" da tabela de alarmes.
const ACOES = {
  atencao:  "→ intensificar monitoramento",
  critico:  "→ acionar equipe de geotecnia",
  semsinal: "→ verificar instrumento/comunicação",
  taxa:     "→ investigar tendência",
};
function classificarKind(lv) {
  return (lv === "atencao" || lv === "critico" || lv === "semsinal" || lv === "taxa") ? "alarme" : "evento";
}

// Único ponto de entrada nas duas listas — classifica pelo campo `lv` e roteia para
// `alarmes` ou `eventos` (nunca as duas), aplicando o limite de 50 cada.
function pushHistorico(entry) {
  entry.kind = classificarKind(entry.lv);
  entry.acao = ACOES[entry.lv] || "";
  const alvo = entry.kind === "alarme" ? alarmes : eventos;
  alvo.unshift(entry);
  if (alvo.length > HIST_MAX) alvo.pop();
  renderTable();
}

// ── TABELA DE ÚLTIMAS LEITURAS ────────────────────────────────────────────────
function pushReading(nivel) {
  const t = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const cls = classifyNivel(nivel);
  readingsHistory.unshift({ time: t, nivel, lv: cls.lv, lbl: cls.lbl });
  if (readingsHistory.length > 12) readingsHistory.pop();
  renderReadingsTable();
}

// ── RELATÓRIO IMPRIMÍVEL ─────────────────────────────────────────────────────
// Página standalone (relatorio.html): lê ?pz= e ?range= da URL, busca o
// histórico agregado (GET /dados) e o último valor (GET /ultimos) do mesmo
// Worker do dashboard, calcula os números do resumo, desenha o gráfico em
// canvas (tema claro) e monta a tabela + bloco de auditoria. Se a API não
// responder, mostra uma mensagem de erro — nunca inventa números.

// ── FETCH ────────────────────────────────────────────────────────────────────
// Wrapper local (mesmo padrão de alerta.js): esta página não carrega fontes.js
// inteiro (que traz os adapters de simulação, sem sentido num documento
// impresso) — só o suficiente pra falar com a API. Serve também de apiGet()
// global pro loadConfig() de config.js, reaproveitando-o em vez de duplicá-lo.
async function apiGet(path, timeoutMs = 10000) {
  const r = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// loadConfig() (config.js) referencia `pzSelecionado` global quando /config
// devolve piezômetros — variável que essa página também usa (abaixo) pra saber
// qual piezômetro o operador escolheu. Sem declará-la aqui, vira ReferenceError
// dentro do loadConfig() (mesmo problema resolvido em alerta.js).
let pzSelecionado = null;
let rangeSelecionado = "24h";

// ── FORMATAÇÃO ───────────────────────────────────────────────────────────────
// Número em pt-BR (vírgula decimal); "n/d" quando o dado não existe — nunca 0
// ou "--" fabricados no lugar de um valor ausente.
function fmtNum(v, casas = 2) {
  return Number.isFinite(v) ? v.toFixed(casas).replace(".", ",") : "n/d";
}
// "dd/mm hh:mm" — o eixo do gráfico e a tabela precisam da DATA (não só hora),
// já que o período pode ser 7 ou 30 dias.
function fmtDataHora(tsSeg) {
  if (!Number.isFinite(tsSeg)) return "--";
  return new Date(tsSeg * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ── QUERY PARAMS ─────────────────────────────────────────────────────────────
function lerParametros() {
  const q = new URLSearchParams(location.search);
  const pz = q.get("pz") || "PZ-01";
  const range = q.get("range") || "24h";
  return { pz, range };
}

// ── GRÁFICO (CANVAS, TEMA CLARO) ─────────────────────────────────────────────
// Versão simplificada de graficos.js: sem sparkline, sem gap (o relatório
// mostra só os intervalos que a API devolveu), fundo branco explícito
// (necessário pra impressão) e eixo X sempre com data+hora.
function desenharLinha(c, pontos, cor, dash, largura) {
  if (!pontos.length) return;
  if (pontos.length === 1) {
    c.beginPath(); c.arc(pontos[0][0], pontos[0][1], 3, 0, Math.PI * 2);
    c.fillStyle = cor; c.fill(); return;
  }
  c.save();
  c.strokeStyle = cor; c.lineWidth = largura; c.setLineDash(dash);
  c.beginPath(); c.moveTo(pontos[0][0], pontos[0][1]);
  for (let i = 1; i < pontos.length; i++) c.lineTo(pontos[i][0], pontos[i][1]);
  c.stroke();
  c.restore();
}

function desenharGrafico(pontos) {
  const cv = document.getElementById("chart-relatorio");
  if (!cv) return;
  const wrap = cv.closest(".grafico-area");
  const W = wrap ? wrap.offsetWidth : 800;
  const H = wrap ? wrap.offsetHeight : 220;
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  c.clearRect(0, 0, W, H);
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H); // fundo branco explícito (tela e PDF)
  if (!pontos.length) return;

  const PAD = { top: 16, right: 20, bottom: 34, left: 48 };
  const cw = W - PAD.left - PAD.right, ch = H - PAD.top - PAD.bottom;
  const medias = pontos.map(p => p.nivel_agua);
  const maxs = pontos.map(p => Number.isFinite(p.nivel_max) ? p.nivel_max : p.nivel_agua);
  const mn = Math.min(...medias, CFG.thrAtencao) - 1;
  const mx = Math.max(...maxs, CFG.thrCritico) + 1;
  const sy = v => PAD.top + ch - ((v - mn) / (mx - mn)) * ch;
  const sx = i => PAD.left + (i / Math.max(pontos.length - 1, 1)) * cw;

  // Grade + eixo Y
  c.font = "12px 'IBM Plex Mono'"; c.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const v = mn + (mx - mn) * (i / 4);
    const y = sy(v);
    c.strokeStyle = "#e4e8ef"; c.lineWidth = 1; c.setLineDash([]);
    c.beginPath(); c.moveTo(PAD.left, y); c.lineTo(PAD.left + cw, y); c.stroke();
    c.fillStyle = "#7a8399";
    c.fillText(v.toFixed(1), PAD.left - 8, y + 4);
  }

  // Limiares tracejados (atenção/crítico) com rótulo
  [
    { v: CFG.thrAtencao, col: "#d9a419", lbl: `${fmtNum(CFG.thrAtencao)} m · atenção` },
    { v: CFG.thrCritico, col: "#c43d3d", lbl: `${fmtNum(CFG.thrCritico)} m · crítico` },
  ].forEach(t => {
    const y = sy(t.v);
    c.save(); c.strokeStyle = t.col; c.setLineDash([5, 4]); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(PAD.left, y); c.lineTo(PAD.left + cw, y); c.stroke();
    c.fillStyle = t.col; c.font = "11px 'IBM Plex Mono'"; c.textAlign = "left";
    c.fillText(t.lbl, PAD.left + 6, y - 5);
    c.restore();
  });

  desenharLinha(c, pontos.map((p, i) => [sx(i), sy(p.nivel_agua)]), "#5b6b8c", [], 2);
  desenharLinha(c, pontos.map((p, i) => [sx(i), sy(Number.isFinite(p.nivel_max) ? p.nivel_max : p.nivel_agua)]), "#b0885a", [3, 3], 1.4);

  // Eixo X: no máximo ~6 rótulos, sempre data+hora
  c.fillStyle = "#4a5268"; c.font = "11px 'IBM Plex Mono'"; c.textAlign = "center";
  const passo = Math.max(1, Math.floor(pontos.length / 6));
  for (let i = 0; i < pontos.length; i += passo) c.fillText(fmtDataHora(pontos[i].ts), sx(i), H - 10);
}

// ── TABELA ────────────────────────────────────────────────────────────────────
function montarTabela(pontos) {
  const tbody = document.getElementById("tbody-intervalos");
  tbody.innerHTML = pontos.map(p => {
    const pico = Number.isFinite(p.nivel_max) ? p.nivel_max : p.nivel_agua;
    const cls = classifyNivel(pico); // util.js — status SEMPRE pelo pico do intervalo, nunca a média
    return `<tr>
      <td>${fmtDataHora(p.ts)}</td>
      <td>${fmtNum(p.nivel_agua)}</td>
      <td>${Number.isFinite(p.nivel_min) ? fmtNum(p.nivel_min) : "n/d"}</td>
      <td>${fmtNum(pico)}</td>
      <td>${Number.isFinite(p.n_leituras) ? p.n_leituras : "n/d"}</td>
      <td class="cel-status st-${cls.lv}">${cls.lbl}</td>
    </tr>`;
  }).join("");
}

// ── RESUMO (números grandes) ─────────────────────────────────────────────────
// 7 números pedidos: nível atual, mínimo, média (ponderada por nº de leituras
// quando disponível), máximo das médias, pico máximo do período (P5 — o pico
// nunca fica escondido atrás da média), leituras recebidas e alarmes no
// período (intervalos cujo PICO caiu em atenção/crítico).
function montarResumo(pontos, ultimo, telemetria) {
  const medias = pontos.map(p => p.nivel_agua).filter(Number.isFinite);
  const maxs = pontos.map(p => Number.isFinite(p.nivel_max) ? p.nivel_max : p.nivel_agua).filter(Number.isFinite);
  const mins = pontos.map(p => Number.isFinite(p.nivel_min) ? p.nivel_min : p.nivel_agua).filter(Number.isFinite);
  const temAlgumN = pontos.some(p => Number.isFinite(p.n_leituras));
  const somaN = pontos.reduce((acc, p) => acc + (Number.isFinite(p.n_leituras) ? p.n_leituras : 0), 0);

  const pesoTotal = pontos.reduce((acc, p) => acc + (Number.isFinite(p.n_leituras) ? p.n_leituras : 1), 0);
  const somaPonderada = pontos.reduce((acc, p) => acc + p.nivel_agua * (Number.isFinite(p.n_leituras) ? p.n_leituras : 1), 0);
  const media = temAlgumN ? (somaPonderada / pesoTotal) : (medias.length ? medias.reduce((a, b) => a + b, 0) / medias.length : NaN);

  const nivelAtual = Number.isFinite(telemetria?.nivelConhecido) ? telemetria.nivelConhecido : (medias.length ? medias[medias.length - 1] : NaN);
  const ultimoStale = Boolean(ultimo && telemetria?.status === "stale");
  const idadeBase = Number.isFinite(ultimo?.recebidoEm) ? ultimo.recebidoEm : ultimo?.ts;
  const subAtual = ultimoStale
    ? `SEM SINAL · ${formatUltimaLeitura(idadeBase)}`
    : (ultimo && Number.isFinite(ultimo.ts)) ? formatUltimaLeitura(ultimo.ts) : "último intervalo agregado";

  const alarmes = pontos.filter(p => {
    const pico = Number.isFinite(p.nivel_max) ? p.nivel_max : p.nivel_agua;
    return Number.isFinite(pico) && classifyNivel(pico).lv !== "normal";
  }).length;

  const cards = [
    { lbl: ultimoStale ? "Última leitura conhecida" : "Nível atual", val: fmtNum(nivelAtual), un: "m", sub: subAtual },
    { lbl: "Mínimo do período", val: mins.length ? fmtNum(Math.min(...mins)) : "n/d", un: "m" },
    { lbl: "Média do período", val: fmtNum(media), un: "m", sub: temAlgumN ? "ponderada por leituras" : "média simples" },
    { lbl: "Máximo (médias)", val: medias.length ? fmtNum(Math.max(...medias)) : "n/d", un: "m" },
    { lbl: "Pico máximo do período", val: maxs.length ? fmtNum(Math.max(...maxs)) : "n/d", un: "m" },
    { lbl: "Leituras recebidas", val: temAlgumN ? String(somaN) : "n/d", un: "" },
    { lbl: "Alarmes no período", val: String(alarmes), un: "", sub: "pico em atenção/crítico" },
  ];
  document.getElementById("resumo-grid").innerHTML = cards.map(c => `
    <div class="resumo-card">
      <div class="rc-lbl">${c.lbl}</div>
      <div class="rc-val">${c.val}${c.un ? `<span class="rc-un">${c.un}</span>` : ""}</div>
      ${c.sub ? `<div class="rc-sub">${c.sub}</div>` : ""}
    </div>`).join("");
}

// ── AUDITORIA ─────────────────────────────────────────────────────────────────
function montarAuditoria({ bucketSeg, endpoint, ultimoOk, telemetria, ultimo }) {
  const intervaloLabel = Number.isFinite(bucketSeg) ? `${Math.round(bucketSeg / 60)} min` : "n/d";
  const ultimoStale = Boolean(ultimoOk && telemetria?.status === "stale");
  const idadeBase = Number.isFinite(ultimo?.recebidoEm) ? ultimo.recebidoEm : ultimo?.ts;
  const itens = [
    ["Fonte dos dados", "Sistema real (Cloudflare Worker + D1)"],
    [ultimoStale ? "Última leitura conhecida" : "Nível atual", ultimoStale
      ? `GET /ultimos · SEM SINAL (${formatUltimaLeitura(idadeBase)})`
      : ultimoOk ? "GET /ultimos (leitura mais recente recebida)" : "GET /ultimos indisponível · usado o último intervalo agregado"],
    ["Limiares vigentes", `atenção ${fmtNum(CFG.thrAtencao)} m · crítico ${fmtNum(CFG.thrCritico)} m`],
    ["Intervalo de agregação", intervaloLabel],
    ["Endpoint", endpoint],
    ["Data de geração", new Date().toLocaleString("pt-BR")],
  ];
  document.getElementById("auditoria-grid").innerHTML = itens.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

// ── ERRO (sem dados fabricados) ───────────────────────────────────────────────
function mostrarErro(msg) {
  const erro = document.getElementById("doc-erro");
  erro.textContent = `⚠ ${msg}`;
  erro.hidden = false;
  document.getElementById("doc-body").hidden = true;
}

// ── CONTROLES (não impressos) ─────────────────────────────────────────────────
function montarControles() {
  const selPz = document.getElementById("sel-pz");
  selPz.innerHTML = PIEZOMETROS.map(p => `<option value="${p.id}">${p.id} · ${p.nome}</option>`).join("");
  selPz.value = pzSelecionado;
  selPz.addEventListener("change", () => navegar(selPz.value, rangeSelecionado));

  const selRange = document.getElementById("sel-range");
  selRange.value = rangeSelecionado;
  selRange.addEventListener("change", () => navegar(pzSelecionado, selRange.value));

  document.getElementById("btn-imprimir").addEventListener("click", () => window.print());
}
function navegar(pz, range) {
  location.href = `relatorio.html?pz=${encodeURIComponent(pz)}&range=${encodeURIComponent(range)}`;
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const params = lerParametros();
  await loadConfig(); // busca limiares/piezômetros reais do Worker; fallback hard-coded se falhar

  pzSelecionado = PIEZOMETROS.some(p => p.id === params.pz) ? params.pz : ((PIEZOMETROS[0] && PIEZOMETROS[0].id) || "PZ-01");
  rangeSelecionado = PERIODOS[params.range] ? params.range : "24h";

  // Nome sugerido do PDF ("Salvar como PDF" usa document.title como filename)
  document.title = `Relatorio_AquaSense_${pzSelecionado}_${rangeSelecionado}`;

  document.getElementById("hdr-pz").textContent = pzSelecionado;
  document.getElementById("hdr-periodo").textContent = `Período: ${PERIODOS[rangeSelecionado].label}`;
  document.getElementById("hdr-gerado").textContent = `Gerado em: ${new Date().toLocaleString("pt-BR")}`;

  montarControles();

  const endpoint = `/dados?pz=${pzSelecionado}&range=${rangeSelecionado}`;
  let pontos, bucketSeg;
  try {
    const dados = await apiGet(endpoint);
    pontos = dados.pontos || [];
    bucketSeg = dados.bucket_seg;
  } catch (e) {
    // Falha de rede/API — nunca mostrar dado fabricado no lugar de um relatório real
    console.warn("Relatório:", e.message);
    mostrarErro("Sem conexão com o sistema · relatório indisponível");
    return;
  }
  if (!pontos.length) {
    // API respondeu, mas não há leituras nesse piezômetro/período — mensagem
    // honesta e distinta de "sem conexão" (o sistema está no ar, só não há dado)
    mostrarErro(`Nenhuma leitura registrada para ${pzSelecionado} no período selecionado (${PERIODOS[rangeSelecionado].label}).`);
    return;
  }

  // Nível atual é best-effort: se /ultimos falhar, o resumo cai para o último
  // ponto do histórico (comunicado na auditoria) — nunca trava o relatório.
  let ultimo = null, ultimoOk = false;
  try {
    const json = await apiGet("/ultimos");
    const row = json && json[pzSelecionado];
    if (row) { ultimo = { nivel: row.nivel_agua, ts: row.ts, recebidoEm: row.recebido_em }; ultimoOk = true; }
  } catch (e) { console.warn("Relatório: /ultimos indisponível —", e.message); }

  const telemetria = avaliarTelemetriaAtual(ultimo);

  montarResumo(pontos, ultimo, telemetria);
  desenharGrafico(pontos);
  montarTabela(pontos);
  montarAuditoria({ bucketSeg, endpoint, ultimoOk, telemetria, ultimo });

  window.addEventListener("resize", () => desenharGrafico(pontos));
});

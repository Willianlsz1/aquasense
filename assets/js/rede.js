// ── REDE ──────────────────────────────────────────────────────────────────────
// Peças da visão geral e do instrumento que olham para a rede inteira: histórico
// de 24 h de todos os instrumentos (tendência e disponibilidade), indicador de
// nível com faixas, gráfico da rede, mapas pequenos, ocorrências recentes, quadro
// de incidente, cartão de comunicação e som do alarme crítico.
// Só apresenta o que a fonte ativa entrega; não decide alarmes do servidor.

// Histórico de 24 h por instrumento: { "PZ-01": [{ t, v, max, n }], ... }.
// No monitoramento real é recarregado a cada 30 min (cada consulta lê o D1);
// na demonstração, a cada consulta, porque os dados são locais.
let historicoRede = {};
let historicoRedeEm = 0;
let historicoRedeReq = 0;
const HISTORICO_REDE_TTL_MS = 30 * 60 * 1000;

async function carregarHistoricoRede({ forcar = false } = {}) {
  if (!forcar && historicoRedeEm && Date.now() - historicoRedeEm < HISTORICO_REDE_TTL_MS) return;
  const meuId = ++historicoRedeReq;
  const fonteDaConsulta = fonte;
  const novo = {};
  await Promise.all(PIEZOMETROS.map(async pz => {
    try {
      const { pontos } = await fonteDaConsulta.historico(pz.id, "24h");
      novo[pz.id] = (pontos || []).filter(p => Number.isFinite(p.nivel_agua)).map(p => ({
        t: p.ts * 1000, v: p.nivel_agua,
        max: Number.isFinite(p.nivel_max) ? p.nivel_max : p.nivel_agua,
        n: Number.isFinite(p.n_leituras) ? p.n_leituras : null,
      }));
    } catch {
      novo[pz.id] = null; // falha de consulta: não é o mesmo que "sem leituras"
    }
  }));
  if (meuId !== historicoRedeReq || fonteDaConsulta !== fonte) return;
  historicoRede = novo;
  historicoRedeEm = Date.now();
  if (typeof atualizarVisaoGeral === "function") atualizarVisaoGeral(pzLatest);
  desenharGraficoRede();
  atualizarCartaoComunicacao();
}

function limparHistoricoRede() {
  historicoRede = {};
  historicoRedeEm = 0;
  historicoRedeReq++;
}

// Leituras recebidas nas últimas 24 h em relação às esperadas (uma a cada
// CFG.intervaloEnvioSeg). null quando o histórico não informa a contagem.
function disponibilidade24h(pzId) {
  const pts = historicoRede[pzId];
  if (!Array.isArray(pts)) return null;
  if (pts.some(p => p.n === null)) return null;
  const recebidas = pts.reduce((s, p) => s + p.n, 0);
  const esperadas = Math.round(86400 / CFG.intervaloEnvioSeg);
  return { recebidas, esperadas, pct: Math.min(100, (recebidas / esperadas) * 100) };
}

function escalaNivel() { return Math.max(4, Math.ceil(CFG.thrCritico * 1.2)); }
const fmtBR = (v, casas = 2) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

// ── INDICADORES DA TABELA ─────────────────────────────────────────────────────
// Bullet graph (Stephen Few) como indicador analógico do ISA-101: faixas neutras de
// intensidade crescente, limites marcados e a barra só ganha cor fora do normal.
// `ref` marca o nível de 24 h atrás.
function bulletSvg(nivel, lv, ref, w = 150) {
  const esc = escalaNivel();
  const x = n => 2 + (clamp(n, 0, esc) / esc) * (w - 4);
  const cor = { normal: "var(--barra-valor)", atencao: "var(--warn)", critico: "var(--crit)", semsinal: "var(--off)" }[lv];
  const barra = Number.isFinite(nivel)
    ? `<rect x="2" y="9.5" width="${(x(nivel) - 2).toFixed(1)}" height="5" rx="1" style="fill:${cor}${lv === "semsinal" ? ";opacity:.55" : ""}"/>` : "";
  const marcaRef = Number.isFinite(ref)
    ? `<line x1="${x(ref).toFixed(1)}" x2="${x(ref).toFixed(1)}" y1="7" y2="17" style="stroke:var(--text-mute)" stroke-width="1.5"/>` : "";
  return `<svg class="bullet" width="${w}" height="24" viewBox="0 0 ${w} 24" aria-hidden="true">
    <rect x="2" y="5" width="${(x(CFG.thrAtencao) - 2).toFixed(1)}" height="14" rx="2" style="fill:var(--faixa-1)"/>
    <rect x="${x(CFG.thrAtencao).toFixed(1)}" y="5" width="${(x(CFG.thrCritico) - x(CFG.thrAtencao)).toFixed(1)}" height="14" style="fill:var(--faixa-2)"/>
    <rect x="${x(CFG.thrCritico).toFixed(1)}" y="5" width="${(w - 2 - x(CFG.thrCritico)).toFixed(1)}" height="14" rx="2" style="fill:var(--faixa-3)"/>
    ${barra}${marcaRef}
    <line x1="${x(CFG.thrAtencao).toFixed(1)}" x2="${x(CFG.thrAtencao).toFixed(1)}" y1="2" y2="22" style="stroke:var(--warn-line)" stroke-width="1.5"/>
    <line x1="${x(CFG.thrCritico).toFixed(1)}" x2="${x(CFG.thrCritico).toFixed(1)}" y1="2" y2="22" style="stroke:var(--crit-line)" stroke-width="1.5"/>
  </svg>`;
}

function sparkSvg(pts, lv, w = 112, h = 32) {
  if (!Array.isArray(pts) || pts.length < 2) return `<span class="sem-serie">${pts === null ? "indisponível" : "sem leituras"}</span>`;
  const vs = pts.map(p => p.v);
  let mn = Math.min(...vs), mx = Math.max(...vs);
  const folga = Math.max(.15, (mx - mn) * .15); mn -= folga; mx += folga;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const sx = t => 1 + ((t - t0) / (t1 - t0 || 1)) * (w - 6);
  const sy = v => h - 3 - ((v - mn) / (mx - mn)) * (h - 6);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.t).toFixed(1)} ${sy(p.v).toFixed(1)}`).join("");
  const cor = { normal: "var(--text-soft)", atencao: "var(--warn)", critico: "var(--crit)", semsinal: "var(--off)" }[lv];
  const limites = [CFG.thrAtencao, CFG.thrCritico].filter(l => l > mn && l < mx).map(l =>
    `<line x1="0" x2="${w}" y1="${sy(l).toFixed(1)}" y2="${sy(l).toFixed(1)}" style="stroke:${l === CFG.thrCritico ? "var(--crit-line)" : "var(--warn-line)"}" stroke-dasharray="3 3"/>`).join("");
  const u = pts[pts.length - 1];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${limites}
    <path d="${d}" fill="none" style="stroke:${cor}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${sx(u.t).toFixed(1)}" cy="${sy(u.v).toFixed(1)}" r="2.6" style="fill:${cor}"/></svg>`;
}

// ── GRÁFICO DA REDE ───────────────────────────────────────────────────────────
const PALETA_REDE = ["#36B7E0", "#9FB3C4", "#5E7FA0", "#7CC4B5", "#B39DDB", "#C9A27E", "#80A6C9", "#A5C27A"];
let pzRealcado = null;

function corVar(nome) { return getComputedStyle(document.documentElement).getPropertyValue(nome).trim(); }

function corDaSerie(lv, i) {
  if (lv === "critico") return corVar("--crit");
  if (lv === "atencao") return corVar("--warn");
  if (lv === "semsinal") return corVar("--off");
  if (i === 0 && document.documentElement.dataset.tema !== "escuro") return "#1565C0";
  return PALETA_REDE[i % PALETA_REDE.length];
}

function desenharGraficoRede() {
  const box = document.getElementById("g-rede");
  const cv = document.getElementById("chart-rede");
  if (!box || !cv || !box.offsetWidth) return;
  const dica = box.querySelector(".graf-dica");
  const W = box.clientWidth, H = box.clientHeight, dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);

  const series = PIEZOMETROS.map((pz, i) => {
    const pts = historicoRede[pz.id];
    const lv = situacaoPz(pzLatest[pz.id]).lv;
    return { pz, pts: Array.isArray(pts) ? pts : [], lv, cor: corDaSerie(lv, i) };
  }).filter(s => s.pts.length);
  c.font = "11px 'IBM Plex Mono', monospace";
  if (!series.length) {
    c.fillStyle = corVar("--text-mute"); c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(Object.keys(historicoRede).length ? "Nenhuma leitura da rede nas últimas 24 h." : "Carregando histórico da rede…", W / 2, H / 2);
    box.onmousemove = null;
    return;
  }

  const agora = Date.now(), t0 = agora - 24 * 3600 * 1000;
  const todos = series.flatMap(s => s.pts);
  const mn = Math.min(0, ...todos.map(p => p.v));
  const mx = Math.max(CFG.thrCritico + 2, ...todos.map(p => p.max));
  const E = 46, D = 132, T = 12, B = 26;
  const X = t => E + ((t - t0) / (agora - t0)) * (W - E - D);
  const Y = v => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);

  const passo = mx - mn > 12 ? 3 : 2;
  c.textBaseline = "middle";
  for (let v = Math.ceil(mn / passo) * passo; v <= mx; v += passo) {
    c.strokeStyle = corVar("--line"); c.lineWidth = 1;
    c.beginPath(); c.moveTo(E, Math.round(Y(v)) + .5); c.lineTo(W - D, Math.round(Y(v)) + .5); c.stroke();
    c.fillStyle = corVar("--text-mute"); c.textAlign = "right"; c.fillText(`${v} m`, E - 8, Y(v));
  }
  c.textAlign = "center"; c.textBaseline = "top";
  const nx = Math.max(3, Math.floor((W - E - D) / 110));
  for (let i = 0; i <= nx; i++) {
    const t = t0 + (i / nx) * (agora - t0);
    c.fillStyle = corVar("--text-mute");
    c.fillText(new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), X(t), H - B + 8);
  }
  [[CFG.thrAtencao, "--warn-line"], [CFG.thrCritico, "--crit-line"]].forEach(([v, cor]) => {
    c.strokeStyle = corVar(cor); c.setLineDash([5, 4]); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(E, Y(v)); c.lineTo(W - D, Y(v)); c.stroke(); c.setLineDash([]);
  });

  // Rótulos diretos no fim das linhas, afastados para não se sobrepor.
  const rot = series.map(s => ({ s, y: Y(s.pts[s.pts.length - 1].v) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < rot.length; i++) if (rot[i].y - rot[i - 1].y < 14) rot[i].y = rot[i - 1].y + 14;

  series.forEach(s => {
    const realce = !pzRealcado || pzRealcado === s.pz.id;
    c.globalAlpha = realce ? 1 : .2;
    c.strokeStyle = s.cor; c.lineJoin = "round";
    c.lineWidth = pzRealcado === s.pz.id ? 2.6 : s.lv === "normal" ? 1.5 : 2.2;
    c.setLineDash(s.lv === "semsinal" ? [4, 3] : []);
    // Interrompe a linha em lacunas maiores que 3 intervalos (instrumento sem enviar).
    c.beginPath();
    s.pts.forEach((p, i) => {
      const lacuna = i && p.t - s.pts[i - 1].t > 3 * 30 * 60 * 1000;
      if (!i || lacuna) c.moveTo(X(p.t), Y(p.v)); else c.lineTo(X(p.t), Y(p.v));
    });
    c.stroke(); c.setLineDash([]);
    const u = s.pts[s.pts.length - 1];
    c.fillStyle = s.cor; c.beginPath(); c.arc(X(u.t), Y(u.v), 3, 0, Math.PI * 2); c.fill();
    const r = rot.find(o => o.s === s);
    c.font = "600 11px 'IBM Plex Mono', monospace"; c.textAlign = "left"; c.textBaseline = "middle";
    c.fillText(`${s.pz.id} ${fmtBR(u.v, 1)}`, X(u.t) + 8, r.y);
    c.font = "11px 'IBM Plex Mono', monospace";
    c.globalAlpha = 1;
  });

  box.onmousemove = ev => {
    const r = cv.getBoundingClientRect(), xm = ev.clientX - r.left;
    if (xm < E || xm > W - D) { dica.style.opacity = "0"; return; }
    const t = t0 + ((xm - E) / (W - E - D)) * (agora - t0);
    const linhas = series.map(s => ({ s, p: s.pts.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a) }));
    dica.innerHTML = `<b>${new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</b>` +
      linhas.map(({ s, p }) => `<div><span style="color:${s.cor}">${textoHtml(s.pz.id)} ${textoHtml(s.pz.nome)}</span><span>${fmtBR(p.v)} m</span></div>`).join("");
    dica.style.left = Math.min(xm + 16, W - 220) + "px";
    dica.style.opacity = "1";
  };
  box.onmouseleave = () => { dica.style.opacity = "0"; };
}

function realcarPz(id) {
  if (pzRealcado === id) return;
  pzRealcado = id;
  document.querySelectorAll("#pz-grid tr[data-pz]").forEach(tr => tr.classList.toggle("realce", tr.dataset.pz === id));
  Object.entries(mapasMini.visao?.marcadores || {}).forEach(([pz, m]) => m.getElement()?.querySelector(".mk")?.classList.toggle("sel", pz === id));
  desenharGraficoRede();
}

// ── MAPAS PEQUENOS ────────────────────────────────────────────────────────────
const mapasMini = {};
let mapaVisaoEnquadrado = false;

function criarMapaMini(id) {
  const el = document.getElementById(id);
  if (!el || typeof L === "undefined") return null;
  try {
    const m = L.map(el, { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 17 }).addTo(m);
    L.control.zoom({ position: "topright" }).addTo(m);
    m.marcadores = {};
    return m;
  } catch (e) {
    console.warn("Mapa:", e.message);
    return null;
  }
}

function marcadorMini(pz, s, comValor, destaque) {
  const valor = comValor && s.nivel !== null && s.lv !== "semsinal" ? `<em>${s.nivel.toFixed(1)} m</em>` : "";
  return `<div class="mk mk-mini st-${s.lv}${destaque ? " sel" : ""}"><span class="mk-anel"></span><span class="mk-dot"></span><span class="mk-rot">${textoHtml(pz.id)}${valor}</span></div>`;
}

function desenharMapaMini(qual, { enquadrar = false } = {}) {
  const id = qual === "visao" ? "mapa-visao" : "mapa-ins";
  const el = document.getElementById(id);
  if (!el || !el.offsetWidth) return;
  if (!mapasMini[qual]) mapasMini[qual] = criarMapaMini(id);
  const m = mapasMini[qual];
  if (!m) return;
  m.invalidateSize();
  Object.values(m.marcadores).forEach(k => m.removeLayer(k));
  m.marcadores = {};
  PIEZOMETROS.forEach(pz => {
    const s = situacaoPz(pzLatest[pz.id]);
    const destaque = qual === "ins" ? pz.id === pzSelecionado : pz.id === pzRealcado;
    const k = L.marker([pz.lat, pz.lng], {
      icon: L.divIcon({ className: qual === "ins" && pz.id !== pzSelecionado ? "mk-apagado" : "", iconSize: [0, 0], html: marcadorMini(pz, s, PIEZOMETROS.length <= 5, destaque) }),
      zIndexOffset: (3 - PRIORIDADE[s.lv]) * 100,
    }).addTo(m);
    k.on("click", () => abrirInstrumento(pz.id));
    if (qual === "visao") { k.on("mouseover", () => realcarPz(pz.id)); k.on("mouseout", () => realcarPz(null)); }
    m.marcadores[pz.id] = k;
  });
  if (qual === "ins") {
    const pz = PIEZOMETROS.find(p => p.id === pzSelecionado);
    if (pz) m.setView([pz.lat, pz.lng], 16, { animate: false });
  } else if (enquadrar || !mapaVisaoEnquadrado) {
    m.fitBounds(L.latLngBounds(PIEZOMETROS.map(p => [p.lat, p.lng])), { paddingTopLeft: [30, 30], paddingBottomRight: [110, 30], maxZoom: 16 });
    mapaVisaoEnquadrado = true;
  }
}

function abrirInstrumento(id) {
  selectPiezometro(id);
  if (typeof irParaVista === "function") irParaVista("instrumento");
}

// ── OCORRÊNCIAS ───────────────────────────────────────────────────────────────
// Monitoramento real: registros do servidor (/alerts). Demonstração: transições
// observadas nesta sessão, porque a simulação não grava no servidor.
const ocorrenciasSessao = [];
const situacaoAnteriorRede = {};
const inicioAlerta = {}; // pz → { lv, desde (ms), pico }

const ICONES_OCORRENCIA = {
  critico: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2.5h6l4.5 4.5v6L13 17.5H7L2.5 13V7z"/><path d="M10 6.5v4.5"/><circle cx="10" cy="13.8" r=".6" fill="currentColor"/></svg>',
  atencao: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.8 18 16.5H2z"/><path d="M10 8v3.5"/><circle cx="10" cy="14" r=".6" fill="currentColor"/></svg>',
  semsinal: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M2 7.5a12 12 0 0 1 16 0M5 10.5a8 8 0 0 1 10 0M8 13.3a4 4 0 0 1 4 0"/><path d="M3 3l14 14"/></svg>',
  ok: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="m7 10.2 2 2 4-4.4"/></svg>',
};

function textoOcorrencia(lv, nivel) {
  const v = Number.isFinite(nivel) ? `${fmtBR(nivel)} m` : "";
  if (lv === "critico") return { titulo: "atingiu o nível crítico", det: `${v} · limite ${fmtBR(CFG.thrCritico, 0)} m · acionar a geotecnia` };
  if (lv === "atencao") return { titulo: "entrou em atenção", det: `${v} · limite ${fmtBR(CFG.thrAtencao, 0)} m` };
  if (lv === "semsinal") return { titulo: "perdeu a comunicação", det: Number.isFinite(nivel) ? `última leitura ${v}` : "nenhuma leitura recebida" };
  return { titulo: "voltou à faixa normal", det: v };
}

// Chamado a cada atualização da rede: registra transições, abre/fecha incidentes e
// toca o som quando um instrumento entra em crítico. A primeira leitura de cada
// instrumento só define o estado inicial (não é uma transição).
function registrarTransicoesRede(mapa) {
  // Resposta vazia (API fora ou troca de fonte) não é transição de nenhum instrumento.
  if (!Object.keys(mapa || {}).length) { somAlarme.atualizar(false); return; }
  const agora = Date.now();
  PIEZOMETROS.forEach(pz => {
    const s = situacaoPz(mapa[pz.id]);
    const anterior = situacaoAnteriorRede[pz.id];
    situacaoAnteriorRede[pz.id] = s.lv;
    if (s.lv === "atencao" || s.lv === "critico") {
      const inc = inicioAlerta[pz.id];
      if (!inc) inicioAlerta[pz.id] = { lv: s.lv, desde: anterior ? agora : null, pico: s.nivel };
      else { inc.pico = Math.max(inc.pico, s.nivel); if (s.lv === "critico") inc.lv = "critico"; }
    } else if (s.lv === "normal") {
      delete inicioAlerta[pz.id];
    }
    if (anterior === undefined || anterior === s.lv) return;
    const lvOc = s.lv === "normal" ? (anterior === "semsinal" ? "ok-com" : "ok") : s.lv;
    const nivel = s.nivel ?? pzLatest[pz.id]?.nivel;
    const txt = lvOc === "ok-com" ? { titulo: "voltou a comunicar", det: Number.isFinite(nivel) ? `${fmtBR(nivel)} m` : "" } : textoOcorrencia(s.lv, nivel);
    if (anterior === "critico" && s.lv === "atencao") txt.titulo = "desceu do crítico para atenção";
    ocorrenciasSessao.unshift({ pz: pz.id, lv: lvOc === "ok-com" ? "ok" : lvOc, t: agora, ...txt });
    if (ocorrenciasSessao.length > 40) ocorrenciasSessao.pop();
    if (s.lv === "critico") somAlarme.novoCritico();
  });
  somAlarme.atualizar(PIEZOMETROS.some(pz => situacaoPz(mapa[pz.id]).lv === "critico"));
}

// Trocar de fonte começa uma sessão nova: nada da fonte anterior vira ocorrência.
function limparSessaoRede() {
  ocorrenciasSessao.length = 0;
  Object.keys(situacaoAnteriorRede).forEach(k => delete situacaoAnteriorRede[k]);
  Object.keys(inicioAlerta).forEach(k => delete inicioAlerta[k]);
  limparHistoricoRede();
  somAlarme.atualizar(false);
}

// Converte um registro do servidor ("⚠️ AQUASENSE PIEZÔMETRO PZ-01 — SEM SINAL\n…")
// em título curto, detalhe e cor de estado.
// A quebra de linha já chega como espaço (textoSeguro), então o título é o trecho
// em maiúsculas depois do "—" e o detalhe é o resto da mensagem.
const TITULOS_SERVIDOR = {
  "CRITICO": "Nível crítico", "CRÍTICO": "Nível crítico", "ATENCAO": "Nível em atenção", "ATENÇÃO": "Nível em atenção",
  "NORMAL": "Voltou à faixa normal", "SEM SINAL": "Sem sinal", "COMUNICAÇÃO RESTABELECIDA": "Comunicação restabelecida",
  "VARIAÇÃO RÁPIDA": "Variação rápida", "VARIAÇÃO NORMALIZADA": "Variação normalizada",
};
function ocorrenciaDoServidor(ev) {
  const texto = String(ev.evento || "");
  const depois = (texto.split("—")[1] ?? texto).trim();
  const m = depois.match(/^([A-ZÀ-Ý ]+?)(?:\s+(?=[A-ZÀ-Ý][a-zà-ÿ])|$)/);
  const chave = m ? m[1].trim() : depois;
  const detalhe = m ? depois.slice(m[0].length).trim() : "";
  let lv = "ok";
  if (/CR[IÍ]TICO/.test(chave)) lv = "critico";
  else if (chave.includes("SEM SINAL")) lv = "semsinal";
  else if (/ATEN|R[AÁ]PIDA/.test(chave)) lv = "atencao";
  const titulo = TITULOS_SERVIDOR[chave] || chave.toLowerCase().replace(/^./, c => c.toUpperCase());
  return { pz: ev.instrumento, lv, t: new Date(ev.ts).getTime(), titulo, det: detalhe || ev.acao, servidor: true };
}

function listaOcorrencias() {
  if (fonte.simulada) return ocorrenciasSessao;
  return (typeof eventosPersistidosCache !== "undefined" ? eventosPersistidosCache : []).map(ocorrenciaDoServidor);
}

function htmlOcorrencia(o, comNome = true) {
  const pz = PIEZOMETROS.find(p => p.id === o.pz);
  const quando = new Date(o.t);
  const hoje = new Date().toDateString() === quando.toDateString();
  const hora = hoje ? quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : quando.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const nome = comNome && pz ? ` ${textoHtml(pz.nome)}` : "";
  const titulo = o.servidor ? `<b>${textoHtml(o.pz)}</b>${nome} · ${textoHtml(o.titulo)}` : `<b>${textoHtml(o.pz)}</b>${nome} ${textoHtml(o.titulo)}`;
  return `<button type="button" class="oc oc-${o.lv}" data-pz="${textoHtml(o.pz)}"><span class="oc-ico">${ICONES_OCORRENCIA[o.lv] || ICONES_OCORRENCIA.ok}</span>
    <span class="oc-txt"><span class="oc-tit">${titulo}</span><span class="oc-det">${textoHtml(o.det || "")}</span></span><span class="oc-hora">${hora}</span></button>`;
}

function renderOcorrenciasRede() {
  const alvo = document.getElementById("ocorr-rede");
  if (alvo) {
    const lista = listaOcorrencias().slice(0, 7);
    const erro = !fonte.simulada && typeof eventosPersistidosErro !== "undefined" && eventosPersistidosErro && !lista.length;
    alvo.innerHTML = lista.length ? lista.map(o => htmlOcorrencia(o)).join("")
      : `<div class="vazio">${erro ? "Registros do servidor indisponíveis no momento." : fonte.simulada ? "Nenhuma ocorrência desde o início da demonstração." : "Nenhum registro no servidor."}</div>`;
  }
  const ins = document.getElementById("ocorr-ins");
  if (ins) {
    const lista = listaOcorrencias().filter(o => o.pz === pzSelecionado).slice(0, 6);
    ins.innerHTML = lista.length ? lista.map(o => htmlOcorrencia(o, false)).join("")
      : `<div class="vazio">Nenhuma ocorrência registrada para ${textoHtml(pzSelecionado)}.</div>`;
  }
}

// ── INCIDENTE ─────────────────────────────────────────────────────────────────
// Quadro no topo do instrumento quando ele está em atenção ou crítico: o que
// aconteceu, desde quando, se ainda sobe, como estão os vizinhos e o que fazer.
function renderIncidente() {
  const box = document.getElementById("incidente");
  if (!box) return;
  const d = pzLatest[pzSelecionado];
  const s = situacaoPz(d);
  if (s.lv !== "atencao" && s.lv !== "critico") { box.hidden = true; box.innerHTML = ""; return; }
  const pz = PIEZOMETROS.find(p => p.id === pzSelecionado) || { id: pzSelecionado, nome: "" };
  const inc = inicioAlerta[pz.id] || { pico: s.nivel, desde: null };
  const limite = s.lv === "critico" ? CFG.thrCritico : CFG.thrAtencao;
  const taxa = Number.isFinite(d?.taxa_m_dia) ? d.taxa_m_dia : null;
  const tendencia = taxa === null ? "sem taxa calculada" : Math.abs(taxa) < 0.05 ? "estável"
    : taxa > 0 ? `subindo ${fmtBR(taxa)} m/dia` : `descendo ${fmtBR(-taxa)} m/dia`;
  const desde = inc.desde
    ? `detectado às ${new Date(inc.desde).toLocaleTimeString("pt-BR")} (${formatUltimaLeitura(inc.desde / 1000)})`
    : "já estava nesta faixa quando o painel abriu";
  const vizinhos = PIEZOMETROS.filter(p => p.id !== pz.id).map(p => {
    const sv = situacaoPz(pzLatest[p.id]);
    const h = historicoRede[p.id];
    const var24 = Array.isArray(h) && h.length > 1 && sv.nivel !== null ? sv.nivel - h[0].v : null;
    return `<li class="st-${sv.lv}"><i></i><b>${textoHtml(p.id)}</b> ${textoHtml(p.nome)} · ${sv.lbl.toLowerCase()}${sv.nivel !== null && sv.lv !== "semsinal" ? ` · ${fmtBR(sv.nivel)} m` : ""}${var24 !== null ? ` <span>(${var24 >= 0 ? "+" : ""}${fmtBR(var24)} m em 24 h)</span>` : ""}</li>`;
  }).join("");
  const acao = s.lv === "critico"
    ? "Acionar a equipe de geotecnia responsável pela estrutura e seguir o plano de ação de emergência."
    : "Intensificar o acompanhamento e avisar o responsável técnico.";
  box.hidden = false;
  box.className = `incidente inc-${s.lv}`;
  box.innerHTML = `
    <div class="inc-cab"><span class="inc-ico">${ICONES_OCORRENCIA[s.lv]}</span>
      <div><h3>${textoHtml(pz.id)} ${s.lv === "critico" ? "em nível crítico" : "em atenção"}</h3><p>${desde}</p></div>
      ${s.lv === "critico" && somAlarme.tocando() ? '<button type="button" class="btn-export" data-silenciar>Silenciar som</button>' : ""}</div>
    <div class="inc-grade">
      <div><span class="inc-lbl">Agora</span><b>${fmtBR(s.nivel)} m</b><small>${fmtBR(s.nivel - limite)} m acima do limite de ${fmtBR(limite, 0)} m</small></div>
      <div><span class="inc-lbl">Pico desde a detecção</span><b>${fmtBR(inc.pico ?? s.nivel)} m</b><small>tendência: ${tendencia}</small></div>
      <div><span class="inc-lbl">Comunicação</span><b>${estadoComunicacao(d) === "ok" ? "Online" : "Sem sinal"}</b><small>recebido ${formatUltimaLeitura(timestampUltimaRecepcao(d))}</small></div>
      <div class="inc-viz"><span class="inc-lbl">Instrumentos vizinhos</span><ul>${vizinhos || "<li>Nenhum outro instrumento cadastrado.</li>"}</ul></div>
      <div class="inc-fazer"><span class="inc-lbl">O que fazer</span><ol>
        <li>Confirmar a leitura: tendência, vizinhos e comunicação.</li>
        <li>${acao}</li>
        <li>Registrar a ocorrência e as providências tomadas.</li></ol></div>
    </div>`;
}

// ── CARTÃO DE COMUNICAÇÃO ─────────────────────────────────────────────────────
function atualizarCartaoComunicacao() {
  const box = document.getElementById("cartao-com");
  if (!box) return;
  const d = pzLatest[pzSelecionado];
  const ts = timestampUltimaRecepcao(d);
  const ok = estadoComunicacao(d) === "ok";
  const disp = disponibilidade24h(pzSelecionado);
  const falhas = listaOcorrencias().filter(o => o.pz === pzSelecionado && o.lv === "semsinal");
  const ultimaFalha = !ok && Number.isFinite(ts) ? `em andamento · ${formatUltimaLeitura(ts)}`
    : falhas.length ? new Date(falhas[0].t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "nenhuma registrada";
  const esperadas = Math.round(86400 / CFG.intervaloEnvioSeg).toLocaleString("pt-BR");
  box.innerHTML = `
    <div class="p-cab"><h2>Comunicação</h2><div class="p-acoes"><span class="tbadge ${ok ? "tb-normal-neutro" : "tb-semsinal"}">${ok ? "Online" : "Sem sinal"}</span></div></div>
    <div class="com-topo"><b class="${ok ? "" : "off"}">${Number.isFinite(ts) ? formatUltimaLeitura(ts) : "nunca"}</b><span>${Number.isFinite(ts) ? "última recepção · " + new Date(ts * 1000).toLocaleString("pt-BR") : "nenhuma leitura recebida"}</span></div>
    <div class="lin"><span>Intervalo de envio</span><b class="m">${CFG.intervaloEnvioSeg} s</b></div>
    <div class="lin"><span>Leituras recebidas 24 h</span><b class="m">${disp ? disp.recebidas.toLocaleString("pt-BR") + " de " + esperadas : "—"}</b></div>
    <div class="lin bloco"><div><span>Disponibilidade 24 h</span><b class="m">${disp ? fmtBR(disp.pct, 1) + "%" : "—"}</b></div><div class="barra-disp${disp && disp.pct < 98 ? " baixa" : ""}"><i style="width:${disp ? disp.pct : 0}%"></i></div></div>
    <div class="lin"><span>Última falha</span><b class="m">${ultimaFalha}</b></div>
    <div class="lin"><span>Sinal da UCT</span><b class="m falta">não enviado pelo firmware</b></div>`;
}

// ── SOM DO ALARME CRÍTICO ─────────────────────────────────────────────────────
// Bipes curtos a cada 20 s enquanto houver instrumento em crítico. "Silenciar"
// cala só este alarme; um novo crítico volta a tocar. O navegador só libera
// áudio depois de um clique na página.
const somAlarme = (() => {
  let ligado = true, silenciado = false, ativo = false, timer = null, ctx = null;
  try { ligado = localStorage.getItem("aquasense-som") !== "off"; } catch { /* sem armazenamento */ }

  function contexto() {
    if (!ctx && (window.AudioContext || window.webkitAudioContext)) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function bipe() {
    const c = contexto();
    if (!c || c.state !== "running") return;
    [0, .32, .64].forEach((atraso, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "square"; o.frequency.value = i % 2 ? 660 : 880;
      g.gain.setValueAtTime(0.0001, c.currentTime + atraso);
      g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + atraso + .02);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + atraso + .22);
      o.connect(g).connect(c.destination); o.start(c.currentTime + atraso); o.stop(c.currentTime + atraso + .25);
    });
  }
  function agendar() {
    clearInterval(timer); timer = null;
    if (ativo && ligado && !silenciado) { bipe(); timer = setInterval(bipe, 20000); }
  }
  function botao() {
    const b = document.getElementById("btn-som");
    if (!b) return;
    b.setAttribute("aria-pressed", String(ligado));
    b.title = ligado ? "Som do alarme crítico ligado" : "Som do alarme crítico desligado";
    b.classList.toggle("tocando", tocando());
  }
  function tocando() { return ativo && ligado && !silenciado; }
  document.addEventListener("click", () => { const c = contexto(); if (c && c.state === "suspended") c.resume(); }, { capture: true });
  document.addEventListener("DOMContentLoaded", () => {
    botao();
    document.getElementById("btn-som")?.addEventListener("click", () => {
      ligado = !ligado;
      try { localStorage.setItem("aquasense-som", ligado ? "on" : "off"); } catch { /* só nesta aba */ }
      agendar(); botao(); renderIncidente();
    });
    document.addEventListener("click", e => {
      if (!e.target.closest("[data-silenciar]")) return;
      silenciado = true; agendar(); botao(); renderIncidente();
    });
  });
  return {
    novoCritico() { silenciado = false; if (ativo) agendar(); },
    atualizar(haCritico) {
      if (haCritico === ativo) return;
      ativo = haCritico;
      if (!ativo) silenciado = false;
      agendar(); botao();
    },
    tocando,
  };
})();

// Ponto único chamado depois de cada atualização da visão geral.
function aoAtualizarRede(mapa) {
  registrarTransicoesRede(mapa);
  renderOcorrenciasRede();
  renderIncidente();
  atualizarCartaoComunicacao();
  if (vistaAtual === "visao") { desenharGraficoRede(); desenharMapaMini("visao"); }
  if (vistaAtual === "instrumento") desenharMapaMini("ins");
}

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("pz-grid");
  grid?.addEventListener("click", e => { const tr = e.target.closest("tr[data-pz]"); if (tr) abrirInstrumento(tr.dataset.pz); });
  grid?.addEventListener("keydown", e => {
    const tr = e.target.closest("tr[data-pz]");
    if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrirInstrumento(tr.dataset.pz); }
  });
  grid?.addEventListener("mouseover", e => { const tr = e.target.closest("tr[data-pz]"); realcarPz(tr ? tr.dataset.pz : null); });
  grid?.addEventListener("mouseleave", () => realcarPz(null));
  ["ocorr-rede", "ocorr-ins"].forEach(id => document.getElementById(id)?.addEventListener("click", e => {
    const o = e.target.closest("[data-pz]");
    if (o && PIEZOMETROS.some(p => p.id === o.dataset.pz)) abrirInstrumento(o.dataset.pz);
  }));
  document.getElementById("busca-pz")?.addEventListener("input", () => atualizarVisaoGeral(pzLatest));
  document.querySelectorAll("#filtro-pz button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("#filtro-pz button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    atualizarVisaoGeral(pzLatest);
  }));
  let espera;
  window.addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(desenharGraficoRede, 120); });
});

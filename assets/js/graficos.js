// ── GRÁFICOS (CANVAS) ─────────────────────────────────────────────────────────
// Só desenho em canvas: sparkline dos mini-cards, o gráfico principal (nível e
// temperatura) com thresholds/gap/série de pico, e redrawCharts() que redesenha
// os dois gráficos principais a partir do estado atual em `charts` (estado.js).

// ── SPARKLINE ─────────────────────────────────────────────────────────────────
function drawSparkline(canvasId, data, color) {
  const cv = document.getElementById(canvasId);
  if (!cv) return;
  const W = cv.parentElement.offsetWidth || 200;
  cv.width = W; cv.height = 28;
  const c = cv.getContext("2d");
  c.clearRect(0, 0, W, 28);
  if (data.length < 2) return;
  const mn = Math.min(...data), mx = Math.max(...data);
  const range = mx - mn || 1;
  const sx = i => (i / (data.length - 1)) * W;
  const sy = v => 24 - ((v - mn) / range) * 20;
  const grad = c.createLinearGradient(0, 0, 0, 28);
  grad.addColorStop(0, color + "33");
  grad.addColorStop(1, color + "00");
  c.beginPath(); c.moveTo(sx(0), sy(data[0]));
  for (let i = 1; i < data.length; i++) c.lineTo(sx(i), sy(data[i]));
  c.lineTo(W, 28); c.lineTo(0, 28); c.closePath();
  c.fillStyle = grad; c.fill();
  c.beginPath(); c.moveTo(sx(0), sy(data[0]));
  for (let i = 1; i < data.length; i++) c.lineTo(sx(i), sy(data[i]));
  c.strokeStyle = color; c.lineWidth = 1.5; c.stroke();
}

// ── MAIN CHARTS ───────────────────────────────────────────────────────────────
function renderMainChart(canvasId, state, color, thresholds, bucketMs, maxData) {
  const cv = document.getElementById(canvasId);
  if (!cv) return;
  const wrap = cv.closest(".chart-area");
  const W = wrap ? wrap.offsetWidth : 500;
  const H = wrap ? wrap.offsetHeight : 160;
  cv.width = W; cv.height = H;
  cv.style.width = W + "px"; cv.style.height = H + "px";
  const c = cv.getContext("2d");
  const escuro = document.documentElement?.dataset.tema === "escuro";
  const texto = escuro ? "#b7c8d2" : "#454a5c";
  const { labels, data, times } = state;
  if (!data.length) { c.clearRect(0, 0, W, H); return; }

  // P1 — timestamps normalizados em ms (state.times mistura ISO string dos pushes ao vivo
  // e number ms dos pontos carregados do histórico) para detectar gaps entre pontos.
  const tms = (times || []).map(t => (typeof t === "number" ? t : new Date(t).getTime()));
  const isGap = i => (
    bucketMs && Number.isFinite(tms[i]) && Number.isFinite(tms[i - 1]) &&
    (tms[i] - tms[i - 1]) > 2 * bucketMs
  );

  const PAD = { top: 10, right: 16, bottom: 28, left: 46 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  let mn = Math.min(...data) - 1;
  let mx = Math.max(...data) + 1;
  // P5 — o eixo Y precisa acomodar o pico do intervalo, não só a média
  if (maxData && maxData.length) {
    const validMax = maxData.filter(Number.isFinite);
    if (validMax.length) mx = Math.max(mx, Math.max(...validMax) + 1);
  }
  if (thresholds) {
    const tvs = thresholds.map(t => t.v);
    mn = Math.min(mn, Math.min(...tvs) - 2);
    mx = Math.max(mx, Math.max(...tvs) + 2);
  }
  const sy = v => PAD.top + ch - ((v - mn) / (mx - mn)) * ch;
  const span = tms[tms.length - 1] - tms[0];
  const tempoValido = tms.length === data.length && tms.every((t, i) => Number.isFinite(t) && (!i || t >= tms[i - 1])) && span > 0;
  const sx = i => PAD.left + (tempoValido ? (tms[i] - tms[0]) / span : i / Math.max(data.length - 1, 1)) * cw;

  c.clearRect(0, 0, W, H);

  // Grid
  for (let i = 0; i <= 4; i++) {
    const v = mn + (mx - mn) * (i / 4);
    const y = sy(v);
    c.strokeStyle = escuro ? "rgba(170,195,210,.2)" : "rgba(105,128,143,.18)"; c.lineWidth = 1; c.setLineDash([]);
    c.beginPath(); c.moveTo(PAD.left, y); c.lineTo(PAD.left + cw, y); c.stroke();
    c.fillStyle = texto; c.font = "11px 'IBM Plex Mono'"; c.textAlign = "right";
    c.fillText(v.toFixed(1), PAD.left - 4, y + 3);
  }

  // Thresholds
  if (thresholds) {
    thresholds.forEach(({ v, col, lbl }) => {
      const y = sy(v);
      c.save(); c.strokeStyle = col; c.setLineDash([4, 4]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(PAD.left, y); c.lineTo(PAD.left + cw, y); c.stroke();
      c.fillStyle = col; c.font = "11px 'IBM Plex Mono'"; c.textAlign = "left";
      c.fillText(lbl, PAD.left + 6, y - 5); c.restore();
    });
  }

  if (data.length === 1) {
    c.beginPath(); c.arc(sx(0), sy(data[0]), 4, 0, Math.PI * 2);
    c.fillStyle = color; c.fill(); return;
  }

  // Linha — P1: gap visível (moveTo) em vez de ligar pontos separados por um intervalo
  // grande demais (> 2×bucketMs) — dado ausente nunca é interpolado silenciosamente.
  c.beginPath(); c.moveTo(sx(0), sy(data[0]));
  for (let i = 1; i < data.length; i++) {
    const x0 = sx(i-1), y0 = sy(data[i-1]), x1 = sx(i), y1 = sy(data[i]);
    if (isGap(i)) { c.moveTo(x1, y1); continue; }
    c.lineTo(x1, y1);
  }
  c.strokeStyle = color; c.lineWidth = 1.5; c.setLineDash([]); c.stroke();

  // P5 — série do máximo do intervalo: linha fina tracejada, cor mais clara da mesma família,
  // desenhada ao lado da média (nunca escondida) — mesma regra de gap da linha principal.
  if (maxData && maxData.length === data.length) {
    c.save();
    c.strokeStyle = color + "80";
    c.lineWidth = 1;
    c.setLineDash([3, 3]);
    c.beginPath();
    let started = false;
    for (let i = 0; i < maxData.length; i++) {
      if (!Number.isFinite(maxData[i])) { started = false; continue; }
      const x = sx(i), y = sy(maxData[i]);
      if (!started || isGap(i)) { c.moveTo(x, y); started = true; }
      else c.lineTo(x, y);
    }
    c.stroke();
    c.restore();
  }

  // Labels X
  c.fillStyle = texto; c.font = "11px 'IBM Plex Mono'"; c.textAlign = "center";
  const step = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(cw / 120))));
  for (let i = 0; i < labels.length; i += step)
    c.fillText(tempoValido && span >= 86400000
      ? new Date(tms[i]).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + labels[i]
      : labels[i], sx(i), H - 6);

  // Último ponto
  const lx = sx(data.length-1), ly = sy(data[data.length-1]);
  c.beginPath(); c.arc(lx, ly, 5, 0, Math.PI*2); c.fillStyle = color; c.fill();
  c.fillStyle = texto; c.font = "11px 'IBM Plex Mono'"; c.textAlign = "right";
  c.fillText(data[data.length-1].toFixed(2), lx - 10, ly - 9);
}

function redrawCharts() {
  const bucketMs = Number.isFinite(histPontos.bucketSeg) && histPontos.bucketSeg > 0
    ? histPontos.bucketSeg * 1000 : (PERIODOS[periodoSelecionado] || {}).bucketMs;
  const escuro = document.documentElement?.dataset.tema === "escuro";
  renderMainChart("chart-n", charts.n, escuro ? "#65c5be" : "#237b83", [
    { v: CFG.thrCritico, col: escuro ? "#ff858a" : "rgba(189,53,60,.85)",  lbl: `${CFG.thrCritico} m crítico` },
    { v: CFG.thrAtencao, col: escuro ? "#f0c66a" : "rgba(147,98,0,.85)", lbl: `${CFG.thrAtencao} m atenção` },
  ], bucketMs, charts.n.maxData);
  renderMainChart("chart-t", charts.t, "#7e8ba3", null, bucketMs);
}

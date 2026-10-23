// Escapa valores dinâmicos nas estruturas HTML legadas.
function textoHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

﻿// ── PAINÉIS (DOM) ─────────────────────────────────────────────────────────────
// Renderização de DOM que não é canvas: cards da visão geral, mapa Leaflet,
// painel de nível de alerta (com/sem sinal), taxa de variação, tabelas de
// alarmes/eventos/leituras, stats/labels de período e status da barra superior.

// ── STATS ─────────────────────────────────────────────────────────────────────
function updateStats(key, arr) {
  if (!arr.length) return;
  stats[key].min = Math.min(...arr);
  stats[key].max = Math.max(...arr);
  const delta = stats[key].max - stats[key].min;
  const fmt = v => v !== null ? v.toFixed(2) : "···";
  document.getElementById(key + "-min").textContent = fmt(stats[key].min);
  document.getElementById(key + "-max").textContent = fmt(stats[key].max);
  const dEl = document.getElementById(key + "-delta");
  dEl.textContent = (delta >= 0 ? "+" : "") + delta.toFixed(2);
  // Para o nível d'água, variação grande é sinal de risco (vermelho)
  dEl.className = "mstat-val " + (delta > 1 ? (key === "n" ? "down" : "up") : "");
}

// Atualiza os rótulos "Faixa" e "Mín/Máx" conforme o período selecionado
function updatePeriodLabels() {
  const lbl = PERIODOS[periodoSelecionado].label;
  document.querySelectorAll(".lbl-faixa").forEach(el => el.textContent = "Faixa " + lbl);
  document.querySelectorAll(".lbl-min").forEach(el => el.textContent = "Mín " + lbl);
  document.querySelectorAll(".lbl-max").forEach(el => el.textContent = "Máx " + lbl);
}

// ── ALERTA ────────────────────────────────────────────────────────────────────
// Folga até os limites, exibida nos indicadores do instrumento selecionado.
function definirFolga(nivel) {
  const definir = (id, limite) => {
    const val = document.getElementById(id), det = document.getElementById(id + "-det");
    const tile = document.getElementById(id === "n-folga-at" ? "tile-folga-at" : "tile-folga-cr");
    if (det) det.textContent = `limite ${limite.toLocaleString("pt-BR")} m`;
    if (!val) return;
    if (!Number.isFinite(nivel)) { val.innerHTML = "—"; tile?.classList.remove("acima"); return; }
    const folga = limite - nivel;
    val.innerHTML = folga > 0
      ? `${folga.toFixed(2)}<small>m</small>`
      : `+${(-folga).toFixed(2)}<small>m acima</small>`;
    tile?.classList.toggle("acima", folga <= 0);
    tile?.classList.toggle("cr", folga <= 0 && id === "n-folga-cr");
  };
  definir("n-folga-at", CFG.thrAtencao);
  definir("n-folga-cr", CFG.thrCritico);
}

// Lógica de piezômetro: nível d'água ALTO = perigo (saturação do maciço)
function setAlert(n) {
  // P4 — histerese na borda: mesma regra vale para o selo exibido (não pisca)
  // e para a decisão de registrar uma nova ocorrência abaixo.
  const { lv, lbl } = classifyComHisterese(n, lastLevel);
  const upperLbl = { normal: "NORMAL", atencao: "ATENÇÃO", critico: "CRÍTICO" }[lv];

  // P6/ISA-101: estado normal em tons neutros — cor saturada SÓ na anormalidade.
  const bn = document.getElementById("badge-n");
  const vn = document.getElementById("val-n");
  if (bn) { bn.className = lv === "normal" ? "tbadge tb-normal-neutro" : `tbadge tb-${lv}`; bn.textContent = lbl; }
  if (vn) vn.className = { normal: "cv-neutral", atencao: "cv-yellow", critico: "cv-red" }[lv];
  const det = document.getElementById("val-n-det");
  if (det) det.textContent = lv === "normal" ? "leitura atual · dentro da faixa normal"
    : lv === "atencao" ? `leitura atual · acima de ${CFG.thrAtencao} m` : `leitura atual · acima de ${CFG.thrCritico} m`;
  definirFolga(n);

  if (typeof atualizarTuboInstrumento === "function") atualizarTuboInstrumento(n, lv, true);

  if (lv !== lastLevel) {
    addAlertRow(lv, upperLbl, n);
    lastLevel = lv;
  }
}

// P1 — instrumento selecionado sem sinal: estado neutro (nunca NORMAL/ATENÇÃO/CRÍTICO
// com dado ausente) e NÃO mexe em lastLevel — a transição de nível não é avaliada
// com dado stale (retoma do zero quando a comunicação voltar).
function setAlertSemSinal(ts) {
  const temTs = Number.isFinite(ts);
  const bn = document.getElementById("badge-n");
  if (bn) { bn.className = "tbadge tb-semsinal"; bn.textContent = "Sem sinal"; }
  const vn = document.getElementById("val-n");
  if (vn) vn.className = "cv-neutral";
  const det = document.getElementById("val-n-det");
  if (det) det.textContent = temTs
    ? `última leitura conhecida · ${formatUltimaLeitura(ts)} · não confirmada`
    : "nenhuma leitura recebida";
  definirFolga(null);
  // O tubo mantém o último nível conhecido, em cinza; sem recepção alguma, fica vazio.
  if (typeof atualizarTuboInstrumento === "function") {
    const ultimoNivel = temTs && typeof pzLatest !== "undefined" ? pzLatest[pzSelecionado]?.nivel : null;
    atualizarTuboInstrumento(ultimoNivel, "semsinal");
  }
}

function addAlertRow(lv, lbl, nivel) {
  const t = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const msgs = {
    normal:  "Nível d'água retornou à faixa normal",
    atencao: "Nível d'água em faixa de atenção",
    critico: "ALERTA: nível d'água crítico detectado",
  };
  const colors = { normal: "#8a94ad", atencao: "#f0c040", critico: "#f04848", info: "#4da8f0" };
  const msg = (msgs[lv] || lbl) + ` (${pzSelecionado})` + (fonte.simulada ? " (simulação)" : "");
  pushHistorico({ lv, lbl, msg, pz: pzSelecionado, nivel: Number.isFinite(nivel) ? nivel.toFixed(2) : "···", time: t, color: colors[lv] || colors.info });
}

function addInfoRow(msg) {
  const t = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  pushHistorico({ lv: "info", lbl: "INFO", msg, nivel: "···", time: t, color: "#4da8f0" });
}

// P3+P4 — alarme de variação rápida: dispara só na borda (transição parado→rápido), com
// a ação "investigar tendência". Ver lastTaxaRapidaState, atualizado em applyData().
function addTaxaRow(taxa) {
  const t = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const sinal = taxa >= 0 ? "+" : "";
  const msg = `📈 Variação rápida do nível d'água (${sinal}${taxa.toFixed(2)} m/dia) · ${pzSelecionado}`;
  pushHistorico({ lv: "taxa", lbl: "TAXA", msg, nivel: "···", time: t, color: corPorStatus("atencao") });
}

// Idade de comunicação é a hora em que o servidor recebeu a amostra. `ts` é
// somente fallback para dados legados e pode refletir um relógio de instrumento errado.
function timestampUltimaRecepcao(leitura) {
  if (Number.isFinite(leitura?.recebidoEm)) return leitura.recebidoEm;
  return leitura?.ts;
}

// P1 — evento de transição de comunicação (ok↔stale) de QUALQUER piezômetro monitorado
// (não só o selecionado); dedupe: só dispara na transição, guardando o estado anterior
// por pz em `pzComm`. "stale" é ALARME (exige verificar instrumento); "ok" é EVENTO
// (comunicação restabelecida — confirmação pontual, cor verde reservada a isso).
function addComunicacaoRow(pzId, estado, recebidoEm) {
  const t = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (estado === "stale") {
    const hhmm = Number.isFinite(recebidoEm)
      ? new Date(recebidoEm * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "···";
    pushHistorico({
      lv: "semsinal", lbl: "SEM SINAL",
      msg: `⚠️ ${pzId} sem sinal (última leitura ${hhmm})`,
      nivel: "···", time: t, color: corPorStatus("semsinal"),
    });
  } else {
    pushHistorico({
      lv: "info", lbl: "INFO",
      msg: `Comunicação restabelecida (${pzId})`,
      nivel: "···", time: t, color: corPorStatus("info"),
    });
  }
}

// Confere o estado de comunicação de TODOS os piezômetros monitorados e dispara
// addComunicacaoRow() só nas transições reais (dedupe via `pzComm`). Chamado a cada poll.
function checarTransicoesComunicacao(mapa) {
  PIEZOMETROS.forEach(pz => {
    const leitura = mapa[pz.id];
    const estadoAtual = estadoComunicacao(leitura);
    const estadoAnterior = pzComm[pz.id];
    if (estadoAnterior !== undefined && estadoAnterior !== estadoAtual) {
      addComunicacaoRow(pz.id, estadoAtual, timestampUltimaRecepcao(leitura));
    }
    pzComm[pz.id] = estadoAtual;
  });
}

function linhaHistorico(e, colBadgeLbl) {
  return `
    <tr>
      <td class="td-dot"><span class="ev-dot-sm" style="background:${e.color}"></span></td>
      <td class="td-msg">${textoHtml(e.msg)}</td>
      <td class="td-val">${textoHtml(e.nivel)} m</td>
      <td class="td-badge"><span class="tbadge tb-${e.lv}">${textoHtml(colBadgeLbl)}</span></td>
      <td class="td-time">${textoHtml(e.time)}</td>
    </tr>`;
}

function renderAlarmesTable() {
  const tbody = document.getElementById("alarm-tbody");
  const countEl = document.getElementById("alarm-count");
  if (countEl) countEl.textContent = `${alarmes.length} alarme${alarmes.length !== 1 ? "s" : ""}`;
  if (!tbody) return;
  if (!alarmes.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--text-3);text-align:center;padding:16px">Nenhuma ocorrência nesta sessão</td></tr>`;
    return;
  }
  // Coluna "Ação" mostra a ação esperada (ACOES), não o rótulo de status
  tbody.innerHTML = alarmes.map(e => linhaHistorico(e, e.acao || e.lbl)).join("");
}

function renderEventosTable() {
  const tbody = document.getElementById("ev-tbody");
  const countEl = document.getElementById("ev-count");
  if (countEl) countEl.textContent = `${eventos.length} evento${eventos.length !== 1 ? "s" : ""}`;
  if (!tbody) return;
  if (!eventos.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--text-3);text-align:center;padding:16px">Nenhum evento registrado</td></tr>`;
    return;
  }
  tbody.innerHTML = eventos.map(e => linhaHistorico(e, e.lbl)).join("");
}

function renderTable() {
  renderAlarmesTable();
  renderEventosTable();
}

function renderReadingsTable() {
  const tbody = document.getElementById("readings-tbody");
  if (!tbody) return;
  if (!readingsHistory.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--text-3);text-align:center;padding:16px">Nenhuma leitura no período.</td></tr>`;
    return;
  }
  tbody.innerHTML = readingsHistory.map(r => `
    <tr>
      <td class="td-time">${r.time}</td>
      <td class="td-val">${r.nivel.toFixed(2)} m</td>
      <td class="td-badge"><span class="tbadge tb-${r.lv}">${r.lbl}</span></td>
    </tr>`).join("");
}

// ── VISÃO GERAL DOS PIEZÔMETROS ───────────────────────────────────────────────
// Tabela ordenada por prioridade (crítico, atenção, sem sinal, normal): o que pede
// ação aparece primeiro. Cada linha traz o nível sobre a escala com os limites, a
// folga até a atenção, a tendência de 24 h, a taxa, a recepção e a disponibilidade.
const PRIORIDADE = { critico: 0, atencao: 1, semsinal: 2, normal: 3 };
const cartaoAnterior = {}; // por pz: { lv, ts } — destaca mudança de faixa e leitura nova

// Situação de um instrumento a partir da última leitura: nunca "normal" sem dado recente.
function situacaoPz(d) {
  const nivel = d && Number.isFinite(d.nivel) ? d.nivel : null;
  if (estadoComunicacao(d) === "stale" || nivel === null) return { lv: "semsinal", lbl: "Sem sinal", nivel };
  return { ...classifyNivel(nivel), nivel };
}

function filtroVisaoGeral() {
  const ativo = typeof document.querySelector === "function" ? document.querySelector("#filtro-pz [aria-pressed='true']") : null;
  const busca = document.getElementById("busca-pz");
  return { filtro: ativo ? ativo.dataset.f : "todos", busca: busca && typeof busca.value === "string" ? busca.value.trim().toLowerCase() : "" };
}

function linhaInstrumento(pz, d, s) {
  const semSinal = s.lv === "semsinal";
  const ultimaRecepcao = timestampUltimaRecepcao(d);
  const anterior = cartaoAnterior[pz.id];
  const mudou = anterior && anterior.lv !== s.lv ? " mudou" : "";
  const leituraNova = !semSinal && anterior && Number.isFinite(ultimaRecepcao) && anterior.ts !== ultimaRecepcao;
  cartaoAnterior[pz.id] = { lv: s.lv, ts: ultimaRecepcao };
  const temRede = typeof historicoRede !== "undefined";
  const hist = temRede ? historicoRede[pz.id] : undefined;
  const ref24 = Array.isArray(hist) && hist.length ? hist[0].v : null;
  const local = typeof cadastroDe === "function" ? cadastroDe(pz.id).local : "";
  const selo = s.lv === "normal" ? "tbadge tb-normal-neutro" : `tbadge tb-${s.lv}`;
  const valor = s.nivel !== null ? `${s.nivel.toFixed(2)}<small>m</small>` : "···";
  const indicador = typeof bulletSvg === "function" ? bulletSvg(s.nivel, s.lv, ref24) : "";

  // P1 — leitura ausente/stale nunca aparece como normal: selo "SEM SINAL", valor
  // esmaecido e "última leitura há X min" (nunca vermelho nem verde).
  let folga;
  if (semSinal) folga = `<span class="folga">—<small>leitura não confirmada</small></span>`;
  else {
    const fa = CFG.thrAtencao - s.nivel, fc = CFG.thrCritico - s.nivel;
    if (fa > 0) folga = `<span class="folga">${fa.toFixed(2)} m<small>${fc.toFixed(2)} m até crítico</small></span>`;
    else if (fc > 0) folga = `<span class="folga at">+${(-fa).toFixed(2)} m acima<small>${fc.toFixed(2)} m até crítico</small></span>`;
    else folga = `<span class="folga cr">+${(-fc).toFixed(2)} m acima<small>do limite crítico</small></span>`;
  }
  // P3 — taxa só com comunicação recente; destaque quando |taxa| > limiar.
  const taxa = !semSinal && d && Number.isFinite(d.taxa_m_dia) ? d.taxa_m_dia : null;
  const taxaRapida = taxa !== null && Math.abs(taxa) > CFG.taxaMaxMDia;
  const taxaHtml = taxa === null ? "—" : `${taxaRapida ? "↗ " : ""}${taxa >= 0 ? "+" : ""}${taxa.toFixed(2)}`;
  const recepcao = semSinal
    ? (Number.isFinite(ultimaRecepcao) ? `última leitura ${formatUltimaLeitura(ultimaRecepcao)}` : "nenhuma leitura recebida")
    : `recebido ${formatUltimaLeitura(ultimaRecepcao)}`;
  const disp = typeof disponibilidade24h === "function" ? disponibilidade24h(pz.id) : null;
  const dispHtml = disp
    ? `<span class="disp${disp.pct < 98 ? " baixa" : ""}"><span class="trilho"><i style="width:${disp.pct.toFixed(1)}%"></i></span>${disp.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>`
    : `<span class="disp">—</span>`;
  return `
    <tr class="lin-${s.lv}${pz.id === pzSelecionado ? " selecionado" : ""}${mudou}" data-pz="${textoHtml(pz.id)}" tabindex="0" aria-label="${textoHtml(pz.id)} ${textoHtml(pz.nome)}: ${s.lbl}">
      <td><span class="${selo}">${s.lbl}</span></td>
      <td><span class="idn"><span class="id">${textoHtml(pz.id)}</span><span class="nm">${textoHtml(pz.nome)}</span>${local ? `<span class="lc">${textoHtml(local)}</span>` : ""}</span></td>
      <td><span class="nivel"><span class="v${semSinal ? " valor-esmaecido" : ""}">${valor}</span>${indicador}</span></td>
      <td>${folga}</td>
      <td class="spark">${typeof sparkSvg === "function" ? sparkSvg(hist, s.lv) : ""}</td>
      <td class="d"><span class="taxa${taxaRapida ? " rapida" : ""}"${taxaRapida ? ' title="Variação rápida: investigar"' : ""}>${taxaHtml}</span>${taxa === null ? "" : "<small>m/dia</small>"}</td>
      <td><span class="rec${semSinal ? " off" : ""}"><span class="sinal" aria-hidden="true"><i></i><i></i><i></i></span>${recepcao}</span>${leituraNova ? '<span class="recebe pulso" aria-hidden="true"></span>' : ""}</td>
      <td>${dispHtml}</td>
      <td class="seta" aria-hidden="true">›</td>
    </tr>`;
}

function atualizarVisaoGeral(mapa) {
  const grid = document.getElementById("pz-grid");
  if (!grid) return;
  const ordem = PIEZOMETROS.map((pz, i) => ({ pz, i, d: mapa[pz.id], s: situacaoPz(mapa[pz.id]) }))
    .sort((a, b) => PRIORIDADE[a.s.lv] - PRIORIDADE[b.s.lv] || a.i - b.i);
  const { filtro, busca } = filtroVisaoGeral();
  const visiveis = ordem.filter(({ pz, s }) => {
    if (filtro === "alerta" && s.lv !== "atencao" && s.lv !== "critico") return false;
    if (filtro === "semsinal" && s.lv !== "semsinal") return false;
    return !busca || `${pz.id} ${pz.nome}`.toLowerCase().includes(busca);
  });
  grid.innerHTML = visiveis.length
    ? visiveis.map(({ pz, d, s }) => linhaInstrumento(pz, d, s)).join("")
    : `<tr><td colspan="9" class="vazio">Nenhum instrumento neste filtro.</td></tr>`;

  const emAlerta = ordem.filter(o => o.s.lv === "atencao" || o.s.lv === "critico").length;
  const sub = document.getElementById("tab-sub");
  if (sub) sub.textContent = `${PIEZOMETROS.length} cadastrados · ${emAlerta ? emAlerta + " em alerta" : "nenhum em alerta"}`;
  const escala = document.getElementById("tab-escala");
  if (escala && typeof escalaNivel === "function") escala.textContent = `(0–${escalaNivel()} m)`;
  if (typeof atualizarResumoRede === "function") atualizarResumoRede(mapa);
  if (typeof aoAtualizarRede === "function") aoAtualizarRede(mapa);
}

// ── MAPA ──────────────────────────────────────────────────────────────────────
// Aba própria: satélite ou mapa de ruas, marcador com a cor e o valor de cada
// instrumento e lista lateral ordenada por prioridade.
const camadasMapa = {};

function initMap() {
  const mapEl = document.getElementById("pz-map");
  if (!mapEl) return;
  if (typeof L === "undefined") {
    mapEl.innerHTML = '<div class="map-fallback">Mapa indisponível (sem conexão ao CDN)</div>';
    return;
  }
  try {
    const centerLat = PIEZOMETROS.reduce((s, p) => s + p.lat, 0) / PIEZOMETROS.length;
    const centerLng = PIEZOMETROS.reduce((s, p) => s + p.lng, 0) / PIEZOMETROS.length;
    leafletMap = L.map(mapEl, { zoomControl: true }).setView([centerLat, centerLng], 15);
    leafletMap.zoomControl.setPosition("topright");
    camadasMapa.satelite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      // Acima do zoom 17 a Esri não tem foto desta região e devolve o ladrilho
      // "Map data not yet available"; amplia o zoom 17 em vez de pedir esse ladrilho.
      maxZoom: 19, maxNativeZoom: 17, attribution: "Imagens &copy; Esri, Maxar, Earthstar Geographics",
    });
    camadasMapa.ruas = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
    });
    camadasMapa.satelite.addTo(leafletMap);
    document.querySelectorAll(".mapa-camadas button").forEach(botao => botao.addEventListener("click", () => {
      document.querySelectorAll(".mapa-camadas button").forEach(b => b.setAttribute("aria-pressed", String(b === botao)));
      Object.values(camadasMapa).forEach(c => leafletMap.removeLayer(c));
      camadasMapa[botao.dataset.camada].addTo(leafletMap);
    }));

    PIEZOMETROS.forEach(pz => {
      const marker = L.marker([pz.lat, pz.lng], {
        icon: L.divIcon({ className: "", iconSize: [0, 0],
          html: `<div class="mk"><span class="mk-anel"></span><span class="mk-dot"></span><span class="mk-rot">${textoHtml(pz.id)}<em></em></span></div>` }),
      }).addTo(leafletMap);
      marker.bindPopup("", { closeButton: false, offset: [0, -8] });
      marker.on("click", () => selectPiezometro(pz.id));
      pzMarkers[pz.id] = marker;
    });
    // Botão "Abrir instrumento" do balão do mapa.
    mapEl.addEventListener("click", event => {
      const botao = event.target.closest("[data-abrir-pz]");
      if (!botao) return;
      selectPiezometro(botao.dataset.abrirPz);
      if (typeof irParaVista === "function") irParaVista("instrumento");
    });
    atualizarMapa(pzLatest);
  } catch (e) {
    console.warn("Leaflet:", e.message);
    mapEl.innerHTML = '<div class="map-fallback">Mapa indisponível (sem conexão ao CDN)</div>';
    leafletMap = null;
  }
}

// Enquadra todos os instrumentos, deixando livre o espaço da lista lateral.
function enquadrarMapa() {
  if (!leafletMap || !PIEZOMETROS.length) return;
  const largo = window.innerWidth > 860;
  leafletMap.fitBounds(L.latLngBounds(PIEZOMETROS.map(p => [p.lat, p.lng])), {
    paddingTopLeft: [largo ? 340 : 30, 60], paddingBottomRight: [150, largo ? 40 : 260], maxZoom: 17,
  });
}

function popupMapa(pz, s, d) {
  const ts = timestampUltimaRecepcao(d);
  const badge = s.lv === "normal" ? "tbadge tb-normal-neutro" : `tbadge tb-${s.lv}`;
  const quando = Number.isFinite(ts) ? `${s.lv === "semsinal" ? "Última leitura" : "Recebido"} ${formatUltimaLeitura(ts)}` : "Nenhuma leitura recebida";
  return `<div class="pop"><span class="${badge}">${s.lbl}</span><h3>${textoHtml(pz.id)} · ${textoHtml(pz.nome)}</h3>
    <div class="pv">${s.nivel !== null ? s.nivel.toFixed(2) + " m" : "···"}</div><p>${quando}</p>
    <button type="button" data-abrir-pz="${textoHtml(pz.id)}">Abrir instrumento</button></div>`;
}

function atualizarMapa(mapa) {
  const lista = document.getElementById("mapa-lista");
  const ordem = PIEZOMETROS.map((pz, i) => ({ pz, i, d: mapa[pz.id], s: situacaoPz(mapa[pz.id]) }))
    .sort((a, b) => PRIORIDADE[a.s.lv] - PRIORIDADE[b.s.lv] || a.i - b.i);
  if (lista) {
    lista.innerHTML = ordem.map(({ pz, d, s }) => {
      const ts = timestampUltimaRecepcao(d);
      return `<button type="button" class="ml-item st-${s.lv}${pz.id === pzSelecionado ? " sel" : ""}" data-pz="${textoHtml(pz.id)}">
        <span class="pt"></span><span class="nm">${textoHtml(pz.id)} · ${textoHtml(pz.nome)}<small>${s.lbl} · ${Number.isFinite(ts) ? formatUltimaLeitura(ts) : "sem leituras"}</small></span>
        <span class="vl">${s.nivel !== null ? s.nivel.toFixed(2) : "···"}</span></button>`;
    }).join("");
    lista.querySelectorAll(".ml-item").forEach(b => b.addEventListener("click", () => {
      const pz = PIEZOMETROS.find(p => p.id === b.dataset.pz);
      selectPiezometro(pz.id);
      if (leafletMap) {
        leafletMap.flyTo([pz.lat, pz.lng], 17, { duration: typeof reduzMovimento !== "undefined" && reduzMovimento ? 0 : .9 });
        pzMarkers[pz.id]?.openPopup();
      }
    }));
    const semSinal = ordem.filter(o => o.s.lv === "semsinal").length;
    const resumo = document.getElementById("mapa-resumo");
    if (resumo) resumo.textContent = `${PIEZOMETROS.length - semSinal} de ${PIEZOMETROS.length} comunicando · toque para localizar`;
  }
  if (typeof L === "undefined" || !leafletMap) return;
  ordem.forEach(({ pz, d, s }) => {
    const marker = pzMarkers[pz.id];
    if (!marker) return;
    const el = marker.getElement && marker.getElement();
    const mk = el && el.querySelector(".mk");
    if (mk) {
      mk.className = `mk st-${s.lv}${pz.id === pzSelecionado ? " sel" : ""}`;
      mk.querySelector("em").textContent = s.nivel !== null ? s.nivel.toFixed(2) + " m" : "···";
      el.style.zIndex = String(1000 - PRIORIDADE[s.lv] * 10);
    }
    // Atualiza o balão só quando o texto muda e sem autoPan: com o balão aberto, o
    // autoPan a cada consulta (10 s) puxava o mapa de volta enquanto o usuário arrastava.
    const html = popupMapa(pz, s, d);
    const popup = marker.getPopup();
    if (popup && popup.getContent() !== html) {
      const autoPan = popup.options.autoPan;
      popup.options.autoPan = false;
      popup.setContent(html);
      popup.options.autoPan = autoPan;
    }
  });
}

function updatePzLabels() {
  const pz = PIEZOMETROS.find(p => p.id === pzSelecionado);
  const dl = document.getElementById("pz-detail-label");
  if (dl) dl.textContent = pz ? pz.nome : pzSelecionado;
  const cod = document.getElementById("i-codigo");
  if (cod) cod.textContent = pzSelecionado;
  const rt = document.getElementById("pz-tag-readings");
  if (rt) rt.textContent = pzSelecionado;
  if (typeof atualizarSeletoresPz === "function") atualizarSeletoresPz();
  if (typeof renderCartaoCadastro === "function") renderCartaoCadastro();
  if (typeof atualizarTituloVista === "function") atualizarTituloVista();
}

// ── TAXA DE VARIAÇÃO (P3) ─────────────────────────────────────────────────────
// Exibe taxa_m_dia no stat "TAXA" do card de nível; destaca em âmbar quando
// |taxa| > CFG.taxaMaxMDia (ref. ASDSO: >0,1 m/dia já é gatilho de investigação).
function renderTaxa(taxa) {
  const el = document.getElementById("n-taxa");
  if (!el) return;
  if (!Number.isFinite(taxa)) {
    el.textContent = "—";
    el.className = "tile-val mstat-val";
    el.removeAttribute("title");
    return;
  }
  const sinal = taxa >= 0 ? "+" : "";
  const rapida = Math.abs(taxa) > CFG.taxaMaxMDia;
  el.innerHTML = `${rapida ? "↗ " : ""}${sinal}${taxa.toFixed(2)}<small>m/dia</small>`;
  el.className = "tile-val mstat-val" + (rapida ? " warn" : "");
  const det = document.getElementById("n-taxa-det");
  if (det) det.textContent = rapida ? `acima de ${CFG.taxaMaxMDia} m/dia · investigar` : `limite ${CFG.taxaMaxMDia} m/dia`;
  if (rapida) el.title = "Variação rápida: investigar (limiar definido na configuração do projeto)";
  else el.removeAttribute("title");
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function setStatus(type, msg) {
  document.getElementById("sdot").className = "sdot " + { live: "s-ok", sim: "s-sim", err: "s-err" }[type];
  document.getElementById("stext").textContent = msg;
}

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

// Atualiza os rótulos "Mín/Máx" dos cartões conforme o período selecionado
function updatePeriodLabels() {
  const lbl = PERIODOS[periodoSelecionado].label;
  document.querySelectorAll(".lbl-min").forEach(el => el.textContent = "Mín " + lbl);
  document.querySelectorAll(".lbl-max").forEach(el => el.textContent = "Máx " + lbl);
  const tt = document.getElementById("temp-period-tag");
  if (tt) tt.textContent = lbl;
}

// ── ALERTA ────────────────────────────────────────────────────────────────────
// Lógica de piezômetro: nível d'água ALTO = perigo (saturação do maciço)
function setAlert(n) {
  // P4 — histerese na borda: mesma regra vale para o badge/faixa exibida (não pisca)
  // e para a decisão de registrar uma nova linha de alarme/evento abaixo.
  const { lv } = classifyComHisterese(n, lastLevel);
  let desc, icon;
  if (lv === "normal") {
    desc = `Nível dentro da faixa esperada. Acompanhamento de rotina pelo painel.`;
    // P6 — ícone neutro no estado normal (cor reservada a anormalidade, ISA-101)
    icon = `<circle cx="8" cy="8" r="5.5" stroke="#7c8196" stroke-width="1.5"/><path d="M5.5 8l2 2 3.5-3.5" stroke="#7c8196" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (lv === "atencao") {
    desc = `Nível entre ${CFG.thrAtencao} e ${CFG.thrCritico} m: observar de perto e intensificar o monitoramento`;
    icon = `<path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="#f0c040" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.5V9.5" stroke="#f0c040" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.5" r=".75" fill="#f0c040"/>`;
  } else {
    desc = `Faixa crítica configurada: verificar a leitura e seguir o procedimento definido pelo responsável.`;
    icon = `<circle cx="8" cy="8" r="5.5" stroke="#f04848" stroke-width="1.5"/><path d="M8 5v3.5" stroke="#f04848" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11" r=".75" fill="#f04848"/>`;
  }
  const upperLbl = { normal: "NORMAL", atencao: "ATENÇÃO", critico: "CRÍTICO" }[lv];

  const bn = document.getElementById("badge-n");
  const vn = document.getElementById("val-n");
  // P6/ISA-101: estado normal em tons neutros — número branco, badge cinza;
  // cor saturada aparece SÓ quando há anormalidade (atenção/crítico).
  if (lv === "normal")  { bn.className = "mbadge";           bn.textContent = "Normal";  vn.className = "cv-neutral"; }
  if (lv === "atencao") { bn.className = "mbadge mb-yellow"; bn.textContent = "Atenção"; vn.className = "cv-yellow"; }
  if (lv === "critico") { bn.className = "mbadge mb-red";    bn.textContent = "Crítico"; vn.className = "cv-red"; }

  document.getElementById("abox").className   = `alert-level-box alb-${lv}`;
  document.getElementById("aicon").className  = `al-icon ali-${lv}`;
  document.getElementById("asvg").innerHTML   = icon;
  document.getElementById("astate").className = `al-state al-${lv}`;
  document.getElementById("astate").textContent = upperLbl;
  document.getElementById("adesc").textContent  = desc;
  document.getElementById("tby").className = lv !== "normal"  ? "tb-seg tb-yellow on" : "tb-seg tb-yellow";
  document.getElementById("tbr").className = lv === "critico" ? "tb-seg tb-red on"    : "tb-seg tb-red";
  document.getElementById("ainfo").textContent = `Nível atual ${n.toFixed(2)} m · Monitoramento ativo`;

  if (typeof atualizarTuboInstrumento === "function") atualizarTuboInstrumento(n, lv, true);

  if (lv !== lastLevel) {
    addAlertRow(lv, upperLbl, n);
    lastLevel = lv;
  }
}

// P1 — painel "Nível de Alerta" quando o pz selecionado está sem sinal: estado neutro
// (nunca NORMAL/ATENÇÃO/CRÍTICO com dado ausente) e NÃO mexe em lastLevel — a transição
// de nível não é avaliada com dado stale (retoma do zero quando a comunicação voltar).
function setAlertSemSinal(ts) {
  const temTs = Number.isFinite(ts);
  const ultimaLeitura = temTs ? formatUltimaLeitura(ts) : null;
  const icon = `<circle cx="8" cy="8" r="5.5" stroke="#8a90a3" stroke-width="1.5"/><path d="M5 8h6" stroke="#8a90a3" stroke-width="1.5" stroke-linecap="round"/>`;

  document.getElementById("abox").className   = "alert-level-box alb-semsinal";
  document.getElementById("aicon").className  = "al-icon ali-semsinal";
  document.getElementById("asvg").innerHTML   = icon;
  document.getElementById("astate").className = "al-state al-semsinal";
  document.getElementById("astate").textContent = "SEM SINAL";
  document.getElementById("adesc").textContent = temTs
    ? `Instrumento sem reportar ${ultimaLeitura}. Alarme de nível suspenso (dado ausente não é avaliado como normal).`
    : "Instrumento nunca reportou. Alarme de nível suspenso (dado ausente não é avaliado como normal).";
  document.getElementById("tby").className = "tb-seg tb-yellow";
  document.getElementById("tbr").className = "tb-seg tb-red";
  document.getElementById("ainfo").textContent = temTs
    ? `Sem comunicação · última leitura ${ultimaLeitura}`
    : "Sem comunicação · nenhuma leitura recebida";
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
  pushHistorico({ lv, lbl, msg, nivel: Number.isFinite(nivel) ? nivel.toFixed(2) : "···", time: t, color: colors[lv] || colors.info });
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
// Cartões ordenados por prioridade (crítico, atenção, sem sinal, normal): o que pede
// ação aparece primeiro. Cada cartão traz o tubo com a altura da água e as faixas.
const PRIORIDADE = { critico: 0, atencao: 1, semsinal: 2, normal: 3 };
const cartaoAnterior = {}; // por pz: { lv, ts, nivel } — destaca mudança de faixa e leitura nova

// Situação de um instrumento a partir da última leitura: nunca "normal" sem dado recente.
function situacaoPz(d) {
  const nivel = d && Number.isFinite(d.nivel) ? d.nivel : null;
  if (estadoComunicacao(d) === "stale" || nivel === null) return { lv: "semsinal", lbl: "Sem sinal", nivel };
  return { ...classifyNivel(nivel), nivel };
}

// Tubo pequeno (54 × 132): a água entra pela posição anterior e anima até a atual.
function tuboMiniSvg(id, nivel, nivelAnterior) {
  const escala = Math.max(4, Math.ceil(CFG.thrCritico * 1.2));
  const y = n => (126 - (clamp(n, 0, escala) / escala) * 118).toFixed(1);
  const alvo = Number.isFinite(nivel) ? y(nivel) : 126;
  const inicio = Number.isFinite(nivelAnterior) ? y(nivelAnterior) : 126;
  const u = "tm-" + String(id).replace(/[^\w-]/g, "");
  return `<svg class="tubo-mini" viewBox="0 0 54 132" aria-hidden="true"><defs>
    <clipPath id="${u}"><rect x="17" y="7" width="20" height="120" rx="10"/></clipPath>
    <linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4FC3F7"/><stop offset="1" stop-color="#1565C0"/></linearGradient></defs>
    <rect class="tubo-corpo" x="17" y="7" width="20" height="120" rx="10" stroke-width="1.5"/>
    <g clip-path="url(#${u})"><g class="agua" data-y="${alvo}" style="transform:translateY(${inicio}px)">
      <path class="onda agua-cor" d="M0 0 q5 -2.5 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 V140 H0Z" fill="url(#${u}g)"/>
    </g></g>
    <line x1="11" x2="43" y1="${y(CFG.thrCritico)}" y2="${y(CFG.thrCritico)}" stroke="#EF5A5A" stroke-width="1.4" stroke-dasharray="3 2"/>
    <line x1="11" x2="43" y1="${y(CFG.thrAtencao)}" y2="${y(CFG.thrAtencao)}" stroke="#E3A53A" stroke-width="1.4" stroke-dasharray="3 2"/>
  </svg>`;
}

function atualizarVisaoGeral(mapa) {
  const grid = document.getElementById("pz-grid");
  if (!grid) return;
  const antes = typeof capturarCartoes === "function" ? capturarCartoes(grid) : null;
  const ordem = PIEZOMETROS.map((pz, i) => ({ pz, i, d: mapa[pz.id], s: situacaoPz(mapa[pz.id]) }))
    .sort((a, b) => PRIORIDADE[a.s.lv] - PRIORIDADE[b.s.lv] || a.i - b.i);

  grid.innerHTML = ordem.map(({ pz, d, s }) => {
    const semSinal = s.lv === "semsinal";
    const nivel = s.nivel;
    const sel = pz.id === pzSelecionado ? " selected" : "";
    const ultimaRecepcao = timestampUltimaRecepcao(d);
    const anterior = cartaoAnterior[pz.id];
    const mudou = anterior && anterior.lv !== s.lv ? " mudou" : "";
    const leituraNova = !semSinal && anterior && Number.isFinite(ultimaRecepcao) && anterior.ts !== ultimaRecepcao;
    cartaoAnterior[pz.id] = { lv: s.lv, ts: ultimaRecepcao, nivel };
    const valorHtml = nivel !== null
      ? `<span class="pz-num">${nivel.toFixed(2)}</span><span class="pz-card-unit">m</span>`
      : "···";
    const tubo = tuboMiniSvg(pz.id, nivel, anterior ? anterior.nivel : null);

    // P1 — leitura ausente/stale nunca aparece como normal: badge cinza "SEM SINAL" + cor+texto,
    // valor esmaecido e "última leitura há X min" (nunca vermelho nem verde — ver docs §2).
    if (semSinal) {
      const lastSeen = Number.isFinite(ultimaRecepcao)
        ? `última leitura ${formatUltimaLeitura(ultimaRecepcao)}`
        : "nenhuma leitura recebida";
      return `
        <div class="pz-card pz-sem-sinal${sel}${mudou}" data-pz="${textoHtml(pz.id)}" role="button" tabindex="0" aria-pressed="${Boolean(sel)}">
          ${tubo}
          <div class="pz-card-corpo">
            <div class="pz-card-top"><span class="pz-card-id">${textoHtml(pz.id)}</span><span class="tbadge tb-semsinal">SEM SINAL</span></div>
            <div class="pz-card-name">${textoHtml(pz.nome)}</div>
            <div class="pz-card-value valor-esmaecido">${valorHtml}</div>
            <div class="pz-card-pe"><span class="sinal" aria-hidden="true"><i></i><i></i><i></i></span><span class="pz-card-lastseen">${lastSeen}</span></div>
          </div>
        </div>`;
    }

    // P3 — chip "variação rápida" quando |taxa| > limiar e o pz está comunicando normalmente
    const taxa = d && Number.isFinite(d.taxa_m_dia) ? d.taxa_m_dia : null;
    const taxaRapida = taxa !== null && Math.abs(taxa) > CFG.taxaMaxMDia;
    const chipHtml = taxaRapida
      ? `<span class="chip-taxa-rapida" title="Variação rápida: investigar (limiar definido na configuração do projeto)">📈 variação rápida</span>`
      : "";
    const badgeCls = s.lv === "normal" ? "tbadge tb-normal-neutro" : `tbadge tb-${s.lv}`;
    return `
      <div class="pz-card nivel-${s.lv}${sel}${mudou}" data-pz="${textoHtml(pz.id)}" role="button" tabindex="0" aria-pressed="${Boolean(sel)}">
        ${tubo}
        <div class="pz-card-corpo">
          <div class="pz-card-top"><span class="pz-card-id">${textoHtml(pz.id)}</span><span class="${badgeCls}">${s.lbl}</span></div>
          <div class="pz-card-name">${textoHtml(pz.nome)}</div>
          <div class="pz-card-value">${valorHtml}</div>
          ${chipHtml}
          <div class="pz-card-pe"><span class="sinal" aria-hidden="true"><i></i><i></i><i></i></span><span class="pz-card-lastseen">recebido ${formatUltimaLeitura(ultimaRecepcao)}</span></div>
        </div>
        <span class="recebe${leituraNova ? " pulso" : ""}" aria-hidden="true"></span>
      </div>`;
  }).join("");
  grid.querySelectorAll(".pz-card").forEach(card => {
    const abrir = () => {
      selectPiezometro(card.dataset.pz);
      if (typeof irParaVista === "function") irParaVista("instrumento");
    };
    card.addEventListener("click", abrir);
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        abrir();
      }
    });
  });
  if (typeof animarCartoes === "function") animarCartoes(grid, antes);
  if (typeof atualizarResumoRede === "function") atualizarResumoRede(mapa);
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
  const nome = pz ? pz.nome : "";
  const dl = document.getElementById("pz-detail-label");
  if (dl) dl.textContent = `${pzSelecionado}${nome ? " · " + nome : ""}`;
  const at = document.getElementById("alert-pz-tag");
  if (at) at.textContent = pzSelecionado;
  const rt = document.getElementById("pz-tag-readings");
  if (rt) rt.textContent = pzSelecionado;
  const et = document.getElementById("events-title");
  if (et) et.textContent = `Sessão atual · todos os instrumentos`;
  if (typeof atualizarTituloVista === "function") atualizarTituloVista();
}

// ── TAXA DE VARIAÇÃO (P3) ─────────────────────────────────────────────────────
// Exibe taxa_m_dia no stat "TAXA" do card de nível; destaca em âmbar quando
// |taxa| > CFG.taxaMaxMDia (ref. ASDSO: >0,1 m/dia já é gatilho de investigação).
function renderTaxa(taxa) {
  const el = document.getElementById("n-taxa");
  if (!el) return;
  if (!Number.isFinite(taxa)) {
    el.textContent = "···";
    el.className = "mstat-val";
    el.removeAttribute("title");
    return;
  }
  const sinal = taxa >= 0 ? "+" : "";
  const rapida = Math.abs(taxa) > CFG.taxaMaxMDia;
  el.textContent = `${rapida ? "📈 " : ""}${sinal}${taxa.toFixed(2)} m/dia`;
  el.className = "mstat-val" + (rapida ? " warn" : "");
  if (rapida) el.title = "Variação rápida: investigar (limiar definido na configuração do projeto)";
  else el.removeAttribute("title");
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function setStatus(type, msg) {
  document.getElementById("sdot").className = "sdot " + { live: "s-ok", sim: "s-sim", err: "s-err" }[type];
  document.getElementById("stext").textContent = msg;
}

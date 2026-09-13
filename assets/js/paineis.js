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
    desc = `Leitura na faixa normal configurada. Este estado não atesta a segurança da estrutura.`;
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
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--text-3);text-align:center;padding:16px">Aguardando dados...</td></tr>`;
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
function atualizarVisaoGeral(mapa) {
  const grid = document.getElementById("pz-grid");
  if (!grid) return;
  grid.innerHTML = PIEZOMETROS.map(pz => {
    const d = mapa[pz.id];
    const nivel = d && Number.isFinite(d.nivel) ? d.nivel : null;
    const comm = estadoComunicacao(d);
    const semSinal = comm === "stale";
    const cls = !semSinal && nivel !== null ? classifyNivel(nivel) : { lv: "info", lbl: "···" };
    const sel = pz.id === pzSelecionado ? " selected" : "";
    const valorHtml = nivel !== null
      ? `${nivel.toFixed(2)}<span class="pz-card-unit">m</span>`
      : "···";

    // P1 — leitura ausente/stale nunca aparece como normal: badge cinza "SEM SINAL" + cor+texto,
    // valor esmaecido e "última leitura há X min" (nunca vermelho nem verde — ver docs §2).
    if (semSinal) {
      const ultimaRecepcao = timestampUltimaRecepcao(d);
      const lastSeen = Number.isFinite(ultimaRecepcao)
        ? `última leitura ${formatUltimaLeitura(ultimaRecepcao)}`
        : "nenhuma leitura recebida";
      return `
        <div class="pz-card pz-sem-sinal${sel}" data-pz="${textoHtml(pz.id)}" role="button" tabindex="0" aria-pressed="${Boolean(sel)}">
          <div class="pz-card-top">
            <span class="pz-card-id">${textoHtml(pz.id)}</span>
            <span class="tbadge tb-semsinal">SEM SINAL</span>
          </div>
          <div class="pz-card-name">${textoHtml(pz.nome)}</div>
          <div class="pz-card-value valor-esmaecido">${valorHtml}</div>
          <div class="pz-card-lastseen">${lastSeen}</div>
        </div>`;
    }

    // P3 — chip "variação rápida" quando |taxa| > limiar e o pz está comunicando normalmente
    const taxa = d && Number.isFinite(d.taxa_m_dia) ? d.taxa_m_dia : null;
    const taxaRapida = taxa !== null && Math.abs(taxa) > CFG.taxaMaxMDia;
    const chipHtml = taxaRapida
      ? `<span class="chip-taxa-rapida" title="Variação rápida: investigar (limiar definido na configuração do projeto)">📈 variação rápida</span>`
      : "";

    // P6 — badge NORMAL neutro (ISA-101: cor = anormalidade, ~90% da UI neutra)
    const badgeCls = cls.lv === "normal" ? "tbadge tb-normal-neutro" : `tbadge tb-${cls.lv}`;
    return `
      <div class="pz-card${sel}" data-pz="${textoHtml(pz.id)}" role="button" tabindex="0" aria-pressed="${Boolean(sel)}">
        <div class="pz-card-top">
          <span class="pz-card-id">${textoHtml(pz.id)}</span>
          <span class="${badgeCls}">${cls.lbl}</span>
        </div>
        <div class="pz-card-name">${textoHtml(pz.nome)}</div>
        <div class="pz-card-value">${valorHtml}</div>
        ${chipHtml}
      </div>`;
  }).join("");
  grid.querySelectorAll(".pz-card").forEach(card => {
    card.addEventListener("click", () => selectPiezometro(card.dataset.pz));
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectPiezometro(card.dataset.pz);
      }
    });
  });
}

// ── MAPA ──────────────────────────────────────────────────────────────────────
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
    leafletMap = L.map(mapEl).setView([centerLat, centerLng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(leafletMap);

    PIEZOMETROS.forEach(pz => {
      const marker = L.circleMarker([pz.lat, pz.lng], {
        radius: 9, weight: 2, color: "#8a94ad", fillColor: "#8a94ad", fillOpacity: .85,
      }).addTo(leafletMap);
      marker.bindPopup(`<b>${textoHtml(pz.nome)}</b>`);
      marker.on("click", () => selectPiezometro(pz.id));
      pzMarkers[pz.id] = marker;
    });
  } catch (e) {
    console.warn("Leaflet:", e.message);
    mapEl.innerHTML = '<div class="map-fallback">Mapa indisponível (sem conexão ao CDN)</div>';
    leafletMap = null;
  }
}

function atualizarMapa(mapa) {
  if (typeof L === "undefined" || !leafletMap) return;
  PIEZOMETROS.forEach(pz => {
    const marker = pzMarkers[pz.id];
    if (!marker) return;
    const d = mapa[pz.id];
    const nivel = d && Number.isFinite(d.nivel) ? d.nivel : null;
    const semSinal = estadoComunicacao(d) === "stale";
    const cls = !semSinal && nivel !== null ? classifyNivel(nivel) : { lv: "semsinal", lbl: "Sem sinal" };
    const col = corPorStatus(semSinal ? "semsinal" : cls.lv);
    marker.setStyle({ color: col, fillColor: col, radius: pz.id === pzSelecionado ? 11 : 9 });
    marker.setPopupContent(
      `<b>${textoHtml(pz.nome)}</b><br>Nível: ${!semSinal && nivel !== null ? nivel.toFixed(2) + " m" : "···"}<br>Status: ${cls.lbl}`
    );
  });
}

function updatePzLabels() {
  const pz = PIEZOMETROS.find(p => p.id === pzSelecionado);
  const nome = pz ? pz.nome : "";
  const dl = document.getElementById("pz-detail-label");
  if (dl) dl.textContent = `Detalhes de: ${pzSelecionado}${nome ? " · " + nome : ""}`;
  const at = document.getElementById("alert-pz-tag");
  if (at) at.textContent = pzSelecionado;
  const rt = document.getElementById("pz-tag-readings");
  if (rt) rt.textContent = pzSelecionado;
  const et = document.getElementById("events-title");
  if (et) et.textContent = `Sessão atual · todos os instrumentos`;
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

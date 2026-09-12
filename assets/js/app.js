// ── APP (ORQUESTRAÇÃO) ────────────────────────────────────────────────────────
// Seleção de piezômetro/período, carregamento de histórico, aplicação dos dados
// recebidos nos painéis, polling periódico da fonte ativa, relógio, inicialização
// dos controles de UI (howto, pills de período) e a IIFE de boot do dashboard.

// ── SELEÇÃO DE PIEZÔMETRO / PERÍODO ───────────────────────────────────────────
function resetPzState({ preservarAlertas = false } = {}) {
  sparks.n = []; sparks.p = []; sparks.t = [];
  charts.n = { labels: [], data: [], times: [], maxData: [] };
  charts.t = { labels: [], data: [], times: [] };
  statsWin.n = []; statsWin.p = []; statsWin.t = []; statsWin.nMax = [];
  histPontos.n = [];
  histPontos.bucketSeg = undefined;
  readingsHistory = [];
  if (!preservarAlertas) {
    lastLevel = null;
    lastTaxaRapidaState = false;
  }
  ["n", "p", "t"].forEach(k => {
    const mn = document.getElementById(k + "-min"), mx = document.getElementById(k + "-max");
    const dl = document.getElementById(k + "-delta");
    if (mn) mn.textContent = "—";
    if (mx) mx.textContent = "—";
    if (dl) { dl.textContent = "—"; dl.className = "mstat-val"; }
  });
  renderTaxa(null); // P3 — limpa o stat TAXA ao trocar de pz/período
  renderReadingsTable();
  redrawCharts();
}

function selectPiezometro(id) {
  if (!PIEZOMETROS.some(p => p.id === id) || id === pzSelecionado) return;
  pzSelecionado = id;
  resetPzState();
  updatePzLabels();
  atualizarVisaoGeral(pzLatest);
  atualizarMapa(pzLatest);
  loadHistoryAndStats();
  if (pzLatest[id]) applyData(pzLatest[id]);
  atualizarLinkRelatorio();
}

function selectPeriodo(p) {
  if (!PERIODOS[p] || p === periodoSelecionado) return;
  periodoSelecionado = p;
  document.querySelectorAll(".period-pill").forEach(btn => btn.classList.toggle("active", btn.dataset.range === p));
  updatePeriodLabels();
  // O período muda o histórico, não o estado operacional do instrumento.
  resetPzState({ preservarAlertas: true });
  loadHistoryAndStats();
  atualizarLinkRelatorio();
}

// Mantém o link "Relatório (PDF)" sempre apontando pro pz/período em tela —
// só o href muda, a página relatorio.html é aberta (aba nova) quando clicado.
function atualizarLinkRelatorio() {
  const el = document.getElementById("btn-relatorio");
  if (el) el.href = "relatorio.html?pz=" + pzSelecionado + "&range=" + periodoSelecionado;
}

// Carrega histórico do piezômetro/período selecionados (nível + temperatura),
// semeia stats, tabela de leituras e redesenha os gráficos.
// Consome só `fonte.historico()` — não sabe (nem precisa saber) se é real ou simulada.
function limparHistoricoCarregado() {
  // Nunca manter no gráfico/statísticas a série da seleção ou fonte anterior: ela
  // poderia ser confundida com o período que acabou de falhar.
  charts.n = { labels: [], data: [], times: [], maxData: [] };
  charts.t = { labels: [], data: [], times: [] };
  statsWin.n = []; statsWin.p = []; statsWin.t = []; statsWin.nMax = [];
  histPontos.n = [];
  histPontos.bucketSeg = undefined;
  readingsHistory = [];
  histSimulado = false;
  ["n", "p", "t"].forEach(k => {
    const mn = document.getElementById(k + "-min");
    const mx = document.getElementById(k + "-max");
    const dl = document.getElementById(k + "-delta");
    if (mn) mn.textContent = "—";
    if (mx) mx.textContent = "—";
    if (dl) { dl.textContent = "—"; dl.className = "mstat-val"; }
  });
  renderReadingsTable();
  redrawCharts();
}

function setHistoricoIndisponivel(mensagem) {
  limparHistoricoCarregado();

  // O canvas vazio não explica por que não há uma linha. A mensagem é estática,
  // criada com textContent, e fica junto do gráfico que foi afetado.
  const canvas = document.getElementById("chart-n");
  const area = canvas && canvas.closest ? canvas.closest(".chart-area") : null;
  if (!area || !document.createElement) return;
  let aviso = document.getElementById("historico-indisponivel");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "historico-indisponivel";
    aviso.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;color:var(--text-1);font-size:12px;background:var(--bg-panel)";
    area.appendChild(aviso);
  }
  aviso.textContent = mensagem;
}

function limparAvisoHistoricoIndisponivel() {
  const aviso = document.getElementById("historico-indisponivel");
  if (aviso) aviso.remove();
}

async function loadHistoryAndStats() {
  // P — token desta chamada: se pzSelecionado/periodoSelecionado mudar de novo antes de
  // terminarmos, histReqId avança e nós descartamos nosso resultado silenciosamente (ver
  // checagens após cada await abaixo) em vez de sobrescrever a seleção atual com dados velhos.
  const meuId = ++histReqId;
  let pontos, bucketSeg;
  try {
    ({ pontos, bucket_seg: bucketSeg } = await fonte.historico(pzSelecionado, periodoSelecionado));
  } catch (e) {
    if (meuId !== histReqId) return; // seleção mudou enquanto a 1ª chamada estava em voo
    const mensagem = `Histórico indisponível: não foi possível carregar ${pzSelecionado} (${PERIODOS[periodoSelecionado].label}).`;
    setHistoricoIndisponivel(mensagem);
    addInfoRow(mensagem);
    return;
  }
  if (meuId !== histReqId) return; // seleção mudou enquanto o histórico estava em voo

  limparHistoricoCarregado();
  histSimulado = false; // fonte.simulada já identifica a simulação global no export.
  limparAvisoHistoricoIndisponivel();

  const hn = pontosParaCampo(pontos, "nivel_agua");
  const ht = pontosParaCampo(pontos, "temperatura");

  if (!hn.length) {
    const mensagem = `Nenhuma leitura histórica disponível para ${pzSelecionado} (${PERIODOS[periodoSelecionado].label}).`;
    setHistoricoIndisponivel(mensagem);
    addInfoRow(mensagem);
    return;
  }

  charts.n.labels  = hn.map(h => h.label);
  charts.n.data    = hn.map(h => h.value);
  charts.n.times   = hn.map(h => h.time);
  // P5 — série do pico do intervalo (cai para o próprio valor quando o Worker não manda nivel_max)
  charts.n.maxData = hn.map(h => Number.isFinite(h.max) ? h.max : h.value);
  statsWin.n       = hn.map(h => h.value);
  statsWin.nMax    = charts.n.maxData.slice();
  // Série completa do período, com timestamps — não é truncada pelas 60 posições dos
  // gráficos, ao contrário de charts.n (ver comentário de histPontos em estado.js).
  // minValue/nLeituras (P5/auditoria) ficam `undefined` quando o Worker não trouxe
  // nivel_min/n_leituras (dados antigos) — exportar.js trata isso sem quebrar.
  histPontos.n     = hn.map(h => ({
    label: h.label, value: h.value,
    maxValue: Number.isFinite(h.max) ? h.max : h.value,
    minValue: h.min, nLeituras: h.n,
    time: h.time,
  }));
  // bucket_seg do período carregado (segundos) — guardado para os metadados do CSV
  // exportado ("ao vivo") quando a fonte não o informou.
  histPontos.bucketSeg = bucketSeg;
  updateStats("n", statsWin.n);
  aplicarMaxNivelPico(); // P5 — MÁX 24H usa o pico do intervalo, não a média
  readingsHistory = hn.slice(-12).reverse().map(h => {
    const cls = classifyNivel(h.value);
    return { time: h.label, nivel: h.value, lv: cls.lv, lbl: cls.lbl };
  });
  renderReadingsTable();
  addInfoRow(`Histórico de nível d'água carregado (${hn.length} pontos) — ${pzSelecionado}`);
  if (ht.length) {
    charts.t.labels = ht.map(h => h.label);
    charts.t.data   = ht.map(h => h.value);
    charts.t.times  = ht.map(h => h.time);
    statsWin.t      = ht.map(h => h.value);
    updateStats("t", statsWin.t);
    addInfoRow(`Histórico de temperatura carregado (${ht.length} pontos) — ${pzSelecionado}`);
  }

  redrawCharts();
}

// ── APLICA DADOS DO PIEZÔMETRO SELECIONADO ───────────────────────────────────
function applyData({ nivel, pressao, temperatura, taxa_m_dia, ts, recebidoEm }) {
  // Honestidade do dado (achado do review de 17/07): grandeza ausente NUNCA vira
  // número fabricado (antes: pressão ausente virava "1013" e temperatura "24",
  // exibidos como se medidos — a bancada HC-SR04 não mede nenhuma das duas).
  // Nível não-finito descarta a aplicação inteira; pressão/temperatura são
  // opcionais e, ausentes, mostram "n/d" (não disponível) com badge "Sem sensor".
  if (!Number.isFinite(nivel)) return;
  const telemetria = avaliarTelemetriaAtual({ nivel, taxa_m_dia, ts, recebidoEm });
  const leituraStale = telemetria.status === "stale";
  const temPressao = Number.isFinite(pressao);
  const temTemp    = Number.isFinite(temperatura);

  // A API pode estar online enquanto o instrumento está sem sinal. Mantemos o
  // último valor conhecido visível, mas o painel deixa claro que ele não é uma
  // leitura operacional atual.
  document.getElementById("pz-detail-label")?.classList.toggle("telemetria-stale", leituraStale);
  document.getElementById("metrics-row")?.classList.toggle("telemetria-stale", leituraStale);

  // Card/gráfico de temperatura nascem OCULTOS (a bancada não instrumenta a
  // grandeza — decisão do usuário: ocultar em vez de exibir "Sem sensor").
  // São revelados na 1ª leitura que trouxer temperatura real (Wokwi/BMP hoje,
  // BME280 no protótipo v2) e as linhas voltam ao layout de 3 cards/2 gráficos.
  if (temTemp) {
    document.getElementById("card-t")?.classList.remove("oculta-metrica");
    document.getElementById("panel-chart-t")?.classList.remove("oculta-metrica");
    document.getElementById("metrics-row")?.classList.remove("sem-temp");
    document.getElementById("charts-row")?.classList.remove("sem-temp");
  }

  const flash = id => {
    const el = document.getElementById(id);
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  };

  document.getElementById("val-n").textContent = nivel.toFixed(2);
  if (!leituraStale) flash("val-n");
  // Poropressão: com sensor de pressão real (ex.: BMP no Wokwi) exibe a leitura
  // bruta em hPa; sem ele (bancada ultrassônica), exibe a poropressão EQUIVALENTE
  // calculada do nível MEDIDO (u = γw·h, 9,807 kPa por metro de coluna d'água,
  // a grandeza que o piezômetro real mede). Rotulada "Calculada": derivação de
  // medição real com rótulo explícito, nunca número inventado.
  const pressaoExib = temPressao ? pressao : nivel * 9.807;
  document.getElementById("val-p").textContent = pressaoExib.toFixed(1);
  if (!leituraStale) flash("val-p");
  const up = document.getElementById("unit-p");
  if (up) up.textContent = temPressao ? "hPa" : "kPa";
  document.getElementById("val-t").textContent = temTemp ? temperatura.toFixed(1) : "n/d";
  if (temTemp && !leituraStale) flash("val-t");

  // Taxa e todos os derivados operacionais exigem uma recepção recente. Não
  // anexar a mesma amostra stale às séries locais nem reavaliar seus alarmes.
  if (leituraStale) {
    renderTaxa(null);
    const badgeNivel = document.getElementById("badge-n");
    if (badgeNivel) { badgeNivel.className = "mbadge"; badgeNivel.textContent = "Sem sinal"; }
    setAlertSemSinal(Number.isFinite(recebidoEm) ? recebidoEm : ts);
    return;
  }

  // Sparklines (só com dado real — sparkline de valor fabricado é linha reta mentirosa)
  pushSpark("n", nivel);
  pushSpark("p", pressaoExib);
  if (temTemp)    pushSpark("t", temperatura);

  // Charts
  const lbl = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const iso = new Date().toISOString();
  pushChart("n", lbl, nivel, iso);
  if (temTemp) pushChart("t", lbl, temperatura, iso);
  redrawCharts();

  // Stats (janela completa do período, não só os pontos visíveis no gráfico)
  pushStats("n", nivel);
  pushStats("nMax", nivel); // leitura ao vivo é instantânea: o valor também é o pico do instante
  pushStats("p", pressaoExib); updateStats("p", statsWin.p);
  if (temTemp)    { pushStats("t", temperatura); updateStats("t", statsWin.t); }
  updateStats("n", statsWin.n);
  aplicarMaxNivelPico(); // P5 — MÁX 24H usa o pico do intervalo, não a média

  // Badge dinâmico de temperatura (neutro quando a bancada não instrumenta a grandeza)
  const bt = document.getElementById("badge-t");
  if (!temTemp)                                    { bt.className = "mbadge";           bt.textContent = "Sem sensor"; }
  else if (temperatura >= 0 && temperatura <= 50)  { bt.className = "mbadge mb-blue";   bt.textContent = "Normal"; }
  else                                             { bt.className = "mbadge mb-yellow"; bt.textContent = "Verificar"; }

  // Badge da pressão idem (o HTML traz "Bruta" fixo — só sobrescreve na ausência)
  const bp = document.getElementById("badge-p");
  if (bp) { bp.textContent = temPressao ? "Bruta" : "Calculada"; bp.className = temPressao ? "mbadge mb-blue" : "mbadge"; }

  // P3 — taxa de variação (display), somente da leitura atual elegível.
  renderTaxa(telemetria.taxaAtual);

  // P3+P4 — alarme de variação rápida, edge-triggered (só na transição parado→rápido),
  // só com comunicação ok (dado stale não confirma tendência real)
  const taxaRapidaAgora = Number.isFinite(taxa_m_dia) && Math.abs(taxa_m_dia) > CFG.taxaMaxMDia;
  if (taxaRapidaAgora && !lastTaxaRapidaState) addTaxaRow(taxa_m_dia);
  lastTaxaRapidaState = taxaRapidaAgora;

  pushReading(nivel);
  setAlert(nivel);
}

// ── RELÓGIO ───────────────────────────────────────────────────────────────────
function updateClock() {
  const n = new Date();
  const dd = String(n.getDate()).padStart(2, "0");
  const mm = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][n.getMonth()];
  const hh = String(n.getHours()).padStart(2, "0");
  const mi = String(n.getMinutes()).padStart(2, "0");
  const ss = String(n.getSeconds()).padStart(2, "0");
  document.getElementById("live-time").textContent = `Ao vivo · ${dd} ${mm} ${n.getFullYear()} ${hh}:${mi}:${ss}`;
}

// ── COMO LER ESTE PAINEL (recolhível) ────────────────────────────────────────
function initHowto() {
  const btn = document.getElementById("howto-toggle");
  const content = document.getElementById("howto-content");
  if (!btn || !content) return;
  btn.addEventListener("click", () => {
    const open = content.classList.toggle("open");
    btn.textContent = open ? "❓ Ocultar explicação" : "❓ Como ler este painel";
  });
}

function initPeriodPills() {
  document.querySelectorAll(".period-pill").forEach(btn => {
    btn.addEventListener("click", () => selectPeriodo(btn.dataset.range));
  });
}

// ── POLLING ───────────────────────────────────────────────────────────────────
// Roda a cada CFG.poll (10s), sempre — não existe mais um setInterval paralelo
// para a simulação. Quando `fonte` é a simulada, fonte.ultimos() devolve os
// valores gerados e o poll não percebe diferença nenhuma.
async function poll() {
  try {
    const dadosTodos = await fonte.ultimos();
    pzLatest = dadosTodos;

    if (fonte.simulada) {
      // Enquanto em modo simulado, tenta também um ping barato à API real para
      // detectar quando ela volta e trocar de fonte automaticamente.
      try {
        pzLatest = await FonteApi.ultimos();
        trocarFonte(FonteApi);
        failCount = 0;
        setStatus("live", `Sistema online · consulta às ${new Date().toLocaleTimeString("pt-BR")}`);
      } catch (_) {
        setStatus("sim", "Modo simulação ativo · sem conexão com o sistema");
      }
    } else {
      failCount = 0;
      setStatus("live", `Sistema online · consulta às ${new Date().toLocaleTimeString("pt-BR")}`);
    }

    checarTransicoesComunicacao(pzLatest); // P1 — eventos de ok↔stale de todos os pz
    atualizarVisaoGeral(pzLatest);
    atualizarMapa(pzLatest);
    const sel = pzLatest[pzSelecionado];
    if (!sel || !Number.isFinite(sel.nivel)) throw new Error(`Sem dados recentes para ${pzSelecionado}`);
    applyData(sel);
  } catch (e) {
    failCount++;
    console.warn("Fonte de leituras:", e.message);
    if (failCount === 1) {
      setStatus("err", `Falha na API: ${e.message}`);
      addInfoRow("Falha de conexão com o sistema · ativando modo simulação");
    }
    if (failCount >= 2 && !fonte.simulada) {
      trocarFonte(FonteSimulada);
      setStatus("sim", "Modo simulação ativo · sem conexão com o sistema");
    }
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
(async function init() {
  updateClock();
  setInterval(updateClock, 1000);

  // Antes de montar mapa/grid e iniciar o polling: tenta carregar config do servidor
  await loadConfig();

  initHowto();
  initPeriodPills();
  updatePeriodLabels();
  updatePzLabels();
  initMap();

  const exportBtn = document.getElementById("btn-export");
  if (exportBtn) exportBtn.addEventListener("click", exportCSV);

  const exportXlsBtn = document.getElementById("btn-export-xls");
  if (exportXlsBtn) exportXlsBtn.addEventListener("click", exportXLS);

  atualizarVisaoGeral(pzLatest);
  atualizarMapa(pzLatest);

  // Carrega histórico do período/piezômetro selecionados
  await loadHistoryAndStats();

  window.addEventListener("resize", () => {
    redrawCharts();
    if (leafletMap) leafletMap.invalidateSize();
  });

  await poll();
  setInterval(poll, CFG.poll);

  // Navegadores estrangulam (ou pausam) o setInterval de poll() em abas em background —
  // ao voltar, o operador poderia olhar por até um ciclo inteiro (CFG.poll) para um dado
  // que já está velho sem perceber. Ao readquirir visibilidade, força um poll() imediato.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") poll();
  });
})();

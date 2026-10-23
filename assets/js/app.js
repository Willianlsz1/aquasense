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
  else mostrarSemSinalSelecionado();
  atualizarResumoDaFonte();
  carregarEventosDaFonte();
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
  atualizarResumoDaFonte();
  carregarEventosDaFonte();
  atualizarLinkRelatorio();
}

// Mantém o link "Relatório (PDF)" sempre apontando pro pz/período em tela —
// só o href muda, a página relatorio.html é aberta (aba nova) quando clicado.
function atualizarLinkRelatorio() {
  const el = document.getElementById("btn-relatorio");
  if (!el) return;
  const indisponivelNaSimulacao = Boolean(typeof fonte !== "undefined" && fonte.simulada);
  el.href = indisponivelNaSimulacao ? "#" : "relatorio.html?pz=" + pzSelecionado + "&range=" + periodoSelecionado;
  if (el.classList) el.classList.toggle("is-disabled", indisponivelNaSimulacao);
  if (typeof el.setAttribute === "function") el.setAttribute("aria-disabled", String(indisponivelNaSimulacao));
  el.title = indisponivelNaSimulacao
    ? "Relatório PDF disponível apenas para dados reais do sistema"
    : "Documento A4 pronto para salvar como PDF: resumo, gráfico, tabela e auditoria do período";
}

// Carrega histórico de nível do piezômetro/período selecionados,
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
  const fonteDaRequisicao = fonte;
  let pontos, bucketSeg;
  try {
    ({ pontos, bucket_seg: bucketSeg } = await fonteDaRequisicao.historico(pzSelecionado, periodoSelecionado));
  } catch (e) {
    if (meuId !== histReqId || fonteDaRequisicao !== fonte) return;
    const mensagem = `Histórico indisponível: não foi possível carregar ${pzSelecionado} (${PERIODOS[periodoSelecionado].label}).`;
    setHistoricoIndisponivel(mensagem);
    addInfoRow(mensagem);
    return;
  }
  if (meuId !== histReqId || fonteDaRequisicao !== fonte) return;

  limparHistoricoCarregado();
  histSimulado = false; // fonte.simulada já identifica a simulação global no export.
  limparAvisoHistoricoIndisponivel();

  const hn = pontosParaCampo(pontos, "nivel_agua");

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
  redrawCharts();
}

// ── APLICA DADOS DO PIEZÔMETRO SELECIONADO ───────────────────────────────────
function applyData({ nivel, taxa_m_dia, ts, recebidoEm }) {
  // Honestidade do dado: só o nível d'água é medido pela UCT. Nível não-finito
  // descarta a aplicação inteira (nunca vira número fabricado).
  if (!Number.isFinite(nivel)) return;
  const telemetria = avaliarTelemetriaAtual({ nivel, taxa_m_dia, ts, recebidoEm });
  const leituraStale = telemetria.status === "stale";

  // A API pode estar online enquanto o instrumento está sem sinal. Mantemos o
  // último valor conhecido visível, mas o painel deixa claro que ele não é uma
  // leitura operacional atual.
  document.getElementById("pz-detail-label")?.classList.toggle("telemetria-stale", leituraStale);
  document.getElementById("metrics-row")?.classList.toggle("telemetria-stale", leituraStale);

  const valor = document.getElementById("val-n");
  valor.textContent = nivel.toFixed(2);
  if (!leituraStale && valor.classList) { valor.classList.remove("flash"); void valor.offsetWidth; valor.classList.add("flash"); }

  // Taxa e todos os derivados operacionais exigem uma recepção recente. Não
  // anexar a mesma amostra stale às séries locais nem reavaliar seus alarmes.
  if (leituraStale) {
    renderTaxa(null);
    setAlertSemSinal(Number.isFinite(recebidoEm) ? recebidoEm : ts);
    return;
  }

  pushSpark("n", nivel);

  // Gráfico
  const lbl = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  pushChart("n", lbl, nivel, new Date().toISOString());
  redrawCharts();

  // Stats (janela completa do período, não só os pontos visíveis no gráfico)
  pushStats("n", nivel);
  pushStats("nMax", nivel); // leitura ao vivo é instantânea: o valor também é o pico do instante
  updateStats("n", statsWin.n);
  aplicarMaxNivelPico(); // P5 — MÁX usa o pico do intervalo, não a média

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

function limparMetricasAtuais() {
  const valor = document.getElementById("val-n");
  if (valor) { valor.textContent = "···"; valor.className = "cv-neutral"; }
  const selo = document.getElementById("badge-n");
  if (selo) { selo.className = "tbadge tb-semsinal"; selo.textContent = "Sem sinal"; }
  document.getElementById("pz-detail-label")?.classList.add("telemetria-stale");
  document.getElementById("metrics-row")?.classList.add("telemetria-stale");
  renderTaxa(null);
}

function mostrarSemSinalSelecionado() {
  limparMetricasAtuais();
  setAlertSemSinal(null);
}

function limparEstadoDaFonte() {
  // A fonte é parte da proveniência: não deixar alarmes, cards ou leituras de uma
  // fonte parecerem pertencer à outra.
  histReqId++;
  histSimulado = false;
  pzLatest = {};
  pzComm = {};
  alarmes = [];
  eventos = [];
  lastLevel = null;
  lastTaxaRapidaState = false;
  if (typeof limparSessaoRede === "function") limparSessaoRede();
  resetPzState();
  limparMetricasAtuais();
  setAlertSemSinal(null);
  renderTable();
  atualizarVisaoGeral(pzLatest);
  atualizarMapa(pzLatest);
  atualizarLinkRelatorio();
}

function atualizarResumoDaFonte(apiIndisponivel = false) {
  if (typeof atualizarResumoOperacional === "function") {
    atualizarResumoOperacional(pzSelecionado, { apiIndisponivel });
  }
}

function carregarEventosDaFonte() {
  if (typeof carregarEventosPersistidos === "function") carregarEventosPersistidos();
}

function aoTrocarFonte() {
  limparEstadoDaFonte();
  const mensagem = fonte.simulada
    ? "Demonstração · dados fictícios em tempo acelerado"
    : "Monitoramento real selecionado · aguardando dados do sistema";
  setStatus(fonte.simulada ? "sim" : "live", mensagem);
  atualizarResumoDaFonte(false);
  carregarEventosDaFonte();
  loadHistoryAndStats();
  if (typeof carregarHistoricoRede === "function") carregarHistoricoRede({ forcar: true });
  solicitarPoll();
}

// ── RELÓGIO ───────────────────────────────────────────────────────────────────
function updateClock() {
  const n = new Date();
  const dd = String(n.getDate()).padStart(2, "0");
  const mm = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][n.getMonth()];
  const hh = String(n.getHours()).padStart(2, "0");
  const mi = String(n.getMinutes()).padStart(2, "0");
  const ss = String(n.getSeconds()).padStart(2, "0");
  document.getElementById("live-time").textContent = `${dd} ${mm} · ${hh}:${mi}:${ss}`;
}

// ── COMO LER ESTE PAINEL (recolhível) ────────────────────────────────────────
function initHowto() {
  const btn = document.getElementById("howto-toggle");
  const content = document.getElementById("howto-content");
  if (!btn || !content) return;
  const icone = btn.querySelector("svg");
  btn.setAttribute("aria-expanded", "false");
  btn.addEventListener("click", () => {
    const open = content.classList.toggle("open");
    btn.textContent = open ? "Ocultar explicação" : "Como ler este painel";
    if (icone) btn.prepend(icone);
    btn.setAttribute("aria-expanded", String(open));
  });
}

function initPeriodPills() {
  document.querySelectorAll(".period-pill").forEach(btn => {
    btn.addEventListener("click", () => selectPeriodo(btn.dataset.range));
  });
}

// ── POLLING ───────────────────────────────────────────────────────────────────
let pollEmAndamento = false;
let pollPendente = false;

function solicitarPoll() {
  if (pollEmAndamento) { pollPendente = true; return; }
  return poll();
}

// Histórico de 24 h da rede: no monitoramento real, recarregado a cada 30 min
// (cada consulta lê o D1); na demonstração, a cada consulta, assim como o
// histórico do instrumento aberto, para o gráfico acompanhar o roteiro.
function aposConsulta() {
  if (typeof carregarHistoricoRede !== "function") return;
  if (!fonte.simulada) { carregarHistoricoRede(); return; }
  carregarHistoricoRede({ forcar: true });
  if (typeof vistaAtual !== "undefined" && vistaAtual === "instrumento") loadHistoryAndStats();
}

// Roda a cada CFG.poll (10s; 3 s na demonstração). A fonte simulada só é usada pelo botão explícito;
// uma falha da API conserva a interface em monitoramento real e informa a falha.
async function poll() {
  if (pollEmAndamento) { pollPendente = true; return; }
  pollEmAndamento = true;
  const fonteDaRequisicao = fonte;
  try {
    const dadosTodos = await fonteDaRequisicao.ultimos();
    if (fonteDaRequisicao !== fonte) return;
    pzLatest = dadosTodos;
    failCount = 0;
    setStatus(fonte.simulada ? "sim" : "live", fonte.simulada
      ? "Demonstração · dados fictícios em tempo acelerado"
      : `Sistema online · consulta às ${new Date().toLocaleTimeString("pt-BR")}`);

    checarTransicoesComunicacao(pzLatest);
    atualizarVisaoGeral(pzLatest);
    atualizarMapa(pzLatest);
    const sel = pzLatest[pzSelecionado];
    if (!sel || !Number.isFinite(sel.nivel)) mostrarSemSinalSelecionado();
    else applyData(sel);
    atualizarResumoDaFonte(false);
    carregarEventosDaFonte();
    aposConsulta();
  } catch (e) {
    if (fonteDaRequisicao !== fonte) return;
    failCount++;
    pzLatest = {};
    atualizarVisaoGeral(pzLatest);
    atualizarMapa(pzLatest);
    mostrarSemSinalSelecionado();
    console.warn("Fonte de leituras:", e.message);
    setStatus("err", `Monitoramento real indisponível · ${e.message}`);
    atualizarResumoDaFonte(true);
  } finally {
    pollEmAndamento = false;
    if (pollPendente) {
      pollPendente = false;
      solicitarPoll();
    }
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
(async function init() {
  updateClock();
  setInterval(updateClock, 1000);

  // Antes de montar mapa/grid e iniciar o polling: tenta carregar config do servidor
  await loadConfig();
  if (typeof aplicarCadastro === "function") aplicarCadastro();

  iniciarEventosPersistidos();
  carregarEventosDaFonte();
  initHowto();
  initPeriodPills();
  if (typeof iniciarSeletoresPz === "function") iniciarSeletoresPz();
  updatePeriodLabels();
  updatePzLabels();
  initMap();

  const exportBtn = document.getElementById("btn-export");
  if (exportBtn) exportBtn.addEventListener("click", exportCSV);

  const exportXlsBtn = document.getElementById("btn-export-xls");
  if (exportXlsBtn) exportXlsBtn.addEventListener("click", exportXLS);

  const pdfBtn = document.getElementById("btn-relatorio");
  if (pdfBtn) pdfBtn.addEventListener("click", event => {
    if (fonte.simulada) event.preventDefault();
  });

  atualizarVisaoGeral(pzLatest);
  atualizarMapa(pzLatest);
  atualizarLinkRelatorio();

  // Carrega histórico do período/piezômetro selecionados e as últimas 24 h da rede
  await loadHistoryAndStats();
  if (typeof carregarHistoricoRede === "function") carregarHistoricoRede({ forcar: true });

  window.addEventListener("resize", () => {
    redrawCharts();
    if (leafletMap) leafletMap.invalidateSize();
  });

  await solicitarPoll();
  setInterval(solicitarPoll, CFG.poll);

  // Navegadores estrangulam (ou pausam) o setInterval de poll() em abas em background —
  // ao voltar, o operador poderia olhar por até um ciclo inteiro (CFG.poll) para um dado
  // que já está velho sem perceber. Ao readquirir visibilidade, força um poll() imediato.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") solicitarPoll();
  });
})();

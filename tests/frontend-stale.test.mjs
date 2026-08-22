import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const relatorioSource = await readFile(new URL("../assets/js/relatorio.js", import.meta.url), "utf8");
const utilSource = await readFile(new URL("../assets/js/util.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../assets/js/app.js", import.meta.url), "utf8");
const paineisSource = await readFile(new URL("../assets/js/paineis.js", import.meta.url), "utf8");

function elemento() {
  const classes = new Set();
  return {
    innerHTML: "", textContent: "", className: "", hidden: false,
    classList: {
      add: classe => classes.add(classe),
      remove: classe => classes.delete(classe),
      toggle: (classe, forcar) => {
        const ativo = forcar === undefined ? !classes.has(classe) : forcar;
        if (ativo) classes.add(classe); else classes.delete(classe);
        return ativo;
      },
      contains: classe => classes.has(classe),
    },
    removeAttribute() {},
    addEventListener() {},
  };
}

function carregarRelatorio() {
  const elementos = new Map();
  const document = {
    getElementById(id) {
      if (!elementos.has(id)) elementos.set(id, { innerHTML: "", hidden: false });
      return elementos.get(id);
    },
  };
  const contexto = vm.createContext({
    CFG: { thrAtencao: 10, thrCritico: 12 },
    Date,
    document,
    URLSearchParams,
  });
  const antesDoBoot = relatorioSource.split('document.addEventListener("DOMContentLoaded"')[0];
  new vm.Script(`${utilSource}\n${antesDoBoot}\nglobalThis.relatorio = { montarAuditoria, montarResumo };`).runInContext(contexto);
  return { relatorio: contexto.relatorio, elementos };
}

function carregarApp() {
  const elementos = new Map();
  const contagens = { renderTaxa: [], semSinal: [], addTaxaRow: 0, pushSpark: 0, pushChart: 0, pushStats: 0, pushReading: 0, setAlert: 0 };
  const document = { getElementById: id => {
    if (!elementos.has(id)) elementos.set(id, elemento());
    return elementos.get(id);
  } };
  const contexto = vm.createContext({
    CFG: { staleSeg: 120, taxaMaxMDia: 0.1 }, Date, Math, document,
    lastTaxaRapidaState: false,
    statsWin: { n: [], p: [], t: [], nMax: [] },
    renderTaxa: taxa => contagens.renderTaxa.push(taxa),
    setAlertSemSinal: ts => contagens.semSinal.push(ts),
    pushSpark: () => { contagens.pushSpark++; }, pushChart: () => { contagens.pushChart++; },
    pushStats: () => { contagens.pushStats++; }, pushReading: () => { contagens.pushReading++; },
    setAlert: () => { contagens.setAlert++; }, addTaxaRow: () => { contagens.addTaxaRow++; }, redrawCharts: () => {},
    updateStats: () => {}, aplicarMaxNivelPico: () => {},
  });
  const antesDoBoot = appSource.split("(async function init()")[0];
  new vm.Script(`${utilSource}\n${antesDoBoot}\nglobalThis.app = { applyData };`).runInContext(contexto);
  return { app: contexto.app, elementos, contagens };
}

function carregarPaineis() {
  const elementos = new Map();
  const historico = [];
  const document = {
    getElementById(id) {
      if (!elementos.has(id)) {
        const el = elemento();
        el.querySelectorAll = () => [];
        elementos.set(id, el);
      }
      return elementos.get(id);
    },
  };
  const contexto = vm.createContext({
    CFG: { staleSeg: 120, taxaMaxMDia: 0.1, thrAtencao: 10, thrCritico: 12 }, Date, Math, document,
    PIEZOMETROS: [{ id: "PZ-01", nome: "Dique Norte" }], pzSelecionado: "PZ-01", pzComm: { "PZ-01": "ok" },
    pushHistorico: linha => historico.push(linha), selectPiezometro() {},
  });
  new vm.Script(`${utilSource}\n${paineisSource}\nglobalThis.paineis = { atualizarVisaoGeral, checarTransicoesComunicacao };`).runInContext(contexto);
  return { paineis: contexto.paineis, elementos, historico };
}

function carregarRelatorioCompleto({ pontos, ultimo }) {
  const elementos = new Map();
  const listeners = new Map();
  const document = {
    title: "",
    getElementById(id) {
      if (id === "chart-relatorio") return null;
      if (!elementos.has(id)) elementos.set(id, elemento());
      return elementos.get(id);
    },
    addEventListener: (tipo, handler) => listeners.set(tipo, handler),
  };
  const contexto = vm.createContext({
    CFG: { staleSeg: 120, thrAtencao: 10, thrCritico: 12 },
    API_URL: "", Date, Math, document, URLSearchParams, AbortSignal,
    location: { search: "?pz=PZ-01&range=24h" },
    window: { addEventListener() {} },
    PIEZOMETROS: [{ id: "PZ-01", nome: "Dique Norte" }],
    PERIODOS: { "24h": { label: "24 horas" } },
    loadConfig: async () => {},
    fetch: async url => ({ ok: true, json: async () => String(url).startsWith("/dados") ? { pontos, bucket_seg: 300 } : { "PZ-01": ultimo } }),
  });
  new vm.Script(`${utilSource}\n${relatorioSource}`).runInContext(contexto);
  return { elementos, iniciar: () => listeners.get("DOMContentLoaded")() };
}

test("auditoria stale informa idade da última recepção, nunca sem dados", () => {
  const { relatorio, elementos } = carregarRelatorio();
  const recebidoEm = Math.floor(Date.now() / 1000) - 360;

  relatorio.montarAuditoria({
    bucketSeg: 300,
    endpoint: "/dados?pz=PZ-01&range=24h",
    ultimoOk: true,
    telemetria: { status: "stale" },
    ultimo: { nivel: 2.4, ts: recebidoEm - 60, recebidoEm },
  });

  const auditoria = elementos.get("auditoria-grid").innerHTML;
  assert.match(auditoria, /Última leitura conhecida/);
  assert.match(auditoria, /SEM SINAL \(há 6 min\)/);
  assert.doesNotMatch(auditoria, /sem dados/);
});

test("applyData stale preserva valor, sinaliza sem comunicação e não deriva indicadores", () => {
  const { app, elementos, contagens } = carregarApp();
  const agora = Math.floor(Date.now() / 1000);

  app.applyData({ nivel: 2.4, taxa_m_dia: 0.8, ts: agora - 600, recebidoEm: agora - 600 });

  assert.equal(elementos.get("val-n").textContent, "2.40");
  assert.equal(elementos.get("metrics-row").classList.contains("telemetria-stale"), true);
  assert.deepEqual(contagens.renderTaxa, [null]);
  assert.deepEqual(contagens.semSinal, [agora - 600]);
  assert.deepEqual(
    { pushSpark: contagens.pushSpark, pushChart: contagens.pushChart, pushStats: contagens.pushStats, pushReading: contagens.pushReading, setAlert: contagens.setAlert },
    { pushSpark: 0, pushChart: 0, pushStats: 0, pushReading: 0, setAlert: 0 },
  );
});

test("applyData fresco remove estado stale e permite derivados", () => {
  const { app, elementos, contagens } = carregarApp();
  const agora = Math.floor(Date.now() / 1000);

  app.applyData({ nivel: 2.4, taxa_m_dia: 0.08, ts: agora, recebidoEm: agora });

  assert.equal(elementos.get("metrics-row").classList.contains("telemetria-stale"), false);
  assert.deepEqual(contagens.renderTaxa, [0.08]);
  assert.ok(contagens.pushSpark > 0);
  assert.ok(contagens.pushChart > 0);
  assert.ok(contagens.pushStats > 0);
  assert.equal(contagens.pushReading, 1);
  assert.equal(contagens.setAlert, 1);
});

test("perda de sinal não rearma a borda de taxa alta já registrada", () => {
  const { app, contagens } = carregarApp();
  const agora = Math.floor(Date.now() / 1000);

  app.applyData({ nivel: 2.4, taxa_m_dia: 0.8, ts: agora, recebidoEm: agora });
  app.applyData({ nivel: 2.4, taxa_m_dia: 0.8, ts: agora - 600, recebidoEm: agora - 600 });
  app.applyData({ nivel: 2.4, taxa_m_dia: 0.8, ts: agora, recebidoEm: agora });

  assert.equal(contagens.addTaxaRow, 1);
});

test("sem sinal usa a última recepção, não o relógio adiantado do instrumento", () => {
  const { paineis, elementos, historico } = carregarPaineis();
  const agora = Math.floor(Date.now() / 1000);
  const recebidoEm = agora - 360;
  const tsAdiantado = agora + 3_600;
  const leitura = { nivel: 2.4, ts: tsAdiantado, recebidoEm };

  paineis.checarTransicoesComunicacao({ "PZ-01": leitura });
  paineis.atualizarVisaoGeral({ "PZ-01": leitura });

  assert.match(elementos.get("pz-grid").innerHTML, /última leitura há 6 min/);
  assert.match(historico[0].msg, new RegExp(new Date(recebidoEm * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })));
});

test("resumo stale usa última leitura conhecida e mantém estatísticas históricas", () => {
  const { relatorio, elementos } = carregarRelatorio();
  const recebidoEm = Math.floor(Date.now() / 1000) - 360;

  relatorio.montarResumo(
    [{ nivel_agua: 1.8, nivel_max: 2, nivel_min: 1.6, n_leituras: 3 }],
    { nivel: 2.4, ts: recebidoEm - 60, recebidoEm },
    { status: "stale", nivelConhecido: 2.4, taxaAtual: null, podeAtualizarIndicadores: false },
  );

  const resumo = elementos.get("resumo-grid").innerHTML;
  assert.match(resumo, /Última leitura conhecida/);
  assert.match(resumo, /SEM SINAL · há 6 min/);
  assert.match(resumo, /Mínimo do período/);
});

test("boot do relatório transporta recebido_em e usa a última leitura stale sem chamá-la atual", async () => {
  const recebidoEm = Math.floor(Date.now() / 1000) - 360;
  const { elementos, iniciar } = carregarRelatorioCompleto({
    pontos: [{ ts: recebidoEm - 120, nivel_agua: 1.8, nivel_max: 2, nivel_min: 1.6, n_leituras: 3 }],
    ultimo: { nivel_agua: 2.4, ts: recebidoEm - 60, recebido_em: recebidoEm },
  });

  await iniciar();

  assert.match(elementos.get("resumo-grid").innerHTML, /Última leitura conhecida/);
  assert.match(elementos.get("resumo-grid").innerHTML, /SEM SINAL · há 6 min/);
  assert.match(elementos.get("auditoria-grid").innerHTML, /SEM SINAL \(há 6 min\)/);
  assert.doesNotMatch(elementos.get("auditoria-grid").innerHTML, /Nível atual<\/dt>/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const appSource = await readFile(new URL("../assets/js/app.js", import.meta.url), "utf8");

function carregarAppHistorico(fonte) {
  const elementos = new Map();
  const area = { appendChild(el) { elementos.set(el.id, el); } };
  const canvas = { closest: seletor => seletor === ".chart-area" ? area : null };
  elementos.set("chart-n", canvas);
  for (const id of ["n", "p", "t"].flatMap(k => [k + "-min", k + "-max", k + "-delta"])) {
    elementos.set(id, { textContent: "valor anterior", className: "mstat-val antigo" });
  }
  const avisos = [];
  const document = {
    getElementById(id) { return elementos.get(id) || null; },
    createElement() {
      return {
        id: "", textContent: "", style: {},
        remove() { elementos.delete(this.id); },
      };
    },
  };
  const contexto = vm.createContext({
    document,
    fonte,
    FonteSimulada: fonte.FonteSimulada,
    PERIODOS: { "24h": { label: "24 horas" } },
    pzSelecionado: "PZ-01", periodoSelecionado: "24h", histReqId: 0,
    charts: { n: { labels: ["anterior"], data: [9], times: [1], maxData: [9] }, t: { labels: ["anterior"], data: [20], times: [1] } },
    statsWin: { n: [9], p: [8], t: [20], nMax: [9] },
    histPontos: { n: [{ value: 9 }], bucketSeg: 300 }, readingsHistory: [{ nivel: 9 }], histSimulado: true,
    renderReadingsTable() {}, redrawCharts() {}, updateStats() {}, aplicarMaxNivelPico() {},
    addInfoRow: mensagem => avisos.push(mensagem),
    pontosParaCampo: (pontos, campo) => pontos.filter(p => Number.isFinite(p[campo])).map(p => ({ label: "12:00", value: p[campo], time: p.ts })),
    classifyNivel: () => ({ lv: "normal", lbl: "Normal" }),
  });
  const antesDoBoot = appSource.split("(async function init()")[0];
  new vm.Script(`${antesDoBoot}\nglobalThis.app = { loadHistoryAndStats, estado: () => ({ charts, statsWin, histPontos, readingsHistory, histSimulado }) };`).runInContext(contexto);
  return { app: contexto.app, elementos, avisos };
}

test("falha no histórico real deixa a série indisponível sem consultar a simulação", async () => {
  let chamadasSimulacao = 0;
  const { app, elementos, avisos } = carregarAppHistorico({
    simulada: false,
    historico: async () => { throw new Error("HTTP 503"); },
    FonteSimulada: { historico: async () => { chamadasSimulacao++; } },
  });

  await app.loadHistoryAndStats();

  const estado = app.estado();
  assert.deepEqual(JSON.parse(JSON.stringify(estado.charts.n)), { labels: [], data: [], times: [], maxData: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(estado.statsWin)), { n: [], p: [], t: [], nMax: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(estado.histPontos)), { n: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(estado.readingsHistory)), []);
  assert.equal(estado.histSimulado, false);
  assert.equal(chamadasSimulacao, 0);
  assert.match(elementos.get("historico-indisponivel").textContent, /Histórico indisponível/);
  assert.match(elementos.get("historico-indisponivel").style.cssText, /color:var\(--text-1\)/);
  assert.match(elementos.get("historico-indisponivel").style.cssText, /background:var\(--bg-panel\)/);
  assert.match(avisos[0], /Histórico indisponível/);
});

test("fonte global simulada continua fornecendo seu histórico identificado", async () => {
  const { app, elementos, avisos } = carregarAppHistorico({
    simulada: true,
    historico: async () => ({ pontos: [{ ts: 1, nivel_agua: 10.2 }], bucket_seg: 1800 }),
  });

  await app.loadHistoryAndStats();

  const estado = app.estado();
  assert.deepEqual(JSON.parse(JSON.stringify(estado.charts.n.data)), [10.2]);
  assert.equal(estado.histPontos.bucketSeg, 1800);
  assert.equal(elementos.get("historico-indisponivel"), undefined);
  assert.match(avisos[0], /Histórico de nível d'água carregado/);
});

test("resposta vazia e erro não preservam séries antigas, e recuperação recarrega só os novos dados", async () => {
  const respostas = [
    { pontos: [{ ts: 1, nivel_agua: 10.2, temperatura: 22 }], bucket_seg: 1800 },
    { pontos: [], bucket_seg: 1800 },
    new Error("HTTP 503"),
    { pontos: [{ ts: 2, nivel_agua: 10.4 }], bucket_seg: 1800 },
  ];
  const { app, elementos } = carregarAppHistorico({
    simulada: false,
    historico: async () => {
      const resposta = respostas.shift();
      if (resposta instanceof Error) throw resposta;
      return resposta;
    },
  });

  await app.loadHistoryAndStats();
  assert.deepEqual(JSON.parse(JSON.stringify(app.estado().charts.t.data)), [22]);

  await app.loadHistoryAndStats();
  assert.deepEqual(JSON.parse(JSON.stringify(app.estado().charts.n.data)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(app.estado().charts.t.data)), []);
  assert.match(elementos.get("historico-indisponivel").textContent, /Nenhuma leitura histórica disponível/);

  await app.loadHistoryAndStats();
  assert.match(elementos.get("historico-indisponivel").textContent, /Histórico indisponível/);

  await app.loadHistoryAndStats();
  assert.deepEqual(JSON.parse(JSON.stringify(app.estado().charts.n.data)), [10.4]);
  assert.deepEqual(JSON.parse(JSON.stringify(app.estado().charts.t.data)), []);
  assert.equal(elementos.get("historico-indisponivel"), undefined);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../assets/js/graficos.js", import.meta.url), "utf8");
test("gráfico respeita distância temporal e não une lacunas nem preenche área", () => {
  const paths = [];
  let path;
  const ctx = {
    clearRect() {}, setLineDash() {}, fillText() {}, arc() {}, fill() {},
    beginPath() { path = []; },
    moveTo(x, y) { path.push(["move", x, y]); },
    lineTo(x, y) { path.push(["line", x, y]); },
    stroke() { paths.push(path); },
  };
  const canvas = { style: {}, closest: () => ({ offsetWidth: 500, offsetHeight: 200 }), getContext: () => ctx };
  const sandbox = vm.createContext({ document: { getElementById: () => canvas } });
  vm.runInContext(source, sandbox);
  sandbox.renderMainChart("chart-n", { data: [1, 2, 3], labels: ["a", "b", "c"], times: [0, 1000, 10000] }, "#237b83", null, 1000);
  const series = paths.at(-1);
  assert.equal(series[0][0], "move");
  assert.equal(series[1][0], "line");
  assert.equal(series[2][0], "move", "interrompe a série durante a lacuna");
  assert.ok(Math.abs((series[1][1] - series[0][1]) / (series[2][1] - series[0][1]) - .1) < 1e-9);
});

test("redesenho usa o intervalo retornado pela fonte para detectar lacunas", () => {
  const sandbox = vm.createContext({
    histPontos: { bucketSeg: 6 * 3600 },
    PERIODOS: { "30d": { bucketMs: 8 * 3600 * 1000 } },
    periodoSelecionado: "30d", CFG: {}, charts: { n: {}, t: {} },
  });
  vm.runInContext(source, sandbox);
  const intervalos = [];
  sandbox.renderMainChart = (_id, _state, _color, _thr, bucket) => intervalos.push(bucket);
  sandbox.redrawCharts();
  assert.deepEqual(intervalos, [21600000, 21600000]);
  assert.ok(13 * 3600 * 1000 > 2 * intervalos[0]);
});

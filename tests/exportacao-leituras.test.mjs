import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const sources = await Promise.all(["util", "exportar_xls", "exportar"].map(name =>
  readFile(new URL(`../assets/js/${name}.js`, import.meta.url), "utf8")));

function preparar(simulada = false) {
  const pontos = Array.from({ length: 72 }, (_, i) => ({
    time: Date.UTC(2026, 8, 10, i), value: 8, minValue: 7,
    maxValue: i === 71 ? 16 : 9, nLeituras: 120,
  }));
  const contexto = vm.createContext({
    Date, CFG: { thrAtencao: 12, thrCritico: 15 },
    histPontos: { n: pontos, bucketSeg: 3600 },
    charts: { n: { data: [99], times: [Date.now()], maxData: [99] } },
    pzSelecionado: "PZ-01", periodoSelecionado: "7d", fonte: { simulada }, histSimulado: false,
  });
  vm.runInContext(sources.join("\n"), contexto);
  const arquivos = [];
  contexto.baixarArquivo = (conteudo, tipo, nome) => arquivos.push({ conteudo, tipo, nome });
  return { contexto, arquivos };
}

test("CSV preserva todos os intervalos e classifica pelo pico, sem limitar ao gráfico", () => {
  const { contexto, arquivos } = preparar();
  contexto.exportCSV();
  const csv = arquivos[0].conteudo;
  assert.match(csv, /Total de intervalos exportados;72/);
  assert.match(csv, /Intervalo de agregação;60 min/);
  assert.match(csv, /8,00;7,00;16,00;120;Crítico/);
  assert.doesNotMatch(csv, /99,00/);
  assert.equal(arquivos[0].nome, "piezometro_PZ-01_7d.csv");
});

test("Excel e CSV identificam simulação e compartilham a classificação do pico", () => {
  const { contexto, arquivos } = preparar(true);
  contexto.exportCSV();
  contexto.exportXLS();
  for (const arquivo of arquivos) {
    assert.match(arquivo.conteudo, /SIMULAÇÃO: dados fictícios de demonstração/);
    assert.match(arquivo.conteudo, /Crítico/);
  }
  assert.match(arquivos[1].conteudo, /<Workbook/);
  assert.doesNotMatch(arquivos[1].conteudo, /NaN|undefined/);
});

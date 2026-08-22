import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const utilSource = await readFile(new URL("../assets/js/util.js", import.meta.url), "utf8");

function carregarUtil() {
  const contexto = vm.createContext({
    CFG: { staleSeg: 120 },
    Date,
    Math,
  });

  new vm.Script(`${utilSource}\nglobalThis.util = { estadoComunicacao, avaliarTelemetriaAtual };`).runInContext(contexto);
  return contexto.util;
}

function assertContratoAtual(atual, esperado) {
  assert.deepEqual(JSON.parse(JSON.stringify(atual)), esperado);
}

test("leitura dentro do limite mantém indicadores atualizáveis", () => {
  const { avaliarTelemetriaAtual } = carregarUtil();

  assertContratoAtual(
    avaliarTelemetriaAtual({ nivel: 2.4, taxa_m_dia: 0.08, recebidoEm: 980 }, 1_000),
    { status: "ok", nivelConhecido: 2.4, taxaAtual: 0.08, podeAtualizarIndicadores: true },
  );
  assert.equal(
    avaliarTelemetriaAtual({ nivel: 2.4, taxa_m_dia: Number.NaN, recebidoEm: 980 }, 1_000).taxaAtual,
    null,
  );
});

test("leitura stale preserva nível, oculta taxa e bloqueia indicadores", () => {
  const { avaliarTelemetriaAtual } = carregarUtil();

  assertContratoAtual(
    avaliarTelemetriaAtual({ nivel: 2.4, taxa_m_dia: 0.08, recebidoEm: 879 }, 1_000),
    { status: "stale", nivelConhecido: 2.4, taxaAtual: null, podeAtualizarIndicadores: false },
  );
});

test("timestamp ausente é stale", () => {
  const { avaliarTelemetriaAtual } = carregarUtil();

  assertContratoAtual(
    avaliarTelemetriaAtual({ nivel: 2.4, taxa_m_dia: 0.08 }, 1_000),
    { status: "stale", nivelConhecido: 2.4, taxaAtual: null, podeAtualizarIndicadores: false },
  );
});

test("recebidoEm tem precedência e ts é fallback", () => {
  const { avaliarTelemetriaAtual } = carregarUtil();

  assert.equal(avaliarTelemetriaAtual({ nivel: 2.4, taxa_m_dia: 0.08, recebidoEm: 879, ts: 999 }, 1_000).status, "stale");
  assert.equal(avaliarTelemetriaAtual({ nivel: 2.4, taxa_m_dia: 0.08, ts: 999 }, 1_000).status, "ok");
});

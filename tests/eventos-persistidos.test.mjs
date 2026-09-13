import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../assets/js/eventos-persistidos.js", import.meta.url), "utf8");

function elemento(tag = "div") {
  return {
    tagName: tag, textContent: "", disabled: false, colSpan: 1, children: [],
    appendChild(filho) { this.children.push(filho); this.firstChild = this.children[0]; return filho; },
    removeChild(filho) { this.children.splice(this.children.indexOf(filho), 1); this.firstChild = this.children[0]; },
    click() { this.clicado = true; },
  };
}

function carregar({ resposta, simulada = false } = {}) {
  const elementos = new Map([
    ["servidor-eventos-tbody", elemento("tbody")],
    ["servidor-eventos-status", elemento()],
    ["btn-export-alertas", elemento("button")],
  ]);
  const blobs = [];
  const document = {
    getElementById: id => elementos.get(id) || null,
    createElement: tag => elemento(tag),
    body: elemento("body"),
  };
  class BlobFake { constructor(parts) { this.texto = parts.join(""); blobs.push(this); } }
  const contexto = vm.createContext({
    Date, document, Blob: BlobFake, URL: { createObjectURL: () => "blob:teste", revokeObjectURL() {} },
    setTimeout() {}, pzSelecionado: "PZ-01", fonte: { simulada },
    apiGet: async () => resposta,
  });
  new vm.Script(`${source}\nglobalThis.persistidos = { carregarEventosPersistidos, renderEventosPersistidos, exportarEventosPersistidos, estado: () => ({ eventosPersistidosCache, eventosPersistidosErro }) };`).runInContext(contexto);
  return { persistidos: contexto.persistidos, contexto, elementos, blobs };
}

test("registros persistidos são normalizados e renderizados sem HTML", async () => {
  const { persistidos, elementos } = carregar({ resposta: { notificacoes: [{
    ts: "2026-09-12T15:00:00.000Z", piezometro: "PZ-01", tipo: "nivel",
    nivel: "ATENCAO", mensagem: "<img src=x>", acao: "Verificar.",
  }, { ts: "invalido", piezometro: "PZ-01" }] } });

  await persistidos.carregarEventosPersistidos();
  const linha = elementos.get("servidor-eventos-tbody").children[0];
  assert.equal(linha.children.length, 5);
  assert.equal(linha.children[3].textContent, "<img src=x>");
  assert.match(elementos.get("servidor-eventos-status").textContent, /1 registro disponível/);
  assert.match(elementos.get("servidor-eventos-status").textContent, /não representa o histórico completo/);
});

test("trocar instrumento reaproveita cache e filtra os registros", async () => {
  const { persistidos, contexto, elementos } = carregar({ resposta: { notificacoes: [
    { ts: "2026-09-12T15:00:00.000Z", piezometro: "PZ-01", tipo: "nivel", mensagem: "PZ 1" },
    { ts: "2026-09-12T16:00:00.000Z", piezometro: "PZ-02", tipo: "taxa", mensagem: "PZ 2" },
  ] } });
  await persistidos.carregarEventosPersistidos();
  contexto.pzSelecionado = "PZ-02";
  await persistidos.carregarEventosPersistidos();
  const linha = elementos.get("servidor-eventos-tbody").children[0];
  assert.equal(linha.children[1].textContent, "PZ-02");
});

test("simulação bloqueia registros persistidos e exportação", async () => {
  const { persistidos, elementos } = carregar({ simulada: true });
  await persistidos.carregarEventosPersistidos();
  assert.equal(elementos.get("servidor-eventos-tbody").children[0].children[0].textContent, "Indisponível no modo simulação");
  assert.equal(elementos.get("btn-export-alertas").disabled, true);
  assert.equal(persistidos.exportarEventosPersistidos(), false);
});

test("CSV de alertas inclui metadados e neutraliza fórmula", async () => {
  const { persistidos, blobs } = carregar({ resposta: { notificacoes: [{
    ts: "2026-09-12T15:00:00.000Z", piezometro: "PZ-01", tipo: "nivel", mensagem: "=COMANDO()", acao: "@ação",
  }] } });
  await persistidos.carregarEventosPersistidos();
  assert.equal(persistidos.exportarEventosPersistidos(), true);
  assert.match(blobs[0].texto, /API do sistema/);
  assert.match(blobs[0].texto, /não é histórico completo/);
  assert.match(blobs[0].texto, /'=COMANDO\(\)/);
  assert.match(blobs[0].texto, /'@ação/);
});

test("polls durante consulta lenta não descartam a resposta pendente", async () => {
  const { persistidos, contexto, elementos } = carregar();
  let concluir;
  let chamadas = 0;
  contexto.apiGet = () => { chamadas++; return new Promise(resolve => { concluir = resolve; }); };
  const primeira = persistidos.carregarEventosPersistidos();
  await persistidos.carregarEventosPersistidos();
  assert.equal(chamadas, 1);
  concluir({ notificacoes: [{ ts: "2026-09-12T15:00:00Z", piezometro: "PZ-01", mensagem: "Registro" }] });
  await primeira;
  assert.match(elementos.get("servidor-eventos-status").textContent, /1 registro disponível/);
});

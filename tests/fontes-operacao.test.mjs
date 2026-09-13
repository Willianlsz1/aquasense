import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const fontesSource = await readFile(new URL("../assets/js/fontes.js", import.meta.url), "utf8");

function carregarFonteApi(resposta) {
  const contexto = vm.createContext({
    API_URL: "https://api.exemplo",
    AbortController,
    setTimeout,
    clearTimeout,
    CFG: { poll: 10_000 },
    clamp: value => value,
    document: { getElementById: () => null },
    simActive: false,
    fetch: async () => ({ ok: true, json: async () => resposta }),
  });
  new vm.Script(`${fontesSource}\nglobalThis.fontesTeste = { FonteApi };`).runInContext(contexto);
  return contexto.fontesTeste.FonteApi;
}

test("/ultimos vazio é resposta válida e não é convertido em falha de API", async () => {
  const fonte = carregarFonteApi({});
  const resultado = await fonte.ultimos();

  assert.deepEqual(JSON.parse(JSON.stringify(resultado)), {});
});

import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { executarRetencao } from "../cloudflare-worker/src/retencao.js";

function bancada() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../cloudflare-worker/schema.sql", import.meta.url), "utf8"));
  const env = { DB: {
    prepare(sql) { return { bind(...params) { return { sql, params }; } }; },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const out = statements.map(({ sql, params }) => ({ meta: db.prepare(sql).run(...params) }));
        db.exec("COMMIT");
        return out;
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  } };
  const inserir = (ts, nivel) => db.prepare(
    "INSERT INTO leituras(piezometro,ts,nivel_agua) VALUES ('PZ-01',?,?)"
  ).run(ts, nivel);
  return { db, env, inserir };
}

test("retenção preserva dia completo entre duas execuções e soma chegada atrasada", async t => {
  const { db, env, inserir } = bancada();
  t.after(() => db.close());
  t.mock.method(Date, "now", () => 1.5 * 86400000);
  inserir(3600, 10); inserir(82800, 20);
  await executarRetencao(env, { RETENCAO_DIAS: 1 });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM leituras").get().n, 2);
  Date.now.mock.mockImplementation(() => 2.5 * 86400000);
  await executarRetencao(env, { RETENCAO_DIAS: 1 });
  const resumo = () => ({ ...db.prepare("SELECT nivel_medio,nivel_min,nivel_max,n_leituras FROM leituras_diario").get() });
  assert.deepEqual(resumo(), { nivel_medio: 15, nivel_min: 10, nivel_max: 20, n_leituras: 2 });
  await executarRetencao(env, { RETENCAO_DIAS: 1 });
  assert.equal(resumo().n_leituras, 2);
  inserir(7200, 30);
  await executarRetencao(env, { RETENCAO_DIAS: 1 });
  assert.deepEqual(resumo(), { nivel_medio: 20, nivel_min: 10, nivel_max: 30, n_leituras: 3 });
});

test("falha na exclusão reverte consolidação e mantém leituras", async t => {
  const { db, env, inserir } = bancada(); t.after(() => db.close());
  inserir(3600, 10);
  db.exec("CREATE TRIGGER impedir_limpeza BEFORE DELETE ON leituras BEGIN SELECT RAISE(ABORT, 'falha simulada'); END");
  await assert.rejects(executarRetencao(env, { RETENCAO_DIAS: 1 }), /falha simulada/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM leituras").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM leituras_diario").get().n, 0);
});

test("configuração de retenção inválida não toca no banco", async () => {
  const env = { DB: { prepare() { assert.fail("não deve consultar banco"); } } };
  for (const dias of [-1, 0, NaN, Infinity, 1.5]) {
    await assert.rejects(executarRetencao(env, { RETENCAO_DIAS: dias }), /limpeza cancelada/);
  }
});

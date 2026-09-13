import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { lerUltimasLeiturasTodas, lerEstadoLeituras } from "../cloudflare-worker/src/db-ultimas.js";

function banco() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../cloudflare-worker/schema.sql", import.meta.url), "utf8"));
  const consultas = [];
  const env = { DB: { prepare(sql) {
    let args = [];
    return {
      bind(...params) { args = params; return this; },
      async all() { consultas.push({ sql, args }); return { results: db.prepare(sql).all(...args) }; },
    };
  } } };
  const inserir = (pz, nivel, ts, recebido) => db.prepare(
    "INSERT INTO leituras(piezometro,nivel_agua,ts,recebido_em) VALUES(?,?,?,?)"
  ).run(pz,nivel,ts,recebido);
  return { db, env, consultas, inserir };
}

test("snapshot mantém MAX(id), recepção legada e instrumentos fora do catálogo", async () => {
  const { db, env, inserir, consultas } = banco();
  const agora = Math.floor(Date.now()/1000);
  inserir("PZ-01", 16, agora, agora);
  inserir("PZ-01", 3, agora-7200, agora-7200); // último id é antigo: nível recente continua 16
  inserir("PZ-02", 2, agora-3600, agora); // relógio atrasado com recepção recente
  inserir("LEGADO", 4, agora, null);
  inserir("SEM-SINAL", 5, agora-900, agora-900);
  const snapshot = await lerEstadoLeituras(env);
  assert.equal(consultas.length, 1);
  const antigas = db.prepare(`SELECT l.* FROM leituras l JOIN
    (SELECT piezometro,MAX(id) mid FROM leituras GROUP BY piezometro) m ON l.id=m.mid`).all();
  for (const row of antigas) assert.equal(snapshot.ultimas[row.piezometro].nivel_agua,row.nivel_agua);
  assert.deepEqual(snapshot.niveis, { LEGADO:4, "PZ-01":16, "PZ-02":2 });
  assert.equal(snapshot.ultimas.LEGADO.recebido_em,agora);
  assert.equal((await lerUltimasLeiturasTodas(env))["PZ-01"].ts,agora-7200);
  db.close();
});

test("banco vazio retorna mapas vazios e migração é reexecutável", async () => {
  const { db, env } = banco();
  const migration = readFileSync(new URL("../cloudflare-worker/migrations/0004_indices_estado.sql", import.meta.url),"utf8");
  db.exec(migration); db.exec(migration);
  assert.deepEqual(await lerEstadoLeituras(env),{ultimas:{},niveis:{}});
  assert.deepEqual(await lerUltimasLeiturasTodas(env),{});
  db.close();
});

test("consultas usam buscas indexadas em histórico grande sem varrer leituras", async () => {
  const { db, env, inserir, consultas } = banco();
  const agora = Math.floor(Date.now()/1000);
  db.exec("BEGIN");
  for(let i=0;i<30000;i++) inserir(`PZ-${i%3}`,i%20,agora-100000+i,null);
  inserir("PZ-0",16,agora,agora);
  db.exec("COMMIT");
  await lerUltimasLeiturasTodas(env);
  await lerEstadoLeituras(env);
  for(const {sql,args} of consultas) {
    const plano = db.prepare("EXPLAIN QUERY PLAN "+sql).all(...args).map(r=>r.detail).join("\n");
    assert.doesNotMatch(plano,/SCAN (?:TABLE )?leituras\b/);
    assert.match(plano,/SEARCH leituras USING COVERING INDEX idx_leituras_pz_id/);
    if(args.length) assert.match(plano,/SEARCH leituras USING INDEX idx_leituras_recepcao/);
  }
  db.close();
});

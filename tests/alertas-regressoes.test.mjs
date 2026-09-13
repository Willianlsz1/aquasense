import assert from "node:assert/strict";
import test from "node:test";

import { checkAlerts } from "../cloudflare-worker/src/alertas.js";

const agoraSeg = 1_800_000_000;
const cfg = {
  NIVEL_ATENCAO: 12,
  NIVEL_CRITICO: 15,
  ALERT_REPEAT_MIN: 15,
  TAXA_JANELA_MIN: 60,
  TAXA_MAX_M_DIA: 0.5,
  SILENCE_ALERT_SEC: 900,
  HISTERESE_M: 0.2,
};

function estado() {
  return {
    lastNotifiedLevel: {}, lastCriticalNotify: {}, commStatus: {}, taxaStatus: {}, alertLog: [],
  };
}

function criarEnv({ piezometros = "[]", niveis = [], ultimas = [], baseline = null, aoBuscarBaseline } = {}) {
  return {
    PIEZOMETROS: piezometros,
    DB: {
      prepare(sql) {
        let args = [];
        return {
          bind(...novosArgs) {
            args = novosArgs;
            return this;
          },
          async all() {
            if (sql.includes("nivel_recente")) return { results: ultimas.map(row => ({ ...row, nivel_recente: niveis.find(n => n.piezometro === row.piezometro)?.nivel_agua ?? null })) };
            if (sql.includes("WHERE piezometro = ?1")) {
              aoBuscarBaseline?.(args);
              return { results: baseline ? [baseline] : [] };
            }
            return { results: ultimas };
          },
        };
      },
    },
  };
}

async function comRelogioCongelado(fn) {
  const original = Date.now;
  Date.now = () => agoraSeg * 1000;
  try {
    return await fn();
  } finally {
    Date.now = original;
  }
}

test("cron calcula taxa pela leitura do instrumento, igual a /ultimos, mas exige recepção recente", async () => {
  const tsLeitura = agoraSeg - 7_200; // relógio do instrumento atrasado duas horas
  let alvoBaseline;
  const env = criarEnv({
    niveis: [{ piezometro: "PZ-01", nivel_agua: 2 }],
    ultimas: [{
      piezometro: "PZ-01", nivel_agua: 2, pressao: null, temperatura: null,
      ts: tsLeitura, recebido_em: agoraSeg,
    }],
    baseline: { nivel_agua: 1, ts: tsLeitura - 3_600 },
    aoBuscarBaseline: ([, alvo]) => { alvoBaseline = alvo; },
  });
  const atual = estado();

  await comRelogioCongelado(() => checkAlerts(cfg, env, atual));

  assert.equal(alvoBaseline, tsLeitura - cfg.TAXA_JANELA_MIN * 60);
  assert.equal(atual.taxaStatus["PZ-01"], "TAXA_ALTA");
  assert.equal(atual.alertLog.find((evento) => evento.tipo === "taxa").taxa, 24);
});

test("cron registra instrumento configurado sem primeira leitura sem inventar data ou duração", async () => {
  const env = criarEnv({
    piezometros: JSON.stringify([{ id: "PZ-01" }, { id: "PZ-02" }, { id: "id inválido" }]),
    ultimas: [{
      piezometro: "PZ-01", nivel_agua: 2, pressao: null, temperatura: null,
      ts: agoraSeg, recebido_em: agoraSeg,
    }],
  });
  const atual = estado();

  await comRelogioCongelado(() => checkAlerts(cfg, env, atual));

  assert.equal(atual.commStatus["PZ-02"], "SEM_SINAL");
  assert.equal(atual.commStatus["id inválido"], undefined);
  const evento = atual.alertLog.find((registro) => registro.piezometro === "PZ-02");
  assert.match(evento.mensagem, /Nenhuma leitura recebida/);
  assert.equal("ultimaLeituraTs" in evento, false);
  assert.equal("silencioMin" in evento, false);
});

test("primeira leitura de instrumento em SEM_SINAL registra recuperação", async () => {
  const env = criarEnv({
    piezometros: JSON.stringify([{ id: "PZ-02" }]),
    ultimas: [{
      piezometro: "PZ-02", nivel_agua: 2, pressao: null, temperatura: null,
      ts: agoraSeg, recebido_em: agoraSeg,
    }],
  });
  const atual = estado();
  atual.commStatus["PZ-02"] = "SEM_SINAL";

  await comRelogioCongelado(() => checkAlerts(cfg, env, atual));

  assert.equal(atual.commStatus["PZ-02"], "OK");
  assert.equal(atual.alertLog.length, 1);
  assert.match(atual.alertLog[0].mensagem, /COMUNICAÇÃO RESTABELECIDA/);
});

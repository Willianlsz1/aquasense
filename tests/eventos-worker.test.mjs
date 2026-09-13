import assert from "node:assert/strict";
import test from "node:test";

import {
  registrarEventoComunicacao,
  registrarEventoNivel,
  registrarEventoTaxa,
} from "../cloudflare-worker/src/eventos.js";
import { checkAlerts } from "../cloudflare-worker/src/alertas.js";
import { handleAlerts } from "../cloudflare-worker/src/rotas.js";

const cfg = {
  ALLOWED_ORIGIN: "*",
  NIVEL_ATENCAO: 12,
  NIVEL_CRITICO: 15,
};

function assertSemCanais(registro) {
  assert.equal("telegram" in registro, false);
  assert.equal("sms" in registro, false);
}

test("registra nível ATENCAO com mensagem, ação e metadados do domínio", () => {
  const alertLog = [];

  registrarEventoNivel(cfg, alertLog, "PZ-01", "ATENCAO", 12.34);

  assert.equal(alertLog.length, 1);
  assert.match(alertLog[0].ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(
    { tipo: alertLog[0].tipo, piezometro: alertLog[0].piezometro, nivel: alertLog[0].nivel, valor: alertLog[0].valor },
    { tipo: "nivel", piezometro: "PZ-01", nivel: "ATENCAO", valor: 12.34 },
  );
  assert.match(alertLog[0].mensagem, /AQUASENSE PIEZÔMETRO PZ-01 — ATENCAO/);
  assert.match(alertLog[0].acao, /Nível acima de 12 m — intensificar monitoramento\./);
  assertSemCanais(alertLog[0]);
});

test("registra comunicação SEM_SINAL sem canais externos", () => {
  const alertLog = [];

  registrarEventoComunicacao(cfg, alertLog, "PZ-02", "SEM_SINAL", 1_700_000_000, 16);

  assert.equal(alertLog[0].tipo, "comunicacao");
  assert.equal(alertLog[0].status, "SEM_SINAL");
  assert.match(alertLog[0].mensagem, /SEM SINAL/);
  assert.match(alertLog[0].mensagem, /Sem leituras há 16 min/);
  assert.equal(alertLog[0].acao, "Verificar instrumento/comunicação.");
  assertSemCanais(alertLog[0]);
});

test("registra TAXA_ALTA preservando taxa, limite, mensagem e ação", () => {
  const alertLog = [];

  registrarEventoTaxa(cfg, alertLog, "PZ-03", "TAXA_ALTA", -1.25, 0.5);

  assert.deepEqual(
    { tipo: alertLog[0].tipo, piezometro: alertLog[0].piezometro, status: alertLog[0].status, taxa: alertLog[0].taxa, limite: alertLog[0].limite },
    { tipo: "taxa", piezometro: "PZ-03", status: "TAXA_ALTA", taxa: -1.25, limite: 0.5 },
  );
  assert.match(alertLog[0].mensagem, /Nível descendo 1\.25 m\/dia \(limite 0\.5\)/);
  assert.equal(alertLog[0].acao, "Investigar mesmo dentro da faixa normal.");
  assertSemCanais(alertLog[0]);
});

test("mantém no máximo 100 eventos, com o mais recente no início", () => {
  const alertLog = [];

  for (let i = 0; i < 101; i++) {
    registrarEventoNivel(cfg, alertLog, `PZ-${i}`, "NORMAL", i);
  }

  assert.equal(alertLog.length, 100);
  assert.equal(alertLog[0].piezometro, "PZ-100");
  assert.equal(alertLog.at(-1).piezometro, "PZ-1");
});

test("handleAlerts remove canais e publica log legado sanitizado", async () => {
  const env = {
    ALERT_STATE: {
      async get() {
        return JSON.stringify({
          lastNotifiedLevel: { "PZ-01": "ATENCAO" },
          commStatus: { "PZ-01": "OK" },
          taxaStatus: { "PZ-01": "OK" },
          alertLog: [{
            ts: "2026-08-22T12:00:00.000Z",
            tipo: "nivel",
            piezometro: "PZ-01",
            nivel: "ATENCAO",
            valor: 12.5,
            telegram: "enviado",
            sms: "enviado",
          }],
        });
      },
    },
  };

  const response = await handleAlerts(env, cfg);
  const body = await response.json();

  assert.equal("canais" in body, false);
  assert.deepEqual(body.notificacoes, [{
    ts: "2026-08-22T12:00:00.000Z",
    tipo: "nivel",
    piezometro: "PZ-01",
    nivel: "ATENCAO",
    valor: 12.5,
  }]);
  assertSemCanais(body.notificacoes[0]);
});

test("cron registra transição ATENCAO sem chamar rede", async () => {
  const agoraSeg = Math.floor(Date.now() / 1000);
  const env = {
    DB: {
      prepare(sql) {
        const results = sql.includes("COALESCE(recebido_em, ts)")
          ? [{ piezometro: "PZ-01", nivel_agua: 12.5, nivel_recente: 12.5, ts: agoraSeg, recebido_em: agoraSeg }]
          : sql.includes("WHERE piezometro = ?1")
            ? []
            : [{
                piezometro: "PZ-01",
                nivel_agua: 12.5,
                pressao: null,
                temperatura: null,
                ts: agoraSeg,
                recebido_em: agoraSeg,
              }];
        const statement = { all: async () => ({ results }) };
        statement.bind = () => statement;
        return statement;
      },
    },
  };
  const estado = {
    lastNotifiedLevel: {},
    lastCriticalNotify: {},
    commStatus: {},
    taxaStatus: {},
    alertLog: [],
  };
  const cfgCron = {
    ...cfg,
    ALERT_REPEAT_MIN: 15,
    TAXA_JANELA_MIN: 60,
    TAXA_MAX_M_DIA: 0.5,
    SILENCE_ALERT_SEC: 900,
    HISTERESE_M: 0.2,
  };
  const fetchAnterior = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("A transição do cron não pode fazer rede");
  };

  try {
    assert.equal(await checkAlerts(cfgCron, env, estado), true);
  } finally {
    globalThis.fetch = fetchAnterior;
  }

  assert.equal(estado.lastNotifiedLevel["PZ-01"], "ATENCAO");
  assert.equal(estado.alertLog.length, 1);
  assert.deepEqual(
    {
      tipo: estado.alertLog[0].tipo,
      piezometro: estado.alertLog[0].piezometro,
      nivel: estado.alertLog[0].nivel,
      valor: estado.alertLog[0].valor,
    },
    { tipo: "nivel", piezometro: "PZ-01", nivel: "ATENCAO", valor: 12.5 },
  );
  assertSemCanais(estado.alertLog[0]);
});

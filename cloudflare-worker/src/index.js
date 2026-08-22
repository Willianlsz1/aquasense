// ── Piezômetro — Cloudflare Worker ───────────────────────────────────────────
// Port do server.js (Node.js puro / Render) para Cloudflare Workers.
// Mesma responsabilidade: ingestão das leituras do ESP32 (/ingest), leitura
// dessas leituras para o dashboard (/ultimos, /dados) e motor de eventos de
// alerta escritos. Aqui o motor roda como CRON TRIGGER (scheduled()), o
// estado e o registro de eventos ficam persistidos no KV (Workers não mantêm
// estado entre invocações), e as leituras ficam no Cloudflare D1 (SQLite) em
// vez de um InfluxDB externo.
//
// Nota sobre rate limiting: o server.js original limitava requisições por IP
// em memória (rateBuckets). Isso não é possível de forma confiável em Workers
// (cada isolate pode processar requisições sem estado compartilhado local, e
// múltiplos data centers não veem o mesmo mapa). Omitimos essa proteção aqui
// de propósito — se for necessária, use o Cloudflare Rate Limiting nativo
// (regra na dashboard/WAF) em vez de reimplementar em memória.

import { getConfig } from "./config.js";
import { corsHeaders, json } from "./http.js";
import { lerEstado, salvarEstado, checkAlerts } from "./alertas.js";
import { executarRetencao } from "./retencao.js";
import {
  handleIngest,
  handleUltimos,
  handleDados,
  handleAlerts,
  handleConfig,
  handleHealth,
} from "./rotas.js";

// ── EXPORT DO WORKER ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const cfg = getConfig(env);
    const url = new URL(request.url);

    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(cfg) });
    }

    console.log(`${request.method} ${url.pathname}`);

    try {
      if (request.method === "POST" && url.pathname === "/ingest") {
        return await handleIngest(request, env, cfg);
      }
      if (url.pathname === "/ultimos") {
        return await handleUltimos(env, cfg);
      }
      if (url.pathname === "/dados") {
        return await handleDados(url, env, cfg);
      }
      if (url.pathname === "/alerts") {
        return await handleAlerts(env, cfg);
      }
      if (url.pathname === "/config") {
        return handleConfig(env, cfg);
      }
      if (url.pathname === "/health") {
        return handleHealth(cfg);
      }
    } catch (e) {
      console.error("Erro não tratado:", e.message);
      return json(cfg, 500, { error: e.message });
    }

    // Sem servir index.html: o dashboard é hospedado no GitHub Pages, não no
    // Worker — mantém o worker enxuto e focado no que precisa de backend.
    return json(cfg, 404, { error: "Not found" });
  },

  // Motor de alertas ativos — antes era setInterval(checkAlerts, ...) no
  // server.js; aqui roda pelo cron trigger definido em wrangler.toml
  // ([triggers] crons = ["* * * * *"]).
  async scheduled(event, env, ctx) {
    const cfg = getConfig(env);
    ctx.waitUntil((async () => {
      const estado = await lerEstado(env);
      let mutou = await checkAlerts(cfg, env, estado);

      // Retenção de dados (ver src/retencao.js): roda NO MÁXIMO 1x/dia — a
      // data (YYYY-MM-DD, UTC) da última execução fica no MESMO estado do
      // KV usado pelos alertas (campo ultimaRetencao), então só custa +1
      // write/dia (bem abaixo do limite do free tier), não 1440.
      // Erro na retenção NÃO pode derrubar o salvamento do estado dos
      // alertas (ex.: banco ainda sem a migração 0003 lançaria exceção a
      // cada ciclo e o commStatus/lastNotifiedLevel nunca seriam salvos):
      // captura, loga e tenta de novo no próximo ciclo — ultimaRetencao só
      // avança quando a execução de fato deu certo.
      const hojeUTC = new Date().toISOString().slice(0, 10);
      if (estado.ultimaRetencao !== hojeUTC) {
        try {
          await executarRetencao(env, cfg);
          estado.ultimaRetencao = hojeUTC;
          mutou = true;
        } catch (e) {
          console.error("Retenção: falhou (será tentada de novo no próximo ciclo):", e.message);
        }
      }

      // Só grava se algo mudou — respeita o limite de escritas do KV free tier
      if (mutou) await salvarEstado(env, estado);
    })());
  },
};

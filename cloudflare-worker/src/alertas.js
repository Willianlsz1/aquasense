// ── MOTOR DE ALERTAS ───────────────────────────────────────────────────────────
// Classificação de nível (com/sem histerese), cálculo de taxa de variação,
// estado persistido no KV e o checkAlerts() que varre as 3 camadas
// (nível, comunicação, taxa) a cada ciclo do cron.

import { lerUltimosNiveis, lerUltimasLeiturasTodas, lerLeituraBaseline } from "./db.js";
import { registrarEventoComunicacao, registrarEventoNivel, registrarEventoTaxa } from "./eventos.js";
import { PIEZOMETRO_ID_RE } from "./config.js";

// Classificação "pura" (sem histerese): usada tanto na SUBIDA de faixa quanto
// no primeiro ciclo de um piezômetro (quando ainda não há faixa anterior).
export function classify(cfg, n) {
  if (n >= cfg.NIVEL_CRITICO) return "CRITICO";
  if (n >= cfg.NIVEL_ATENCAO) return "ATENCAO";
  return "NORMAL";
}

export const ORDEM_FAIXA = { NORMAL: 0, ATENCAO: 1, CRITICO: 2 };

// P4 — classificação com histerese (deadband), ver docs/projeto/DASHBOARD_PROFISSIONAL.md
// §5 (ISA-18.2). Subir de faixa é imediato (não há motivo para atrasar um
// alarme de segurança), mas descer de faixa exige que o nível fique
// HISTERESE_M abaixo do limiar da faixa anterior — sem isso, um nível
// oscilando bem em cima de um limiar (ex.: 15,00 / 14,98 / 15,01 m) dispararia
// e cancelaria o alarme a cada ciclo ("chattering").
export function classifyComHisterese(cfg, nivel, faixaAnterior) {
  const puro = classify(cfg, nivel);
  if (faixaAnterior === null) return puro; // primeiro ciclo — sem histerese

  if (ORDEM_FAIXA[puro] >= ORDEM_FAIXA[faixaAnterior]) {
    // Subida (ou mesma faixa): usa o limiar puro, sem atraso.
    return puro;
  }

  // Descida: só confirma o rebaixamento se houver folga suficiente abaixo
  // do limiar da faixa anterior; caso contrário mantém a faixa anterior.
  if (faixaAnterior === "CRITICO") {
    return nivel < cfg.NIVEL_CRITICO - cfg.HISTERESE_M ? puro : "CRITICO";
  }
  if (faixaAnterior === "ATENCAO") {
    return nivel < cfg.NIVEL_ATENCAO - cfg.HISTERESE_M ? puro : "ATENCAO";
  }
  return puro; // faixaAnterior === "NORMAL" — não há como descer mais
}

// P3 — calcula a taxa de variação (m/dia) entre uma leitura atual e uma
// leitura-base, exigindo que o intervalo entre elas seja de pelo menos
// metade da janela configurada (evita taxa inflada por dois pontos quase
// simultâneos, ex.: piezômetro recém-cadastrado). Retorna null se não houver
// baseline válida.
export function calcularTaxaMDia(cfg, atual, baseline) {
  if (!baseline) return null;
  const deltaSeg = atual.ts - baseline.ts;
  if (deltaSeg < (cfg.TAXA_JANELA_MIN * 60) / 2) return null;
  return ((atual.nivel_agua - baseline.nivel_agua) / deltaSeg) * 86400;
}

// Estado persistido no KV — uma única chave "state", lida uma vez no início
// da execução do cron e gravada SÓ QUANDO ALGO MUDOU (checkAlerts retorna um
// flag de mutação). Na maioria dos ciclos nenhum piezômetro muda de faixa,
// então as escritas ficam muito abaixo do limite do free tier do KV
// (1000 writes/dia) mesmo com cron de 1 minuto.
function estadoVazio() {
  return {
    lastNotifiedLevel: {},
    lastCriticalNotify: {},
    commStatus: {}, // P2 — pz → "OK" | "SEM_SINAL"
    taxaStatus: {}, // P3 — pz → "OK" | "TAXA_ALTA"
    alertLog: [],
    ultimaRetencao: "", // data (YYYY-MM-DD, UTC) da última execução da retenção — ver index.js scheduled()
  };
}

export async function lerEstado(env) {
  const raw = await env.ALERT_STATE.get("state");
  if (!raw) return estadoVazio();
  try {
    const parsed = JSON.parse(raw);
    return {
      lastNotifiedLevel: parsed.lastNotifiedLevel || {},
      lastCriticalNotify: parsed.lastCriticalNotify || {},
      commStatus: parsed.commStatus || {},
      taxaStatus: parsed.taxaStatus || {},
      alertLog: Array.isArray(parsed.alertLog) ? parsed.alertLog : [],
      ultimaRetencao: parsed.ultimaRetencao || "",
    };
  } catch {
    return estadoVazio();
  }
}

export async function salvarEstado(env, estado) {
  if (estado.alertLog.length > 100) estado.alertLog = estado.alertLog.slice(0, 100);
  await env.ALERT_STATE.put("state", JSON.stringify(estado));
}

// O catálogo é uma configuração de interface, mas também define os instrumentos
// esperados pelo cron. Um item malformado não pode criar um alerta impossível de
// relacionar com um instrumento real.
function idsPiezometrosConfigurados(env) {
  try {
    const catalogo = JSON.parse(env.PIEZOMETROS || "[]");
    if (!Array.isArray(catalogo)) return [];
    return [...new Set(catalogo
      .map((item) => item && item.id)
      .filter((id) => typeof id === "string" && PIEZOMETRO_ID_RE.test(id)))];
  } catch {
    return [];
  }
}

// Port de checkAlerts() do server.js, operando sobre o estado carregado do KV.
// Retorna true se o estado foi modificado (e portanto precisa ser regravado).
export async function checkAlerts(cfg, env, estado) {
  let mutou = false;
  try {
    // Camada de NÍVEL — só enxerga quem teve leitura nos últimos 5 minutos.
    // Um piezômetro em SEM_SINAL simplesmente não aparece aqui: dado ausente
    // não conta como NORMAL, então ele fica de fora da avaliação de nível
    // (em vez de "puxar" a última leitura antiga e mascarar o silêncio).
    const niveis = await lerUltimosNiveis(env);
    const agora = Date.now();
    const agoraSeg = Math.floor(agora / 1000);

    for (const [pz, valor] of Object.entries(niveis)) {
      const anterior = Object.prototype.hasOwnProperty.call(estado.lastNotifiedLevel, pz)
        ? estado.lastNotifiedLevel[pz]
        : null; // null = primeiro ciclo deste piezômetro (não notifica NORMAL)
      // P4 — histerese só se aplica à descida; classify() puro decide a
      // subida (ver classifyComHisterese()).
      const nivel = classifyComHisterese(cfg, valor, anterior);
      const mudouDeFaixa = nivel !== anterior;
      const repetirCritico = nivel === "CRITICO" &&
        agora - (estado.lastCriticalNotify[pz] || 0) >= cfg.ALERT_REPEAT_MIN * 60000;

      if (mudouDeFaixa || repetirCritico) {
        if (anterior !== null || nivel !== "NORMAL") {
          registrarEventoNivel(cfg, estado.alertLog, pz, nivel, valor);
          if (nivel === "CRITICO") estado.lastCriticalNotify[pz] = agora;
        }
        estado.lastNotifiedLevel[pz] = nivel;
        mutou = true;
      }

    }

    // Camada de COMUNICAÇÃO (P2) — consulta TODOS os piezômetros já
    // cadastrados, sem janela de tempo, para detectar silêncio prolongado.
    // É deliberadamente separada da camada de nível acima.
    const ultimas = await lerUltimasLeiturasTodas(env);

    // P3 — usa a mesma leitura atual e a mesma referência temporal de
    // GET /ultimos. A recepção recente define se a leitura ainda é elegível;
    // a taxa em si usa ts do instrumento para não misturar dois relógios.
    for (const [pz, leitura] of Object.entries(ultimas)) {
      if (leitura.recebido_em < agoraSeg - 300) continue;
      const tsAlvo = leitura.ts - cfg.TAXA_JANELA_MIN * 60;
      const baseline = await lerLeituraBaseline(env, pz, tsAlvo);
      const taxa = calcularTaxaMDia(cfg, leitura, baseline);

      if (taxa === null) continue;
      const statusTaxa = Math.abs(taxa) > cfg.TAXA_MAX_M_DIA ? "TAXA_ALTA" : "OK";
      const statusTaxaAnterior = estado.taxaStatus[pz] || "OK";
      if (statusTaxa !== statusTaxaAnterior) {
        registrarEventoTaxa(cfg, estado.alertLog, pz, statusTaxa, taxa, cfg.TAXA_MAX_M_DIA);
        estado.taxaStatus[pz] = statusTaxa;
        mutou = true;
      }
    }

    // Inclui instrumentos válidos do catálogo mesmo antes da primeira leitura.
    // Assim o cron registra a ausência inicial e, quando a primeira leitura
    // chegar, registra a recuperação pela mesma transição de estado.
    const piezometros = new Set([...Object.keys(ultimas), ...idsPiezometrosConfigurados(env)]);
    for (const pz of piezometros) {
      const leitura = ultimas[pz];
      // O silêncio é medido pela última RECEPÇÃO (recebido_em), não pelo
      // relógio do device (ts) — a deriva do relógio simulado no Wokwi
      // causava falso SEM_SINAL quando medida por ts. lerUltimasLeiturasTodas
      // já garante o fallback para ts em linhas antigas sem recebido_em.
      const silencioSeg = leitura ? agoraSeg - leitura.recebido_em : null;
      const statusComm = !leitura || silencioSeg > cfg.SILENCE_ALERT_SEC ? "SEM_SINAL" : "OK";
      const statusCommAnterior = estado.commStatus[pz] || "OK";

      if (statusComm !== statusCommAnterior) {
        const silencioMin = leitura ? Math.round(silencioSeg / 60) : null;
        registrarEventoComunicacao(cfg, estado.alertLog, pz, statusComm, leitura && leitura.ts, silencioMin);
        estado.commStatus[pz] = statusComm;
        mutou = true;
      }
    }
  } catch (e) {
    console.error("Motor de alertas:", e.message);
  }
  return mutou;
}

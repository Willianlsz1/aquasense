// ── QUERIES D1 ────────────────────────────────────────────────────────────────
// Normalização de leituras cruas + todas as consultas/gravações na tabela
// `leituras` do D1 (ingestão, últimos níveis, baseline de taxa, série agregada).

import { PIEZOMETRO_ID_RE } from "./config.js";

// ── INGESTÃO (placa → D1) ────────────────────────────────────────────────────
// Normaliza uma leitura bruta {piezometro?, nivel_agua, pressao?, temperatura?,
// ts?} em um objeto pronto para virar bind params do INSERT. Retorna null se
// nivel_agua não for um número finito (campo obrigatório) OU se piezometro
// vier PRESENTE mas com formato inválido.
//
// indice/total = posição da leitura dentro do lote enviado no /ingest.
// Usados só para reconstruir o ts quando ele vem ausente/inválido (ver abaixo).
export function normalizarLeitura(leitura, indice = 0, total = 1) {
  if (!leitura || typeof leitura !== "object") return null;

  const nivel = leitura.nivel_agua;
  if (typeof nivel !== "number" || !Number.isFinite(nivel)) return null;

  const pressao =
    typeof leitura.pressao === "number" && Number.isFinite(leitura.pressao) ? leitura.pressao : null;
  const temperatura =
    typeof leitura.temperatura === "number" && Number.isFinite(leitura.temperatura)
      ? leitura.temperatura
      : null;

  // Campo AUSENTE mantém o fallback "PZ-01" (compatibilidade com firmware
  // antigo que não manda o campo). Campo PRESENTE mas com formato inválido
  // é REJEITADO (retorna null) em vez de rebatizado para "PZ-01": rebatizar
  // silenciosamente misturaria, no mesmo instrumento lógico, leituras de
  // sensores físicos diferentes — inaceitável em monitoramento de segurança,
  // onde cada piezômetro mede poropressão de uma camada específica.
  let piezometro = "PZ-01";
  if (leitura.piezometro !== undefined && leitura.piezometro !== null) {
    if (typeof leitura.piezometro !== "string" || !PIEZOMETRO_ID_RE.test(leitura.piezometro)) {
      return null;
    }
    piezometro = leitura.piezometro;
  }

  const agoraMs = Date.now();
  const agoraSeg = Math.floor(agoraMs / 1000);
  const tsBruto = leitura.ts;
  let ts;
  if (Number.isInteger(tsBruto) && tsBruto > 1e9 && tsBruto < 1e11) {
    ts = tsBruto;
  } else {
    // ts ausente/inválido (NTP falhou no device): sem isso, TODAS as
    // leituras do lote cairiam no mesmo Math.floor(Date.now()/1000) e, com
    // o índice único (piezometro, ts) da migração 0002, um lote inteiro
    // colapsaria em 1 linha. Aproximação: reconstrói o tempo de cada
    // leitura assumindo o INTERVALO_ENVIO de 10 s do firmware, contando
    // "de trás para frente" a partir de agora.
    ts = agoraSeg - (total - 1 - indice) * 10;
  }

  // Relógio do device adiantado não pode projetar leitura no futuro. O clamp
  // escalona como o fallback acima: colapsar o lote inteiro no MESMO agoraSeg
  // faria o índice único (piezometro, ts) + OR IGNORE descartar N-1 leituras
  // em silêncio — e o firmware, recebendo 204, apagaria o buffer.
  if (ts > agoraSeg + 300) ts = agoraSeg - (total - 1 - indice) * 10;

  const recebido_em = agoraSeg;

  return { piezometro, nivel_agua: nivel, pressao, temperatura, ts, recebido_em };
}

// Grava um lote de leituras já normalizadas no D1 (INSERT em batch).
// OR IGNORE: reenvio do buffer store & forward do firmware (ex.: HTTP 204 de
// confirmação perdido) não duplica linha — o índice único (piezometro, ts)
// da migração 0002 faz o SQLite descartar a repetição silenciosamente.
export async function inserirLeituras(env, normalizadas) {
  const stmt = env.DB.prepare(
    "INSERT OR IGNORE INTO leituras (piezometro, nivel_agua, pressao, temperatura, ts, recebido_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
  );
  const batch = normalizadas.map((l) =>
    stmt.bind(l.piezometro, l.nivel_agua, l.pressao, l.temperatura, l.ts, l.recebido_em)
  );
  await env.DB.batch(batch);
}

// Consultas indexadas de estado atual ficam isoladas do histórico agregado.
export { lerUltimosNiveis, lerUltimasLeiturasTodas, lerEstadoLeituras } from "./db-ultimas.js";

// P3 — busca, para um piezômetro, a leitura mais próxima (mais recente que
// não ultrapasse) de um instante-alvo no passado. Usada tanto pelo motor de
// alertas (taxa de variação) quanto por GET /ultimos (campo taxa_m_dia).
export async function lerLeituraBaseline(env, piezometro, tsAlvo) {
  const { results } = await env.DB.prepare(
    `SELECT nivel_agua, ts FROM leituras
      WHERE piezometro = ?1 AND ts <= ?2
      ORDER BY ts DESC LIMIT 1`
  )
    .bind(piezometro, tsAlvo)
    .all();

  const row = results && results[0];
  if (!row) return null;
  return { nivel_agua: Number(row.nivel_agua), ts: Number(row.ts) };
}

// GET /dados — série histórica agregada em buckets para um piezômetro dentro
// de uma janela de tempo. P5 — nivel_max preserva o PICO do bucket (ver
// handleDados em rotas.js para o porquê). nivel_min e n_leituras alimentam a
// auditoria do CSV exportado (mín. do intervalo e nº de amostras que formaram
// a agregação — ver exportar.js).
export async function lerDadosAgregados(env, pz, range, desde) {
  const { results } = await env.DB.prepare(
    `SELECT CAST(ts / ?1 AS INTEGER) * ?1 AS t,
            AVG(nivel_agua) AS nivel_agua,
            MAX(nivel_agua) AS nivel_max,
            MIN(nivel_agua) AS nivel_min,
            COUNT(*) AS n_leituras,
            AVG(pressao) AS pressao,
            AVG(temperatura) AS temperatura
       FROM leituras
      WHERE piezometro = ?2 AND ts >= ?3
      GROUP BY t
      ORDER BY t`
  )
    .bind(range.bucket, pz, desde)
    .all();

  return results || [];
}

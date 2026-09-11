// ── RETENÇÃO DE DADOS ─────────────────────────────────────────────────────────
// Consolida leituras brutas mais antigas que RETENCAO_DIAS em 1 linha/dia/
// piezômetro (tabela `leituras_diario`) e apaga as brutas já consolidadas —
// histórico "infinito" sem deixar a tabela `leituras` crescer sem limite.
// Chamada no máximo 1x/dia pelo scheduled() em index.js (ver estado no KV,
// campo `ultimaRetencao` em alertas.js).

// Consolida dias anteriores ao início UTC do dia de corte. Leituras que
// chegarem depois para um dia consolidado entram por média ponderada.
// O batch mantém a atualização do resumo e a exclusão bruta atômicas.
export async function executarRetencao(env, cfg) {
  if (!Number.isInteger(cfg.RETENCAO_DIAS) || cfg.RETENCAO_DIAS < 1) {
    throw new Error("RETENCAO_DIAS deve ser um inteiro positivo; limpeza cancelada");
  }
  // Só dias UTC completos. Um corte no meio do dia separaria seu resumo
  // entre execuções. Leituras atrasadas são somadas ao resumo já existente.
  const corte = (Math.floor(Date.now() / 86400000) - cfg.RETENCAO_DIAS) * 86400;

  const consolidar = env.DB.prepare(
    `INSERT INTO leituras_diario
            (piezometro, dia, nivel_medio, nivel_min, nivel_max, n_leituras)
     SELECT piezometro,
            CAST(ts / 86400 AS INTEGER) * 86400 AS dia,
            AVG(nivel_agua),
            MIN(nivel_agua),
            MAX(nivel_agua),
            COUNT(*)
       FROM leituras
      WHERE ts < ?1
      GROUP BY piezometro, CAST(ts / 86400 AS INTEGER)
     ON CONFLICT(piezometro, dia) DO UPDATE SET
       nivel_medio = (leituras_diario.nivel_medio * leituras_diario.n_leituras
                     + excluded.nivel_medio * excluded.n_leituras)
                    / (leituras_diario.n_leituras + excluded.n_leituras),
       nivel_min = MIN(leituras_diario.nivel_min, excluded.nivel_min),
       nivel_max = MAX(leituras_diario.nivel_max, excluded.nivel_max),
       n_leituras = leituras_diario.n_leituras + excluded.n_leituras`
  )
    .bind(corte);

  // D1 batch é transacional: se a limpeza falhar, o resumo também volta.
  const [consolidado, apagado] = await env.DB.batch([
    consolidar,
    env.DB.prepare(`DELETE FROM leituras WHERE ts < ?1`).bind(corte),
  ]);

  const diasConsolidados = consolidado.meta?.changes ?? 0;
  const linhasApagadas = apagado.meta?.changes ?? 0;
  console.log(
    `🗄️ Retenção: ${diasConsolidados} dia(s)/piezômetro consolidado(s) em leituras_diario, ${linhasApagadas} leitura(s) bruta(s) apagada(s) (corte=${corte})`
  );

  return { diasConsolidados, linhasApagadas };
}

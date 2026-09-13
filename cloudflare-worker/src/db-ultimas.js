// Cada passo procura o próximo instrumento no índice, sem GROUP BY do histórico.
// Inclui instrumentos fora do catálogo para preservar o contrato existente.
const INSTRUMENTOS = `WITH RECURSIVE instrumentos(piezometro) AS (
  SELECT MIN(piezometro) FROM leituras
  UNION ALL
  SELECT (SELECT MIN(piezometro) FROM leituras WHERE piezometro > instrumentos.piezometro)
    FROM instrumentos WHERE piezometro IS NOT NULL
)`;

const ULTIMAS = `SELECT l.piezometro, l.nivel_agua, l.pressao, l.temperatura, l.ts, l.recebido_em
  FROM instrumentos p JOIN leituras l ON l.id = (
    SELECT id FROM leituras WHERE piezometro = p.piezometro ORDER BY id DESC LIMIT 1
  )`;

function mapearUltimas(results) {
  const ultimas = {};
  for (const row of results || []) {
    ultimas[row.piezometro] = {
      nivel_agua: Number(row.nivel_agua), pressao: row.pressao, temperatura: row.temperatura,
      ts: Number(row.ts), recebido_em: Number(row.recebido_em) || Number(row.ts),
    };
  }
  return ultimas;
}

export async function lerUltimasLeiturasTodas(env) {
  const { results } = await env.DB.prepare(`${INSTRUMENTOS} ${ULTIMAS}`).all();
  return mapearUltimas(results);
}

// Preserva a seleção por MAX(id) entre recepções recentes, mesmo se uma linha
// legada inserida depois tiver recebido_em antigo ou nulo.
export async function lerEstadoLeituras(env) {
  const desde = Math.floor(Date.now() / 1000) - 300;
  const { results } = await env.DB.prepare(`${INSTRUMENTOS}, recentes AS (
    SELECT piezometro, MAX(id) AS id FROM leituras INDEXED BY idx_leituras_recepcao
     WHERE COALESCE(recebido_em, ts) >= ?1 GROUP BY piezometro
  ), ultimas AS (${ULTIMAS})
  SELECT u.*, n.nivel_agua AS nivel_recente FROM ultimas u
  LEFT JOIN recentes r ON r.piezometro = u.piezometro
  LEFT JOIN leituras n ON n.id = r.id`).bind(desde).all();
  const niveis = {};
  for (const row of results || []) {
    if (row.nivel_recente !== null && row.nivel_recente !== undefined && Number.isFinite(Number(row.nivel_recente))) {
      niveis[row.piezometro] = Number(row.nivel_recente);
    }
  }
  return { ultimas: mapearUltimas(results), niveis };
}

export async function lerUltimosNiveis(env) {
  return (await lerEstadoLeituras(env)).niveis;
}

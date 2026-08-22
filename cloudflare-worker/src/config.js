// ── CONFIG ────────────────────────────────────────────────────────────────────
// Constantes de validação/limites e leitura das env vars do Worker (limiares
// de alerta e janelas de agregação de /dados).

export const PIEZOMETRO_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
export const INGEST_MAX_BYTES = 64 * 1024; // /ingest recebe lotes do store & forward
export const INGEST_MAX_LEITURAS = 200;

// Janelas de agregação disponíveis em GET /dados: nome → { janela em
// segundos, tamanho do bucket em segundos usado no GROUP BY }.
export const RANGES = {
  "24h": { janela: 24 * 3600, bucket: 1800 },
  "7d": { janela: 7 * 24 * 3600, bucket: 7200 },
  "30d": { janela: 30 * 24 * 3600, bucket: 28800 },
};

// ── HELPERS DE CONFIG ─────────────────────────────────────────────────────────
export function getConfig(env) {
  const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || "*";
  const DEVICE_KEY = env.DEVICE_KEY || "";

  // Chave por dispositivo (opcional): JSON { "PZ-01": "chave-do-pz01", ... },
  // definido via `wrangler secret put DEVICE_KEYS`. Permite revogar a chave
  // de UM piezômetro de campo sem afetar a frota inteira — com a DEVICE_KEY
  // única antiga, vazar a chave de um device comprometia todos. JSON inválido
  // vira null (loga o erro) e handleIngest cai no fallback de DEVICE_KEY
  // única, mantendo o serviço no ar em vez de travar a ingestão inteira por
  // um typo no secret.
  let DEVICE_KEYS = null;
  if (env.DEVICE_KEYS) {
    try {
      DEVICE_KEYS = JSON.parse(env.DEVICE_KEYS);
    } catch (e) {
      console.error("DEVICE_KEYS: JSON inválido —", e.message);
      DEVICE_KEYS = null;
    }
  }

  // Retenção de dados brutos (dias) — leituras mais antigas que isso são
  // consolidadas em 1 linha/dia/piezômetro (leituras_diario) e apagadas da
  // tabela `leituras`. Ver src/retencao.js. Default 180 dias — folga de 6x
  // sobre o maior range servido pelo dashboard (30d).
  const RETENCAO_DIAS = parseInt(env.RETENCAO_DIAS || "180", 10);

  const NIVEL_ATENCAO = parseFloat(env.NIVEL_ATENCAO || "12");
  const NIVEL_CRITICO = parseFloat(env.NIVEL_CRITICO || "15");
  const ALERT_REPEAT_MIN = parseInt(env.ALERT_REPEAT_MIN || "15", 10);

  // P2 (alarme de comunicação) e P3 (taxa de variação) — ver
  // docs/projeto/DASHBOARD_PROFISSIONAL.md §2/§4/§6.
  const SILENCE_ALERT_SEC = parseInt(env.SILENCE_ALERT_SEC || "900", 10);
  const TAXA_JANELA_MIN = parseInt(env.TAXA_JANELA_MIN || "60", 10);
  const TAXA_MAX_M_DIA = parseFloat(env.TAXA_MAX_M_DIA || "0.5");
  const STALE_SEG = parseInt(env.STALE_SEG || "60", 10);

  // P4 — histerese (deadband) na classificação de nível: evita alarme
  // "chattering" quando o nível oscila bem em cima do limiar (ISA-18.2).
  // Só é aplicada na DESCIDA de faixa — ver classifyComHisterese().
  const HISTERESE_M = parseFloat(env.HISTERESE_M || "0.2");

  return {
    ALLOWED_ORIGIN, DEVICE_KEY, DEVICE_KEYS, RETENCAO_DIAS,
    NIVEL_ATENCAO, NIVEL_CRITICO, ALERT_REPEAT_MIN,
    SILENCE_ALERT_SEC, TAXA_JANELA_MIN, TAXA_MAX_M_DIA, STALE_SEG, HISTERESE_M,
  };
}

-- ── Piezômetro — Schema D1 (SQLite) ─────────────────────────────────────────
-- Tabela única com todas as leituras de todos os piezômetros. Substitui o
-- InfluxDB: sem measurement/bucket, é só uma tabela relacional com índice
-- por (piezometro, ts) para as consultas de "última leitura" e "série
-- histórica" ficarem rápidas.
--
-- Aplique com:
--   wrangler d1 execute piezometro-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS leituras (
  id          INTEGER PRIMARY KEY AUTOINCREMENT, -- identificador interno, auto-incremental
  piezometro  TEXT NOT NULL DEFAULT 'PZ-01',      -- identificador do sensor (ex.: "PZ-01")
  nivel_agua  REAL NOT NULL,                      -- nível d'água medido, em metros
  pressao     REAL,                               -- pressão atmosférica opcional, em hPa
  temperatura REAL,                                -- temperatura opcional, em °C
  ts          INTEGER NOT NULL,                   -- instante da leitura (medição), epoch em SEGUNDOS
  recebido_em INTEGER                              -- instante em que o Worker recebeu a leitura, epoch em
                                                    -- SEGUNDOS (nullable) — fonte de frescor, imune à deriva
                                                    -- do relógio do device
);

-- Acelera tanto o "SELECT última leitura de cada piezômetro" (MAX(id) por
-- piezometro) quanto as agregações por janela de tempo (WHERE piezometro = ?
-- AND ts >= ?), que são os dois padrões de consulta usados pelo Worker.
CREATE INDEX IF NOT EXISTS idx_leituras_pz_ts ON leituras (piezometro, ts);

-- Reenvio idempotente do buffer store & forward do firmware (ex.: HTTP 204
-- de confirmação perdido) não deve duplicar a linha — o INSERT OR IGNORE em
-- db.js depende deste índice único para descartar a repetição.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leituras_pz_ts_unico ON leituras (piezometro, ts);

-- ── RETENÇÃO DE DADOS (histórico infinito, banco enxuto) ─────────────────────
-- Consolida leituras brutas mais antigas que RETENCAO_DIAS em 1 linha/dia/
-- piezômetro (ver src/retencao.js e migrations/0003_retencao_diaria.sql).
-- Nenhum endpoint consome esta tabela ainda — fica disponível para uma
-- futura análise de longo prazo.
CREATE TABLE IF NOT EXISTS leituras_diario (
  piezometro  TEXT NOT NULL,                -- identificador do sensor (ex.: "PZ-01")
  dia         INTEGER NOT NULL,             -- epoch em SEGUNDOS do início do dia UTC (00:00)
  nivel_medio REAL,                          -- média do nível d'água no dia, em metros
  nivel_min   REAL,                          -- mínimo do nível d'água no dia, em metros
  nivel_max   REAL,                          -- máximo do nível d'água no dia, em metros
  n_leituras  INTEGER,                       -- nº de leituras brutas que formaram o resumo do dia
  PRIMARY KEY (piezometro, dia)
);

-- Última inserção por instrumento; preserva reenvios fora de ordem de ts.
CREATE INDEX IF NOT EXISTS idx_leituras_pz_id ON leituras(piezometro, id);
-- Limita a avaliação de nível às recepções recentes, incluindo dados legados.
CREATE INDEX IF NOT EXISTS idx_leituras_recepcao ON leituras(COALESCE(recebido_em, ts));

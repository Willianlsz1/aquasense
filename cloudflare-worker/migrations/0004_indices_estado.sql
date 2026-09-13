-- Última inserção por instrumento; preserva reenvios fora de ordem de ts.
CREATE INDEX IF NOT EXISTS idx_leituras_pz_id ON leituras(piezometro, id);
-- Limita a avaliação de nível às recepções recentes, incluindo dados legados.
CREATE INDEX IF NOT EXISTS idx_leituras_recepcao ON leituras(COALESCE(recebido_em, ts));

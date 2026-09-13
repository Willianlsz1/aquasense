# Redução de leituras D1 — 13/09/2026

## Alteração

`src/db-ultimas.js` substitui o agrupamento de todo o histórico por buscas indexadas:
o próximo identificador de instrumento e a última inserção de cada instrumento.
Instrumentos fora do catálogo continuam incluídos. A última inserção continua sendo
definida por `id`, não pelo horário do dispositivo, preservando reenvios fora de ordem.

O motor de alertas usa uma consulta para obter a última leitura e o último nível
recebido nos cinco minutos anteriores. O filtro por recepção mantém o fallback
`COALESCE(recebido_em, ts)` dos dados legados. Uma última inserção antiga não oculta
outra leitura recente da avaliação de nível.

## Índices e implantação

A migração `0004_indices_estado.sql` adiciona índices por `(piezometro, id)` e pela
expressão de recepção. É idempotente e roda antes da publicação do Worker.
O índice de recepção é explicitado na consulta para evitar que o agrupamento leve
o otimizador a preferir uma varredura de todo o histórico.

Os índices exigem armazenamento e manutenção adicional em cada gravação. Não há
alteração no firmware, frequência de envio, polling da dashboard, cron, limiares,
retenção ou exportações. Nenhum dado é apagado por esta migração.

## Evidência e limites

- 49 testes locais passaram, incluindo SQLite real com 30 mil registros.
- `EXPLAIN QUERY PLAN` confirmou buscas pelos índices de instrumento e recepção,
  sem varredura completa da tabela nas consultas novas.
- Cobertos banco vazio, migração repetida, instrumento fora do catálogo, relógio
  atrasado, recepção nula e última inserção mais antiga que outra leitura recente.
- Resultado local não mede a contabilização `rows_read` do D1 em produção. O ganho
  real deve ser medido após a liberação da cota diária e a implantação dos índices.
- O limite já consumido não é restaurado por esta alteração. Se o D1 bloquear a
  migração, a publicação é interrompida antes de substituir o Worker.

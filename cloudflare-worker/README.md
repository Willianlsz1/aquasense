# Backend do AquaSense

Cloudflare Worker para o protótipo de bancada ESP32 e HC-SR04. O D1 armazena
leituras; KV armazena estados e registros do motor de alertas. A interface está
no GitHub Pages. Consulte o [guia mestre](../docs/GUIA_MESTRE.md).

## Rotas

| Rota | Função |
|---|---|
| POST /ingest | Autenticação por chave, validação e gravação de leituras. |
| GET /ultimos | Última inserção por instrumento, recepção e taxa calculada. |
| GET /dados | Intervalos agregados por instrumento e período. |
| GET /alerts | Estado e até 50 eventos persistidos da rede. |
| GET /config | Configuração pública do painel. |
| GET /health | Resposta de saúde da rota; não comprova disponibilidade do D1. |

## Configuração existente

`wrangler.toml` define nome do Worker, bindings D1/KV, cron de um minuto,
origem permitida, catálogo e limiares da demonstração. Credenciais ficam em
secrets e não devem ser copiadas para código, documentação ou logs públicos.
`DEVICE_KEY` é a chave compartilhada; `DEVICE_KEYS` permite chaves por instrumento.
Não há envio de notificações por provedores externos.

Não recriar banco ou namespace para usar a instalação existente. Para uma instalação
nova, provisionar recursos separados, configurar bindings, aplicar `schema.sql` e
cadastrar as credenciais em ambiente próprio. O schema não é substituto das migrações
para bancos existentes.

## Manutenção e publicação

Na raiz do projeto, executar `npm test` com Node.js 24. O workflow
`.github/workflows/deploy-worker.yml` aplica as migrações de `migrations/` antes de
publicar o Worker quando um push em `main` altera o backend. Falha de migração
interrompe a publicação. Conferir o resultado do workflow e o endpoint após o envio.

As consultas atuais usam os índices de instrumento e recepção introduzidos pela
migração 0004. O motor usa um snapshot de leituras por ciclo; as regras de faixa,
histerese, comunicação e taxa foram preservadas. A economia real de `rows_read`
em produção ainda não foi medida.

## Limites

O limite diário do D1 pode impedir consultas mesmo com Worker publicado. Cache ou
resposta de saúde não demonstram nova medição. Não converter falha do serviço em
leitura fictícia. A cota consumida não é restaurada por uma publicação.

O índice único de instrumento e horário trata reenvios; não garante recuperação
ilimitada. O buffer da placa é RAM e tem limites. Retenção consolida dias completos
mais antigos que a configuração atual, mantendo resumos diários. Nenhum endpoint
da dashboard consulta a tabela diária neste momento.

Em 13/09 foram publicados os índices e o Worker do commit `0cc0d78`; a chamada
posterior ainda estava bloqueada pela cota. Essa é uma evidência datada, não o
estado presumido de toda consulta futura.

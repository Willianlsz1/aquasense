# Piezômetro — Worker Cloudflare (port do server.js)

Port do proxy Node.js (`../server.js`) para **Cloudflare Workers**: mesma
ingestão do ESP32 e motor de alertas escritos (agora rodando como *cron
trigger* em vez de `setInterval`, com o estado persistido no KV), e as
leituras armazenadas no **Cloudflare D1** (SQLite gerenciado) em vez de um
InfluxDB externo. O InfluxDB não é mais necessário para este projeto — se
você criou uma conta só para isso, pode encerrá-la.

## 1. Instalar o wrangler e autenticar

```bash
npm i -g wrangler
wrangler login
```

## 2. Criar o KV namespace do motor de alertas

(pule este passo se o namespace já existir de uma instalação anterior)

```bash
wrangler kv namespace create ALERT_STATE
```

Copie o `id` retornado e cole em `wrangler.toml`, no bloco `[[kv_namespaces]]`,
no lugar do id já preenchido.

## 3. Criar o banco D1 e aplicar o schema

```bash
wrangler d1 create piezometro-db
```

Copie o `database_id` retornado e cole em `wrangler.toml`, no bloco
`[[d1_databases]]`, no lugar de `"COLOQUE_O_ID_AQUI"`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "piezometro-db"
database_id = "seu-database-id-aqui"
```

Depois aplique o schema (tabela `leituras` + índice) no banco remoto:

```bash
wrangler d1 execute piezometro-db --remote --file=schema.sql
```

## 4. Definir os segredos

Estes valores **nunca** vão no `wrangler.toml` (fica em texto puro e pode ir
pro Git) — use `wrangler secret put`, que pergunta o valor interativamente.
É só um segredo de autenticação:

```bash
wrangler secret put DEVICE_KEY
```

`DEVICE_KEY` protege o `/ingest`. As transições de faixa são registradas no KV
e apresentadas como alertas escritos e visuais no dashboard; não há canal
externo de notificação configurável.

### Chave por dispositivo (`DEVICE_KEYS`, opcional)

Além da `DEVICE_KEY` única (uma chave compartilhada por toda a frota), o
Worker aceita uma chave **por piezômetro**, revogável individualmente sem
afetar os demais devices — útil se um ESP32 de campo for perdido/comprometido:
trocar só a chave dele no JSON, sem precisar reconfigurar toda a frota.

```bash
wrangler secret put DEVICE_KEYS
```

O valor é um JSON `{"piezometro": "chave"}`, um por instrumento cadastrado:

```json
{"PZ-01": "chave-do-pz01", "PZ-02": "chave-do-pz02"}
```

Regras de autenticação do `POST /ingest` (fail-closed, igual ao modo antigo):

- Se `DEVICE_KEYS` estiver definida (e for um JSON válido), ela tem
  prioridade sobre `DEVICE_KEY`: a chave do header `x-device-key` precisa
  bater com a entrada do piezômetro de **cada** leitura do lote enviado —
  um device só pode enviar leituras do(s) piezômetro(s) cuja chave ele
  apresentou. Um lote com leitura de outro piezômetro (chave vazada usada
  para outro pz, ou firmware mal configurado) é rejeitado inteiro com 401.
- Se `DEVICE_KEYS` não estiver definida (ou o secret tiver JSON inválido —
  logado como erro e tratado como ausente), o Worker cai no comportamento
  atual: `DEVICE_KEY` única para todos os devices.
- Se nenhuma das duas existir, a resposta é 503 (mesma mensagem de antes) —
  ingestão bloqueada até algum segredo de autenticação ser definido.

**Migração gradual**: dá para manter `DEVICE_KEY` única enquanto só existir
1-2 devices e criar `DEVICE_KEYS` só quando a frota crescer (ou quando quiser
revogação por instrumento) — as duas formas nunca precisam coexistir de
propósito, mas nada impede manter `DEVICE_KEY` definida como fallback
"morto" (ela é ignorada assim que `DEVICE_KEYS` existir).

## 5. Ajustar as variáveis não sensíveis

Edite o bloco `[vars]` em `wrangler.toml` conforme o seu ambiente:

- `ALLOWED_ORIGIN` → coloque a URL exata do seu GitHub Pages (sem barra
  final), nunca deixe `"*"` em produção
- `NIVEL_ATENCAO`, `NIVEL_CRITICO`, `ALERT_REPEAT_MIN`
- `SILENCE_ALERT_SEC` (default `"900"`, 15 min) → tempo de silêncio de um
  piezômetro (sem nenhuma leitura nova, independente do valor) a partir do
  qual o motor de alertas dispara o **alarme de comunicação** — camada
  separada do alarme de nível, que registra a mudança de estado. Dado ausente nunca é tratado
  como NORMAL: enquanto um piezômetro está em silêncio, ele fica de fora da
  avaliação de nível.
- `TAXA_JANELA_MIN` (default `"60"`, 1 hora) → janela usada para calcular a
  **taxa de variação** do nível d'água: cada leitura atual é comparada com a
  leitura mais próxima de "agora − `TAXA_JANELA_MIN`" para estimar a
  velocidade de subida/descida em m/dia (campo `taxa_m_dia` em
  `/ultimos`).
- `TAXA_MAX_M_DIA` (default `"0.5"`) → limite de taxa de variação (m/dia)
  acima do qual dispara o alerta de "variação rápida", mesmo com o nível
  ainda dentro da faixa NORMAL. A referência profissional (ASDSO) é 0,1
  m/dia; o default aqui é maior de propósito, por se tratar de um protótipo
  didático com sensor stand-in mais ruidoso.
- `STALE_SEG` (default `"120"`) → não é usado pelo motor de alertas em si;
  é só servido em `GET /config` para o **dashboard** decidir quando marcar um
  piezômetro como "sem sinal" na interface, evitando duplicar esse número
  no `index.html`. Default mais tolerante que os antigos 60s porque no
  Wokwi a simulação roda mais devagar que o tempo real (um envio a cada
  10s simulados pode demorar 20-30s reais). O frescor é calculado com base
  em `recebido_em` (hora em que o Worker recebeu a leitura), não em `ts`
  (hora da medição no device) — isso evita falso "sem sinal" causado pela
  deriva do relógio simulado do ESP32 no Wokwi. Bancos D1 criados antes
  desta mudança precisam da migração `migrations/0001_recebido_em.sql`
  (`wrangler d1 execute piezometro-db --remote --file=migrations/0001_recebido_em.sql`),
  que adiciona a coluna `recebido_em` (linhas antigas ficam `NULL` e os
  consumidores fazem fallback para `ts`). Aplique a migração **antes** do
  `wrangler deploy` desta versão — o Worker novo referencia a coluna e a
  ingestão falharia num banco ainda sem ela.
- `HISTERESE_M` (default `"0.2"`, 20 cm) → folga (deadband) exigida para
  **descer** de faixa na classificação de nível (CRÍTICO→ATENÇÃO/NORMAL ou
  ATENÇÃO→NORMAL): o nível precisa cair `HISTERESE_M` metros abaixo do
  limiar da faixa anterior antes de o motor confirmar o rebaixamento.
  **Subir** de faixa continua imediato, sem histerese — não faz sentido
  atrasar um alarme de segurança. Sem essa folga, um nível oscilando bem em
  cima de um limiar (ex.: 15,00 / 14,98 / 15,01 m) dispararia e cancelaria o
  alerta a cada ciclo do cron ("chattering"), prática desaconselhada pela
  norma ISA-18.2 de gerenciamento de alarmes.

## 6. Deploy

```bash
wrangler deploy
```

Ao final, o wrangler imprime a URL pública, algo como:

```
https://piezometro-worker.<seu-subdominio>.workers.dev
```

## 7. Testar

```bash
# Health check
curl https://piezometro-worker.<seu-subdominio>.workers.dev/health

# Ingestão de uma leitura (troque SUA-DEVICE-KEY pela que você definiu)
curl -X POST https://piezometro-worker.<seu-subdominio>.workers.dev/ingest \
  -H "Content-Type: application/json" \
  -H "x-device-key: SUA-DEVICE-KEY" \
  -d '{"piezometro":"PZ-01","nivel_agua":10.4,"pressao":1013.2,"temperatura":24.1}'

# Última leitura de cada piezômetro
curl https://piezometro-worker.<seu-subdominio>.workers.dev/ultimos

# Série histórica agregada (últimas 24h, buckets de 30min)
curl "https://piezometro-worker.<seu-subdominio>.workers.dev/dados?pz=PZ-01&range=24h"
```

Cada ponto de `GET /dados` traz `nivel_agua` (média do bucket) **e**
`nivel_max` (o maior valor lido dentro daquele bucket). Em monitoramento de
segurança a média pode mascarar uma excursão breve acima do limiar — um
bucket de 30 min com um pico de 15,3 m por 2 minutos, por exemplo, pode
aparecer no gráfico como uma média tranquila de 12,1 m se só `nivel_agua`
for plotado. `nivel_max` existe para o dashboard conseguir destacar o pico
real, não apenas a tendência suavizada.

```bash
# Config (limiares, ranges aceitos e catálogo de piezômetros p/ o dashboard)
curl https://piezometro-worker.<seu-subdominio>.workers.dev/config
```

## 8. Apontar o firmware e o dashboard para o Worker

- **Firmware** (`../firmware/sketch.ino`): troque `SERVER_URL` para
  `https://piezometro-worker.<seu-subdominio>.workers.dev/ingest`.
- **Dashboard** (`../index.html`): aponte para
  `https://piezometro-worker.<seu-subdominio>.workers.dev/ultimos` (status
  atual) e `.../dados?pz=<id>&range=<24h|7d|30d>` (gráficos históricos).

## 9. Testar o cron (motor de alertas) localmente

```bash
wrangler dev --test-scheduled
```

Em outro terminal, dispare o cron manualmente:

```bash
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

Isso executa `scheduled()` uma vez — leia os logs do `wrangler dev` para
confirmar que ele buscou os últimos níveis no D1, avaliou as faixas e registrou
os eventos no KV.

## Observação sobre o volume do cron

O `wrangler.toml` está configurado para `* * * * *` (a cada 1 minuto), igual
ao `ALERT_POLL_SEC=60` padrão do `server.js`. Cada execução faz 1 leitura no
KV (~1440/dia — o free tier permite 100.000 leituras/dia) e uma consulta ao
D1, mas só **grava** no KV quando algum piezômetro muda de faixa ou o alerta
CRÍTICO é repetido. Em operação normal isso significa poucas escritas por
dia, bem abaixo do limite de 1000 escritas/dia do KV gratuito — não é preciso
mexer no cron.

## Sobre a retenção de dados

Diferente do InfluxDB (que costuma ter política de retenção configurável e
frequentemente limitada nos planos gratuitos), o D1 não expira dados
automaticamente — mas deixar a tabela `leituras` crescer para sempre não é
de graça (limite de 5 GB no free tier, consultas mais lentas com o tempo).
O Worker resolve isso com **retenção com consolidação**: histórico
"infinito" em tamanho de banco enxuto.

Uma vez por dia (dentro do cron de 1 min já existente, controlado pelo campo
`ultimaRetencao` no mesmo estado do KV usado pelos alertas — ver
`src/retencao.js` e `scheduled()` em `src/index.js`), o Worker:

1. Agrupa as leituras BRUTAS mais antigas que `RETENCAO_DIAS` dias
   (`[vars]` em `wrangler.toml`, default `"180"`) por piezômetro e dia
   (UTC), calculando média/mín/máx do nível d'água e o nº de leituras — e
   grava 1 linha por piezômetro/dia na tabela `leituras_diario`
   (`INSERT OR REPLACE`, então rodar de novo no mesmo dia é seguro/idempotente).
2. Apaga da tabela `leituras` as linhas brutas já consolidadas
   (`DELETE ... WHERE ts < corte`).

Para mudar o prazo, edite `RETENCAO_DIAS` em `wrangler.toml` (o default de
180 dias é 6x o maior range servido pelo dashboard, 30d — folga generosa
antes de qualquer leitura bruta usada nos gráficos sumir). A tabela
`leituras_diario` (schema em `schema.sql` / `migrations/0003_retencao_diaria.sql`)
já fica disponível para análises de longo prazo (tendência plurianual do
nível d'água, por exemplo), mas **nenhum endpoint a consome ainda** — é uma
evolução natural do projeto, não um requisito atual.

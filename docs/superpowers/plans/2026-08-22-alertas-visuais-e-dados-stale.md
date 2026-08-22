# Alertas visuais e dados stale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover Telegram/Twilio do AquaSense, preservar o registro escrito de alertas e impedir que a ultima leitura stale alimente indicadores atuais.

**Architecture:** O motor de estados do Worker continuara em `alertas.js`, mas delegara somente a gravacao de eventos para um modulo local sem rede externa. Dashboard e relatorio compartilharao um contrato puro de frescor em `util.js`; apenas a telemetria atual fresca podera atualizar series e indicadores derivados, enquanto `GET /dados` continuara sendo a fonte do historico da janela.

**Tech Stack:** JavaScript sem dependencias, Node.js `node:test`, Cloudflare Workers/D1/KV, HTML/CSS, firmware Arduino/ESP32 apenas para comentarios neste escopo.

---

## Estrutura de arquivos

- Criar `package.json`: comandos locais de teste e checagem sem dependencias externas.
- Criar `tests/frescor.test.mjs`: contrato de frescor e elegibilidade da telemetria atual.
- Criar `tests/eventos-worker.test.mjs`: registro local de eventos e contrato sanitizado de `/alerts`.
- Criar `tests/sem-canais-externos.test.mjs`: impede reintroducao de Telegram/Twilio/SMS no produto ativo e documentacao publica.
- Criar `cloudflare-worker/src/eventos.js`: monta e registra eventos no KV, sem chamadas HTTP.
- Excluir `cloudflare-worker/src/notificacoes.js`.
- Modificar `cloudflare-worker/src/alertas.js`, `config.js`, `http.js`, `index.js`, `rotas.js` e `wrangler.toml`: remover canais externos mantendo cron e log.
- Modificar `assets/js/util.js`, `app.js`, `relatorio.js` e `assets/styles.css`: contrato stale e apresentacao correta.
- Modificar `.github/workflows/deploy-worker.yml`: testes obrigatorios antes de migracao/deploy.
- Modificar `readme.md`, `cloudflare-worker/README.md`, `docs/GUIA_MESTRE.md`, `index.html` e comentarios dos sketches: documentar somente alertas escritos/visuais.

### Task 1: Criar o harness e fixar o contrato de frescor

**Files:**
- Create: `package.json`
- Create: `tests/frescor.test.mjs`
- Modify: `assets/js/util.js:42-55`

- [ ] **Step 1: Criar o comando de teste**

Adicionar `package.json` sem dependencias:

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "check:js": "node scripts/check-js.mjs"
  }
}
```

Se `scripts/check-js.mjs` nao for necessario para o escopo final, remover `check:js` antes do commit em vez de deixar comando quebrado.

- [ ] **Step 2: Escrever testes RED do contrato**

Em `tests/frescor.test.mjs`, carregar `assets/js/util.js` com `node:vm`, fornecer `CFG.staleSeg = 120` e testar:

```js
test("telemetria recebida dentro do limite pode atualizar indicadores", () => {
  assert.equal(avaliarTelemetriaAtual({ nivel: 10, taxa_m_dia: 0.2, recebidoEm: 950 }, 1000).podeAtualizarIndicadores, true);
});

test("telemetria stale preserva nivel conhecido mas bloqueia derivados", () => {
  assert.deepEqual(avaliarTelemetriaAtual({ nivel: 10, taxa_m_dia: 4, recebidoEm: 800 }, 1000), {
    status: "stale",
    nivelConhecido: 10,
    taxaAtual: null,
    podeAtualizarIndicadores: false,
  });
});
```

Cobrir tambem timestamp ausente e fallback para `ts`.

- [ ] **Step 3: Executar RED**

Run: `node --test tests/frescor.test.mjs`

Expected: FAIL porque `avaliarTelemetriaAtual` ainda nao existe.

- [ ] **Step 4: Implementar o minimo em `util.js`**

Adicionar funcao pura com parametro opcional `agoraSeg` para testes deterministas:

```js
function avaliarTelemetriaAtual(leitura, agoraSeg = Date.now() / 1000) {
  const status = estadoComunicacao(leitura, agoraSeg);
  return {
    status,
    nivelConhecido: Number.isFinite(leitura && leitura.nivel) ? leitura.nivel : null,
    taxaAtual: status === "ok" && Number.isFinite(leitura && leitura.taxa_m_dia) ? leitura.taxa_m_dia : null,
    podeAtualizarIndicadores: status === "ok",
  };
}
```

Ajustar `estadoComunicacao` para aceitar `agoraSeg` sem alterar seu comportamento no navegador.

- [ ] **Step 5: Executar GREEN e regressao**

Run: `node --test tests/frescor.test.mjs`

Expected: todos os testes do arquivo PASS.

- [ ] **Step 6: Commit**

```powershell
git add package.json tests/frescor.test.mjs assets/js/util.js
git commit -m "test: define contrato de telemetria stale"
```

### Task 2: Substituir notificacoes externas por registro local de eventos

**Files:**
- Create: `tests/eventos-worker.test.mjs`
- Create: `cloudflare-worker/src/eventos.js`
- Delete: `cloudflare-worker/src/notificacoes.js`
- Modify: `cloudflare-worker/src/alertas.js:1-170`
- Modify: `cloudflare-worker/src/rotas.js:177-221`

- [ ] **Step 1: Escrever testes RED do registro local**

Testar a API desejada de `eventos.js`:

```js
test("registrarEventoNivel grava texto e metadados sem campos de canal", () => {
  const log = [];
  registrarEventoNivel(log, "PZ-01", "ATENCAO", 12.5, cfg);
  assert.equal(log[0].tipo, "nivel");
  assert.match(log[0].mensagem, /intensificar monitoramento/i);
  assert.equal("telegram" in log[0], false);
  assert.equal("sms" in log[0], false);
});
```

Testar nivel, comunicacao e taxa, incluindo limite maximo de 100 registros.

Para `handleAlerts`, usar `env.ALERT_STATE.get()` fake retornando um estado com registros legados contendo `telegram` e `sms`; confirmar que a resposta nao possui `canais` e remove campos antigos dos itens publicados.

- [ ] **Step 2: Executar RED**

Run: `node --test tests/eventos-worker.test.mjs`

Expected: FAIL porque `eventos.js` e o novo contrato de `/alerts` ainda nao existem.

- [ ] **Step 3: Implementar `eventos.js` sem rede**

Extrair de `notificacoes.js` somente montagem de mensagem, metadados, `alertLog.unshift()` e limite de 100 entradas. Nao importar `fetch`, `timeoutSignal`, tokens ou configuracao de canais.

- [ ] **Step 4: Integrar ao motor e sanear `/alerts`**

Em `alertas.js`, trocar `notificar*` por `registrarEvento*` sincronos. Em `rotas.js`, remover `canais` e mapear notificacoes legadas para o contrato publico sem `telegram`/`sms`.

- [ ] **Step 5: Excluir `notificacoes.js` e executar GREEN**

Run: `node --test tests/eventos-worker.test.mjs`

Expected: todos os testes do arquivo PASS e nenhuma chamada externa executada.

- [ ] **Step 6: Executar todos os testes**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add tests/eventos-worker.test.mjs cloudflare-worker/src/eventos.js cloudflare-worker/src/alertas.js cloudflare-worker/src/rotas.js
git rm cloudflare-worker/src/notificacoes.js
git commit -m "refactor: mantém alertas somente como eventos escritos"
```

### Task 3: Remover configuracao e contratos dos canais externos

**Files:**
- Create: `tests/sem-canais-externos.test.mjs`
- Modify: `cloudflare-worker/src/config.js`
- Modify: `cloudflare-worker/src/http.js`
- Modify: `cloudflare-worker/src/index.js`
- Modify: `cloudflare-worker/src/rotas.js`
- Modify: `cloudflare-worker/wrangler.toml`

- [ ] **Step 1: Escrever teste RED de ausencia dos canais**

O teste deve inspecionar os arquivos de runtime/configuracao acima e falhar se encontrar identificadores ativos `TELEGRAM_`, `TWILIO_`, `sendTelegram`, `sendSMS`, `telegramOn` ou `smsOn`.

- [ ] **Step 2: Executar RED**

Run: `node --test tests/sem-canais-externos.test.mjs`

Expected: FAIL listando as referencias existentes.

- [ ] **Step 3: Remover configuracao morta**

Remover secrets/vars de `getConfig`, `wrangler.toml`, comentarios de transporte e o helper `timeoutSignal` se ficar sem consumidor. Em `/health`, substituir canais por um contrato honesto como:

```json
{"alertas":{"modo":"registro_escrito","cron":"1min"}}
```

- [ ] **Step 4: Executar GREEN e dry-run**

Run: `node --test tests/sem-canais-externos.test.mjs`

Run: `npx --no-install wrangler deploy --dry-run` dentro de `cloudflare-worker`.

Expected: teste PASS e dry-run exit 0 sem bindings Telegram/Twilio.

- [ ] **Step 5: Commit**

```powershell
git add tests/sem-canais-externos.test.mjs cloudflare-worker/src/config.js cloudflare-worker/src/http.js cloudflare-worker/src/index.js cloudflare-worker/src/rotas.js cloudflare-worker/wrangler.toml
git commit -m "chore: remove configuração de Telegram e Twilio"
```

### Task 4: Impedir telemetria stale de atualizar indicadores atuais

**Files:**
- Modify: `tests/frescor.test.mjs`
- Modify: `assets/js/app.js:128-218`
- Modify: `assets/js/relatorio.js:136-188,252-264`
- Modify: `assets/styles.css`

- [ ] **Step 1: Ampliar o teste RED para a decisao de apresentacao**

Adicionar casos que garantam:

- `taxaAtual` e `podeAtualizarIndicadores` sao bloqueados para stale;
- nivel conhecido continua disponivel para exibicao;
- uma leitura fresca continua elegivel;
- pontos historicos nao passam por esse helper e permanecem cobertos pelos testes existentes de conversao/historico.

Se o ultimo item exigir nova funcao pura para distinguir telemetria atual de pontos historicos, escrever primeiro a assercao da API desejada e observar a falha.

- [ ] **Step 2: Executar RED**

Run: `node --test tests/frescor.test.mjs`

Expected: FAIL apenas nos novos casos.

- [ ] **Step 3: Integrar o helper em `app.js`**

No inicio de `applyData`, avaliar a telemetria. Renderizar o ultimo valor conhecido e o estado `SEM SINAL`, mas retornar antes de `pushSpark`, `pushChart`, `pushStats`, `renderTaxa(taxa)` e `pushReading` quando `podeAtualizarIndicadores` for falso. Chamar `renderTaxa(null)` para stale. Nao limpar nem filtrar dados carregados de `GET /dados`.

Trocar o status de sucesso do poll para `Sistema online · consulta às HH:MM:SS`, evitando afirmar que o instrumento esta comunicando.

Adicionar classe visual discreta para esmaecer a leitura conhecida no painel de detalhes durante `SEM SINAL`, removendo a classe quando a comunicacao voltar.

- [ ] **Step 4: Integrar o helper em `relatorio.js`**

Transportar `recebido_em` como `recebidoEm`, avaliar a ultima telemetria e, se stale:

- usar rotulo `Ultima leitura conhecida` em vez de `Nivel atual`;
- exibir `SEM SINAL` e a idade;
- nao apresentar taxa atual;
- manter as estatisticas vindas exclusivamente de `GET /dados`.

- [ ] **Step 5: Executar GREEN e todos os testes**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Validar manualmente no navegador**

Servir a raiz localmente, abrir `index.html` e `relatorio.html?pz=PZ-01&range=24h` e confirmar:

- `SEM SINAL` continua visivel;
- ultima leitura conhecida pode aparecer esmaecida;
- taxa fica indisponivel;
- janela sem pontos nao recebe min/max/variacao fabricados;
- nenhum erro novo aparece no console.

- [ ] **Step 7: Commit**

```powershell
git add tests/frescor.test.mjs assets/js/app.js assets/js/relatorio.js assets/styles.css
git commit -m "fix: não deriva indicadores de leitura stale"
```

### Task 5: Atualizar documentacao publica e CI

**Files:**
- Modify: `readme.md`
- Modify: `cloudflare-worker/README.md`
- Modify: `docs/GUIA_MESTRE.md`
- Modify: `index.html`
- Modify: `firmware/sketch.ino`
- Modify: `firmware/sketch_fisico_jsn_sr04t.ino`
- Modify: `.github/workflows/deploy-worker.yml`
- Modify: `tests/sem-canais-externos.test.mjs`

- [ ] **Step 1: Ampliar o teste RED para documentacao ativa**

Incluir README, Guia Mestre, `index.html` e comentarios dos sketches no teste de ausencia de canais. Excluir explicitamente `docs/superpowers/**`, que registra a decisao historica, e `docs/PESQUISA_EXTERNA_PIEZOMETROS.md`, que e pesquisa e nao declaracao de funcionalidade.

- [ ] **Step 2: Executar RED**

Run: `node --test tests/sem-canais-externos.test.mjs`

Expected: FAIL listando as referencias documentais atuais.

- [ ] **Step 3: Reescrever documentacao sem ampliar escopo**

Substituir afirmacoes de notificacao externa por:

- alertas escritos no dashboard;
- registro de eventos pelo cron no KV;
- LEDs e buzzer local;
- estado `SEM SINAL` quando o instrumento esta desconectado.

Remover instrucoes de secrets, numeros, custos e diagramas de Telegram/Twilio. Preservar o posicionamento honesto de prototipo didatico.

- [ ] **Step 4: Colocar testes antes do deploy**

Adicionar ao workflow, antes das migracoes:

```yaml
- name: Testes
  working-directory: .
  run: npm test
```

- [ ] **Step 5: Executar GREEN, sintaxe e dry-run**

Run: `npm test`

Run: `Get-ChildItem -Recurse -File -Filter *.js | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw "Falha de sintaxe: $($_.FullName)" } }`

Run: `npx --no-install wrangler deploy --dry-run` dentro de `cloudflare-worker`.

Expected: todos exit 0.

- [ ] **Step 6: Commit**

```powershell
git add readme.md cloudflare-worker/README.md docs/GUIA_MESTRE.md index.html firmware/sketch.ino firmware/sketch_fisico_jsn_sr04t.ino .github/workflows/deploy-worker.yml tests/sem-canais-externos.test.mjs
git commit -m "docs: mantém alertas somente escritos e locais"
```

### Task 6: Revisao e verificacao final

**Files:**
- Review only: all changed files

- [ ] **Step 1: Revisar o diff completo**

Run: `git diff HEAD~5 --check`

Run: `git diff HEAD~5 --stat`

Confirmar que nao houve mudanca em sensor, limiares, cadencia, migrations ou pagina didatica `alerta.html`.

- [ ] **Step 2: Executar verificacao completa fresca**

Run: `npm test`

Run: sintaxe de todos os JavaScript.

Run: `npx --no-install wrangler deploy --dry-run` em `cloudflare-worker`.

Run: `git grep -n -i -E 'telegram|twilio|sms' -- ':!tests/**' ':!docs/superpowers/**' ':!docs/PESQUISA_EXTERNA_PIEZOMETROS.md'`

Expected: testes/sintaxe/dry-run exit 0; grep sem ocorrencias no produto ativo fora dos testes e documentos historicos explicitamente excluidos.

- [ ] **Step 3: Revisao independente**

Solicitar revisao somente leitura com foco em regressao de alertas, semantica stale, contrato `/alerts`, documentacao e seguranca.

- [ ] **Step 4: Corrigir apenas achados bloqueantes e repetir verificacao**

Qualquer correcao deve seguir novo ciclo RED-GREEN quando alterar comportamento.

- [ ] **Step 5: Relatar entrega**

Informar arquivos alterados, motivos, comandos/resultados, commits locais, riscos remanescentes e teste manual recomendado. Nao fazer push ou deploy.

# Alertas visuais e tratamento de dados stale

## Objetivo

Simplificar o AquaSense para o uso real do prototipo: manter alertas escritos e visuais no dashboard, remover as integracoes externas de Telegram e SMS e impedir que uma leitura antiga seja apresentada como taxa ou estatistica atual.

## Contexto e decisao

O prototipo pode permanecer desconectado por longos periodos. Nesse estado, a ultima leitura conhecida continua util como referencia, mas nao representa o periodo atual e nao pode alimentar taxa de variacao, minimo, maximo ou variacao da janela selecionada.

Telegram e SMS foram ideias de demonstracao e nao fazem parte do destino atual do prototipo. O motor de classificacao continua necessario para registrar e exibir `NORMAL`, `ATENCAO`, `CRITICO`, `SEM_SINAL` e `TAXA_ALTA`, sem enviar mensagens para servicos externos.

## Alternativas consideradas

1. Apenas esconder Telegram e SMS na documentacao. Rejeitada porque manteria codigo, secrets e estados operacionais sem uso.
2. Remover todo o motor de alertas. Rejeitada porque eliminaria os alertas escritos, o historico e as classificacoes que continuam sendo parte central do projeto.
3. Remover somente os canais externos e preservar o motor como registrador de eventos. Escolhida por manter o valor didatico e operacional com menor complexidade.

## Comportamento aprovado

### Alertas

- O Worker nao deve possuir configuracao, credenciais nem chamadas para Telegram ou Twilio.
- O cron deve continuar classificando nivel, comunicacao e taxa.
- Cada transicao deve continuar entrando no `alertLog` do KV para consulta por `GET /alerts`.
- `GET /alerts` nao deve expor o campo `canais`.
- Alertas visuais do dashboard, LEDs e buzzer local permanecem.
- A pagina didatica `alerta.html` nao sera ampliada nem integrada a canais externos neste escopo.

### Leitura antiga

- A ultima leitura conhecida pode permanecer visivel e esmaecida, acompanhada de `SEM SINAL` e sua idade.
- Para dashboard e relatorio, frescor usa `recebido_em` quando finito e usa `ts` apenas como fallback. Timestamp ausente ou invalido resulta em `stale`. A leitura e `stale` quando `agora - timestampBase` excede `CFG.staleSeg`, carregado de `GET /config` (120 segundos na configuracao atual).
- O limiar operacional do cron para alarme de comunicacao continua separado (`SILENCE_ALERT_SEC`, atualmente 900 segundos). Ele representa a tolerancia para disparar um evento remoto no Worker, enquanto `CFG.staleSeg` controla a apresentacao imediata da interface.
- Somente a ultima telemetria usada como estado atual, quando stale, deve ser impedida de entrar nos graficos ao vivo, tabela de ultimas leituras, estatisticas da janela e calculo exibido de taxa.
- Pontos retornados por `GET /dados` continuam validos quando pertencem a janela historica selecionada. A idade natural desses pontos nao os torna stale nem os remove de graficos, tabela historica ou estatisticas do periodo.
- Se o historico da janela estiver vazio, minimo, maximo, variacao e taxa devem mostrar indisponibilidade.
- O status da interface deve distinguir "sistema/API online" de "instrumento comunicando".
- O relatorio deve transportar `recebido_em`. Se a ultima leitura estiver stale, deve rotula-la como ultima leitura conhecida sem sinal, nunca como nivel atual.

## Arquitetura

As funcoes que hoje enviam notificacoes serao substituidas por funcoes puras de montagem e registro de eventos. `alertas.js` continua responsavel pela maquina de estados; o novo modulo de eventos apenas grava o texto e os metadados no log.

O criterio de frescor da interface sera centralizado em uma funcao pura reutilizavel pelo dashboard e pelo relatorio. A interface chamara essa funcao antes de atualizar qualquer indicador derivado da ultima telemetria. O valor bruto antigo podera ser renderizado, mas o caminho de atualizacao ao vivo de series e estatisticas sera interrompido. A agregacao historica de `GET /dados` permanece independente desse bloqueio.

## Testes

- Teste do Worker confirmando que uma transicao registra evento sem chamar rede externa.
- Testes do contrato de `GET /alerts` sem `canais`.
- Testes da funcao de frescor para leitura atual, stale, ausente e fallback de timestamp.
- Teste da decisao de apresentacao garantindo que leitura stale nao alimente indicadores derivados.
- Verificacao no navegador da pagina publicada/local em estado sem sinal.
- Sintaxe de todos os JavaScript e `wrangler deploy --dry-run`.

## Documentacao

README, Guia Mestre, README do Worker e configuracao Wrangler devem declarar que os alertas sao escritos/visuais. Referencias a Telegram, SMS, Twilio, tokens, numeros de telefone e canais ativos devem ser removidas ou reescritas como historico fora do produto atual.

## Fora de escopo

- Alterar sensores, hardware, limiares ou cadencia de coleta.
- Corrigir a reconstrucao temporal do modo deep sleep.
- Implementar notificacao por outro canal.
- Transformar o prototipo em sistema certificado de seguranca.
- Redesenhar a pagina didatica `alerta.html`.

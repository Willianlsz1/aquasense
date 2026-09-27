# Guia mestre do AquaSense

O documento mestre é o texto do TCC **AquaSense_TCC_v5** (PDF, mantido fora do
repositório). Este guia liga as seções do TCC aos arquivos do código e separa o
que já foi comprovado do que é especificação ou plano.

## O que o TCC apresenta

| Parte do TCC | Situação | Onde está no repositório |
|---|---|---|
| Protótipo V1 — bancada (seção 4.1.1) | Montado e validado em 12/09/2026 | `firmware/aquasense_hc_sr04/`, [validação](VALIDACAO_BANCADA_2026-09-12.md) |
| Protótipo V2 — tubo de acrílico (seção 4.1.2) | Planejado; peças cotadas | [roteiro de ensaios](ENSAIOS_V2.md) |
| UCT comercial (seções 4.2 a 4.5) | Especificação; não montada | `firmware/sketch_uct_4a20ma.ino`, `firmware/piezometro_deep_sleep.h` (referência, sem ensaio) |
| Software e nuvem (seção 4.6) | Publicado e com testes locais | `cloudflare-worker/`, `index.html`, `relatorio.html`, `assets/` |
| Manual, manutenção, mercado e finanças (seções 5 a 10) | Somente no texto do TCC | — |

Os protótipos e a UCT compartilham o núcleo do firmware (`piezometro_core.h`),
o servidor e o painel. Mudam o sensor, a comunicação, a energia e a proteção.

## Medição e escala do V1

O HC-SR04 mede distância até um alvo. O firmware usa a mediana de cinco tentativas
e converte a distância em nível equivalente: `max(0, 40 - distancia_cm) * 0,5`.
Distância de 20 cm corresponde a 10 m didáticos. O valor exibido não é uma coluna
real de dez metros nem uma medição direta de poropressão.

Faixas: NORMAL abaixo de 12 m, ATENÇÃO a partir de 12 m e CRÍTICO a partir de 15 m,
com histerese de 0,2 m na descida. São valores de demonstração; em campo, os limites
de cada instrumento vêm da geotecnia do cliente.

Ausência de eco válido é FALHA SENSOR: o último valor pode servir de referência,
mas não é enviado como amostra nova.

## Cadeia de dados

1. O ESP32 lê o sensor, classifica a faixa e prepara o envio.
2. `POST /ingest` autentica o dispositivo e valida o conteúdo.
3. O D1 guarda as leituras com horário de medição (`ts`) e de recepção (`recebido_em`).
4. A cada minuto, o motor de alertas avalia nível, taxa de variação e comunicação;
   estados e eventos ficam no KV.
5. O painel consulta `/ultimos`, `/dados`, `/alerts` e `/config` a cada dez segundos.

O frescor usa a recepção; sem recepção por mais de 120 s, o ponto aparece como
SEM SINAL. A taxa de variação usa o horário da medição.

## Painel web

- Resumo no topo (frase e indicadores de alerta, sem sinal e última recepção),
  calculado das últimas leituras. Leitura antiga conta como SEM SINAL; falha da
  API aparece como "não confirmado", nunca como rede normal.
- Instrumentos em barras proporcionais ao nível, com mapa ilustrativo e seleção
  por teclado.
- Leitura atual, origem do dado, última recepção e condição do ponto.
- Gráficos de 24h, 7d e 30d com média, pico e lacunas visíveis.
- Eventos do servidor (até 50 da rede) separados dos eventos da sessão.
- Exportação CSV, Excel e relatório PDF (`relatorio.html`); o PDF fica bloqueado
  na simulação.
- Simulação só por escolha manual, identificada na tela e nas exportações.
  Falha da API mostra indisponibilidade; não ativa simulação.
- Tema claro e escuro, com a preferência salva.

## O que foi comprovado

| Evidência | Data | Limite |
|---|---|---|
| Faixas, falha de eco, recuperação e HTTP 204 na bancada | 12/09/2026 | Sem régua: não mede exatidão. Sem teste de queda de rede do ESP32. |
| OLED exibiu FALHA SENSOR | 12/09/2026 | O display apagou depois, no mesmo dia; a causa não foi confirmada. |
| Painel e Worker publicados | 13/09/2026 | Publicado não significa disponível hoje. A cota diária do D1 já bloqueou consultas. |
| Testes automatizados | 25/09/2026 | 49/49 aprovados localmente (`npm test`). O TCC v5 cita 31/31, contagem de 12/09. |

## Limites conhecidos

- O buffer do V1 fica em RAM: até 120 envios, cerca de 20 minutos. Quando lota,
  descarta o mais antigo; um reinício perde as pendências. A UCT prevê flash.
- O protótipo não usa LEDs nem buzzer: o estado aparece no OLED e no painel.
- Dados brutos ficam retidos por 180 dias; dias anteriores viram resumos diários,
  ainda sem consulta no painel.
- Os índices da migração 0004 reduziram as consultas ao D1 no código; a economia
  real em produção ainda não foi medida.

## Como demonstrar

Apresentar o problema, mostrar a distância física e a escala, mover o alvo (ou a
água, no V2) pelas faixas, consultar histórico e exportação e explicar SEM SINAL e
simulação. Registrar data, firmware e o que foi observado.

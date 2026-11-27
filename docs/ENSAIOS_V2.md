# Ensaios do protótipo V2

Roteiro da Tabela 6 do TCC v7.1. O V2 usa o mesmo ESP32, HC-SR04 e firmware do V1,
montados num tubo de acrílico transparente de 30 cm com régua graduada.
**Situação (27/11/2026): V2 ligado, calibrado e enviando à API real. Realizados:
calibração, repetibilidade (2), subida das faixas (5), comunicação ponta a ponta;
ensaios 3 e 4 em bancada em 27/09/2026, sem o tubo. Pendentes: exatidão em cinco
alturas com leitura da régua ao nível dos olhos (1) e descida das faixas com
histerese (5).** Preencher as tabelas somente com valores observados, com data e
versão do firmware.

## 0. Ligação, comunicação e calibração (26–27/11/2026)

Firmware `firmware/aquasense_hc_sr04` (commits `72a89c8` e `84b8a10`), placa ESP32
na COM3 (USB CP2102), instrumento PZ-01. Credenciais em `segredos.h`, fora do Git.

| Verificação | Observado |
|---|---|
| Gravação | arduino-cli/esptool; a placa só entra no modo de gravação segurando BOOT |
| Tela TFT | acende e mostra nível, distância, limites, Wi-Fi e situação do envio |
| Wi-Fi | conectado, sinal −32 dBm; relógio sincronizado por NTP |
| Sem rede (antes de configurar o Wi-Fi) | continua medindo e guarda as leituras na fila |
| API real (`/ingest`) | aceita os envios (HTTP 204, um a cada 10 s) |
| Painel real | PZ-01 aparece com "recebido há <1 min"; PZ-02 e PZ-03 em SEM SINAL |

**Calibração.** Régua graduada encostada no vaso: face do sensor a ~27,0 cm, fundo
interno a ~1,0 cm. Vaso vazio: o sensor lê **28,8 cm**. Com água, o sensor lê
cerca de 3 cm a mais que a distância pela régua, de forma constante (24,0 cm pela
régua contra 27,1 cm pelo sensor; 26,0 contra 28,8 cm até o fundo). Como a
diferença é constante, o zero foi tomado da própria leitura do vaso vazio.
Configuração adotada: `ALTURA_REF_CM = 28.8` e `ESCALA_M_POR_CM = 1.0`
(1 cm de água = 1 m didático; Atenção com 12 cm de água, Crítico com 15 cm).
Conferência: 27,06 cm medidos (média de 21 leituras) = 1,72 m, com ~2 cm de água na
régua (leitura por foto, incerteza de alguns milímetros).

Registro de cada sessão: data, responsáveis, commit do firmware, instrumento
(ex.: PZ-01), distância do sensor ao fundo do tubo e observações.

## 1. Exatidão

Encher o tubo em cinco alturas, ler a régua e anotar a distância e o nível do painel.

| Altura na régua (cm) | Distância do sensor (cm) | Nível no painel (m) | Nível esperado (m) | Erro |
|---|---|---|---|---|
| | | | | |

Resultado: erro médio e erro máximo.

## 2. Repetibilidade

Nível parado; registrar 30 leituras seguidas (serial ou exportação CSV).
Resultado: menor, maior, média e dispersão.

**Resultado em 27/11/2026 (tubo com água; firmware `84b8a10`, PZ-01, leitura a cada 1 s
pelo serial).** Dados em `docs/ensaios/`.

| Nível parado | Leituras | Distância (cm) | Nível (m) mín. / máx. / média | Desvio-padrão |
|---|---|---|---|---|
| ~12,5 cm de água | 30 | 16,3 em todas | 12,51 / 12,51 / 12,51 | 0,000 m |
| ~17 cm de água | 55 | 11,8 em todas | 17,04 / 17,04 / 17,04 | 0,000 m |
| ~2 cm de água | 21 | 26,2 a 27,1 | 1,71 / 1,73 / 1,72 | não calculado |

Com a água parada, a variação ficou abaixo da resolução exibida (0,1 cm). Com a
água em movimento (enchendo), as leituras saltaram entre 13,5 e 17,4 m por cerca de
2 minutos: o jato e as ondas refletem o ultrassom. Isso é próprio da bancada; num
piezômetro real a coluna d'água não ondula.

Também em 26/11/2026, ainda com a calibração antiga (zero em 40 cm, escala de
0,5 m/cm), 69 leituras seguidas deram 25,0 cm em todas.

## 3. Queda de rede

Desligar o roteador por 10 minutos e religar. Conferir no histórico se as leituras
do período chegaram. O buffer em RAM comporta cerca de 20 minutos; reiniciar o
ESP32 durante o ensaio invalida o resultado.

**Resultado em 27/09/2026 (bancada, sem tubo; firmware `5905928`, PZ-01).** Roteador
desligado das 13:31 às 13:43 (~12 min), ESP32 ligado. Consulta ao D1 por minuto:
de 13:32 a 13:40, 6 leituras por minuto (uma a cada 10 s), sem lacuna, recebidas
depois com atraso de 92 s a 622 s — ou seja, vieram do buffer após a volta da rede.
A reconexão ocorreu por volta de 13:42 sem reiniciar a placa. No momento da queda
(13:30–13:31) chegaram 7 leituras em vez de 12: perda de ~50 s, provavelmente
porque o envio em curso ficou bloqueado até o tempo limite do HTTP (8 s). Nenhuma
leitura duplicada foi observada na contagem. O período sem rede não gerou evento
de comunicação, pois durou menos que `SILENCE_ALERT_SEC` (15 min); por isso o
ensaio 4 foi feito à parte.

## 4. Perda de sinal

Desligar o protótipo por mais de 15 minutos. Esperado: painel indica SEM SINAL em
2 minutos e o servidor registra o evento após 15 minutos; ao religar, volta ao estado
da leitura atual.

**Resultado em 27/09/2026 (bancada; firmware `5905928`, PZ-01).** Placa desligada da
energia por ~18 min. Consulta a `/ultimos` e `/alerts` a cada minuto:

| Momento | Observado |
|---|---|
| 13:46:07 | Última leitura recebida antes do desligamento |
| 14:01:45 | Evento de comunicação `SEM_SINAL` registrado (15,6 min de silêncio; limite 15 min) |
| 14:04:26 | Primeira leitura após religar |
| 14:04:30 | Evento de comunicação `OK` (restabelecida) registrado |

O servidor detectou a ausência de leituras e registrou perda e retorno. O aviso visual
de 2 min no painel não foi fotografado neste ensaio.

## 5. Faixas de alerta

Encher e esvaziar o tubo passando por 12 m e 15 m didáticos. Esperado: transições
NORMAL, ATENÇÃO e CRÍTICO no display e no painel, e retorno com histerese de 0,2 m.

**Resultado da subida em 27/11/2026 (tubo com água; firmware `84b8a10`, PZ-01).**
Água adicionada em duas etapas; serial gravado a cada 1 s; API e painel real
(`https://willianlsz1.github.io/aquasense/`) consultados durante o ensaio.

| Hora | Onde | Observado |
|---|---|---|
| 18:30:15 | Servidor | Evento `TAXA_ALTA` (variação rápida) ao encher |
| 18:30:22 | Tela do protótipo | ATENÇÃO, 12,51 m |
| 18:31:21 | Painel (captura) | Aviso "PZ-01 Dique Norte em atenção — 12,51 m, 0,51 m acima do limite de 12 m" |
| 18:31:16 | Servidor | Evento de nível ATENCAO (verificação a cada minuto) |
| 18:35:14 | Tela do protótipo | CRÍTICO |
| 18:37:20 | Tela do protótipo | Nível estabiliza em 17,04 m |
| 18:38:15 | Servidor | Evento de nível CRITICO |
| 18:38:41 | Painel (captura) | Alarme crítico com som: "17,04 m, 2,04 m acima do limite de 15 m" |

O evento de CRÍTICO do servidor saiu cerca de 3 minutos depois da tela. O servidor
avalia a última leitura recebida uma vez por minuto, e, nas verificações de 18:36 e
18:37, a água ainda agitada dava leituras abaixo de 15 m. A consulta a `/alerts`
pode mostrar o estado anterior por até ~1 minuto (estado guardado no KV da
Cloudflare). Pendente: descida até abaixo de 11,8 m para conferir o retorno com
histerese.

## Pendências

- Ensaio 1: medir cinco alturas com a régua lida ao nível dos olhos (as fotos de
  27/11 foram tiradas de cima e não permitem ler a marca exata).
- Ensaio 5: descida das faixas e histerese.
- Tela: o desenho está na horizontal (`setRotation(1)`) e a tela está montada na
  vertical na caixa; o texto aparece de lado.

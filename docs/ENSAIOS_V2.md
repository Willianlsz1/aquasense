# Ensaios do protótipo V2

Roteiro da Tabela 6 do TCC v5. O V2 usa o mesmo ESP32, HC-SR04 e firmware do V1,
montados num tubo de acrílico transparente de 30 cm com régua graduada.
**Situação: ensaio 3 realizado em bancada (27/09/2026); demais pendentes.** Preencher as tabelas somente com valores
observados, com data e versão do firmware.

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
de comunicação, pois durou menos que `SILENCE_ALERT_SEC` (15 min); o ensaio 4
continua pendente.

## 4. Perda de sinal

Desligar o protótipo por mais de 2 minutos. Esperado: painel indica SEM SINAL para
o ponto e registra o evento; ao religar, volta ao estado da leitura atual.

## 5. Faixas de alerta

Encher e esvaziar o tubo passando por 12 m e 15 m didáticos. Esperado: transições
NORMAL, ATENÇÃO e CRÍTICO no display e no painel, e retorno com histerese de 0,2 m.

## Pendências de montagem

- Display definido: TFT ST7789 240×320 (SPI), conferido em bancada em 27/09/2026
  nas quatro faixas ([registro](REGISTRO_FIRMWARE.md)); falta repetir com água no tubo.
- Ajustar a escala `max(0, 40 - distancia_cm) * 0,5` à altura real do tubo, se
  necessário, e registrar a escolha.

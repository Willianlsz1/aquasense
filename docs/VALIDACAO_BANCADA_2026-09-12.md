# Validação funcional de bancada — 12/09/2026

## Escopo e evidências

ESP32 com HC-SR04 e OLED, instrumento PZ-01. Leituras acompanhadas pela
COM3 a 115200 baud; display observado pelo responsável pela bancada.
Não foram usados LEDs. Buzzer e precisão metrológica não foram validados.

Este registro resume as saídas seriais e consultas observadas nesta sessão;
não é um log bruto contínuo nem um certificado de calibração. As distâncias
abaixo são as informadas pelo sensor, sem comparação com régua.

O sketch de demonstração aplica `nivel = max(0, 40 - distancia_cm) * 0,5`.
Os metros exibidos são equivalentes didáticos, não uma coluna real dessa altura.

## Firmware gravado

- Fonte: commit `8a55e6c`, sketch `firmware/sketch_demo_hc_sr04.ino` e núcleo comum.
- Compilação: `esp32:esp32:esp32`, core ESP32 3.3.10, com configuração local
  de Wi-Fi e chave preservada fora do repositório.
- Ocupação informada: 82% do programa e 15% da RAM estática.
- Gravação na COM3: concluída com código zero e hash verificado pelo esptool.
  Foi necessário segurar BOOT durante a conexão inicial.
- A gravação usou uma cópia de compilação. O projeto anteriormente aberto na IDE,
  em `Documents/Arduino/sketch_demo_hc_sr04`, não foi atualizado nesta operação.
  Antes de gravar novamente pela IDE, sincronizar seus fontes com o repositório,
  preservando `piezometro_config_local.h` e eventuais edições locais.

## Resultados físicos

| Ensaio | Observação | Resultado e limite |
|---|---|---|
| Firmware antigo sem eco | Tecido na frente; serial indicou “sem eco”, nível 0, NORMAL e envio HTTP 204 | Defeito reproduzido: ausência de leitura era tratada como zero válido. |
| Firmware corrigido sem eco | Serial indicou FALHA SENSOR; responsável confirmou a mensagem no OLED; nenhum envio observado em 20 s | Tratamento de ausência de eco confirmado. Dois ecos ocasionais de 345,2 e 368,6 cm produziram NORMAL: o tecido não isolou completamente o som. |
| Recuperação após falha | Predominância de 22,1 cm e 8,93 m equivalentes, NORMAL; HTTP 204 e buffer vazio | Leitura e envio retomados. |
| Atenção | 12,5–14,6 cm e 12,70–13,75 m equivalentes, ATENÇÃO; HTTP 204 | Faixa confirmada no serial. Leituras ocasionais mais distantes produziram NORMAL. |
| Crítico | 4,4–5,7 cm e 17,16–17,80 m equivalentes, CRÍTICO durante toda a janela observada; HTTP 204 | Faixa confirmada no serial. |
| Retorno a normal | 36,8–37,3 cm e 1,36–1,59 m equivalentes; dois HTTP 204 e buffer vazio | Retorno de CRÍTICO para NORMAL confirmado. |
| Tentativa de queda de Wi-Fi | Foi desligado o Wi-Fi do computador; ESP32 continuou enviando e API recebeu dados recentes | Ensaio não realizado: o ESP32 usa diretamente o roteador. Não comprova armazenamento/reenvio offline. |

HTTP 204 confirma a resposta de aceitação do servidor; isoladamente não prova
a integridade de cada registro persistido. Buffer vazio durante conexão normal
também não comprova recuperação após queda de rede.

## Servidor e painel

- Painel publicado observado durante a bancada: PZ-01 em NORMAL, 1,59 m,
  coerente com a faixa medida no serial naquela etapa.
- Nova consulta às 12:40 de 12/09/2026 (horário de Brasília): API trouxe 1,276 m,
  recepção com idade aproximada de 12 s e 12 intervalos agregados em 24 h.
- Serial às 12:41: predominância de 37,9 cm / 1,04 m equivalentes, NORMAL,
  buffer vazio e envio HTTP 204.
- Painel **local corrigido** às 12:41:55: PZ-01 em NORMAL, 1,05 m, histórico
  real com 12 pontos e PZ-02/PZ-03 sem primeira leitura. Banner de simulação
  ausente após carregamento bem-sucedido. Valores de consultas sucessivas
  podem diferir porque a medição continua acontecendo.
- O painel apresentou também alarme de taxa (+5,81 m/dia nessa consulta).
  NORMAL descreve a faixa de nível; a taxa é uma avaliação separada. A bancada
  usa escala ampliada e alvo móvel: esse número não valida tendência geotécnica.

A verificação local usou encaminhamento temporário somente de consultas GET
para a API publicada. Nenhum valor foi inventado ou substituído no teste real.
A primeira chamada desse encaminhador foi recusada (HTTP 403); depois de ajustar
o cabeçalho da requisição, o painel foi recarregado e saiu da simulação.
O encaminhador não integra o produto e não alterou CORS nem o serviço online.

As correções do servidor (`4b03798`) e painel (`b5e14c6`) permanecem locais.
Este ensaio combina **firmware corrigido + serviço publicado anterior + painel
local corrigido**; não equivale a validar o novo Worker em produção.

### Ajuste encontrado durante a conferência do painel

Selecionar 7 dias após 24 horas reiniciava os estados de faixa e taxa e repetia
eventos de NORMAL e de variação rápida, mesmo sem nova transição operacional.
`assets/js/app.js` foi ajustado para preservar esses estados ao mudar somente
o período. A troca de instrumento continua inicializando seu próprio estado.
Dois testes de regressão verificam a preservação, uma nova transição legítima
de taxa e o comportamento ao trocar de piezômetro.
As primeiras repetições visuais ainda mostraram duplicação e uma falha de conexão
às 12:48:32. A conferência foi reiniciada com uma URL nova para o script local,
evitando reaproveitar a versão em cache; isso foi feito somente no encaminhador
temporário, sem alterar o HTML do produto.
Na nova sessão, a troca de 24 h para 7 dias manteve **1 alarme** e acrescentou
somente o evento de histórico carregado (2 para 3 eventos). Novas leituras às
12:49:53 e 12:50:03 não repetiram NORMAL nem o alarme de taxa. A conferência
visual final passou para esse cenário.

## Validações locais de código já executadas

Na etapa de implementação: 29 testes passaram, 26 arquivos JS/MJS passaram
na checagem de sintaxe, YAML válido e empacotamento do Worker via dry-run passou.
Os testes cobrem retenção SQL, falha/ausência de histórico, taxa, comunicação e
frescor; não substituem os ensaios físicos pendentes.

Após o ajuste de período nesta conferência: **31/31 testes passaram**, sintaxe
dos dois arquivos JS/MJS alterados aprovada e `git diff --check` sem erros.
A revisão independente não encontrou bloqueios; os nove testes focados do
frontend também passaram na revisão.

## Pendências

1. **Wi-Fi/reenvio:** adiado por decisão do responsável. Roteador Huawei WS7001,
   senha administrativa desconhecida. Nenhum reset ou ajuste do roteador foi feito.
   O teste futuro deve manter alimentação e produzir interrupção real da rede do ESP32.
2. **Perda de sinal no painel:** verificar com recepção realmente interrompida
   por mais de 120 s; não foi demonstrada fisicamente nesta rodada.
3. **Precisão:** comparar distâncias com régua, usando alvo fixo, para distinguir
   erro sistemático e dispersão. Não inferir precisão das posições aproximadas pedidas.
4. **Publicação:** push/deploy e migrações online não executados. Exigem pedido
   explícito e verificação posterior do serviço publicado.
5. **Limites mantidos:** buffer em RAM para 120 leituras; reinício perde pendências,
   lotação descarta as mais antigas. TLS do protótipo continua sem validação de CA.
   Modo deep sleep e adapter 4–20 mA não foram testados nesta bancada.

Não se declara “zero perda”, homologação industrial, validação de barragem real
nem aprovação metrológica a partir destes ensaios.

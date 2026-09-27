# Registro do firmware do protótipo

Histórico de gravação e diagnóstico do sketch de uma aba (`firmware/aquasense_hc_sr04`).
Instruções de uso: [firmware/README.md](../firmware/README.md).

## Cópia preparada para a bancada

A cópia local, fora do repositório, foi preenchida a partir da configuração local anterior. O projeto
antigo `sketch_demo_hc_sr04` permanece como reserva. Use o novo nome na IDE para
editar em uma aba só. A preparação não regrava automaticamente o ESP32.

Validação em 12/09/2026: a cópia preenchida compilou para `esp32:esp32:esp32`
(core 3.3.10), usando 1.063.540 bytes de programa (81%) e 52.056 bytes de RAM
estática (15%). A suíte local passou 33/33 testes, incluindo a atualização do
arquivo gerado e a proteção do destino de credenciais. Revisão independente sem
bloqueios. A versão de uma aba foi posteriormente gravada na COM3, com BOOT
pressionado na conexão inicial: upload concluído e hash verificado. Após o
reinício, o serial mostrou NORMAL, distâncias predominantes de 37,0–37,4 cm,
níveis equivalentes de 1,28–1,52 m, envio HTTP 204 e buffer vazio. Também houve
ecos de 46,8 cm, convertidos em zero pela escala da demonstração. Essa observação
confirma leitura e envio após a gravação; não valida precisão. A confirmação
visual do OLED e a repetição das demais faixas nesta versão ainda estão pendentes.

Na conferência visual posterior, o responsável informou que o OLED permaneceu
apagado, inclusive após reiniciar o ESP32. Os pinos SDA 21 / SCL 22 e endereço
0x3C foram comparados com a versão anterior e não mudaram. O serial mostrou
"OLED OK", mas a biblioteca não confirma a resposta I2C ao retornar sucesso.
Foi acrescentada uma verificação explícita de resposta (ACK) e desativada a
reinicialização implícita do barramento pela biblioteca, pois o núcleo já faz
`Wire.begin(21, 22)`. Essa alteração é diagnóstica; ainda não comprova a causa
nem a recuperação da imagem no OLED.
Após gravar essa versão (upload concluído e hash verificado), o reinício mostrou
`OLED I2C 0x3C: codigo 5 (0 = respondeu)`, seguido de erro de inicialização.
O sensor continuou em NORMAL e houve envios HTTP 204. A comunicação com a tela
falhou nessa tentativa; a causa ainda não foi isolada. O diagnóstico posterior também não recuperou a imagem. A investigação está
suspensa até a equipe dispor de outro OLED; não repetir ensaios por este roteiro.

## Remoção de LEDs e buzzer (26/09/2026)

O protótipo não usa LEDs nem buzzer. As rotinas foram retiradas do núcleo comum e o
sketch de uma aba foi gerado de novo. Os três firmwares (uma aba, modular e UCT)
compilaram para `esp32:esp32:esp32` (core 3.3.11); o de uma aba usa 1.062.936 bytes
de programa (81%). A nova versão ainda não foi gravada na placa.

## Troca do OLED pelo TFT ST7789 (27/09/2026)

O OLED foi substituído por um TFT SPI ST7789 240×320 de 7 pinos, em HSPI:
SCK 14, SDA 13, CS 25, DC 27, RST 26, VCC 3V3. O HC-SR04 continuou em 5/18.
O sketch compilou para `esp32:esp32:esp32` (81% do programa) e a suíte local
passou 49/49. A primeira gravação exibiu cores invertidas; a inversão foi
desligada no início da tela.

Conferência em bancada pelo responsável, por fotos: a tela mostrou NORMAL (21,1 cm,
9,44 m, verde), ATENÇÃO (15,6 cm, 12,19 m, amarelo) e CRÍTICO! (7,3 cm, 16,34 m,
vermelho), com Wi-Fi OK e valores coerentes com a escala didática. O endpoint
`/ultimos` recebeu leituras novas a cada ~10 s no mesmo dia. Com o ECHO desconectado,
a tela mostrou FALHA SENSOR (roxo), "Dist: ---" e o último nível identificado como
"Ultimo", sem apresentá-lo como medição atual. Isso confirma tela, faixas e envio;
não valida precisão, que será ensaiada com o reservatório de acrílico.

## Validação do certificado HTTPS (27/09/2026)

`setInsecure()` foi trocado por `setCACert()` com as raízes ISRG Root X1/X2
(Let's Encrypt) e GTS Root R1–R4 (Google Trust Services), da lista da Mozilla
(certifi 2026.02.25), no núcleo e no modo deep sleep. Antes da troca, uma conexão
TLS 1.3 ao Worker publicado foi validada no computador apenas com essas raízes
(emissor atual: Let's Encrypt YE1). O sketch compilou (83% do programa). Gravado na placa às
14:31: das 14:32 às 14:34 o `/ultimos` recebeu leituras a cada 10 s, chegando 2–3 s
após a medição (antes, 0–1 s — o custo da validação no handshake). A tela nova
mostrou "PZ-01 AQUASENSE 14:32:14", "Sensor: 30.2 cm", "Limites: 12 / 15 m" e
"WiFi -35dBm  Envio OK 2s". A validação depende do relógio via NTP; se a
Cloudflare passar a usar outro emissor fora da lista, o envio falha e as leituras
ficam retidas no buffer até a lista ser atualizada.

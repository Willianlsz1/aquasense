# HC-SR04 em uma única aba

Abra `aquasense_hc_sr04/aquasense_hc_sr04.ino` na Arduino IDE. Essa pasta contém
somente um sketch; não é necessário copiar nenhum dos cabeçalhos `.h` do projeto.
As bibliotecas Adafruit GFX e Adafruit SSD1306 continuam necessárias.

Na cópia local, preencha Wi-Fi, endereço `/ingest`, chave e instrumento no início
do arquivo. Os pinos e a escala ficam logo abaixo. Selecione **ESP32 Dev Module**.
O modelo versionado tem apenas valores de exemplo: mantenha a cópia preenchida
fora do repositório e não a compartilhe, pois ela contém senha e chave.

O comportamento foi preservado: mediana de cinco tentativas, falha de sensor sem
envio como medição nova, tela OLED, faixas de alerta, leitura a cada segundo,
envio a cada dez segundos e buffer em RAM. As rotinas de LEDs e buzzer permanecem
compatíveis com a versão anterior, embora LEDs não estejam montados na bancada.
Os metros continuam sendo uma escala didática, não a distância real em metros.

## Cópia preparada nesta máquina

`C:\Users\KABUM\Documents\Arduino\aquasense_hc_sr04\aquasense_hc_sr04.ino`

Essa cópia foi preenchida a partir da configuração local anterior. O projeto
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
falhou nessa tentativa; a causa ainda não foi isolada. O próximo ensaio é desligar
e religar a alimentação USB, pois reiniciar somente o ESP32 não necessariamente
reinicializa a alimentação do OLED.

## Manutenção do código

O arquivo único é gerado dos fontes comuns, evitando duas implementações que
possam divergir. Para atualizar a distribuição depois de alterar esses fontes:

```powershell
node tools/gerar-firmware-unico.mjs
```

Para criar uma cópia preenchida, informe `--config` com o cabeçalho privado e
`--output` com o destino `.ino` fora do repositório. O comando sobrescreve o
destino; salve eventuais edições feitas na cópia da IDE antes de gerá-la novamente.
Não é necessário executar esse comando para usar o sketch já preparado.

Os outros sensores (JSN-SR04T, BMP180 e 4–20 mA) continuam em seus projetos
originais; não devem ser colocados como abas adicionais do sketch HC-SR04.

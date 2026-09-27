# Firmware

## Qual arquivo abrir

| Arquivo | Para quê | Situação |
|---|---|---|
| `aquasense_hc_sr04/aquasense_hc_sr04.ino` | **Protótipo V1/V2 (HC-SR04).** Sketch de uma aba, pronto para a Arduino IDE. | Gravado e validado em bancada (12/09/2026) |
| `sketch_uct_4a20ma.ino` | UCT comercial: sonda 4–20 mA com ADS1115. | Referência; compila, mas não foi montado nem ensaiado |
| `piezometro_core.h` | Núcleo comum: Wi-Fi, NTP, buffer, envio ao `/ingest`, faixas de alerta e tela. | Fonte; não abrir sozinho |
| `tela.h`, `tela_st7789.h` | Interface de tela e implementação para o TFT ST7789 240×320 (SPI), em uso. | Fonte |
| `tela_ssd1306.h` | Implementação para o OLED SSD1306 antigo (I2C). | Fonte; fora de uso |
| `piezometro_deep_sleep.h` | Modo opcional de baixo consumo para campo (bateria/solar). | Opcional; não usado na bancada |
| `sketch_demo_hc_sr04.ino` | Versão modular do protótipo, que gera o sketch de uma aba. | Fonte |
| `piezometro_config_local.h.example` | Modelo de credenciais (Wi-Fi, endereço, chave, instrumento). | Copiar para `piezometro_config_local.h`, que o Git ignora |

Os nomes `piezometro_*` são dos fontes comuns; `aquasense_*` é o sketch distribuído.

## Protótipo em uma aba

Abra `aquasense_hc_sr04/aquasense_hc_sr04.ino` na Arduino IDE. A pasta contém
somente esse sketch; não é preciso copiar os cabeçalhos `.h`. São necessárias as
bibliotecas Adafruit GFX e Adafruit ST7735 and ST7789 e o pacote de placas esp32.

| Ligação | GPIO |
|---|---|
| HC-SR04 TRIG | 5 |
| HC-SR04 ECHO (divisor 1k/2k) | 18 |
| Tela SCK | 14 |
| Tela SDA | 13 |
| Tela CS | 25 |
| Tela DC | 27 |
| Tela RST | 26 |
| Tela VCC / GND | 3V3 / GND |

O HC-SR04 é alimentado em 5V. Os GPIO 21/22 (I2C) ficam livres.

Na cópia local, preencha Wi-Fi, endereço `/ingest`, chave e instrumento no início
do arquivo. Os pinos e a escala ficam logo abaixo. Selecione **ESP32 Dev Module**.
O arquivo versionado tem apenas valores de exemplo: mantenha a cópia preenchida
fora do repositório e não a compartilhe, pois ela contém senha e chave.

Comportamento: mediana de cinco tentativas, falha de sensor sem envio como medição
nova, tela TFT colorida, faixas de alerta, leitura a cada segundo, envio a cada dez segundos
e buffer em RAM. O protótipo não usa LEDs nem buzzer. Os metros são uma escala
didática, não a distância real em metros.

Para o V2, a conversão de distância em nível precisa ser ajustada à altura real do
tubo e do suporte, A tela TFT ainda precisa ser conferida em bancada.

## Manutenção do código

O sketch de uma aba é **gerado** a partir dos fontes comuns, para que não existam
duas implementações divergentes. Não edite o arquivo gerado; altere os fontes e rode:

```bash
node tools/gerar-firmware-unico.mjs
```

O teste `tests/firmware-unico.test.mjs` falha se o arquivo gerado estiver
desatualizado.

Para criar uma cópia já preenchida, informe `--config` com o cabeçalho privado e
`--output` com o destino `.ino` fora do repositório. O comando sobrescreve o destino;
salve antes eventuais edições feitas na cópia da IDE.

O histórico de gravação e o diagnóstico do OLED estão em
[docs/REGISTRO_FIRMWARE.md](../docs/REGISTRO_FIRMWARE.md).

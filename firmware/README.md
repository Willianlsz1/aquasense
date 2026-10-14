# Firmware

## Qual arquivo abrir

| Arquivo | Para quê | Situação |
|---|---|---|
| `aquasense_hc_sr04/aquasense_hc_sr04.ino` | **Protótipo V1/V2 (HC-SR04 + TFT).** Sketch único, pronto para a Arduino IDE. | Em uso na bancada |
| `referencia_uct/` | UCT comercial (sonda 4–20 mA com ADS1115), deep sleep e o núcleo modular antigo. | Referência do TCC; não montada nem ensaiada |

## Gravar o protótipo

1. Copie a pasta `aquasense_hc_sr04/` para **fora** do repositório e abra o `.ino`
   na Arduino IDE.
2. Preencha Wi-Fi, endereço `/ingest`, chave e instrumento no início do arquivo.
   Não compartilhe a cópia preenchida: ela contém senha e chave.
3. Placa **ESP32 Dev Module**; bibliotecas **Adafruit GFX** e
   **Adafruit ST7735 and ST7789**.
4. Grave e confira no Monitor Serial (115200) a leitura e o "HTTP 204".

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

O HC-SR04 é alimentado em 5V.

## Comportamento

Mediana de cinco tentativas a cada segundo; envio a cada dez segundos; fila em RAM
de 120 leituras (~20 min) quando falta rede; HTTPS com certificado do servidor
validado. Falha do sensor não é enviada como medição nova e a tela mostra o último
valor como "Ultimo". O protótipo não usa LEDs nem buzzer.

Escala didática: `max(0, ALTURA_REF_CM - distância) * 0,5` m, com
`ALTURA_REF_CM = 40`. Para medir o nível real no tubo do V2, ajuste
`ALTURA_REF_CM` à distância do sensor até o fundo.

O histórico de gravação e o diagnóstico do OLED antigo estão em
[docs/REGISTRO_FIRMWARE.md](../docs/REGISTRO_FIRMWARE.md).

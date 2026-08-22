/*
 * ============================================================================
 * SAMARCO — MONITORAMENTO ONLINE DO NÍVEL DE ÁGUA EM PIEZÔMETROS
 * ESP32 + BMP180 (stand-in) + OLED + LEDS + BUZZER + SERVIDOR (JSON) + STORE&FORWARD
 * ============================================================================
 *
 * ⚠️ NOTA CONCEITUAL (para o TCC):
 * O desafio SAGA pede monitoramento do NÍVEL DE ÁGUA (metros de coluna
 * d'água). O Wokwi não possui transdutor piezométrico, então usamos o BMP180
 * (barômetro) como *stand-in*: a pressão do slider é convertida em um nível
 * d'água SIMULADO pela escala didática SIM_ESCALA (10 hPa = 1 m). No hardware
 * real (Fase 2), o nível virá de um transdutor de pressão submersível
 * 4–20 mA lido por um ADC ADS1115 — e a conversão passa a ser física real
 * (1 mH2O ≈ 98,07 hPa), calibrada na instalação.
 *
 * LÓGICA DE ALERTA (correta para piezômetro: nível ALTO = perigo):
 * 🟢 NORMAL   : nível < 12 m           → LED Verde, buzzer OFF
 * 🟡 ATENÇÃO  : 12 m ≤ nível < 15 m    → LED Amarelo, beep lento (2 s)
 * 🔴 CRÍTICO  : nível ≥ 15 m           → LED Vermelho pisca, beep rápido
 *
 * Com o padrão do Wokwi (1013,25 hPa) o nível simulado é 10,0 m (NORMAL).
 * Durante a simulação, clique no BMP180 e suba a pressão no slider:
 *   1013 hPa → 10,0 m (normal) · 1035 hPa → 12,2 m (atenção)
 *   1065 hPa → 15,2 m (CRÍTICO)
 *
 * ENVIO / STORE & FORWARD / ALERTAS / IDENTIFICAÇÃO: ver piezometro_core.h —
 * este .ino só implementa a parte específica do sensor (BMP180); todo o
 * resto (WiFi, NTP, buffer, envio HTTP, LEDs, buzzer, OLED) é do núcleo
 * comum, compartilhado com o firmware do protótipo físico
 * (sketch_fisico_jsn_sr04t.ino).
 *
 * CONEXÕES NO WOKWI (ver firmware/diagram.json):
 * BMP180:  VCC→3V3  GND→GND  SCL→GPIO22  SDA→GPIO21
 * OLED:    VCC→3V3  GND→GND  SCL→GPIO22  SDA→GPIO21
 * LEDs (resistor 220Ω): Verde→GPIO32  Amarelo→GPIO33  Vermelho→GPIO25
 * BUZZER:  (+)→GPIO26  (−)→GND
 *
 * Bibliotecas: Adafruit BMP085 Library, Adafruit SSD1306, Adafruit GFX Library
 * ============================================================================
 */

#include <Adafruit_BMP085.h>

// ===== CREDENCIAIS E LIMIARES (simulação Wokwi) =====
// EXCEÇÃO à regra do piezometro_config_local.h usada pelos sketches físicos:
// este sketch roda no SIMULADOR Wokwi, que só enxerga os arquivos do projeto
// (não existe "arquivo local fora do git" lá) — um include de arquivo
// ausente quebraria a simulação ao abrir. As credenciais do Wokwi não são
// segredo (rede pública "Wokwi-GUEST", senha vazia); DEVICE_KEY continua
// placeholder e é colada direto no editor do Wokwi na hora de demonstrar.
#define WIFI_SSID   "Wokwi-GUEST"
#define WIFI_PASS   ""
#define SERVER_URL  "https://piezometro-worker.SEU-SUBDOMINIO.workers.dev/ingest"  // endpoint /ingest do Cloudflare Worker
#define DEVICE_KEY  "troque-esta-chave"                    // mesma DEVICE_KEY definida como secret no Worker
#define MEASUREMENT "telemetria_samarco"                   // (info) rótulo interno das leituras
#define PIEZOMETRO_ID "PZ-01"   // identificador deste instrumento (PZ-01, PZ-02, ...)

// Limiares de nível (m) — espelhados no Worker ([vars] do wrangler.toml) e
// no dashboard (CFG); nos sketches físicos vêm do piezometro_config_local.h.
#define NIVEL_ATENCAO 12.0   // acima disso = ATENÇÃO
#define NIVEL_CRITICO 15.0   // acima disso = CRÍTICO

// ===== CONVERSÃO PRESSÃO → NÍVEL D'ÁGUA (simulação) =====
// nivel = NIVEL_REF + (pressao_hPa − PRESSAO_REF) / SIM_ESCALA
// Escala didática: 10 hPa por metro, para o slider do Wokwi varrer os 3 níveis.
// No hardware real: nivel = (P_transdutor − P_atmosferica) / 98.07 (mH2O).
#define PRESSAO_REF 1013.25  // hPa — padrão do BMP180 no Wokwi
#define NIVEL_REF   10.0     // m  — nível no ponto de referência
#define SIM_ESCALA  10.0     // hPa por metro (didático)

// O núcleo comum (WiFi, buffer, envio, alertas, tela) e o struct Leitura
// vêm do core — este sketch só implementa o adapter do sensor BMP180.
#include "piezometro_core.h"

// ===== MODO DE CAMPO A BATERIA/SOLAR (opcional) =====
// Padrão aqui continua sendo sempre-ligado (bom para o Wokwi/demonstração).
// Para o modo deep sleep (Opção C de docs/projeto/ALIMENTACAO_ENERGIA.md), ver o
// bloco equivalente e mais detalhado em sketch_fisico_jsn_sr04t.ino e o
// cabeçalho de piezometro_deep_sleep.h.

// ===== OBJETO DO SENSOR =====
Adafruit_BMP085 bmp;

// Instrumento de SEGURANÇA: o BMP180 aqui é só o stand-in de simulação, mas
// o padrão vale igual para o sensor real — falha dele não pode travar o
// sketch. sensorOk indica se o begin() funcionou; se não, lerSensor()
// degrada (devolve a última leitura conhecida, marcada valida=false) em vez
// de entrar em while(1).
bool sensorOk = false;

// ===== HOOK: INICIALIZAR SENSOR =====
void initSensor() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(21, 22);

  Serial.print("Inicializando BMP180... ");
  sensorOk = bmp.begin();
  if (!sensorOk) {
    Serial.println("ERRO!");
    Serial.println("BMP180 ausente — seguindo em modo degradado (sem sensor)");
  } else {
    Serial.println("OK!");
  }
}

// ===== HOOK: LER SENSOR =====
Leitura lerSensor() {
  if (!sensorOk) {
    // Sensor indisponível: mantém a última leitura conhecida, mas marca
    // valida=false para NÃO entrar no histórico como medição nova.
    leituraAtual.valida = false;
    return leituraAtual;
  }

  Leitura l;
  l.temperatura = bmp.readTemperature();
  l.pressao = bmp.readPressure() / 100.0;
  // Conversão simulada pressão → nível d'água (ver nota no topo)
  l.nivel = NIVEL_REF + (l.pressao - PRESSAO_REF) / SIM_ESCALA;
  if (l.nivel < 0) l.nivel = 0;
  l.temPressao = true;
  l.temTemperatura = true;
  l.valida = true;
  return l;
}

// ===== HOOK: LINHAS EXTRAS NA TELA =====
void linhasExtrasDisplay(Tela &t) {
  char l1[32];
  snprintf(l1, sizeof(l1), "Press: %.1f hPa", leituraAtual.pressao);
  t.escreverLinha(SLOT_EXTRA_1, l1);

  char l2[32];
  snprintf(l2, sizeof(l2), "Temp: %.1f C  %s",
           leituraAtual.temperatura, wifiOk ? "WiFi:OK" : "WiFi:--");
  t.escreverLinha(SLOT_EXTRA_2, l2);
}

// ===== HOOK: LINHAS EXTRAS NO SERIAL =====
void linhasExtrasSerial() {
  Serial.print("📊 Pressão:      ");
  Serial.print(leituraAtual.pressao, 1);
  Serial.println(" hPa");

  Serial.print("📊 Temperatura:  ");
  Serial.print(leituraAtual.temperatura, 1);
  Serial.println(" °C");
}

// ===== SETUP / LOOP (modo padrão sempre-ligado — ver PIEZOMETRO_MAIN em piezometro_core.h) =====
PIEZOMETRO_MAIN()

/*
 * ============================================================================
 * COMO TESTAR NO WOKWI:
 * ============================================================================
 * Clique no BMP180 durante a simulação e mova o slider de PRESSÃO
 * (a escala didática converte 10 hPa em 1 m de nível d'água):
 *
 * 1. NORMAL  (verde):    1013 hPa → nível 10,0 m
 * 2. ATENÇÃO (amarelo):  1035 hPa → nível 12,2 m  (beep a cada 2 s)
 * 3. CRÍTICO (vermelho): 1065 hPa → nível 15,2 m  (LED pisca + beep rápido)
 *
 * O dashboard usa os MESMOS limiares (12 m / 15 m) e o motor de alertas do
 * O dashboard registra por escrito e destaca visualmente as transições de nível;
 * LEDs e buzzer sinalizam a faixa localmente — veja o
 * README.
 *
 * TESTE DO STORE & FORWARD: pause a simulação por ~1 min (ou desligue o
 * WiFi) e observe no Serial o buffer acumulando; ao reconectar, todas as
 * leituras retidas são enviadas de uma vez (JSON) ao Worker, com seus
 * timestamps originais, que por sua vez grava tudo no D1.
 * ============================================================================
 */

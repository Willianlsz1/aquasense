/*
 * ============================================================================
 * AQUASENSE — MONITORAMENTO ONLINE DO NÍVEL DE ÁGUA EM PIEZÔMETROS
 * ESP32 + JSN-SR04T (ultrassônico) + OLED + LEDS + BUZZER + SERVIDOR (JSON)
 * + STORE&FORWARD  —  FIRMWARE PARA HARDWARE REAL (protótipo físico)
 * ============================================================================
 *
 * ⚠️ ESTE ARQUIVO É PARA A MAQUETE FÍSICA (ESP32 real + sensor real).
 * A simulação no Wokwi continua usando firmware/sketch.ino (com o BMP180
 * como stand-in de pressão). Aqui o "stand-in" sai de cena: o nível d'água
 * vem de um sensor ultrassônico JSN-SR04T medindo a distância até a água
 * dentro de um tubo de PVC (ou balde) — uma maquete em escala reduzida do
 * piezômetro real.
 *
 * MONTAGEM FÍSICA (ver docs/prototipo/PROTOTIPO_FISICO.md para o passo a passo):
 * O sensor fica fixado no TOPO do tubo/balde, apontando para baixo, para a
 * superfície da água. Ele mede a distância até a água; quanto MAIS a água
 * sobe, MENOR a distância medida — por isso o nível é calculado por
 * subtração: nivel_cm = ALTURA_SENSOR_CM - distancia_medida_cm.
 *
 *        ┌────────────┐  ← sensor JSN-SR04T (topo do tubo, apontando p/ baixo)
 *        │   TRIG/ECHO │
 *        └──────┬─────┘
 *               │  distancia (medida)
 *               │
 *        ╔══════▼══════╗  ← ALTURA_SENSOR_CM (distância do sensor ao FUNDO)
 *        ║             ║
 *        ║  ~~~~~~~~~~ ║  ← superfície da água (nivel_cm = altura - distancia)
 *        ║             ║
 *        ╚═════════════╝  ← fundo do tubo/balde
 *
 * ⚠️ DIVISOR DE TENSÃO NO ECHO: o JSN-SR04T opera em 5V e o pino ECHO
 * devolve um pulso em 5V — mas as GPIOs do ESP32 só toleram 3,3V! É
 * OBRIGATÓRIO usar um divisor resistivo entre o ECHO do sensor e o GPIO18:
 *   ECHO (5V) ──[ 1kΩ ]──┬── GPIO18 (ESP32)
 *                        │
 *                      [ 2kΩ ]
 *                        │
 *                       GND
 * Isso reduz o pulso de 5V para ~3,3V (regra do divisor: 5V × 2k/(1k+2k) ≈
 * 3,3V). TRIG pode ir direto ao GPIO5 (o ESP32 já manda 3,3V, e o sensor
 * reconhece HIGH acima de ~2V).
 *
 * ⚠️ ZONA MORTA DO JSN-SR04T: o sensor não mede distâncias menores que
 * ~20–25 cm de forma confiável (a onda ainda não "descolou" do transdutor).
 * Por isso o sensor DEVE ficar montado a pelo menos 25 cm de altura acima
 * do nível MÁXIMO de água esperado no tubo — senão, quando a água estiver
 * alta, as leituras ficam erráticas ou somem. É por isso que descartamos
 * (na mediana) qualquer leitura < 25 cm.
 *
 * ESCALA DA MAQUETE: como o tubo/balde é pequeno, aplicamos um fator de
 * escala didático (ESCALA_M_POR_CM) para que poucos centímetros de água no
 * tubo representem metros de coluna d'água na "barragem" simulada — os
 * MESMOS limiares de alerta do sistema real (12 m / 15 m) continuam
 * valendo, só a régua física é que é menor:
 *   20 cm de água no tubo → 10,0 m equivalentes (NORMAL)
 *   24 cm de água no tubo → 12,0 m equivalentes (ATENÇÃO)
 *   30 cm de água no tubo → 15,0 m equivalentes (CRÍTICO)
 *
 * PASSO DE CALIBRAÇÃO (fazer sempre que remontar o sensor no tubo): meça
 * com uma régua/trena a distância real do sensor até o FUNDO do tubo
 * (ALTURA_SENSOR_CM) e ajuste o define abaixo antes de gravar o firmware.
 * Um erro de 1 cm na medição já desloca o nível calculado em 0,5 m.
 *
 * ENVIO / STORE & FORWARD / ALERTAS / IDENTIFICAÇÃO: ver piezometro_core.h —
 * este .ino só implementa a parte específica do sensor (JSN-SR04T,
 * medição por pulseIn() + mediana); todo o resto (WiFi, NTP, buffer, envio
 * HTTP, LEDs, buzzer, OLED) é do núcleo comum, compartilhado com o firmware
 * de simulação (sketch.ino). O JSON aqui só carrega "nivel_agua" (+ "ts"
 * quando o NTP sincronizou) — sem pressão/temperatura, pois este protótipo
 * não tem esses sensores; o Worker aceita esses campos ausentes normalmente.
 *
 * CONEXÕES NA MAQUETE (ver docs/prototipo/PROTOTIPO_FISICO.md para a tabela completa):
 * JSN-SR04T: VCC→5V (VIN)  GND→GND  TRIG→GPIO5  ECHO→[divisor 1k/2k]→GPIO18
 * OLED:      VCC→3V3  GND→GND  SCL→GPIO22  SDA→GPIO21
 * LEDs (resistor 220Ω): Verde→GPIO32  Amarelo→GPIO33  Vermelho→GPIO25
 * BUZZER:    (+)→GPIO26  (−)→GND
 *
 * Bibliotecas: Adafruit SSD1306, Adafruit GFX Library (nenhuma lib externa
 * é necessária para o JSN-SR04T — ele é lido com pulseIn() puro).
 * ============================================================================
 */

// ===== CREDENCIAIS E LIMIARES (preencha antes de usar!) =====
// WIFI_SSID/WIFI_PASS/SERVER_URL/DEVICE_KEY/PIEZOMETRO_ID/NIVEL_ATENCAO/
// NIVEL_CRITICO vêm de piezometro_config_local.h (fora do git — ver o
// modelo em firmware/piezometro_config_local.h.example: copie para
// piezometro_config_local.h e preencha antes de gravar o firmware).
#include "piezometro_config_local.h"

// ===== SENSOR ULTRASSÔNICO JSN-SR04T =====
#define PIN_TRIG 5
#define PIN_ECHO 18   // ⚠️ via divisor de tensão (echo é 5V; ESP32 é 3,3V!)
// Montagem física (maquete): sensor fixado no TOPO do tubo, apontando para a água
#define ALTURA_SENSOR_CM 60.0   // distância do sensor ao FUNDO do tubo (medir na montagem!)
#define ESCALA_M_POR_CM  0.5    // maquete em escala: 1 cm no tubo = 0,5 m na barragem
// Com a escala padrão: 20 cm de água → 10 m (normal) · 24 cm → 12 m (atenção)
// · 30 cm → 15 m (crítico) — os mesmos limiares de sempre, ver abaixo.

// O núcleo comum (WiFi, buffer, envio, alertas, tela) e o struct Leitura
// vêm do core — este sketch só implementa o adapter do sensor JSN-SR04T.
#include "piezometro_core.h"

// ===== MODO DE CAMPO A BATERIA/SOLAR (opcional — ver piezometro_deep_sleep.h) =====
// O padrão deste sketch é o modo sempre-ligado acima (bom para a maquete: LEDs,
// buzzer e OLED ao vivo). Para uma instalação de campo a bateria/solar (Opção C
// de docs/projeto/ALIMENTACAO_ENERGIA.md), ative o deep sleep ANTES do #include acima:
//   #define MODO_DEEP_SLEEP
//   #include "piezometro_core.h"
//   #include "piezometro_deep_sleep.h"
// e troque o setup()/loop() no fim deste arquivo por:
//   void setup() { initSensor(); deepSleepCiclo(); }  // nunca retorna
//   void loop()  { }                                   // nunca alcançado

// ===== VARIÁVEIS ESPECÍFICAS DO ADAPTER (só para display/serial) =====
float distanciaCm = 0;   // última distância medida pelo sensor (sensor → água)
float nivelCm = 0;       // nível real de água dentro do tubo/balde (cm)

// ===== HOOK: INICIALIZAR SENSOR =====
void initSensor() {
  Serial.begin(115200);
  delay(1000);

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

  Serial.println("Sensor ultrassônico JSN-SR04T pronto (TRIG/ECHO configurados).");
}

// ===== FUNÇÃO: UMA MEDIÇÃO BRUTA DO SENSOR (cm) =====
// Dispara um pulso de 10 µs no TRIG e mede a largura do pulso de retorno
// no ECHO. Retorna 0 se estourar o timeout (sem eco — nada refletindo).
float medirDistanciaCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duracao = pulseIn(PIN_ECHO, HIGH, 30000UL); // timeout 30 ms
  if (duracao == 0) return 0; // sem eco dentro do timeout
  return duracao / 58.0;      // µs → cm (velocidade do som no ar)
}

// ===== FUNÇÃO: DISTÂNCIA POR MEDIANA (mais robusta a ruído/eco espúrio) =====
// Faz 5 medições espaçadas de 30 ms, descarta as fora da faixa útil
// (< 25 cm = zona morta do JSN-SR04T; > 450 cm = fora de alcance/ruído) e
// retorna a mediana das leituras válidas. Se nenhuma sobrar, retorna -1.
float medirDistanciaMedianaCm() {
  float leituras[5];
  int n = 0;

  for (int i = 0; i < 5; i++) {
    float d = medirDistanciaCm();
    if (d >= 25.0 && d <= 450.0) {
      leituras[n++] = d;
    }
    delay(30);
  }

  if (n == 0) return -1.0; // nenhuma leitura válida nesta rodada

  // Ordena (insertion sort — n é pequeno) e pega o elemento do meio
  for (int i = 1; i < n; i++) {
    float chave = leituras[i];
    int j = i - 1;
    while (j >= 0 && leituras[j] > chave) {
      leituras[j + 1] = leituras[j];
      j--;
    }
    leituras[j + 1] = chave;
  }

  return leituras[n / 2];
}

// ===== HOOK: LER SENSOR =====
Leitura lerSensor() {
  float distancia = medirDistanciaMedianaCm();

  if (distancia < 0) {
    // Sem leitura válida nesta rodada: mantém o ÚLTIMO nível conhecido para
    // display/serial (não zera! um alarme falso de "nível zero" seria pior
    // que atrasar) mas marca valida=false — essa leitura NÃO é enviada ao
    // backend como medição nova, senão a falha do sensor entraria
    // disfarçada de dado bom no histórico.
    Serial.println("⚠️ Sem eco válido — leitura não enviada");
    leituraAtual.valida = false;
    return leituraAtual;
  }

  distanciaCm = distancia;

  float nivel_cm = ALTURA_SENSOR_CM - distanciaCm;
  if (nivel_cm < 0) nivel_cm = 0;
  nivelCm = nivel_cm;

  Leitura l;
  l.nivel = nivelCm * ESCALA_M_POR_CM; // nível equivalente (m) — vai para telemetria/alerta
  l.pressao = 0;
  l.temperatura = 0;
  l.temPressao = false;
  l.temTemperatura = false;
  l.valida = true;
  return l;
}

// ===== HOOK: LINHAS EXTRAS NA TELA =====
void linhasExtrasDisplay(Tela &t) {
  char l1[32];
  snprintf(l1, sizeof(l1), "Tubo: %.1fcm", nivelCm);
  t.escreverLinha(SLOT_EXTRA_1, l1);

  char l2[32];
  snprintf(l2, sizeof(l2), "Dist: %.1fcm %s", distanciaCm, wifiOk ? "WiFi:OK" : "WiFi:--");
  t.escreverLinha(SLOT_EXTRA_2, l2);
}

// ===== HOOK: LINHAS EXTRAS NO SERIAL =====
void linhasExtrasSerial() {
  Serial.print("📏 Nível no tubo: ");
  Serial.print(nivelCm, 1);
  Serial.println(" cm");

  Serial.print("📡 Distância medida: ");
  Serial.print(distanciaCm, 1);
  Serial.println(" cm");
}

// ===== SETUP / LOOP (modo padrão sempre-ligado — ver PIEZOMETRO_MAIN em piezometro_core.h) =====
PIEZOMETRO_MAIN()

/*
 * ============================================================================
 * COMO TESTAR NA MAQUETE FÍSICA:
 * ============================================================================
 * 1. Meça com uma régua a distância real do sensor ao fundo do tubo/balde e
 *    ajuste ALTURA_SENSOR_CM antes de gravar o firmware.
 * 2. Com o tubo VAZIO, o Serial deve mostrar distância ≈ ALTURA_SENSOR_CM e
 *    nível ≈ 0 m (confere a calibração).
 * 3. Despeje água aos poucos (jarra/copo) e observe no Serial/OLED:
 *    - até ~20 cm de água no tubo → nível 10,0 m (NORMAL, verde)
 *    - a partir de 24 cm de água  → nível 12,0 m (ATENÇÃO, amarelo, beep 2s)
 *    - a partir de 30 cm de água  → nível 15,0 m (CRÍTICO, vermelho pisca,
 *      beep rápido; o Worker registra o evento para exibição escrita/visual
 *      no dashboard)
 * 4. O dashboard usa os MESMOS limiares (12 m / 15 m) do firmware de
 *    simulação — não é preciso mudar nada no Worker nem no index.html.
 *
 * TESTE DO STORE & FORWARD: desligue o WiFi do roteador/celular por ~1 min
 * e observe no Serial o buffer acumulando; ao reconectar, todas as leituras
 * retidas são enviadas de uma vez (JSON) ao Worker, com seus timestamps
 * originais, que por sua vez grava tudo no D1.
 * ============================================================================
 */

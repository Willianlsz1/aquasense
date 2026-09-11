/*
 * ============================================================================
 * SAMARCO — MONITORAMENTO ONLINE DO NÍVEL DE ÁGUA EM PIEZÔMETROS
 * ESP32 + UCT (transdutor piezométrico 4-20 mA + ADS1115) + OLED + LEDS +
 * BUZZER + SERVIDOR (JSON) + STORE&FORWARD — FIRMWARE DA UCT INDUSTRIAL
 * ============================================================================
 *
 * ⚠️ ESTE ARQUIVO É O ADAPTER DA UCT (Unidade de Controle e Telemetria)
 * INDUSTRIAL, a validar conforme docs/projeto/HOMOLOGACAO_UCT.md. Difere dos
 * dois sketches anteriores (sketch.ino = BMP180 de simulação Wokwi;
 * sketch_fisico_jsn_sr04t.ino = ultrassônico stand-in da maquete didática):
 * aqui o nível vem de um TRANSDUTOR PIEZOMÉTRICO SUBMERSÍVEL de loop de
 * corrente 4-20 mA — o mesmo fenômeno físico do piezômetro real (poropressão
 * convertida em corrente proporcional), não um stand-in. Ver
 * docs/projeto/PROJETO_INDUSTRIAL.md seções 4 e 10 para a especificação de
 * hardware completa.
 *
 * FÍSICA DO INSTRUMENTO (detalhada em docs/projeto/HOMOLOGACAO_UCT.md §2):
 * o transdutor (faixa 0-5 m H2O) entrega 4 mA no fundo de escala vazio e
 * 20 mA cheio — sensibilidade de 3,2 mA/m. Essa corrente não é lida
 * diretamente pelo ESP32 (não há ADC de corrente); em vez disso ela passa
 * por um RESISTOR SHUNT de precisão de 150 Ω, 0,1%, colocado em série no
 * loop entre o transdutor e o retorno (GND). A tensão que se forma sobre o
 * shunt (V = I × R) é o que o ADS1115 mede:
 *   4 mA  × 150 Ω = 0,600 V  (transdutor seco / 0 m)
 *   20 mA × 150 Ω = 3,000 V  (fundo de escala / 5 m)
 * Sensibilidade em tensão: 3,2 mA/m × 150 Ω = 0,48 V/m.
 *
 * MONTAGEM ELÉTRICA (bancada/homologação, ver HOMOLOGACAO_UCT.md §3):
 *   Transdutor 4-20 mA (loop) → shunt 150 Ω 0,1% → GND
 *   ADS1115 AIN0 → nó entre o transdutor e o shunt (mede a tensão SOBRE o
 *                  shunt, entrada single-ended referenciada ao GND comum)
 *   ADS1115 I2C: SDA→GPIO21  SCL→GPIO22 — MESMO barramento do OLED
 *                (endereços diferentes, sem conflito: ADS1115 em 0x48,
 *                OLED SSD1306 em 0x3C — os dois convivem no mesmo Wire.begin)
 *   ADS1115: VCC→3V3  GND→GND  ADDR→GND (fixa o endereço em 0x48)
 *
 * Bibliotecas: Adafruit SSD1306, Adafruit GFX Library (OLED, já usadas nos
 * outros sketches) + Adafruit_ADS1X15 (novo — biblioteca do conversor A/D).
 *
 * ENVIO / STORE & FORWARD / ALERTAS / IDENTIFICAÇÃO: ver piezometro_core.h —
 * este .ino só implementa a parte específica do sensor (leitura do ADS1115 +
 * conversão corrente/tensão → metros); todo o resto (WiFi, NTP, buffer,
 * envio HTTP, LEDs, buzzer, OLED) é do núcleo comum, compartilhado com os
 * outros dois firmwares. O JSON aqui só carrega "nivel_agua" (+ "ts" quando o
 * NTP sincronizou) — sem pressão/temperatura, pois este transdutor reporta
 * só o nível (a leitura de pressão bruta já é convertida em metros aqui
 * mesmo, dentro do adapter).
 *
 * DOIS MODOS DE OPERAÇÃO (mesmo padrão dos outros sketches):
 *   - SEMPRE-LIGADO (bancada/homologação — ATIVO neste arquivo): setup/loop
 *     padrão, initSensor()+coreSetup()/coreLoop(). É o modo certo para os
 *     ensaios de docs/projeto/HOMOLOGACAO_UCT.md (E1-E5): precisa do
 *     Serial/OLED vivos o tempo todo para acompanhar a bancada.
 *   - DEEP SLEEP (campo — opcional, ver piezometro_core.h e
 *     piezometro_deep_sleep.h): para uma instalação de campo a bateria/solar
 *     (Opção C de docs/projeto/ALIMENTACAO_ENERGIA.md), ative ANTES do
 *     #include abaixo:
 *       #define MODO_DEEP_SLEEP
 *       #include "piezometro_core.h"
 *       #include "piezometro_deep_sleep.h"
 *     e troque o setup()/loop() no fim deste arquivo por:
 *       void setup() { initSensor(); deepSleepCiclo(); }  // nunca retorna
 *       void loop()  { }                                   // nunca alcançado
 *     A homologação de bancada deve ser feita primeiro, no modo
 *     sempre-ligado; o modo de campo só entra depois de aprovada (critério de
 *     saída de HOMOLOGACAO_UCT.md §5).
 * ============================================================================
 */

#include <Adafruit_ADS1X15.h>

// ===== CREDENCIAIS E LIMIARES (preencha antes de usar!) =====
// WIFI_SSID/WIFI_PASS/SERVER_URL/DEVICE_KEY/PIEZOMETRO_ID/NIVEL_ATENCAO/
// NIVEL_CRITICO vêm de piezometro_config_local.h (fora do git — ver o
// modelo em firmware/piezometro_config_local.h.example: copie para
// piezometro_config_local.h e preencha antes de gravar o firmware).
#include "piezometro_config_local.h"

// ===== CONDICIONAMENTO ELÉTRICO DO LOOP 4-20 mA =====
#define SHUNT_OHMS        150.0f   // decisão fechada (0,6-3,0 V na faixa 4-20 mA)

// ===== CALIBRAÇÃO DE DOIS PONTOS (etapa E2 de HOMOLOGACAO_UCT.md) =====
// Os dois valores abaixo SÃO os coeficientes que a etapa E2 do protocolo de
// homologação determina na bancada real (ponto 1 = zero, ponto 2 =
// referência a 1,5/2,0 m — ver HOMOLOGACAO_UCT.md §4, tabela E2). Os
// defaults aqui são os valores TEÓRICOS do transdutor 0-5 m (datasheet),
// usados só até a bancada gerar os valores medidos; troque os dois após
// rodar E2, nunca use os defaults em produção sem recalibrar.
#define CAL_V_ZERO        0.600f   // V lida com transdutor a seco (ajustar na etapa E2 da homologação)
#define CAL_ESCALA_M_V    (1.0f / 0.48f) // m por volt: 1/(3,2 mA/m × 150 Ω) — ajustar com o 2º ponto da E2
// nivel = (v_shunt - CAL_V_ZERO) * CAL_ESCALA_M_V

// ===== DETECÇÃO DE FALHA ELÉTRICA (NAMUR NE43) =====
// A faixa "viva" do loop é 4-20 mA; fora dela não é medição, é falha do
// próprio instrumento/fiação — a norma NAMUR NE43 reserva as bordas da
// escala 0-20 mA para sinalizar isso:
//   < 3,6 mA (< 0,54 V no shunt): loop rompido/sensor desconectado
//   > 21,0 mA (> 3,15 V no shunt): curto-circuito ou sobrefaixa
#define CORRENTE_MIN_MA   3.6f
#define CORRENTE_MAX_MA   21.0f
#define V_SHUNT_MIN       (CORRENTE_MIN_MA / 1000.0f * SHUNT_OHMS)  // 0,540 V
#define V_SHUNT_MAX       (CORRENTE_MAX_MA / 1000.0f * SHUNT_OHMS)  // 3,150 V

// ===== AMOSTRAGEM =====
// 16 conversões single-shot suavizam o ruído elétrico do loop de corrente; a
// 128 SPS (padrão da lib), o ADS1115 completa as 16 em ~125 ms — folga
// tranquila dentro do INTERVALO_LEITURA de 1 s do core.
#define N_AMOSTRAS 16

// O núcleo comum (WiFi, buffer, envio, alertas, tela) e o struct Leitura
// vêm do core — este sketch só implementa o adapter do sensor UCT (4-20 mA).
#include "piezometro_core.h"

// ===== MODO DE CAMPO A BATERIA/SOLAR (opcional — ver piezometro_deep_sleep.h) =====
// O padrão deste sketch é o modo sempre-ligado acima (obrigatório para os
// ensaios de bancada de docs/projeto/HOMOLOGACAO_UCT.md). Para uma
// instalação de campo a bateria/solar (Opção C de
// docs/projeto/ALIMENTACAO_ENERGIA.md), ative o deep sleep ANTES do #include
// acima:
//   #define MODO_DEEP_SLEEP
//   #include "piezometro_core.h"
//   #include "piezometro_deep_sleep.h"
// e troque o setup()/loop() no fim deste arquivo por:
//   void setup() { initSensor(); deepSleepCiclo(); }  // nunca retorna
//   void loop()  { }                                   // nunca alcançado

// ===== OBJETO DO ADC =====
Adafruit_ADS1115 ads;

// Instrumento de SEGURANÇA: mesmo padrão dos outros dois sketches — falha do
// ads.begin() (I2C ausente/endereço errado) não pode travar o setup.
// sensorOk indica se o begin() funcionou; se não, lerSensor() degrada
// (devolve a última leitura conhecida, marcada valida=false) em vez de
// entrar em while(1).
bool sensorOk = false;

// ===== VARIÁVEIS ESPECÍFICAS DO ADAPTER (só para display/serial) =====
float correnteMa = 0;   // última corrente de loop calculada (mA)
float vShunt = 0;       // última tensão medida sobre o shunt (V)

// ===== HOOK: INICIALIZAR SENSOR =====
void initSensor() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(21, 22); // barramento I2C compartilhado com o OLED (0x48 ADS / 0x3C OLED — sem conflito)

  Serial.print("Inicializando ADS1115 (UCT 4-20 mA)... ");
  sensorOk = ads.begin(); // endereço padrão 0x48 (ADDR→GND)
  if (!sensorOk) {
    Serial.println("ERRO!");
    Serial.println("ADS1115 ausente — seguindo em modo degradado (sem sensor)");
  } else {
    // GAIN_ONE = ±4,096 V de fundo de escala, 125 µV/bit — casa com a faixa
    // do loop condicionado pelo shunt (0,6-3,0 V): usa quase toda a escala
    // do ADC sem saturar, maximizando a resolução efetiva (ver conta em
    // HOMOLOGACAO_UCT.md §2: ~0,26 mm por bit).
    ads.setGain(GAIN_ONE);
    Serial.println("OK!");
  }
}

// ===== FUNÇÃO: LER TENSÃO MÉDIA DO SHUNT (V) =====
// N_AMOSTRAS conversões single-shot em AIN0, convertidas de código bruto
// para volts com computeVolts() (já contabiliza o LSB do ganho escolhido) e
// tiradas a média — suaviza o ruído elétrico do loop.
float lerTensaoShuntMedia() {
  float soma = 0;
  for (int i = 0; i < N_AMOSTRAS; i++) {
    int16_t bruto = ads.readADC_SingleEnded(0); // AIN0
    soma += ads.computeVolts(bruto);
  }
  return soma / N_AMOSTRAS;
}

// ===== HOOK: LER SENSOR =====
Leitura lerSensor() {
  if (!sensorOk) {
    // ADC indisponível: mantém a última leitura conhecida, mas marca
    // valida=false para NÃO entrar no histórico como medição nova.
    leituraAtual.valida = false;
    return leituraAtual;
  }

  float v = lerTensaoShuntMedia();
  correnteMa = (v / SHUNT_OHMS) * 1000.0f; // I = V / R, em mA
  vShunt = v;

  // ===== DETECÇÃO DE FALHA ELÉTRICA NAMUR NE43 =====
  if (v < V_SHUNT_MIN) {
    Serial.println("⚠️ Corrente abaixo de 3,6 mA — loop rompido ou sensor desconectado (NAMUR NE43)");
    leituraAtual.valida = false;
    return leituraAtual;
  }
  if (v > V_SHUNT_MAX) {
    Serial.println("⚠️ Corrente acima de 21 mA — curto-circuito ou sobrefaixa (NAMUR NE43)");
    leituraAtual.valida = false;
    return leituraAtual;
  }

  Leitura l;
  l.nivel = (v - CAL_V_ZERO) * CAL_ESCALA_M_V; // calibração de dois pontos (E2)
  if (l.nivel < 0) l.nivel = 0; // clamp — ruído/offset residual não pode virar nível negativo
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
  snprintf(l1, sizeof(l1), "Loop: %.2fmA", correnteMa);
  t.escreverLinha(SLOT_EXTRA_1, l1);

  char l2[32];
  snprintf(l2, sizeof(l2), "Shunt: %.3fV", vShunt);
  t.escreverLinha(SLOT_EXTRA_2, l2);
}

// ===== HOOK: LINHAS EXTRAS NO SERIAL =====
void linhasExtrasSerial() {
  Serial.print("⚡ Corrente de loop: ");
  Serial.print(correnteMa, 3);
  Serial.println(" mA");

  Serial.print("🔌 Tensão no shunt:  ");
  Serial.print(vShunt, 4);
  Serial.println(" V");
}

// ===== SETUP / LOOP (modo sempre-ligado — bancada/homologação; ver PIEZOMETRO_MAIN em piezometro_core.h) =====
PIEZOMETRO_MAIN()

/*
 * ============================================================================
 * COMO TESTAR NA BANCADA (ver docs/projeto/HOMOLOGACAO_UCT.md para o protocolo completo):
 * ============================================================================
 * 1. E1 — verificação elétrica do loop a seco (sem o ADS1115 ligado ainda):
 *    confirme ~4,0 mA com o multímetro antes de conectar o ADC.
 * 2. E2 — calibração de dois pontos: com a bancada vazia, registre a tensão
 *    lida (deve bater com CAL_V_ZERO ≈ 0,600 V); encha até a altura de
 *    referência (1,5 ou 2,0 m) e registre a segunda tensão; recalcule
 *    CAL_V_ZERO e CAL_ESCALA_M_V a partir dos dois pontos medidos e grave no
 *    firmware.
 * 3. E3 — curva de exatidão: para cada altura da tabela de HOMOLOGACAO_UCT.md
 *    §2 (0 / 0,5 / 1,0 / 1,5 / 2,0 m), colete 10 leituras e compare com o
 *    valor esperado (critério de aceite: ±3 cm).
 * 4. Teste de falha NAMUR: desconecte o transdutor do loop (corrente cai a
 *    zero) e confirme no Serial a mensagem de "loop rompido"; a leitura NÃO
 *    deve ser enviada ao backend.
 * ============================================================================
 */

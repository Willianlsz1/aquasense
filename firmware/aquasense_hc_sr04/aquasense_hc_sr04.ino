// AQUASENSE — HC-SR04 + OLED SSD1306 — UMA ÚNICA ABA
// Gerado por tools/gerar-firmware-unico.mjs a partir dos fontes da bancada.
// Edite a configuração abaixo na cópia LOCAL da Arduino IDE.
// Não publique este arquivo depois de preencher senha e chave.
// Escala didática: max(0, 40 - distância em cm) * 0,5 m.
// ECHO no GPIO 18 exige divisor de tensão; mantenha a montagem já testada.
// Bibliotecas: Adafruit GFX e Adafruit SSD1306; placa ESP32 Dev Module.

// ===== CREDENCIAIS (preencha antes de usar!) =====
#define WIFI_SSID   "SUA_REDE_WIFI"
#define WIFI_PASS   "SUA_SENHA_WIFI"
#define SERVER_URL  "https://piezometro-worker.SEU-SUBDOMINIO.workers.dev/ingest"  // endpoint /ingest do Cloudflare Worker
#define DEVICE_KEY  "troque-esta-chave"                    // mesma DEVICE_KEY definida como secret no Worker
#define MEASUREMENT "telemetria_aquasense"                 // (info) rótulo interno das leituras
#define PIEZOMETRO_ID "PZ-01"   // identificador deste instrumento (PZ-01, PZ-02, ...)

// ===== LIMIARES DE NÍVEL (m) =====
#define NIVEL_ATENCAO 12.0   // acima disso = ATENÇÃO
#define NIVEL_CRITICO 15.0   // acima disso = CRÍTICO

// ===== CREDENCIAIS E LIMIARES (preencha antes de usar!) =====

// ===== SENSOR ULTRASSÔNICO HC-SR04 =====
#define PIN_TRIG 5
#define PIN_ECHO 18   // ⚠️ via divisor de tensão 1k/2k (echo é 5V!)
#define ALTURA_REF_CM   40.0   // "fundo" virtual: mão a 40 cm = nível 0
#define ESCALA_M_POR_CM  0.5   // 1 cm = 0,5 m equivalentes
#define DIST_MIN_CM  3.0
#define DIST_MAX_CM  400.0

// ===== VARIÁVEIS DO ADAPTER (para display/serial) =====

// ===== TELA OLED =====
#include <Arduino.h>

// ===== SLOTS DE LINHA (mesma ordem/semântica das linhas do OLED atual) =====
#define SLOT_TITULO       0  // título fixo da tela de operação ("AQUASENSE PIEZOMETRO")
#define SLOT_NIVEL        1  // "Nivel: X.XX m"
#define SLOT_EXTRA_1      2  // 1ª linha específica do sensor (hook linhasExtrasDisplay)
#define SLOT_EXTRA_2      3  // 2ª linha específica do sensor (hook linhasExtrasDisplay)
#define SLOT_WIFI_STATUS  4  // reservado: status de conectividade isolado — hoje os

// ===== FAIXAS DE ALERTA (para destacarStatus) =====
#define FAIXA_NORMAL   0  // nível < NIVEL_ATENCAO
#define FAIXA_ATENCAO  1  // NIVEL_ATENCAO <= nível < NIVEL_CRITICO
#define FAIXA_CRITICO  2  // nível >= NIVEL_CRITICO
#define FAIXA_FALHA    3  // sensor sem leitura válida

// ===== INTERFACE =====
class Tela {
 public:
  virtual ~Tela() {}

  virtual bool iniciar() = 0;

  virtual void limpar() = 0;

  virtual void escreverLinha(uint8_t slot, const char* texto) = 0;

  virtual void destacarStatus(const char* rotulo, uint8_t faixa) = 0;

  virtual void mostrar() = 0;

  virtual void mostrarTelaInicio() = 0;

  virtual void atenuar() {}
};

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ===== DISPLAY OLED =====
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C

class TelaSSD1306 : public Tela {
 public:
  TelaSSD1306() : display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET) {}

  bool iniciar() override {
    Wire.beginTransmission(SCREEN_ADDRESS);
    uint8_t erro = Wire.endTransmission();
    Serial.printf("OLED I2C 0x%02X: codigo %u (0 = respondeu)\n", SCREEN_ADDRESS, erro);
    if (erro != 0) return false;
    bool ok = display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS, true, false);
    if (ok) display.setTextColor(SSD1306_WHITE);
    return ok;
  }

  void limpar() override {
    display.clearDisplay();
  }

  void escreverLinha(uint8_t slot, const char* texto) override {
    switch (slot) {
      case SLOT_TITULO:
        display.setTextSize(1);
        display.setCursor(0, 0);
        display.print(texto);
        display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
        break;
      case SLOT_NIVEL:
        display.setTextSize(1);
        display.setCursor(0, 15);
        display.print(texto);
        break;
      case SLOT_EXTRA_1:
        display.setTextSize(1);
        display.setCursor(0, 25);
        display.print(texto);
        break;
      case SLOT_EXTRA_2:
        display.setTextSize(1);
        display.setCursor(0, 35);
        display.print(texto);
        break;
      case SLOT_WIFI_STATUS:
        break;
      default:
        break;
    }
  }

  void destacarStatus(const char* rotulo, uint8_t faixa) override {
    (void)faixa; // SSD1306 é monocromático — a faixa não muda nada aqui; um
    display.drawLine(0, 45, 128, 45, SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(0, 50);
    if (rotulo[0] != '\0') display.print(rotulo);
  }

  void mostrar() override {
    display.display();
  }

  void mostrarTelaInicio() override {
    display.clearDisplay();
    display.setTextSize(2);
    display.setCursor(10, 5);
    display.println("AquaSense");

    display.setTextSize(1);
    display.setCursor(8, 30);
    display.println("Nivel de agua em");
    display.setCursor(18, 42);
    display.println("piezometros");

    display.setCursor(10, 55);
    display.println("Iniciando...");

    display.display();
  }

  void atenuar() override {
    display.dim(true);
  }

 private:
  Adafruit_SSD1306 display;
};

// ===== CONEXÃO, ENVIO E ALERTAS =====
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <math.h>

// ===== PINOS COMUNS (LEDs/buzzer — iguais nos dois firmwares) =====
#define LED_VERDE    32
#define LED_AMARELO  33
#define LED_VERMELHO 25
#define BUZZER       26

// ===== INTERVALOS (ms) =====
#define INTERVALO_LEITURA 1000UL    // leitura local + LEDs + display
#define INTERVALO_ENVIO   10000UL   // envio ao backend (Cloudflare Worker)
#define INTERVALO_NTP     300000UL  // 5 min — re-sincroniza o relógio periodicamente:

// ===== STORE & FORWARD =====
#define BUFFER_MAX 120              // ~20 min de leituras retidas sem rede

// ===== CONTRATO DO SENSOR =====
struct Leitura {
  float nivel;        // m — obrigatório
  float pressao;      // hPa — só se temPressao
  float temperatura;  // °C — só se temTemperatura
  bool  temPressao;
  bool  temTemperatura;
  bool  valida;        // false = sensor sem resposta neste ciclo — NÃO
};

// ===== DECLARAÇÕES DOS HOOKS DE SENSOR (implementados no .ino) =====
void initSensor();
Leitura lerSensor();
void linhasExtrasDisplay(Tela &t);
void linhasExtrasSerial();

// ===== IMPLEMENTAÇÃO DE TELA EM USO =====
TelaSSD1306 telaSsd1306;
Tela* tela = &telaSsd1306;

// ===== ESTADO DA ÚLTIMA LEITURA (preenchido pelo adapter via lerSensor) =====
Leitura leituraAtual = {0, 0, 0, false, false, false};

String nivelAlerta = "FALHA SENSOR";
int corAtual = 3; // 0=Verde, 1=Amarelo, 2=Vermelho, 3=Falha
bool temLeituraValida = false;

unsigned long ultimoBuzzer  = 0;
unsigned long ultimaLeitura = 0;
unsigned long ultimoEnvio   = 0;
unsigned long ultimoNtp     = 0;
bool estadoBuzzer = false;
bool wifiOk = false;
bool ntpOk = false;
bool displayOk = false;

String bufferDados[BUFFER_MAX];
int bufferCount = 0;

// ===== FUNÇÃO: CONECTAR WIFI =====
void conectarWiFi() {
  Serial.print("Conectando ao WiFi \"" WIFI_SSID "\"");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) {
    delay(500);
    Serial.print(".");
  }
  wifiOk = (WiFi.status() == WL_CONNECTED);
  if (wifiOk) {
    Serial.println(" OK!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" FALHOU — sistema segue com alertas locais + buffer.");
  }
}

// ===== FUNÇÃO: SINCRONIZAR RELÓGIO (NTP) =====
void sincronizarNTP() {
  if (!wifiOk) return;
  Serial.print("Sincronizando relógio (NTP)");
  configTime(0, 0, "pool.ntp.org");
  unsigned long inicio = millis();
  while (time(nullptr) < 1000000000 && millis() - inicio < 10000) {
    delay(500);
    Serial.print(".");
  }
  ntpOk = (time(nullptr) >= 1000000000);
  Serial.println(ntpOk ? " OK!" : " FALHOU — envio sem timestamp local.");
}

// ===== FUNÇÃO: BUFFERIZAR LEITURA (store & forward) =====
void bufferizarLeitura() {
  char item[160];
  char campos[96] = "";

  if (leituraAtual.temPressao) {
    char p[32];
    snprintf(p, sizeof(p), ",\"pressao\":%.3f", leituraAtual.pressao);
    strncat(campos, p, sizeof(campos) - strlen(campos) - 1);
  }
  if (leituraAtual.temTemperatura) {
    char t[32];
    snprintf(t, sizeof(t), ",\"temperatura\":%.2f", leituraAtual.temperatura);
    strncat(campos, t, sizeof(campos) - strlen(campos) - 1);
  }

  if (ntpOk) {
    long ts = (long)time(nullptr);
    snprintf(item, sizeof(item),
             "{\"piezometro\":\"" PIEZOMETRO_ID "\",\"nivel_agua\":%.3f%s,\"ts\":%ld}",
             leituraAtual.nivel, campos, ts);
  } else {
    snprintf(item, sizeof(item),
             "{\"piezometro\":\"" PIEZOMETRO_ID "\",\"nivel_agua\":%.3f%s}",
             leituraAtual.nivel, campos);
  }

  if (bufferCount >= BUFFER_MAX) {
    for (int i = 1; i < BUFFER_MAX; i++) bufferDados[i - 1] = bufferDados[i];
    bufferCount = BUFFER_MAX - 1;
    Serial.println("⚠️ Buffer cheio — leitura mais antiga descartada");
  }
  bufferDados[bufferCount++] = String(item);
}

// ===== FUNÇÃO: DESPACHAR BUFFER AO SERVIDOR =====
void despacharBuffer() {
  wifiOk = (WiFi.status() == WL_CONNECTED);

  if (bufferCount == 0) return;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("📡 WiFi offline — %d leitura(s) retidas no buffer\n", bufferCount);
    WiFi.reconnect();
    return;
  }
  if (!ntpOk) sincronizarNTP();  // tenta recuperar o relógio quando a rede volta

  String body = "{\"leituras\":[";
  for (int i = 0; i < bufferCount; i++) {
    body += bufferDados[i];
    if (i < bufferCount - 1) body += ",";
  }
  body += "]}";

  WiFiClientSecure client;
  client.setInsecure(); // simulação/protótipo; em produção use certificado CA

  HTTPClient http;
  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  http.setTimeout(8000);

  int code = http.POST(body);
  if (code == 204) {
    Serial.printf("📡 Servidor: %d leitura(s) enviadas (HTTP 204)\n", bufferCount);
    bufferCount = 0;  // sucesso — esvazia o buffer
  } else {
    Serial.printf("📡 Servidor: falha (HTTP %d) — %d leitura(s) retidas\n",
                  code, bufferCount);
  }
  http.end();
}

// ===== FUNÇÃO: DETERMINAR NÍVEL DE ALERTA =====
void determinarAlerta() {
  if (!leituraAtual.valida || !isfinite(leituraAtual.nivel)) {
    leituraAtual.valida = false;
    nivelAlerta = "FALHA SENSOR";
    corAtual = 3;
    return;
  }
  temLeituraValida = true;
  if (leituraAtual.nivel < NIVEL_ATENCAO) {
    nivelAlerta = "NORMAL";
    corAtual = 0; // Verde
  }
  else if (leituraAtual.nivel < NIVEL_CRITICO) {
    nivelAlerta = "ATENCAO";
    corAtual = 1; // Amarelo
  }
  else {
    nivelAlerta = "CRITICO";
    corAtual = 2; // Vermelho
  }
}

// ===== FUNÇÃO: ATUALIZAR LEDS =====
void atualizarLEDs() {
  digitalWrite(LED_VERDE, LOW);
  digitalWrite(LED_AMARELO, LOW);
  digitalWrite(LED_VERMELHO, LOW);

  if (corAtual == 3) {
    static bool estadoFalha = false;
    estadoFalha = !estadoFalha;
    digitalWrite(LED_AMARELO, estadoFalha); // falha: amarelo piscando
  }
  else if (corAtual == 0) {
    digitalWrite(LED_VERDE, HIGH);          // NORMAL — verde fixo
  }
  else if (corAtual == 1) {
    digitalWrite(LED_AMARELO, HIGH);        // ATENÇÃO — amarelo fixo
  }
  else {
    static bool estadoVermelho = false;
    estadoVermelho = !estadoVermelho;
    digitalWrite(LED_VERMELHO, estadoVermelho);
  }
}

// ===== FUNÇÃO: ATUALIZAR BUZZER (não bloqueante) =====
void atualizarBuzzer() {
  unsigned long agora = millis();

  if (corAtual == 0) {
    digitalWrite(BUZZER, LOW);
    estadoBuzzer = false;
  }
  else if (corAtual == 1 || corAtual == 3) {
    if (!estadoBuzzer && agora - ultimoBuzzer >= 2000) {
      digitalWrite(BUZZER, HIGH);
      estadoBuzzer = true;
      ultimoBuzzer = agora;
    }
    else if (estadoBuzzer && agora - ultimoBuzzer >= 100) {
      digitalWrite(BUZZER, LOW);
      estadoBuzzer = false;
    }
  }
  else {
    if (agora - ultimoBuzzer >= 500) {
      estadoBuzzer = !estadoBuzzer;
      digitalWrite(BUZZER, estadoBuzzer);
      ultimoBuzzer = agora;
    }
  }
}

// ===== FUNÇÃO: MOSTRAR NO SERIAL =====
void mostrarSerial() {
  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (!leituraAtual.valida) {
    Serial.println("FALHA SENSOR — sem medição atual; verificar sensor/eco.");
  }
  Serial.print(leituraAtual.valida ? "💧 Nível d'água: " : "Último nível conhecido: ");
  Serial.print(leituraAtual.nivel, 2);
  Serial.println(" m");

  linhasExtrasSerial(); // linhas específicas do sensor (pressão/temp, distância, etc.)

  Serial.print("💾 Buffer:       ");
  Serial.print(bufferCount);
  Serial.println(" leitura(s) pendente(s)");

  Serial.println();

  if (!leituraAtual.valida) {
    Serial.println("STATUS: FALHA SENSOR — leitura não será enviada como nova");
    if (!temLeituraValida) Serial.println("Nenhuma leitura válida desde o início");
  }
  else if (nivelAlerta == "NORMAL") {
    Serial.println("🟢 STATUS: NORMAL");
    Serial.println("   → Nível dentro da faixa segura");
  }
  else if (nivelAlerta == "ATENCAO") {
    Serial.println("🟡 STATUS: ATENÇÃO!");
    Serial.println("   → Nível d'água subindo");
    Serial.println("   → Intensificar monitoramento");
  }
  else {
    Serial.println("🔴 STATUS: CRÍTICO!!!");
    Serial.println("   → ALERTA MÁXIMO ATIVADO!");
    Serial.println("   → Nível acima do limite de segurança");
    Serial.println("   → Acionar equipe de geotecnia imediatamente!");
  }

  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Serial.println();
}

// ===== FUNÇÃO: MOSTRAR NA TELA =====
void mostrarDisplay() {
  if (!displayOk) return;

  tela->limpar();

  tela->escreverLinha(SLOT_TITULO, "AQUASENSE PIEZOMETRO");

  char bufNivel[32];
  if (!temLeituraValida) snprintf(bufNivel, sizeof(bufNivel), "Nivel: ---");
  else snprintf(bufNivel, sizeof(bufNivel), leituraAtual.valida ? "Nivel: %.2f m" : "Ultimo: %.2f m", leituraAtual.nivel);
  tela->escreverLinha(SLOT_NIVEL, bufNivel);

  linhasExtrasDisplay(*tela); // até 2 linhas específicas do sensor (SLOT_EXTRA_1/2)

  const char* rotulo = "NORMAL";
  if (!leituraAtual.valida) rotulo = "FALHA SENSOR";
  else if (nivelAlerta == "ATENCAO") rotulo = "ATENCAO";
  else if (nivelAlerta == "CRITICO") rotulo = "CRITICO!";
  tela->destacarStatus(rotulo, (uint8_t)corAtual);

  tela->mostrar();
}

// ===== FUNÇÃO: TELA DE INICIALIZAÇÃO =====
void mostrarTelaInicio() {
  if (!displayOk) return;

  tela->mostrarTelaInicio();
  delay(2000);
}

// ===== FUNÇÃO: TESTAR LEDS =====
void testarLEDs() {
  digitalWrite(LED_VERDE, HIGH);
  delay(300);
  digitalWrite(LED_VERDE, LOW);

  digitalWrite(LED_AMARELO, HIGH);
  delay(300);
  digitalWrite(LED_AMARELO, LOW);

  digitalWrite(LED_VERMELHO, HIGH);
  delay(300);
  digitalWrite(LED_VERMELHO, LOW);

  digitalWrite(LED_VERDE, HIGH);
  digitalWrite(LED_AMARELO, HIGH);
  digitalWrite(LED_VERMELHO, HIGH);
  delay(300);
  digitalWrite(LED_VERDE, LOW);
  digitalWrite(LED_AMARELO, LOW);
  digitalWrite(LED_VERMELHO, LOW);

  Serial.println("✅ LEDs OK!");
}

// ===== FUNÇÃO: TESTAR BUZZER =====
void testarBuzzer() {
  for (int i = 0; i < 3; i++) {
    digitalWrite(BUZZER, HIGH);
    delay(100);
    digitalWrite(BUZZER, LOW);
    delay(100);
  }
  Serial.println("✅ Buzzer OK!");
}

// ===== SETUP COMUM =====
void coreSetup() {
  Serial.begin(115200); // idempotente — initSensor() pode já ter iniciado o Serial
  delay(1000);

  Serial.println("===========================================");
  Serial.println("  AQUASENSE - NIVEL DE AGUA EM PIEZOMETROS");
  Serial.println("  Telemetria + Alertas + Store & Forward");
  Serial.println("  Instrumento: " PIEZOMETRO_ID);
  Serial.println("===========================================");
  Serial.println();

  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_AMARELO, OUTPUT);
  pinMode(LED_VERMELHO, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  Serial.println("Testando LEDs...");
  testarLEDs();

  Serial.println("Testando buzzer...");
  testarBuzzer();

  Wire.begin(21, 22); // barramento I2C da tela (compartilhado com o BMP180, quando houver)

  Serial.print("Inicializando OLED... ");
  displayOk = tela->iniciar();
  if (!displayOk) {
    Serial.println("ERRO!");
    Serial.println("OLED ausente — seguindo em modo degradado (sem display)");
  } else {
    Serial.println("OK!");
  }

  mostrarTelaInicio();
  conectarWiFi();
  sincronizarNTP();
  ultimoNtp = millis(); // evita re-sincronizar de novo já no primeiro loop

  Serial.println();
  Serial.println("Sistema pronto!");
  Serial.println("Monitoramento iniciado...");
  Serial.println("===========================================");
  Serial.println();

  determinarAlerta();
  atualizarLEDs();
  mostrarDisplay();
}

// ===== LOOP COMUM (envio HTTP pode bloquear até o timeout) =====
void coreLoop() {
  unsigned long agora = millis();

  if (agora - ultimaLeitura >= INTERVALO_LEITURA) {
    ultimaLeitura = agora;
    leituraAtual = lerSensor();
    determinarAlerta();
    atualizarLEDs();
    mostrarSerial();
    mostrarDisplay();
  }

  if (agora - ultimoEnvio >= INTERVALO_ENVIO) {
    ultimoEnvio = agora;
    if (leituraAtual.valida) bufferizarLeitura();
    despacharBuffer();
  }

  if (wifiOk && agora - ultimoNtp >= INTERVALO_NTP) {
    ultimoNtp = agora;
    sincronizarNTP();
  }

  atualizarBuzzer();
}

// ===== MACRO: SETUP()/LOOP() PADRÃO (modo sempre-ligado) =====

// ===== LEITURA DO HC-SR04 =====
float distanciaCm = 0;   // última distância medida (sensor → mão)

// ===== HOOK: INICIALIZAR SENSOR =====
void initSensor() {
  Serial.begin(115200);
  delay(1000);

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

  Serial.println("Sensor HC-SR04 pronto (TRIG/ECHO configurados) — modo DEMO.");
}

// ===== UMA MEDIÇÃO BRUTA (cm) =====
float medirDistanciaCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duracao = pulseIn(PIN_ECHO, HIGH, 30000UL); // timeout 30 ms
  if (duracao == 0) return 0;
  return duracao / 58.0; // µs → cm
}

// ===== DISTÂNCIA POR MEDIANA (5 leituras, descarta fora da faixa útil) =====
float medirDistanciaMedianaCm() {
  float leituras[5];
  int n = 0;

  for (int i = 0; i < 5; i++) {
    float d = medirDistanciaCm();
    if (d >= DIST_MIN_CM && d <= DIST_MAX_CM) {
      leituras[n++] = d;
    }
    delay(30);
  }

  if (n == 0) return -1.0;

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
    distanciaCm = -1;
    leituraAtual.valida = false;
    return leituraAtual;
  }

  distanciaCm = distancia;

  float nivel_cm = ALTURA_REF_CM - distanciaCm;
  if (nivel_cm < 0) nivel_cm = 0;

  Leitura l;
  l.nivel = nivel_cm * ESCALA_M_POR_CM;
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
  if (distanciaCm < 0) snprintf(l1, sizeof(l1), "Dist: ---");
  else snprintf(l1, sizeof(l1), "Dist: %.1fcm", distanciaCm);
  t.escreverLinha(SLOT_EXTRA_1, l1);

  char l2[32];
  snprintf(l2, sizeof(l2), "DEMO %s", wifiOk ? "WiFi:OK" : "WiFi:--");
  t.escreverLinha(SLOT_EXTRA_2, l2);
}

// ===== HOOK: LINHAS EXTRAS NO SERIAL =====
void linhasExtrasSerial() {
  Serial.print("Distancia medida: ");
  if (distanciaCm < 0) Serial.println("(sem eco)");
  else { Serial.print(distanciaCm, 1); Serial.println(" cm"); }
}

// ===== SETUP / LOOP (modo padrão sempre-ligado — ver PIEZOMETRO_MAIN em piezometro_core.h) =====

// ===== INÍCIO E REPETIÇÃO =====
void setup() {
  initSensor();
  coreSetup();
}

void loop() {
  coreLoop();
}

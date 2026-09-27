/*
 * ============================================================================
 * PIEZOMETRO_CORE.H — núcleo comum dos firmwares AQUASENSE (bancada + UCT)
 * ============================================================================
 *
 * Este arquivo concentra tudo que é IGUAL entre os firmwares
 * (sketch_demo_hc_sr04.ino da bancada e sketch_uct_4a20ma.ino da UCT): WiFi, NTP, store & forward, envio HTTP ao
 * /ingest, classificação de nível e tela. O que muda de um
 * sensor para o outro (como medir o nível) fica no próprio .ino, que
 * implementa um "adapter" de sensor definido pelo contrato abaixo. O que
 * muda de um HARDWARE DE TELA para o outro (hoje só o OLED SSD1306) fica em
 * tela_ssd1306.h — o core só fala com a interface Tela (ver tela.h), nunca
 * com o tipo concreto do display.
 *
 * COMO USAR NO ARDUINO IDE / WOKWI:
 * Este .h entra como uma ABA A MAIS dentro da mesma pasta do sketch (Arduino
 * IDE: "New Tab" → nome "piezometro_core.h"; no Wokwi: crie o arquivo com
 * esse nome no mesmo projeto), junto de tela.h e tela_ssd1306.h. O .ino faz
 * "#include "piezometro_core.h"" DEPOIS de definir credenciais/limiares
 * (normalmente via "#include "piezometro_config_local.h"" — ver o modelo em
 * piezometro_config_local.h.example) e ANTES de implementar os hooks do
 * sensor — o compilador processa tudo como um único arquivo, então a ordem
 * de inclusão importa.
 *
 * CONTRATO — o .ino implementa (o struct Leitura é definido AQUI, pelo core):
 *   void initSensor();                    // hardware do sensor
 *   Leitura lerSensor();                  // uma leitura
 *   void linhasExtrasDisplay(Tela &t);    // 0-2 linhas na tela (SLOT_EXTRA_1/2)
 *   void linhasExtrasSerial();            // idem no Serial
 * e finaliza com a macro PIEZOMETRO_MAIN() (definida no fim deste arquivo)
 * no lugar de setup()/loop() manual — só sketches com setup/loop DIFERENTE
 * do padrão sempre-ligado (ex. modo deep sleep) implementam o próprio.
 * ============================================================================
 */

#pragma once

#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <math.h>

#include "tela.h"
// OLED antigo: trocar por tela_ssd1306.h e ajustar a instância abaixo.
#include "tela_st7789.h"

// ===== INTERVALOS (ms) =====
// Modo de campo a bateria/solar (duty cycling, sem ficar sempre ligado):
// ver piezometro_deep_sleep.h — opcional, não afeta os intervalos abaixo.
#define INTERVALO_LEITURA 1000UL    // leitura local + display
#define INTERVALO_ENVIO   10000UL   // envio ao backend (Cloudflare Worker)
#define INTERVALO_NTP     300000UL  // 5 min — re-sincroniza o relógio periodicamente:
                                     // no Wokwi o clock simulado deriva (fica atrasado)
                                     // em relação ao tempo real, e a deriva acumulada
                                     // envelheceria o ts das leituras.

// ===== STORE & FORWARD =====
#define BUFFER_MAX 120              // ~20 min de leituras retidas sem rede

// ===== REDE E TELA =====
#define INTERVALO_RECONEXAO 60000UL // o ESP32 já reconecta sozinho; só insiste a cada 1 min
#ifndef FUSO_HORARIO_SEG
#define FUSO_HORARIO_SEG (-3 * 3600) // hora de Brasília na tela (o envio segue em UTC)
#endif

// ===== CONTRATO DO SENSOR =====
// Uma leitura do instrumento. O nível (m) é obrigatório; pressão e
// temperatura são opcionais — o JSON enviado ao backend só inclui os campos
// cujo flag "tem*" estiver true (o BMP180 envia os três; o JSN-SR04T, só o
// nível). O struct pertence ao core porque É a interface entre o núcleo e o
// adapter de sensor — não um detalhe de cada sketch.
struct Leitura {
  float nivel;        // m — obrigatório
  float pressao;      // hPa — só se temPressao
  float temperatura;  // °C — só se temTemperatura
  bool  temPressao;
  bool  temTemperatura;
  bool  valida;        // false = sensor sem resposta neste ciclo — NÃO
                        // bufferizar como medição nova, senão a falha do
                        // sensor entra no histórico disfarçada de dado bom
};

// ===== DECLARAÇÕES DOS HOOKS DE SENSOR (implementados no .ino) =====
// Declaradas explicitamente aqui — não confiar só no auto-prototype do
// Arduino IDE, que é heurístico (ctags) e pode falhar com tipos definidos
// fora do sketch.
void initSensor();
Leitura lerSensor();
void linhasExtrasDisplay(Tela &t);
void linhasExtrasSerial();

// ===== IMPLEMENTAÇÃO DE TELA EM USO =====
// Trocar de hardware é incluir outro tela_*.h que implemente Tela e trocar
// as duas linhas abaixo — core e sketches só falam com Tela.
TelaST7789 telaSt7789;
Tela* tela = &telaSt7789;

// ===== ESTADO DA ÚLTIMA LEITURA (preenchido pelo adapter via lerSensor) =====
Leitura leituraAtual = {0, 0, 0, false, false, false};

String nivelAlerta = "FALHA SENSOR";
int corAtual = 3; // 0=Verde, 1=Amarelo, 2=Vermelho, 3=Falha
bool temLeituraValida = false;

unsigned long ultimaLeitura = 0;
unsigned long ultimoEnvio   = 0;
unsigned long ultimoNtp     = 0;
bool wifiOk = false;
bool ntpOk = false;
// Instrumento de SEGURANÇA: falha de um componente secundário (tela) não
// pode derrubar a medição — degrada (segue sem tela), nunca trava o setup.
bool displayOk = false;

// Resultado do último envio, para a tela dizer se o dado chega ao servidor
// (Wi-Fi conectado não garante isso: chave errada ou servidor fora do ar).
int ultimoCodigoHttp = 0;           // 0 = ainda não tentou; 204 = aceito; <0 = sem conexão
unsigned long ultimoEnvioOkMs = 0;
unsigned long ultimaReconexaoMs = 0;

String bufferDados[BUFFER_MAX];
int bufferCount = 0;

// ===== FUNÇÃO: CONECTAR WIFI =====
void conectarWiFi() {
  Serial.print("Conectando ao WiFi \"" WIFI_SSID "\"");
  WiFi.setAutoReconnect(true);
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
// Necessário para o store & forward: cada leitura retida no buffer precisa
// do SEU timestamp, senão o backend carimbaria tudo com a hora do reenvio.
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
// Monta o JSON só com os campos presentes nesta Leitura (pressao/temperatura
// são opcionais — o protótipo físico não os envia; o Worker aceita ausentes).
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
    // Timestamp em SEGUNDOS
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
    // Buffer cheio: descarta a leitura mais ANTIGA (política ring buffer)
    for (int i = 1; i < BUFFER_MAX; i++) bufferDados[i - 1] = bufferDados[i];
    bufferCount = BUFFER_MAX - 1;
    Serial.println("⚠️ Buffer cheio — leitura mais antiga descartada");
  }
  bufferDados[bufferCount++] = String(item);
}

// ===== FUNÇÃO: DESPACHAR BUFFER AO SERVIDOR =====
void despacharBuffer() {
  // Atualiza wifiOk aqui (e não só no boot em conectarWiFi()) — é o valor que
  // a tela/Serial exibem e que o re-sync NTP do coreLoop consulta; sem isso
  // eles ficavam presos ao estado do momento da conexão inicial.
  wifiOk = (WiFi.status() == WL_CONNECTED);

  if (bufferCount == 0) return;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("📡 WiFi offline — %d leitura(s) retidas no buffer\n", bufferCount);
    // Forçar a cada 10 s interrompia a reconexão automática em andamento.
    if (millis() - ultimaReconexaoMs >= INTERVALO_RECONEXAO) {
      ultimaReconexaoMs = millis();
      WiFi.reconnect();
    }
    return;
  }
  if (!ntpOk) sincronizarNTP();  // tenta recuperar o relógio quando a rede volta

  // Monta um único JSON com todas as leituras retidas
  String body = "{\"leituras\":[";
  for (int i = 0; i < bufferCount; i++) {
    body += bufferDados[i];
    if (i < bufferCount - 1) body += ",";
  }
  body += "]}";

  WiFiClientSecure client;
  client.setInsecure(); // simulação/protótipo; em produção use certificado CA
  client.setHandshakeTimeout(5); // s — rede caída não pode parar a medição por muito tempo

  HTTPClient http;
  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  http.setConnectTimeout(3000);
  http.setTimeout(5000);

  int code = http.POST(body);
  ultimoCodigoHttp = code;
  if (code == 204) {
    ultimoEnvioOkMs = millis();
    Serial.printf("📡 Servidor: %d leitura(s) enviadas (HTTP 204)\n", bufferCount);
    bufferCount = 0;  // sucesso — esvazia o buffer
  } else {
    Serial.printf("📡 Servidor: falha (HTTP %d) — %d leitura(s) retidas\n",
                  code, bufferCount);
  }
  http.end();
}

// ===== FUNÇÃO: DETERMINAR NÍVEL DE ALERTA =====
// Lógica correta de piezômetro: nível d'água ALTO = perigo (saturação).
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

// ===== FUNÇÃO: LINHA DE COMUNICAÇÃO DA TELA =====
// O que o técnico precisa saber em campo: o dado está chegando ao servidor?
// Máx. 25 caracteres (largura da linha no TFT).
void linhaComunicacao(char* buf, size_t tam) {
  if (WiFi.status() != WL_CONNECTED) {
    snprintf(buf, tam, "SEM WI-FI  Fila %d %dmin", bufferCount, bufferCount * 10 / 60);
  } else if (ultimoCodigoHttp < 0) {
    snprintf(buf, tam, "SEM SERVIDOR  Fila %d", bufferCount);
  } else if (ultimoCodigoHttp != 0 && ultimoCodigoHttp != 204) {
    snprintf(buf, tam, "ERRO SERV %d  Fila %d", ultimoCodigoHttp, bufferCount);
  } else if (ultimoCodigoHttp == 0) {
    snprintf(buf, tam, "WiFi %lddBm  Aguardando", (long)WiFi.RSSI());
  } else {
    unsigned long idade = (millis() - ultimoEnvioOkMs) / 1000;
    if (idade < 100) snprintf(buf, tam, "WiFi %lddBm  Envio OK %lus", (long)WiFi.RSSI(), idade);
    else snprintf(buf, tam, "WiFi %lddBm  Envio OK %lum", (long)WiFi.RSSI(), idade / 60);
  }
}

// ===== FUNÇÃO: MOSTRAR NA TELA =====
// Componente SECUNDÁRIO: se a tela falhou no boot (displayOk == false), não
// faz nada — medição, alertas e telemetria seguem intactos. Fala só com a
// interface Tela (ver tela.h); pixels/fontes são decisão do adapter concreto.
void mostrarDisplay() {
  if (!displayOk) return;

  tela->limpar();

  // Instrumento + hora local; sem NTP, a hora fica em traços para não enganar.
  char bufTitulo[32];
  char hora[9] = "--:--:--";
  if (ntpOk) {
    time_t t = time(nullptr) + FUSO_HORARIO_SEG;
    struct tm tmHora;
    gmtime_r(&t, &tmHora);
    strftime(hora, sizeof(hora), "%H:%M:%S", &tmHora);
  }
  snprintf(bufTitulo, sizeof(bufTitulo), "%-16s%s", PIEZOMETRO_ID " AQUASENSE", hora);
  tela->escreverLinha(SLOT_TITULO, bufTitulo);

  char bufNivel[32];
  if (!temLeituraValida) snprintf(bufNivel, sizeof(bufNivel), "Nivel: ---");
  else snprintf(bufNivel, sizeof(bufNivel), leituraAtual.valida ? "Nivel: %.2f m" : "Ultimo: %.2f m", leituraAtual.nivel);
  tela->escreverLinha(SLOT_NIVEL, bufNivel);

  linhasExtrasDisplay(*tela); // até 2 linhas específicas do sensor (SLOT_EXTRA_1/2)

  char bufCom[32];
  linhaComunicacao(bufCom, sizeof(bufCom));
  tela->escreverLinha(SLOT_WIFI_STATUS, bufCom);

  // Rótulo de status SEMPRE visível. O "pisca" original amostrava a paridade
  // de millis()/500, mas o display só atualiza a cada 1 s (múltiplo exato de
  // 500 ms): a paridade caía sempre no mesmo lado do boot em diante, e o
  // rótulo podia ficar PRESO na fase apagada — ATENCAO/CRITICO sumiam do
  // OLED (visto em bancada em 17/07). Num instrumento de segurança o status
  // precisa ser legível a qualquer momento.
  const char* rotulo = "NORMAL";
  if (!leituraAtual.valida) rotulo = "FALHA SENSOR";
  else if (nivelAlerta == "ATENCAO") rotulo = "ATENCAO";
  else if (nivelAlerta == "CRITICO") rotulo = "CRITICO!";
  tela->destacarStatus(rotulo, (uint8_t)corAtual);

  tela->mostrar();
}

// ===== FUNÇÃO: TELA DE INICIALIZAÇÃO =====
// Mesma degradação de mostrarDisplay(): sem tela, não há splash de boot, mas
// o setup segue normalmente. Layout do splash é do adapter
// (Tela::mostrarTelaInicio()); aqui só o tempo em que fica visível (2 s).
void mostrarTelaInicio() {
  if (!displayOk) return;

  tela->mostrarTelaInicio();
  delay(2000);
}

// ===== SETUP COMUM =====
// Chamado pelo .ino DEPOIS de initSensor(): void setup(){ initSensor(); coreSetup(); }
// (ou, na prática, via macro PIEZOMETRO_MAIN() — ver mais abaixo.)
void coreSetup() {
  Serial.begin(115200); // idempotente — initSensor() pode já ter iniciado o Serial
  delay(1000);

  Serial.println("===========================================");
  Serial.println("  AQUASENSE - NIVEL DE AGUA EM PIEZOMETROS");
  Serial.println("  Telemetria + Alertas + Store & Forward");
  Serial.println("  Instrumento: " PIEZOMETRO_ID);
  Serial.println("===========================================");
  Serial.println();

  Wire.begin(21, 22); // barramento I2C livre para sensores (ADS1115, BMP180), quando houver

  Serial.print("Inicializando tela... ");
  // Instrumento de SEGURANÇA: a tela é um componente SECUNDÁRIO — sua
  // falha não pode travar o setup e derrubar leitura/alertas/telemetria.
  // Só registra o problema e segue em modo degradado (sem tela).
  displayOk = tela->iniciar();
  if (!displayOk) {
    Serial.println("ERRO!");
    Serial.println("Tela ausente — seguindo em modo degradado (sem display)");
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
  mostrarDisplay();
}

// ===== LOOP COMUM (envio HTTP pode bloquear até o timeout) =====
// Chamado pelo .ino: void loop(){ coreLoop(); } (ou via PIEZOMETRO_MAIN()).
void coreLoop() {
  unsigned long agora = millis();

  // Ciclo local: leitura + alertas + display (a cada 1 s)
  if (agora - ultimaLeitura >= INTERVALO_LEITURA) {
    ultimaLeitura = agora;
    leituraAtual = lerSensor();
    determinarAlerta();
    mostrarSerial();
    mostrarDisplay();
  }

  // Ciclo de telemetria: bufferiza (só leitura válida) e tenta despachar sempre
  // (a cada 10 s) — despacharBuffer() roda mesmo sem leitura nova, para
  // esvaziar pendências já retidas.
  if (agora - ultimoEnvio >= INTERVALO_ENVIO) {
    ultimoEnvio = agora;
    if (leituraAtual.valida) bufferizarLeitura();
    despacharBuffer();
  }

  // Ciclo de relógio: re-sincroniza o NTP a cada 5 min (corrige a deriva do Wokwi)
  if (wifiOk && agora - ultimoNtp >= INTERVALO_NTP) {
    ultimoNtp = agora;
    sincronizarNTP();
  }
}

// ===== MACRO: SETUP()/LOOP() PADRÃO (modo sempre-ligado) =====
// Expande para o setup()/loop() que todo sketch sempre-ligado escrevia à
// mão: initSensor()+coreSetup() uma vez, coreLoop() a cada passagem. Modo
// deep sleep (piezometro_deep_sleep.h) não chama coreLoop() — não usa esta
// macro, implementa o próprio setup()/loop().
#define PIEZOMETRO_MAIN() \
  void setup() { \
    initSensor(); \
    coreSetup(); \
  } \
  void loop() { \
    coreLoop(); \
  }

/*
 * ============================================================================
 * PIEZOMETRO_DEEP_SLEEP.H — modo de campo a bateria/solar (duty cycling)
 * ============================================================================
 *
 * O QUE É: deep sleep é o modo de baixíssimo consumo do ESP32 (~10 µA) em que
 * a CPU desliga por completo entre ciclos. NÃO é um delay() — ao acordar, o
 * ESP32 REINICIA o programa do zero: setup() roda de novo, toda variável
 * global normal volta ao valor inicial. Só sobrevive ao sono o que estiver
 * marcado RTC_DATA_ATTR (RTC slow memory, ~8 KB, alimentada por um domínio de
 * energia separado que o deep sleep não desliga). Por isso este header NÃO
 * reusa bufferDados/bufferCount do core (são globais comuns, morrem a cada
 * ciclo) — ele mantém seu PRÓPRIO buffer, em RTC_DATA_ATTR (ver seção 2).
 *
 * QUANDO USAR: instalação de campo alimentada por bateria/solar (Opção C de
 * docs/projeto/ALIMENTACAO_ENERGIA.md) — reduz o consumo em ~30× (de ~30 Wh/dia para
 * <1 Wh/dia) porque o Wi-Fi só liga durante os poucos segundos do ciclo ativo.
 *
 * QUANDO **NÃO** USAR: na maquete/demonstração da banca. Sem este modo, o
 * ESP32 fica sempre acordado — é o que permite ver o LED mudando de cor, o
 * buzzer apitando e o OLED atualizando ao vivo enquanto a banca observa. Em
 * deep sleep o dispositivo passa a maior parte do tempo completamente
 * desligado (LEDs apagados, OLED apagado) — ótimo para bateria, péssimo para
 * demonstração ao vivo. Por isso o modo padrão dos sketches continua sendo o
 * de sempre-ligado (coreSetup()/coreLoop()); este header é OPT-IN.
 *
 * COMO USAR NO .INO:
 *   No .ino, depois dos #define de credenciais e ANTES do #include do core:
 *     #define MODO_DEEP_SLEEP
 *     #include "piezometro_core.h"
 *     #include "piezometro_deep_sleep.h"
 *   e no setup()/loop(), em vez dos initSensor()+coreSetup()/coreLoop() de
 *   sempre:
 *     void setup() { initSensor(); deepSleepCiclo(); }   // nunca retorna
 *     void loop()  { }                                    // nunca alcançado
 *   (deepSleepCiclo() termina em esp_deep_sleep_start(), que não retorna —
 *   o "loop" deste modo é, na prática, o próprio ciclo liga-mede-envia-dorme
 *   se repetindo via reset, não uma função loop() chamada em repetição.)
 *
 * O QUE ESTE HEADER USA DO CORE (piezometro_core.h, incluído ANTES): a ordem
 * de inclusão garante que tudo abaixo já existe quando este arquivo é
 * processado:
 *   - struct Leitura, variável global leituraAtual
 *   - lerSensor()      — hook implementado pelo .ino (adapter do sensor)
 *   - determinarAlerta(), nivelAlerta (String "NORMAL"/"ATENCAO"/"CRITICO")
 *   - conectarWiFi()   — timeout interno de 15 s, seta wifiOk
 *   - sincronizarNTP() — seta ntpOk
 *   - wifiOk, ntpOk, displayOk, tela (ponteiro Tela — ver tela.h)
 *   - PIEZOMETRO_ID, DEVICE_KEY, SERVER_URL (defines do .ino)
 * ============================================================================
 */

#pragma once

#ifndef MODO_DEEP_SLEEP
#error "piezometro_deep_sleep.h incluído sem #define MODO_DEEP_SLEEP antes. " \
       "Isso normalmente indica um include acidental: este modo muda o " \
       "comportamento do dispositivo (ele passa a dormir e reiniciar a cada " \
       "ciclo) e não deve entrar 'de brinde' num sketch pensado para o modo " \
       "sempre-ligado. Defina MODO_DEEP_SLEEP antes do #include se a " \
       "intenção é mesmo usar este modo de campo (ver cabeçalho deste arquivo)."
#endif

#include <esp_sleep.h>
#include <esp_attr.h>

// ===== 1. INTERVALOS DO CICLO =====
// Piezômetro é um fenômeno LENTO (poropressão varia em horas/dias, não em
// segundos) — os próprios concorrentes comerciais (docs/projeto/ALIMENTACAO_ENERGIA.md,
// seção 2) medem a cada 5-30 min. 5 min é o valor de referência usado nas
// contas de autonomia daquele documento; não diminua sem refazer a conta de
// consumo lá.
#define INTERVALO_DEEP_SLEEP_SEG 300UL         // 5 min entre ciclos

// Espelha o timeout já hardcoded dentro de conectarWiFi() (core) — não é
// passado como parâmetro (a função não aceita um), serve aqui só como
// documentação do orçamento de tempo (e, portanto, de bateria) de cada
// despertar: leitura + conexão + envio devem caber em poucos segundos.
#define DEEP_SLEEP_MAX_ESPERA_WIFI_MS 15000UL

// A cada quantos ciclos re-sincronizar o NTP mesmo com o relógio já válido
// (corrige a deriva do RTC interno ao longo de várias horas). 12 ciclos de
// 5 min ≈ 1 h.
#define DEEP_SLEEP_CICLOS_NTP 12

// ===== 2. BUFFER RTC (sobrevive ao sono; RTC slow memory tem ~8 KB) =====
// Struct compacta (sem String — nada de heap dinâmico sobrevivendo entre
// ciclos): float(4) + float(4) + float(4) + uint8_t(1, +3 de padding para
// alinhar o próximo campo de 8 bytes) + int64_t(8) ≈ 24 bytes por item.
// 96 itens × 24 B ≈ 2,3 KB — bem dentro do limite de 8 KB da RTC slow memory,
// com folga para outras variáveis RTC_DATA_ATTR (rtcBufferCount, ciclosDesdeNtp).
#define RTC_BUFFER_MAX 96

struct LeituraRtc {
  float nivel;
  float pressao;
  float temperatura;
  uint8_t flags;   // bit0 temPressao · bit1 temTemperatura · bit2 tsValido
  int64_t ts;      // epoch em SEGUNDOS — só significa algo se bit2 estiver set
};

// RTC_DATA_ATTR: só recebe o valor inicial (= 0) num power-on/reset comum;
// ao ACORDAR de um deep sleep, o conteúdo é o que ficou do ciclo anterior —
// é exatamente esse comportamento que faz o buffer "sobreviver ao sono".
RTC_DATA_ATTR LeituraRtc rtcBuffer[RTC_BUFFER_MAX];
RTC_DATA_ATTR int rtcBufferCount = 0;
RTC_DATA_ATTR uint32_t ciclosDesdeNtp = 0;

// ===== 3. EMPILHAR LEITURA NO BUFFER RTC =====
// Mesma política do buffer do core (bufferizarLeitura(), em piezometro_core.h):
// buffer cheio descarta a leitura mais ANTIGA, nunca recusa a mais nova.
void empilharBufferRtc() {
  LeituraRtc r;
  r.nivel = leituraAtual.nivel;
  r.pressao = leituraAtual.pressao;
  r.temperatura = leituraAtual.temperatura;
  r.flags = 0;
  if (leituraAtual.temPressao) r.flags |= 0x01;
  if (leituraAtual.temTemperatura) r.flags |= 0x02;

  // O RTC interno do ESP32 mantém a hora através do deep sleep (com alguma
  // deriva) — por isso dá para carimbar o ts aqui mesmo antes de reconectar.
  time_t agora = time(nullptr);
  if (agora > 1000000000) {
    r.ts = (int64_t)agora;
    r.flags |= 0x04;
  } else {
    r.ts = 0; // relógio ainda não sincronizado neste dispositivo — ts omitido no envio
  }

  if (rtcBufferCount >= RTC_BUFFER_MAX) {
    for (int i = 1; i < RTC_BUFFER_MAX; i++) rtcBuffer[i - 1] = rtcBuffer[i];
    rtcBufferCount = RTC_BUFFER_MAX - 1;
    Serial.println("Buffer RTC cheio — leitura mais antiga descartada");
  }
  rtcBuffer[rtcBufferCount++] = r;
}

// ===== 4. DESPACHAR BUFFER RTC AO SERVIDOR =====
// Mesmo formato de payload e mesmos headers do despacharBuffer() do core —
// o Worker não diferencia quem enviou. Montado com snprintf em char[]
// (não String): aqui o motivo não é heap (o processo dura segundos, um
// pouco de fragmentação não importa) e sim consistência com a crítica já
// feita ao uso de String no core — este código novo não repete o hábito.
// Retorna quantas leituras foram confirmadas enviadas (0 se falhou).
int despacharBufferRtc() {
  if (rtcBufferCount == 0) return 0;

  // Buffer de trabalho em RAM comum (não RTC — não precisa sobreviver ao
  // sono, é remontado a cada ciclo). ~96 itens × ~130 B + folga do envelope.
  static char body[RTC_BUFFER_MAX * 130 + 32];
  size_t offset = 0;
  offset += snprintf(body + offset, sizeof(body) - offset, "{\"leituras\":[");

  for (int i = 0; i < rtcBufferCount; i++) {
    LeituraRtc &r = rtcBuffer[i];
    char campos[96] = "";

    if (r.flags & 0x01) {
      char p[32];
      snprintf(p, sizeof(p), ",\"pressao\":%.3f", r.pressao);
      strncat(campos, p, sizeof(campos) - strlen(campos) - 1);
    }
    if (r.flags & 0x02) {
      char t[32];
      snprintf(t, sizeof(t), ",\"temperatura\":%.2f", r.temperatura);
      strncat(campos, t, sizeof(campos) - strlen(campos) - 1);
    }

    if (r.flags & 0x04) {
      offset += snprintf(body + offset, sizeof(body) - offset,
        "%s{\"piezometro\":\"" PIEZOMETRO_ID "\",\"nivel_agua\":%.3f%s,\"ts\":%lld}",
        (i > 0 ? "," : ""), r.nivel, campos, (long long)r.ts);
    } else {
      // ts omitido — o Worker reconstrói o horário pela posição no lote
      offset += snprintf(body + offset, sizeof(body) - offset,
        "%s{\"piezometro\":\"" PIEZOMETRO_ID "\",\"nivel_agua\":%.3f%s}",
        (i > 0 ? "," : ""), r.nivel, campos);
    }
  }
  offset += snprintf(body + offset, sizeof(body) - offset, "]}");

  WiFiClientSecure client;
  client.setInsecure(); // simulação/protótipo; em produção use certificado CA

  HTTPClient http;
  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  http.setTimeout(8000);

  int code = http.POST(body);
  int enviadas;
  if (code == 204) {
    Serial.printf("Servidor: %d leitura(s) enviadas (HTTP 204)\n", rtcBufferCount);
    enviadas = rtcBufferCount;
    rtcBufferCount = 0; // sucesso — esvazia o buffer RTC
  } else {
    Serial.printf("Servidor: falha (HTTP %d) — %d leitura(s) retidas\n",
                  code, rtcBufferCount);
    enviadas = 0; // nada confirmado — segue tudo retido para o próximo ciclo
  }
  http.end();
  return enviadas;
}

// ===== 5. DORMIR =====
void dormir() {
  esp_sleep_enable_timer_wakeup(INTERVALO_DEEP_SLEEP_SEG * 1000000ULL); // s → µs
  esp_deep_sleep_start(); // não retorna — próximo "loop" é um reboot
}

// ===== 6. CICLO COMPLETO (chamado uma vez no setup(); nunca retorna) =====
void deepSleepCiclo() {
  // Serial só o essencial — sem banner longo, sem delay(1000) de bancada:
  // cada segundo acordado é bateria gasta. O objetivo aqui é log mínimo
  // para depuração com o hardware na mão, não a experiência de boot da
  // maquete (essa fica no modo sempre-ligado, coreSetup()).
  Serial.begin(115200);
  delay(200);
  Serial.println("=== AQUASENSE PIEZOMETRO — modo DEEP SLEEP === " PIEZOMETRO_ID);

  // ACHADO DE REVIEW (B9): antes, displayOk nunca ficava true neste modo
  // porque display.begin() só era chamado dentro de coreSetup() — nunca
  // invocado no ciclo de deep sleep. Resultado: o bloco de debug do OLED lá
  // embaixo (passo 7) nunca executava, mesmo com o hardware presente e
  // funcionando. Corrigido inicializando a tela aqui, sempre (o "debug
  // visual" é opt-in só no sentido de que displayOk controla se o bloco 7
  // desenha algo; não há um define separado para isso). Wire.begin() é
  // necessário aqui porque, ao contrário do modo sempre-ligado
  // (coreSetup()), este ciclo não passa por ele. Falha aqui degrada
  // normalmente (displayOk=false) — nunca trava o ciclo nem atrasa o envio.
  Wire.begin(21, 22);
  displayOk = tela->iniciar();

  leituraAtual = lerSensor();
  determinarAlerta();

  if (leituraAtual.valida) {
    empilharBufferRtc();
  } else {
    Serial.println("Leitura inválida neste ciclo — não empilhada");
  }

  conectarWiFi(); // core — timeout interno de 15 s, seta wifiOk

  int enviadas = 0;
  if (wifiOk) {
    // Atenção: ntpOk (global comum do core) volta a false a cada despertar —
    // o reboot zera a RAM. O critério certo aqui é a VALIDADE DO RELÓGIO, que
    // sobrevive ao sono no RTC interno: re-sincroniza só quando a hora ainda
    // não existe (primeiro boot) ou quando o contador RTC de ciclos indica
    // ~1 h de deriva acumulada.
    const bool relogioValido = time(nullptr) > 1000000000;
    if (!relogioValido || ciclosDesdeNtp >= DEEP_SLEEP_CICLOS_NTP) {
      sincronizarNTP(); // core — seta ntpOk
      ciclosDesdeNtp = 0;
    }
    enviadas = despacharBufferRtc();
  } else {
    Serial.println("WiFi indisponível neste ciclo — leitura(s) seguem retidas");
  }
  ciclosDesdeNtp++;

  Serial.printf("Ciclo concluído: %d enviada(s), %d retida(s)\n",
                enviadas, rtcBufferCount);

  // OLED opcional — em campo ninguém olha o display, mas ajuda a depurar
  // com o hardware na mão durante os testes. Sem delay longo: só desenha e
  // já segue para dormir(). Fala só com a interface Tela (ver tela.h) — não
  // conhece mais Adafruit_SSD1306 diretamente. É uma tela de depuração
  // própria (3 linhas curtas), mais simples que a de operação de
  // mostrarDisplay() (piezometro_core.h); reaproveita os slots padrão
  // (SLOT_NIVEL/EXTRA_1/EXTRA_2), então as linhas caem em y=15/25/35 em vez
  // das posições y=0/15/30 usadas quando este bloco desenhava direto no
  // SSD1306 — deslocamento sem consequência aqui (tela só para depuração de
  // campo, não para o layout "oficial" da maquete).
  if (displayOk) {
    tela->limpar();

    char bufNivel[32];
    snprintf(bufNivel, sizeof(bufNivel), "Nivel: %.2f m", leituraAtual.nivel);
    tela->escreverLinha(SLOT_NIVEL, bufNivel);

    tela->escreverLinha(SLOT_EXTRA_1, nivelAlerta.c_str());

    char bufEnviadas[24];
    snprintf(bufEnviadas, sizeof(bufEnviadas), "Enviadas: %d", enviadas);
    tela->escreverLinha(SLOT_EXTRA_2, bufEnviadas);

    tela->mostrar();
    tela->atenuar(); // reduz o brilho antes de apagar de vez com o sono
  }

  Serial.println("Dormindo...");
  Serial.flush();
  dormir();
}

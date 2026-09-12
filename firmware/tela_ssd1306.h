/*
 * ============================================================================
 * TELA_SSD1306.H — adapter concreto do display OLED SSD1306 para a Tela
 * ============================================================================
 *
 * Implementa a interface Tela (ver tela.h) sobre a lib Adafruit_SSD1306.
 * TODO o código específico do hardware OLED — dimensões, endereço I2C,
 * objeto Adafruit_SSD1306, begin(), cursores/tamanhos de texto — fica
 * isolado aqui. O core (piezometro_core.h) e os sketches não enxergam mais
 * Adafruit_SSD1306 diretamente, só a interface Tela.
 *
 * Reproduz EXATAMENTE o layout/pixels do OLED de antes da extração deste
 * adapter (mesmos cursores, tamanhos de texto e conteúdo char a char) —
 * nenhum comportamento observável no display deve mudar.
 *
 * Um futuro TFT ILI9341 colorido entra como um novo arquivo
 * (tela_ili9341.h) implementando a mesma interface Tela, sem tocar neste
 * arquivo nem no core.
 * ============================================================================
 */

#pragma once

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#include "tela.h"

// ===== DISPLAY OLED =====
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C

class TelaSSD1306 : public Tela {
 public:
  TelaSSD1306() : display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET) {}

  // PRESSUPÕE que Wire.begin(21, 22) já foi chamado pelo chamador (é o que
  // coreSetup() e deepSleepCiclo() fazem antes de chamar iniciar() — ver
  // piezometro_core.h e piezometro_deep_sleep.h) — o barramento I2C é
  // compartilhado com outros sensores (BMP180, ADS1115), então quem o abre
  // é responsabilidade de quem monta o setup, não desta tela.
  bool iniciar() override {
    // begin() da Adafruit verifica a alocação, mas não confirma o ACK da tela.
    Wire.beginTransmission(SCREEN_ADDRESS);
    uint8_t erro = Wire.endTransmission();
    Serial.printf("OLED I2C 0x%02X: codigo %u (0 = respondeu)\n", SCREEN_ADDRESS, erro);
    if (erro != 0) return false;
    // O chamador já abriu o barramento nos pinos corretos: não reinicializar.
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
        // Reservado: nenhum adapter atual usa este slot isolado — o status
        // de WiFi hoje vem embutido no texto do SLOT_EXTRA_2 (ver hooks
        // linhasExtrasDisplay nos sketches). Sem posição própria no OLED
        // 128x64 (já ocupado), este slot fica sem efeito aqui.
        break;
      default:
        break;
    }
  }

  void destacarStatus(const char* rotulo, uint8_t faixa) override {
    (void)faixa; // SSD1306 é monocromático — a faixa não muda nada aqui; um
                 // adapter colorido (ex. ILI9341) a usará para pintar o
                 // fundo verde/amarelo/vermelho.
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

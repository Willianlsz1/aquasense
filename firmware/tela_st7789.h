/*
 * tela_st7789.h — implementação de Tela para o TFT SPI ST7789 240x320
 *
 * Módulo de 7 pinos (GND VCC SCK SDA RST DC CS), sem pino de luz de fundo:
 * a luz fica sempre acesa. Usa o barramento HSPI do ESP32 em pinos livres,
 * sem mexer no TRIG (GPIO 5) e no ECHO (GPIO 18) do HC-SR04 já montado.
 *
 * Bibliotecas: Adafruit GFX e "Adafruit ST7735 and ST7789 Library".
 *
 * Sem framebuffer: redesenhar a tela inteira a cada segundo piscaria. Por
 * isso o fundo é pintado uma vez e cada linha é reescrita com cor de fundo
 * e largura fixa; a faixa de status só é repintada quando muda.
 *
 * Limitação: o TFT não responde pelo SPI (não há MISO), então iniciar()
 * não consegue detectar tela ausente — diferente do OLED I2C.
 */
#pragma once

#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include "tela.h"

// ===== TELA TFT ST7789 (SPI) =====
#define TFT_SCK   14   // pino SCK da tela
#define TFT_MOSI  13   // pino SDA da tela
#define TFT_CS    25
#define TFT_DC    27
#define TFT_RST   26
#define TFT_LARGURA 320  // deitada (rotação 1)
#define TFT_ALTURA  240

class TelaST7789 : public Tela {
 public:
  TelaST7789() : spi(HSPI), display(&spi, TFT_CS, TFT_DC, TFT_RST) {}

  bool iniciar() override {
    // Define os pinos antes da biblioteca abrir o barramento com os padrões.
    spi.begin(TFT_SCK, -1, TFT_MOSI, TFT_CS);
    display.init(240, 320);
    display.setRotation(1);
    display.setTextWrap(false);
    fundoPronto = false;
    return true;
  }

  void limpar() override {
    if (fundoPronto) return;
    display.fillScreen(ST77XX_BLACK);
    display.fillRect(0, 0, TFT_LARGURA, 32, ST77XX_BLUE);
    faixaAtual = 255;
    rotuloAtual[0] = '\0';
    fundoPronto = true;
  }

  void escreverLinha(uint8_t slot, const char* texto) override {
    switch (slot) {
      case SLOT_TITULO:    linha(texto, 2, 20, 16, 9, ST77XX_WHITE, ST77XX_BLUE); break;
      case SLOT_NIVEL:     linha(texto, 3, 16, 8, 50, ST77XX_WHITE, ST77XX_BLACK); break;
      case SLOT_EXTRA_1:   linha(texto, 2, 25, 8, 96, ST77XX_CYAN, ST77XX_BLACK); break;
      case SLOT_EXTRA_2:   linha(texto, 2, 25, 8, 124, ST77XX_CYAN, ST77XX_BLACK); break;
      default: break;
    }
  }

  void destacarStatus(const char* rotulo, uint8_t faixa) override {
    if (faixa == faixaAtual && strcmp(rotulo, rotuloAtual) == 0) return;
    faixaAtual = faixa;
    strncpy(rotuloAtual, rotulo, sizeof(rotuloAtual) - 1);
    rotuloAtual[sizeof(rotuloAtual) - 1] = '\0';

    uint16_t fundo = ST77XX_GREEN, texto = ST77XX_BLACK;
    if (faixa == FAIXA_ATENCAO) fundo = ST77XX_YELLOW;
    else if (faixa == FAIXA_CRITICO) { fundo = ST77XX_RED; texto = ST77XX_WHITE; }
    else if (faixa == FAIXA_FALHA) { fundo = ST77XX_MAGENTA; texto = ST77XX_WHITE; }

    display.fillRect(0, 160, TFT_LARGURA, 80, fundo);
    display.setTextSize(4);  // 24 px por caractere
    display.setTextColor(texto);
    int16_t x = (TFT_LARGURA - (int16_t)strlen(rotulo) * 24) / 2;
    display.setCursor(x < 0 ? 0 : x, 184);
    display.print(rotulo);
  }

  void mostrar() override {}  // desenha direto no TFT; nada a enviar

  void mostrarTelaInicio() override {
    display.fillScreen(ST77XX_BLACK);
    display.setTextColor(ST77XX_CYAN);
    display.setTextSize(4);
    display.setCursor(52, 60);
    display.print("AquaSense");
    display.setTextColor(ST77XX_WHITE);
    display.setTextSize(2);
    display.setCursor(64, 120);
    display.print("Nivel de agua em");
    display.setCursor(94, 144);
    display.print("piezometros");
    display.setCursor(88, 196);
    display.print("Iniciando...");
    fundoPronto = false;  // a próxima leitura repinta o fundo de operação
  }

 private:
  // Texto com cor de fundo e espaços até a largura fixa: apaga o valor
  // anterior sem limpar a tela.
  void linha(const char* texto, uint8_t tamanho, int largura, int16_t x, int16_t y,
             uint16_t cor, uint16_t fundo) {
    char buf[32];
    snprintf(buf, sizeof(buf), "%-*.*s", largura, largura, texto);
    display.setTextSize(tamanho);
    display.setTextColor(cor, fundo);
    display.setCursor(x, y);
    display.print(buf);
  }

  SPIClass spi;
  Adafruit_ST7789 display;
  bool fundoPronto = false;
  uint8_t faixaAtual = 255;
  char rotuloAtual[16] = "";
};

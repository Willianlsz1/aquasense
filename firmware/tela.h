/*
 * ============================================================================
 * TELA.H — interface abstrata de exibição (seam entre o core e o hardware)
 * ============================================================================
 *
 * O core (piezometro_core.h) e os hooks de sensor dos sketches enxergam
 * SOMENTE esta interface — nunca o tipo concreto do display (hoje
 * Adafruit_SSD1306, escondido dentro de tela_ssd1306.h). Isso permite trocar
 * o hardware de tela (ex.: substituir o OLED monocromático por um TFT
 * ILI9341 colorido) criando um novo arquivo "tela_xxx.h" que implemente
 * Tela — sem editar o core nem nenhum dos sketches. O adapter atual do OLED
 * está em tela_ssd1306.h.
 *
 * ORIENTADA A "LINHAS/SLOTS": cada informação do painel ocupa um slot fixo
 * (constantes SLOT_*), reproduzindo o layout atual do OLED 128x64 mono. Um
 * adapter colorido pode usar os mesmos slots com fontes/posições/cores
 * diferentes — a interface não amarra pixels, só CONTEÚDO.
 * ============================================================================
 */

#pragma once

#include <Arduino.h>

// ===== SLOTS DE LINHA (mesma ordem/semântica das linhas do OLED atual) =====
#define SLOT_TITULO       0  // título fixo da tela de operação ("SAMARCO PIEZOMETRO")
#define SLOT_NIVEL        1  // "Nivel: X.XX m"
#define SLOT_EXTRA_1      2  // 1ª linha específica do sensor (hook linhasExtrasDisplay)
#define SLOT_EXTRA_2      3  // 2ª linha específica do sensor (hook linhasExtrasDisplay)
#define SLOT_WIFI_STATUS  4  // reservado: status de conectividade isolado — hoje os
                              // adapters de sensor embutem "WiFi:OK/--" dentro do
                              // texto do SLOT_EXTRA_2; uma tela futura com mais
                              // espaço (ex. ILI9341) pode usar este slot à parte.

// ===== FAIXAS DE ALERTA (para destacarStatus) =====
// Mesma codificação de corAtual no core (0/1/2) — não inverter.
#define FAIXA_NORMAL   0  // nível < NIVEL_ATENCAO
#define FAIXA_ATENCAO  1  // NIVEL_ATENCAO <= nível < NIVEL_CRITICO
#define FAIXA_CRITICO  2  // nível >= NIVEL_CRITICO
#define FAIXA_FALHA    3  // sensor sem leitura válida

// ===== INTERFACE =====
class Tela {
 public:
  virtual ~Tela() {}

  // Inicializa o hardware da tela (barramento, endereço, etc.). PRESSUPÕE
  // que o barramento (ex. I2C via Wire.begin) já foi aberto pelo chamador —
  // a interface não decide QUEM abre o barramento, só usa. Retorna false se
  // a tela não respondeu; o chamador deve DEGRADAR (seguir sem tela), nunca
  // travar: a tela é um componente SECUNDÁRIO do instrumento.
  virtual bool iniciar() = 0;

  // Limpa o conteúdo da tela (equivalente a display.clearDisplay()).
  virtual void limpar() = 0;

  // Escreve o texto de um slot de linha (ver constantes SLOT_*). A
  // implementação decide fonte/posição/cor; o chamador só fornece o
  // conteúdo já formatado (ex. via snprintf).
  virtual void escreverLinha(uint8_t slot, const char* texto) = 0;

  // Destaca visualmente o status atual (NORMAL/ATENCAO/CRITICO). "rotulo" é
  // o texto a mostrar (string vazia "" = nada a imprimir agora — usado para
  // o pisca-pisca de ATENÇÃO/CRÍTICO, ver piezometro_core.h); "faixa" (ver
  // FAIXA_*) indica a severidade — um OLED mono ignora a faixa (sempre a
  // mesma cor), uma tela colorida futura (ex. ILI9341) pode usá-la para
  // pintar o fundo verde/amarelo/vermelho.
  virtual void destacarStatus(const char* rotulo, uint8_t faixa) = 0;

  // Envia o conteúdo desenhado para o hardware (equivalente a
  // display.display() no SSD1306 — em telas sem buffer isso pode ser um
  // no-op).
  virtual void mostrar() = 0;

  // Desenha a tela de splash mostrada uma única vez no boot (equivalente ao
  // antigo mostrarTelaInicio() do core). É uma tela fixa e específica (não
  // um composto de slots) — cada implementação decide o efeito visual; a do
  // SSD1306 reproduz exatamente o texto/layout original.
  virtual void mostrarTelaInicio() = 0;

  // OPCIONAL: reduz o brilho/energia da tela (equivalente a display.dim(true)
  // no SSD1306). Tem corpo padrão vazio — nem toda tela suporta atenuação
  // (ex. um TFT sem PWM de backlight controlável), e nenhum outro ponto do
  // sistema depende deste comportamento além do modo deep sleep (ver
  // piezometro_deep_sleep.h), que chama isso só como cortesia de consumo
  // antes de dormir.
  virtual void atenuar() {}
};

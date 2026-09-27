// AQUASENSE — HC-SR04 + TFT ST7789 — UMA ÚNICA ABA
// Gerado por tools/gerar-firmware-unico.mjs a partir dos fontes da bancada.
// Edite a configuração abaixo na cópia LOCAL da Arduino IDE.
// Não publique este arquivo depois de preencher senha e chave.
// Escala didática: max(0, 40 - distância em cm) * 0,5 m.
// ECHO no GPIO 18 exige divisor de tensão; mantenha a montagem já testada.
// Tela TFT SPI: SCK 14, SDA 13, CS 25, DC 27, RST 26; VCC em 3V3.
// Bibliotecas: Adafruit GFX e Adafruit ST7735 and ST7789; placa ESP32 Dev Module.

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

// ===== TELA =====
#include <Arduino.h>

// ===== SLOTS DE LINHA (mesma ordem/semântica das linhas do OLED atual) =====
#define SLOT_TITULO       0  // título fixo da tela de operação ("AQUASENSE PIEZOMETRO")
#define SLOT_NIVEL        1  // "Nivel: X.XX m"
#define SLOT_EXTRA_1      2  // 1ª linha específica do sensor (hook linhasExtrasDisplay)
#define SLOT_EXTRA_2      3  // 2ª linha específica do sensor (hook linhasExtrasDisplay)
#define SLOT_WIFI_STATUS  4  // comunicação (Wi-Fi, último envio, fila), escrita pelo

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

#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

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
    spi.begin(TFT_SCK, -1, TFT_MOSI, TFT_CS);
    display.init(240, 320);
    display.invertDisplay(false);  // este módulo mostrava as cores invertidas
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
      case SLOT_TITULO:    linha(texto, 2, 25, 8, 9, ST77XX_WHITE, ST77XX_BLUE); break;
      case SLOT_NIVEL:     linha(texto, 3, 16, 8, 42, ST77XX_WHITE, ST77XX_BLACK); break;
      case SLOT_EXTRA_1:   linha(texto, 2, 25, 8, 78, ST77XX_CYAN, ST77XX_BLACK); break;
      case SLOT_EXTRA_2:   linha(texto, 2, 25, 8, 102, ST77XX_CYAN, ST77XX_BLACK); break;
      case SLOT_WIFI_STATUS: {
        bool falha = strncmp(texto, "SEM", 3) == 0 || strncmp(texto, "ERRO", 4) == 0;
        linha(texto, 2, 25, 8, 130, falha ? ST77XX_YELLOW : ST77XX_WHITE, ST77XX_BLACK);
        break;
      }
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

// ===== CONEXÃO, ENVIO E ALERTAS =====
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <math.h>

// ===== CERTIFICADOS RAIZ (validação do servidor HTTPS) =====
static const char CA_RAIZES[] = R"PEM(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIICGzCCAaGgAwIBAgIQQdKd0XLq7qeAwSxs6S+HUjAKBggqhkjOPQQDAzBPMQsw
CQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFyY2gg
R3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMjAeFw0yMDA5MDQwMDAwMDBaFw00
MDA5MTcxNjAwMDBaME8xCzAJBgNVBAYTAlVTMSkwJwYDVQQKEyBJbnRlcm5ldCBT
ZWN1cml0eSBSZXNlYXJjaCBHcm91cDEVMBMGA1UEAxMMSVNSRyBSb290IFgyMHYw
EAYHKoZIzj0CAQYFK4EEACIDYgAEzZvVn4CDCuwJSvMWSj5cz3es3mcFDR0HttwW
+1qLFNvicWDEukWVEYmO6gbf9yoWHKS5xcUy4APgHoIYOIvXRdgKam7mAHf7AlF9
ItgKbppbd9/w+kHsOdx1ymgHDB/qo0IwQDAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0T
AQH/BAUwAwEB/zAdBgNVHQ4EFgQUfEKWrt5LSDv6kviejM9ti6lyN5UwCgYIKoZI
zj0EAwMDaAAwZQIwe3lORlCEwkSHRhtFcP9Ymd70/aTSVaYgLXTWNLxBo1BfASdW
tL4ndQavEi51mI38AjEAi/V3bNTIZargCyzuFJ0nN6T5U6VR5CmD1/iQMVtCnwr1
/q4AaOeMSQ+2b1tbFfLn
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIFVzCCAz+gAwIBAgINAgPlk28xsBNJiGuiFzANBgkqhkiG9w0BAQwFADBHMQsw
CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU
MBIGA1UEAxMLR1RTIFJvb3QgUjEwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw
MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp
Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjEwggIiMA0GCSqGSIb3DQEBAQUA
A4ICDwAwggIKAoICAQC2EQKLHuOhd5s73L+UPreVp0A8of2C+X0yBoJx9vaMf/vo
27xqLpeXo4xL+Sv2sfnOhB2x+cWX3u+58qPpvBKJXqeqUqv4IyfLpLGcY9vXmX7w
Cl7raKb0xlpHDU0QM+NOsROjyBhsS+z8CZDfnWQpJSMHobTSPS5g4M/SCYe7zUjw
TcLCeoiKu7rPWRnWr4+wB7CeMfGCwcDfLqZtbBkOtdh+JhpFAz2weaSUKK0Pfybl
qAj+lug8aJRT7oM6iCsVlgmy4HqMLnXWnOunVmSPlk9orj2XwoSPwLxAwAtcvfaH
szVsrBhQf4TgTM2S0yDpM7xSma8ytSmzJSq0SPly4cpk9+aCEI3oncKKiPo4Zor8
Y/kB+Xj9e1x3+naH+uzfsQ55lVe0vSbv1gHR6xYKu44LtcXFilWr06zqkUspzBmk
MiVOKvFlRNACzqrOSbTqn3yDsEB750Orp2yjj32JgfpMpf/VjsPOS+C12LOORc92
wO1AK/1TD7Cn1TsNsYqiA94xrcx36m97PtbfkSIS5r762DL8EGMUUXLeXdYWk70p
aDPvOmbsB4om3xPXV2V4J95eSRQAogB/mqghtqmxlbCluQ0WEdrHbEg8QOB+DVrN
VjzRlwW5y0vtOUucxD/SVRNuJLDWcfr0wbrM7Rv1/oFB2ACYPTrIrnqYNxgFlQID
AQABo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4E
FgQU5K8rJnEaK0gnhS9SZizv8IkTcT4wDQYJKoZIhvcNAQEMBQADggIBAJ+qQibb
C5u+/x6Wki4+omVKapi6Ist9wTrYggoGxval3sBOh2Z5ofmmWJyq+bXmYOfg6LEe
QkEzCzc9zolwFcq1JKjPa7XSQCGYzyI0zzvFIoTgxQ6KfF2I5DUkzps+GlQebtuy
h6f88/qBVRRiClmpIgUxPoLW7ttXNLwzldMXG+gnoot7TiYaelpkttGsN/H9oPM4
7HLwEXWdyzRSjeZ2axfG34arJ45JK3VmgRAhpuo+9K4l/3wV3s6MJT/KYnAK9y8J
ZgfIPxz88NtFMN9iiMG1D53Dn0reWVlHxYciNuaCp+0KueIHoI17eko8cdLiA6Ef
MgfdG+RCzgwARWGAtQsgWSl4vflVy2PFPEz0tv/bal8xa5meLMFrUKTX5hgUvYU/
Z6tGn6D/Qqc6f1zLXbBwHSs09dR2CQzreExZBfMzQsNhFRAbd03OIozUhfJFfbdT
6u9AWpQKXCBfTkBdYiJ23//OYb2MI3jSNwLgjt7RETeJ9r/tSQdirpLsQBqvFAnZ
0E6yove+7u7Y/9waLd64NnHi/Hm3lCXRSHNboTXns5lndcEZOitHTtNCjv0xyBZm
2tIMPNuzjsmhDYAPexZ3FL//2wmUspO8IFgV6dtxQ/PeEMMA3KgqlbbC1j+Qa3bb
bP6MvPJwNQzcmRk13NfIRmPVNnGuV/u3gm3c
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIFVzCCAz+gAwIBAgINAgPlrsWNBCUaqxElqjANBgkqhkiG9w0BAQwFADBHMQsw
CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU
MBIGA1UEAxMLR1RTIFJvb3QgUjIwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw
MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp
Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjIwggIiMA0GCSqGSIb3DQEBAQUA
A4ICDwAwggIKAoICAQDO3v2m++zsFDQ8BwZabFn3GTXd98GdVarTzTukk3LvCvpt
nfbwhYBboUhSnznFt+4orO/LdmgUud+tAWyZH8QiHZ/+cnfgLFuv5AS/T3KgGjSY
6Dlo7JUle3ah5mm5hRm9iYz+re026nO8/4Piy33B0s5Ks40FnotJk9/BW9BuXvAu
MC6C/Pq8tBcKSOWIm8Wba96wyrQD8Nr0kLhlZPdcTK3ofmZemde4wj7I0BOdre7k
RXuJVfeKH2JShBKzwkCX44ofR5GmdFrS+LFjKBC4swm4VndAoiaYecb+3yXuPuWg
f9RhD1FLPD+M2uFwdNjCaKH5wQzpoeJ/u1U8dgbuak7MkogwTZq9TwtImoS1mKPV
+3PBV2HdKFZ1E66HjucMUQkQdYhMvI35ezzUIkgfKtzra7tEscszcTJGr61K8Yzo
dDqs5xoic4DSMPclQsciOzsSrZYuxsN2B6ogtzVJV+mSSeh2FnIxZyuWfoqjx5RW
Ir9qS34BIbIjMt/kmkRtWVtd9QCgHJvGeJeNkP+byKq0rxFROV7Z+2et1VsRnTKa
G73VululycslaVNVJ1zgyjbLiGH7HrfQy+4W+9OmTN6SpdTi3/UGVN4unUu0kzCq
gc7dGtxRcw1PcOnlthYhGXmy5okLdWTK1au8CcEYof/UVKGFPP0UJAOyh9OktwID
AQABo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4E
FgQUu//KjiOfT5nK2+JopqUVJxce2Q4wDQYJKoZIhvcNAQEMBQADggIBAB/Kzt3H
vqGf2SdMC9wXmBFqiN495nFWcrKeGk6c1SuYJF2ba3uwM4IJvd8lRuqYnrYb/oM8
0mJhwQTtzuDFycgTE1XnqGOtjHsB/ncw4c5omwX4Eu55MaBBRTUoCnGkJE+M3DyC
B19m3H0Q/gxhswWV7uGugQ+o+MePTagjAiZrHYNSVc61LwDKgEDg4XSsYPWHgJ2u
NmSRXbBoGOqKYcl3qJfEycel/FVL8/B/uWU9J2jQzGv6U53hkRrJXRqWbTKH7QMg
yALOWr7Z6v2yTcQvG99fevX4i8buMTolUVVnjWQye+mew4K6Ki3pHrTgSAai/Gev
HyICc/sgCq+dVEuhzf9gR7A/Xe8bVr2XIZYtCtFenTgCR2y59PYjJbigapordwj6
xLEokCZYCDzifqrXPW+6MYgKBesntaFJ7qBFVHvmJ2WZICGoo7z7GJa7Um8M7YNR
TOlZ4iBgxcJlkoKM8xAfDoqXvneCbT+PHV28SSe9zE8P4c52hgQjxcCMElv924Sg
JPFI/2R80L5cFtHvma3AH/vLrrw4IgYmZNralw4/KBVEqE8AyvCazM90arQ+POuV
7LXTWtiBmelDGDfrs7vRWGJB82bSj6p4lVQgw1oudCvV0b4YacCs1aTPObpRhANl
6WLAYv7YTVWW4tAR+kg0Eeye7QUd5MjWHYbL
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIICCTCCAY6gAwIBAgINAgPluILrIPglJ209ZjAKBggqhkjOPQQDAzBHMQswCQYD
VQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIG
A1UEAxMLR1RTIFJvb3QgUjMwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAwMDAw
WjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2Vz
IExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjMwdjAQBgcqhkjOPQIBBgUrgQQAIgNi
AAQfTzOHMymKoYTey8chWEGJ6ladK0uFxh1MJ7x/JlFyb+Kf1qPKzEUURout736G
jOyxfi//qXGdGIRFBEFVbivqJn+7kAHjSxm65FSWRQmx1WyRRK2EE46ajA2ADDL2
4CejQjBAMA4GA1UdDwEB/wQEAwIBhjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQW
BBTB8Sa6oC2uhYHP0/EqEr24Cmf9vDAKBggqhkjOPQQDAwNpADBmAjEA9uEglRR7
VKOQFhG/hMjqb2sXnh5GmCCbn9MN2azTL818+FsuVbu/3ZL3pAzcMeGiAjEA/Jdm
ZuVDFhOD3cffL74UOO0BzrEXGhF16b0DjyZ+hOXJYKaV11RZt+cRLInUue4X
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIICCTCCAY6gAwIBAgINAgPlwGjvYxqccpBQUjAKBggqhkjOPQQDAzBHMQswCQYD
VQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIG
A1UEAxMLR1RTIFJvb3QgUjQwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAwMDAw
WjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2Vz
IExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjQwdjAQBgcqhkjOPQIBBgUrgQQAIgNi
AATzdHOnaItgrkO4NcWBMHtLSZ37wWHO5t5GvWvVYRg1rkDdc/eJkTBa6zzuhXyi
QHY7qca4R9gq55KRanPpsXI5nymfopjTX15YhmUPoYRlBtHci8nHc8iMai/lxKvR
HYqjQjBAMA4GA1UdDwEB/wQEAwIBhjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQW
BBSATNbrdP9JNqPV2Py1PsVq8JQdjDAKBggqhkjOPQQDAwNpADBmAjEA6ED/g94D
9J+uHXqnLrmvT/aDHQ4thQEd0dlq7A/Cr8deVl5c1RxYIigL9zC2L7F8AjEA8GE8
p/SgguMh1YQdc4acLa/KNJvxn7kjNuK8YAOdgLOaVsjh4rsUecrNIdSUtUlD
-----END CERTIFICATE-----
)PEM";

// ===== INTERVALOS (ms) =====
#define INTERVALO_LEITURA 1000UL    // leitura local + display
#define INTERVALO_ENVIO   10000UL   // envio ao backend (Cloudflare Worker)
#define INTERVALO_NTP     300000UL  // 5 min — re-sincroniza o relógio periodicamente:

// ===== STORE & FORWARD =====
#define BUFFER_MAX 120              // ~20 min de leituras retidas sem rede

// ===== REDE E TELA =====
#define INTERVALO_RECONEXAO 60000UL // o ESP32 já reconecta sozinho; só insiste a cada 1 min
#ifndef FUSO_HORARIO_SEG
#define FUSO_HORARIO_SEG (-3 * 3600) // hora de Brasília na tela (o envio segue em UTC)
#endif

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
bool displayOk = false;

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
    if (millis() - ultimaReconexaoMs >= INTERVALO_RECONEXAO) {
      ultimaReconexaoMs = millis();
      WiFi.reconnect();
    }
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
  client.setCACert(CA_RAIZES);
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
void mostrarDisplay() {
  if (!displayOk) return;

  tela->limpar();

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

  Wire.begin(21, 22); // barramento I2C livre para sensores (ADS1115, BMP180), quando houver

  Serial.print("Inicializando tela... ");
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
void coreLoop() {
  unsigned long agora = millis();

  if (agora - ultimaLeitura >= INTERVALO_LEITURA) {
    ultimaLeitura = agora;
    leituraAtual = lerSensor();
    determinarAlerta();
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
  if (distanciaCm < 0) snprintf(l1, sizeof(l1), "Sensor: sem eco");
  else snprintf(l1, sizeof(l1), "Sensor: %.1f cm", distanciaCm);
  t.escreverLinha(SLOT_EXTRA_1, l1);

  char l2[32];
  snprintf(l2, sizeof(l2), "Limites: %.0f / %.0f m", (float)NIVEL_ATENCAO, (float)NIVEL_CRITICO);
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

// AQUASENSE — protótipo V1/V2: ESP32 + HC-SR04 + TFT ST7789
// Lê o nível a cada 1 s, mostra na tela e no Serial, e envia ao servidor a cada 10 s.
// Sem rede, guarda até 120 leituras (~20 min) e envia quando a rede volta.
//
// Arduino IDE: placa "ESP32 Dev Module"; bibliotecas "Adafruit GFX" e
// "Adafruit ST7735 and ST7789". Preencha as credenciais abaixo SÓ na sua cópia
// local e não publique o arquivo preenchido (contém senha e chave).

#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>

// ===== CREDENCIAIS (preencha antes de gravar) =====
#define WIFI_SSID     "SUA_REDE_WIFI"
#define WIFI_PASS     "SUA_SENHA_WIFI"
#define SERVER_URL    "https://piezometro-worker.SEU-SUBDOMINIO.workers.dev/ingest"
#define DEVICE_KEY    "troque-esta-chave"   // a mesma DEVICE_KEY do Worker
#define PIEZOMETRO_ID "PZ-01"

// ===== FAIXAS DE ALERTA (m) =====
#define NIVEL_ATENCAO 12.0   // a partir daqui: ATENCAO
#define NIVEL_CRITICO 15.0   // a partir daqui: CRITICO

// ===== SENSOR HC-SR04 =====
#define PIN_TRIG 5
#define PIN_ECHO 18             // ECHO é 5 V: manter o divisor 1k/2k
#define ALTURA_REF_CM   40.0    // distância do sensor ao nível zero
#define ESCALA_M_POR_CM  0.5    // escala didática: 1 cm = 0,5 m
#define DIST_MIN_CM  3.0
#define DIST_MAX_CM  400.0

// ===== TELA TFT ST7789 (SPI, 320x240 deitada) =====
#define TFT_SCK  14   // pino SCK da tela
#define TFT_MOSI 13   // pino SDA da tela
#define TFT_CS   25
#define TFT_DC   27
#define TFT_RST  26
#define TFT_LARGURA 320

// ===== TEMPOS =====
#define INTERVALO_LEITURA   1000UL    // 1 s
#define INTERVALO_ENVIO     10000UL   // 10 s
#define INTERVALO_NTP       300000UL  // ressincroniza o relógio a cada 5 min
#define INTERVALO_RECONEXAO 60000UL   // insiste no Wi-Fi a cada 1 min
#define FUSO_HORARIO_SEG    (-3 * 3600)  // hora de Brasília na tela; o envio usa UTC
#define BUFFER_MAX          120       // ~20 min de leituras sem rede

// Faixas: também escolhem a cor da tarja na tela
enum Faixa { NORMAL, ATENCAO, CRITICO, FALHA };

// ===== CERTIFICADOS RAIZ (valida o servidor HTTPS) =====
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

// ===== ESTADO =====
SPIClass spiTela(HSPI);
Adafruit_ST7789 tft(&spiTela, TFT_CS, TFT_DC, TFT_RST);

float nivelM = 0;              // último nível válido (m)
float distanciaCm = -1;        // última distância medida; -1 = sem eco
bool leituraValida = false;    // a leitura deste ciclo veio do sensor?
bool jaTeveLeitura = false;    // houve alguma leitura válida desde o início?
Faixa faixa = FALHA;

bool ntpOk = false;
int ultimoCodigoHttp = 0;      // 0 = ainda não enviou; 204 = aceito; <0 = sem conexão
unsigned long ultimoEnvioOkMs = 0;
unsigned long ultimaLeitura = 0, ultimoEnvio = 0, ultimoNtp = 0, ultimaReconexao = 0;

String fila[BUFFER_MAX];
int filaCount = 0;

// ===== SENSOR =====
float medirDistanciaCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long duracao = pulseIn(PIN_ECHO, HIGH, 30000UL);  // espera até 30 ms
  return duracao / 58.0;                                     // µs -> cm (0 = sem eco)
}

// Mediana de 5 tentativas, ignorando as fora da faixa útil. -1 = nenhuma válida.
float medirMedianaCm() {
  float v[5];
  int n = 0;
  for (int i = 0; i < 5; i++) {
    float d = medirDistanciaCm();
    if (d >= DIST_MIN_CM && d <= DIST_MAX_CM) v[n++] = d;
    delay(30);
  }
  if (n == 0) return -1;
  for (int i = 1; i < n; i++)            // ordena (poucos valores)
    for (int j = i; j > 0 && v[j - 1] > v[j]; j--) {
      float t = v[j]; v[j] = v[j - 1]; v[j - 1] = t;
    }
  return v[n / 2];
}

void lerSensor() {
  distanciaCm = medirMedianaCm();
  leituraValida = distanciaCm > 0;
  if (!leituraValida) {      // falha: mantém o último nível, mas não o envia como novo
    faixa = FALHA;
    return;
  }
  nivelM = max(0.0, ALTURA_REF_CM - distanciaCm) * ESCALA_M_POR_CM;
  jaTeveLeitura = true;
  if (nivelM < NIVEL_ATENCAO) faixa = NORMAL;
  else if (nivelM < NIVEL_CRITICO) faixa = ATENCAO;
  else faixa = CRITICO;
}

// ===== REDE =====
void conectarWiFi() {
  Serial.print("Conectando ao Wi-Fi \"" WIFI_SSID "\"");
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(" OK! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" FALHOU - segue medindo e guardando na fila.");
  }
}

void sincronizarNTP() {
  if (WiFi.status() != WL_CONNECTED) return;
  Serial.print("Sincronizando relogio (NTP)");
  configTime(0, 0, "pool.ntp.org");
  unsigned long inicio = millis();
  while (time(nullptr) < 1000000000 && millis() - inicio < 10000) {
    delay(500);
    Serial.print(".");
  }
  ntpOk = time(nullptr) >= 1000000000;
  Serial.println(ntpOk ? " OK!" : " FALHOU - envio sem horario local.");
}

// Guarda a leitura atual na fila; se cheia, descarta a mais antiga.
void guardarNaFila() {
  char item[96];
  if (ntpOk)
    snprintf(item, sizeof(item), "{\"piezometro\":\"" PIEZOMETRO_ID "\",\"nivel_agua\":%.3f,\"ts\":%ld}",
             nivelM, (long)time(nullptr));
  else
    snprintf(item, sizeof(item), "{\"piezometro\":\"" PIEZOMETRO_ID "\",\"nivel_agua\":%.3f}", nivelM);

  if (filaCount >= BUFFER_MAX) {
    for (int i = 1; i < BUFFER_MAX; i++) fila[i - 1] = fila[i];
    filaCount = BUFFER_MAX - 1;
    Serial.println("Fila cheia - leitura mais antiga descartada");
  }
  fila[filaCount++] = item;
}

// Envia a fila inteira num único POST; só esvazia se o servidor aceitar (HTTP 204).
void enviarFila() {
  if (filaCount == 0) return;
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("Wi-Fi offline - %d leitura(s) na fila\n", filaCount);
    if (millis() - ultimaReconexao >= INTERVALO_RECONEXAO) {
      ultimaReconexao = millis();
      WiFi.reconnect();
    }
    return;
  }
  if (!ntpOk) sincronizarNTP();  // a rede voltou: tenta recuperar o relógio

  String corpo = "{\"leituras\":[";
  for (int i = 0; i < filaCount; i++) {
    if (i > 0) corpo += ",";
    corpo += fila[i];
  }
  corpo += "]}";

  WiFiClientSecure cliente;
  cliente.setCACert(CA_RAIZES);
  cliente.setHandshakeTimeout(5);  // s: rede ruim não pode travar a medição por muito tempo
  HTTPClient http;
  http.begin(cliente, SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  http.setConnectTimeout(3000);
  http.setTimeout(5000);

  ultimoCodigoHttp = http.POST(corpo);
  if (ultimoCodigoHttp == 204) {
    ultimoEnvioOkMs = millis();
    Serial.printf("Servidor: %d leitura(s) enviadas (HTTP 204)\n", filaCount);
    filaCount = 0;
  } else {
    Serial.printf("Servidor: falha (HTTP %d) - %d leitura(s) na fila\n", ultimoCodigoHttp, filaCount);
  }
  http.end();
}

// ===== TELA =====
// Escreve uma linha, completando com espaços para apagar o texto anterior.
void linha(const char* texto, uint8_t tamanho, int16_t y, uint16_t cor, uint16_t fundo) {
  char buf[32];
  snprintf(buf, sizeof(buf), "%-25.25s", texto);
  tft.setTextSize(tamanho);
  tft.setTextColor(cor, fundo);
  tft.setCursor(8, y);
  tft.print(buf);
}

void desenharFundo() {
  tft.fillScreen(ST77XX_BLACK);
  tft.fillRect(0, 0, TFT_LARGURA, 32, ST77XX_BLUE);
}

void mostrarTelaInicio() {
  tft.fillScreen(ST77XX_BLACK);
  tft.setTextColor(ST77XX_CYAN);
  tft.setTextSize(4);
  tft.setCursor(52, 60);
  tft.print("AquaSense");
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(64, 120);
  tft.print("Nivel de agua em");
  tft.setCursor(94, 144);
  tft.print("piezometros");
  tft.setCursor(88, 196);
  tft.print("Iniciando...");
  delay(2000);
  desenharFundo();
}

// Tarja inferior colorida; só redesenha quando a faixa muda (evita piscar).
void mostrarTarja() {
  static int faixaDesenhada = -1;
  if (faixa == faixaDesenhada) return;
  faixaDesenhada = faixa;

  const char* rotulo = "NORMAL";
  uint16_t fundo = ST77XX_GREEN, cor = ST77XX_BLACK;
  if (faixa == ATENCAO)      { rotulo = "ATENCAO";      fundo = ST77XX_YELLOW; }
  else if (faixa == CRITICO) { rotulo = "CRITICO!";     fundo = ST77XX_RED;     cor = ST77XX_WHITE; }
  else if (faixa == FALHA)   { rotulo = "FALHA SENSOR"; fundo = ST77XX_MAGENTA; cor = ST77XX_WHITE; }

  tft.fillRect(0, 160, TFT_LARGURA, 80, fundo);
  tft.setTextSize(4);  // 24 px por caractere
  tft.setTextColor(cor);
  tft.setCursor(max(0, (TFT_LARGURA - (int)strlen(rotulo) * 24) / 2), 184);
  tft.print(rotulo);
}

void mostrarTela() {
  char buf[40];

  char hora[9] = "--:--:--";
  if (ntpOk) {
    time_t t = time(nullptr) + FUSO_HORARIO_SEG;
    struct tm tmHora;
    gmtime_r(&t, &tmHora);
    strftime(hora, sizeof(hora), "%H:%M:%S", &tmHora);
  }
  snprintf(buf, sizeof(buf), "%-16s%s", PIEZOMETRO_ID " AQUASENSE", hora);
  linha(buf, 2, 9, ST77XX_WHITE, ST77XX_BLUE);

  // Em falha, mostra o último nível como "Ultimo", nunca como medição atual
  if (!jaTeveLeitura) snprintf(buf, sizeof(buf), "Nivel: ---");
  else snprintf(buf, sizeof(buf), leituraValida ? "Nivel: %.2f m" : "Ultimo: %.2f m", nivelM);
  linha(buf, 3, 42, ST77XX_WHITE, ST77XX_BLACK);

  if (leituraValida) snprintf(buf, sizeof(buf), "Sensor: %.1f cm", distanciaCm);
  else snprintf(buf, sizeof(buf), "Sensor: sem eco");
  linha(buf, 2, 78, ST77XX_CYAN, ST77XX_BLACK);

  snprintf(buf, sizeof(buf), "Limites: %.0f / %.0f m", NIVEL_ATENCAO, NIVEL_CRITICO);
  linha(buf, 2, 102, ST77XX_CYAN, ST77XX_BLACK);

  // Comunicação: amarelo quando há problema
  bool problema = true;
  long rssi = WiFi.RSSI();
  if (WiFi.status() != WL_CONNECTED)
    snprintf(buf, sizeof(buf), "SEM WI-FI  Fila %d %dmin", filaCount, filaCount * 10 / 60);
  else if (ultimoCodigoHttp < 0)
    snprintf(buf, sizeof(buf), "SEM SERVIDOR  Fila %d", filaCount);
  else if (ultimoCodigoHttp != 0 && ultimoCodigoHttp != 204)
    snprintf(buf, sizeof(buf), "ERRO SERV %d  Fila %d", ultimoCodigoHttp, filaCount);
  else {
    problema = false;
    unsigned long idade = (millis() - ultimoEnvioOkMs) / 1000;
    if (ultimoCodigoHttp == 0) snprintf(buf, sizeof(buf), "WiFi %lddBm  Aguardando", rssi);
    else if (idade < 100)      snprintf(buf, sizeof(buf), "WiFi %lddBm  Envio OK %lus", rssi, idade);
    else                       snprintf(buf, sizeof(buf), "WiFi %lddBm  Envio OK %lum", rssi, idade / 60);
  }
  linha(buf, 2, 130, problema ? ST77XX_YELLOW : ST77XX_WHITE, ST77XX_BLACK);

  mostrarTarja();
}

// ===== SERIAL =====
void mostrarSerial() {
  Serial.println("---------------------------------------");
  if (leituraValida) {
    Serial.printf("Nivel: %.2f m   Distancia: %.1f cm\n", nivelM, distanciaCm);
  } else {
    Serial.println("FALHA SENSOR - sem eco; leitura nao sera enviada.");
    if (jaTeveLeitura) Serial.printf("Ultimo nivel conhecido: %.2f m\n", nivelM);
    else Serial.println("Nenhuma leitura valida desde o inicio");
  }
  const char* status[] = {"NORMAL", "ATENCAO", "CRITICO", "FALHA SENSOR"};
  Serial.printf("Status: %s   Fila: %d leitura(s)\n", status[faixa], filaCount);
}

// ===== INÍCIO E REPETIÇÃO =====
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("=== AQUASENSE - instrumento " PIEZOMETRO_ID " ===");

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

  spiTela.begin(TFT_SCK, -1, TFT_MOSI, TFT_CS);
  tft.init(240, 320);
  tft.invertDisplay(false);  // este módulo mostrava as cores invertidas
  tft.setRotation(1);
  tft.setTextWrap(false);
  mostrarTelaInicio();

  conectarWiFi();
  sincronizarNTP();
  ultimoNtp = millis();
  Serial.println("Monitoramento iniciado.");
}

void loop() {
  unsigned long agora = millis();

  if (agora - ultimaLeitura >= INTERVALO_LEITURA) {
    ultimaLeitura = agora;
    lerSensor();
    mostrarSerial();
    mostrarTela();
  }

  if (agora - ultimoEnvio >= INTERVALO_ENVIO) {
    ultimoEnvio = agora;
    if (leituraValida) guardarNaFila();
    enviarFila();  // pode esperar alguns segundos se a rede estiver ruim
  }

  if (agora - ultimoNtp >= INTERVALO_NTP) {
    ultimoNtp = agora;
    sincronizarNTP();
  }
}

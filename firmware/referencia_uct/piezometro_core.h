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
 * muda de um HARDWARE DE TELA para o outro (hoje o TFT ST7789; o OLED SSD1306
 * antigo segue disponível) fica em tela_st7789.h / tela_ssd1306.h — o core só fala com a interface Tela (ver tela.h), nunca
 * com o tipo concreto do display.
 *
 * COMO USAR NO ARDUINO IDE / WOKWI:
 * Este .h entra como uma ABA A MAIS dentro da mesma pasta do sketch (Arduino
 * IDE: "New Tab" → nome "piezometro_core.h"; no Wokwi: crie o arquivo com
 * esse nome no mesmo projeto), junto de tela.h e tela_st7789.h. O .ino faz
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

// ===== CERTIFICADOS RAIZ (validação do servidor HTTPS) =====
// Sem validar o certificado, alguém na mesma rede poderia se passar pelo
// servidor. Lista da Mozilla (pacote certifi 2026.02.25): Let's Encrypt
// (ISRG Root X1/X2), que assina o workers.dev hoje, e Google Trust Services
// (GTS Root R1-R4), outro emissor usado pela Cloudflare. Exige relógio certo
// (NTP) para conferir a validade.
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

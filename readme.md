# AquaSense

Protótipo de bancada para demonstrar telemetria aplicada ao monitoramento de
piezômetros, desenvolvido no Técnico em Automação Industrial do SENAI HORTO.
Usa ESP32 e HC-SR04 com escala didática, envio por Wi-Fi, armazenamento em nuvem,
dashboard, registros escritos e indicação visual de condições.

**Escopo vigente:** [bancada com os recursos disponíveis](docs/ESCOPO_ATUAL.md).
Não depende de testes em mineração, outro sensor ou construção de equipamento industrial.

## Funcionamento

ESP32 e HC-SR04 → HTTPS `/ingest` → Cloudflare Worker → D1 → dashboard GitHub Pages.
O motor de alertas executa a cada minuto e guarda estados e eventos no KV.
A dashboard consulta as últimas leituras a cada dez segundos.

- Medição física de distância convertida em nível equivalente da demonstração:
  `max(0, 40 - distancia_cm) * 0,5`. Não representa uma coluna real de vários metros.
- Ausência de eco válido é falha do sensor; não é enviada como nível zero novo.
- Recepção antiga aparece como SEM SINAL. Erro da API mostra indisponibilidade.
- Simulação depende de escolha explícita e é identificada na tela e exportações.
- Tema claro/escuro com preferência salva, gráficos de 24h/7d/30d e mapa ilustrativo.
- Histórico persistido: até 50 eventos da rede, filtrados pelo instrumento escolhido.
  Eventos da sessão são apresentados separadamente.
- CSV/Excel exportam os intervalos disponíveis, com média e pico. Não constituem
  exportação integral de amostras brutas. PDF real fica indisponível na simulação.

[Dashboard publicada](https://willianlsz1.github.io/aquasense/).
Estar publicado não assegura disponibilidade contínua: conexão e cotas do serviço
podem impedir consultas, como ocorreu com o limite diário do D1 em 13/09/2026.

## Bancada e validação

O sensor atual é HC-SR04. OLED apagado, investigação suspensa; LEDs não estão
montados e buzzer não foi validado. A demonstração pode ser acompanhada pelo serial
e pela dashboard. Não é necessário comprar outro sensor para concluir o TCC.

Em 12/09 foram observadas faixas, falha de eco, recuperação e respostas HTTP 204.
Isso não comprova precisão metrológica ou recuperação sem perda após queda de rede.
Veja [evidências e limites](docs/VALIDACAO_BANCADA_2026-09-12.md).

O buffer em RAM admite até 120 envios pendentes, aproximadamente 20 minutos no
intervalo atual. Lotação descarta o mais antigo; reinício perde pendências.
Sem horário válido no dispositivo, o servidor estima os horários do lote.

Em 13/09 foram publicados os ajustes de dashboard e backend. A última execução
local passou 49 testes. A economia real das consultas indexadas no D1 segue
pendente de medição após a liberação da cota; veja [otimização](docs/OTIMIZACAO_D1.md).

## Executar e manter

- Firmware em uma aba: [instruções](firmware/UMA_ABA.md).
- Credenciais: usar arquivo local ou cópia privada; nunca inserir senhas no Git.
- Testes: Node.js 24, comando `npm test` na raiz.
- Dashboard: arquivos estáticos em `index.html` e `assets/`.
- Backend: `cloudflare-worker/`; workflow aplica migrações antes de publicar.
- Push em `main` pode publicar o site e, ao alterar o backend, o Worker.
- Origem permitida pela API: site GitHub Pages configurado. Servidor local pode
  receber bloqueio de CORS; não abrir permissões de produção apenas para uma prévia.

O núcleo compartilhado gera a distribuição HC-SR04 de uma aba. Sketches de outros
sensores são variantes legadas, não entregas atuais. Não houve regravação da placa
como parte da revisão de documentos.

## Documentação

[Guia mestre](docs/GUIA_MESTRE.md) · [Escopo atual](docs/ESCOPO_ATUAL.md) ·
[Critérios da interface](docs/CRITERIOS_UI_OPERACIONAL.md) ·
[Pendências de bancada](docs/PLANO_REFINAMENTO.md) ·
[Acordo de trabalho](docs/COMO_TRABALHAMOS.md).

Fotografias em `docs/img/` são registros históricos; não comprovam o funcionamento
atual do display. Documentos acadêmicos e guias internos permanecem locais conforme
as exclusões existentes do repositório.

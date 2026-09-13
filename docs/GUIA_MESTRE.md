# Guia Mestre — AquaSense

> Documento único para qualquer pessoa da equipe entender o projeto inteiro, explicá-lo a alguém de
> fora e perceber quando algo está errado. Este guia **consolida** os documentos-fonte listados no
> fim de cada seção — não inventa números nem decisões novas. Onde os documentos-fonte divergem
> entre si, valem os **números oficiais** usados aqui (ver seção 7); as divergências encontradas
> estão registradas explicitamente onde aparecem.

---

## 1. O projeto em 30 segundos, 2 minutos e 10 minutos

### Em 30 segundos (elevator pitch)

> "AquaSense mede automaticamente o nível de água dentro de piezômetros de barragens — hoje isso é
> feito uma vez por semana, à mão, por um técnico caminhando até cada poço. Nosso sistema lê o
> instrumento continuamente, manda o dado pra nuvem em tempo real e registra um alerta escrito
> com destaque visual assim que o nível fica perigoso. Custa uma fração do preço da telemetria industrial e ataca
> exatamente a lacuna que ela não cobre: as milhares de barragens pequenas que hoje não têm nenhuma
> automação."

### Em 2 minutos (resumo executivo)

O AquaSense nasceu como resposta ao desafio SAGA da Samarco Mineração (TCC do SENAI): substituir a
leitura manual terceirizada de piezômetros — que custa cerca de R$ 600 mil/ano e deixa uma "janela
cega" entre leituras — por um sistema de telemetria contínua. Um sensor ligado a um ESP32 lê o
nível d'água, envia para um backend serverless (Cloudflare Worker + banco D1), que grava o
histórico e roda um motor de alertas a cada minuto, registrando eventos persistentes para consulta/auditoria
quando o nível cruza os limiares de atenção (12 m) ou crítico (15 m). Um dashboard web mostra tudo
em tempo real.

O projeto tem **duas camadas que não podem ser confundidas**: o **protótipo de bancada** (ESP32 +
sensor ultrassônico + OLED, alimentado por USB) é a *representação* funcional da arquitetura,
validada de ponta a ponta em 16/07/2026. O **produto** é a especificação da UCT industrial —
Unidade de Controle e Telemetria com transdutor piezorresistivo 4-20 mA, comunicação celular 4G e
energia solar autônoma — ainda não montada fisicamente, apenas especificada em engenharia
(`docs/projeto/PROJETO_INDUSTRIAL.md`). Economicamente, o projeto de referência (50 pontos, R$
260.000 de investimento) se paga em 5,6 meses e devolve quase 11× o capital investido em 5 anos.

### Em 10 minutos (explicação completa)

**O problema.** Piezômetros de barragens são lidos hoje à mão, com um "pio elétrico" descido pelo
tubo por um técnico em campo — uma vez por semana ou menos. Isso custa caro (R$ 600 mil/ano de
leitura terceirizada), deixa uma janela cega entre leituras e expõe pessoas a áreas de risco
geotécnico. Os dois maiores desastres de barragem do Brasil (Fundão-2015, B1-2019) tiveram como
causa apontada linha freática alta sem rebaixamento efetivo e auscultação (monitoramento)
deficiente — o dado existia, mas não virou ação a tempo.

**A física por trás.** Um piezômetro mede poropressão — a pressão da água dentro dos poros do solo.
Pelo princípio de Terzaghi (σ' = σ − u), poropressão alta reduz a resistência do solo; em rejeito
fofo e saturado, isso pode causar liquefação. Por isso nível alto = perigo, sempre.

**A lei.** A Resolução ANM 95/2022 só *obriga* monitoramento automatizado para barragens de Dano
Potencial Associado (DPA) alto. O Brasil tem 28.043 barragens cadastradas e só 6.210 na PNSB — a
imensa maioria fica de fora da obrigação, e é exatamente aí que o AquaSense se posiciona: não como
concorrente do pacote industrial caro, mas como a opção que hoje simplesmente não existe para quem
não pode pagar dezenas de milhares de reais por ponto.

**A solução.** Um ESP32 lê o sensor de nível (mediana de 5 leituras, filtrando ruído), guarda em
buffer se a rede cair (*store & forward*) e envia por HTTPS autenticado para um Cloudflare Worker.
O Worker grava no banco D1, roda um motor de alertas em 3 camadas a cada minuto (nível, comunicação,
taxa de variação) e registra eventos no KV, expostos por `GET /alerts` para consulta e auditoria. Um dashboard web mostra estados em tempo real e eventos locais da sessão, com um
relatório imprimível e exports em CSV/Excel para auditoria. Uma página separada (`alerta.html`)
demonstra, de forma coletiva no auditório da banca, como seria o alerta de Defesa Civil na Zona de
Autossalvamento.

**A economia.** O projeto de referência (50 pontos, R$ 260.000 de investimento) se paga em 5,6
meses e devolve quase 11× o capital em 5 anos — mesmo comparado ao único número histórico aberto de
mercado (IBRACON 2007, ~US$ 1.636–2.370/instrumento), o AquaSense já compete em ordem de grandeza,
décadas depois e sem correção monetária.

**A honestidade.** O projeto separa duas garantias que não podem ser confundidas: a integridade do
dado (que o AquaSense garante por construção de software) e a validade metrológica da medição (que
depende de calibração certificada, fora do escopo de um TCC). O sensor da bancada é um stand-in —
mede coluna d'água como um INA, não poropressão de uma camada selada com bentonita — e isso é dito
com naturalidade, não escondido.

Para os detalhes de cada peça, leia as seções 2 a 12 deste documento na ordem: o problema (§2), o
que é um piezômetro (§3), as leis (§4), cada parte do sistema e como testá-la (§5), o desenho da
arquitetura (§6), os números de custo e retorno (§7), a cadeia de confiança (§8), as limitações
admitidas (§9), o checklist de diagnóstico (§10), o glossário (§11) e o que falta fazer (§12).

**Fontes:** `CLAUDE.md`, `readme.md`, `docs/projeto/BASE_DE_CONHECIMENTO.md` (fio condutor).

---

## 2. O problema

### Como a leitura é feita hoje

O piezômetro de tubo aberto (tipo Casagrande) é lido com um **pio elétrico**: uma sonda presa a uma
fita graduada desce pelo tubo até tocar a água, fechando um circuito que emite um apito. A
profundidade lida na fita vira a cota piezométrica. Para isso, uma equipe técnica precisa se
deslocar até cada poço, um por um — muitas vezes dentro da própria **Zona de Autossalvamento** da
barragem, a área que seria atingida primeiro em caso de ruptura. Na prática, isso é feito **uma vez
por semana ou menos** em operação estabilizada (a frequência sobe quando uma leitura foge do
padrão).

### O que isso custa e arrisca

| Problema | Descrição |
|---|---|
| **Custo** | A empresa gasta hoje **R$ 600.000/ano** com leitura manual terceirizada — deslocamento de equipe, veículo, combustível, encargos e relatório. |
| **Janela cega** | Entre uma leitura semanal e a próxima, um transiente hidráulico rápido (chuva intensa, por exemplo) pode subir e descer sem que ninguém veja — a poropressão pode oscilar em horas, não em semanas. |
| **Risco à equipe** | O técnico precisa caminhar e permanecer periodicamente em áreas de alta periculosidade geotécnica para fazer a leitura manual. |
| **Resposta lenta** | Mesmo quando o dado é ruim, ele só chega ao responsável técnico depois do ciclo de leitura — não em tempo real. |

### O contexto Brasil

O Brasil tem **28.043 barragens cadastradas** no Sistema Nacional de Informações sobre Segurança de
Barragens (SNISB), mas só **6.210 estão enquadradas na Política Nacional de Segurança de Barragens
(PNSB)** — a grande maioria segue sem instrumentação nenhuma ou com leitura manual esporádica. Os
dois desastres que motivam toda a legislação atual de segurança de barragens no Brasil — **Fundão,
em Mariana/MG (2015, 19 mortos)** e **B1, em Brumadinho/MG (2019, 270 mortos)** — tiveram como
mecanismo central a **liquefação**, precedida por linha freática alta sem rebaixamento efetivo e
auscultação (monitoramento) deficiente. A lição repetida nos dois relatórios oficiais é a mesma: a
instrumentação existia, mas não gerou **ação a tempo**.

> **Analogia:** é como ter um sensor de fumaça que só é lido uma vez por semana, por uma pessoa que
> precisa dirigir até a casa para checar. Se o incêndio começa na segunda-feira e a leitura só
> acontece no domingo seguinte, o alarme existe — mas de nada serve.

**Fontes:** `docs/projeto/BASE_DE_CONHECIMENTO.md` (partes 1 e 2), `docs/tcc/TCC_AQUASENSE.md` (§1.2).

---

## 3. O que é um piezômetro

Um piezômetro **não mede "quanto de água tem"** como uma régua num lago. Ele mede a **poropressão**
— a pressão que a água exerce dentro dos poros (vazios) do solo, num ponto específico do maciço.

> **Analogia:** pense numa esponja encharcada segurando um peso em cima. Enquanto a água consegue
> escoar aos poucos, o peso fica apoiado firme nos "grãos" da esponja. Se a água entra mais rápido
> do que consegue escoar, ela se acumula sob pressão dentro dos poros e passa a segurar parte do
> peso sozinha — a esponja (o solo) perde o apoio firme entre seus próprios grãos, mesmo que por
> fora nada pareça diferente. O piezômetro é o instrumento que avisa quanto dessa "água segurando o
> peso" existe, ponto a ponto, dentro do maciço.

### Por que nível alto = perigo

Pelo **princípio das tensões efetivas de Terzaghi**:

```
σ' = σ − u
```

- **σ** (tensão total): peso do solo, da água e de cargas acima do ponto.
- **u** (poropressão): a pressão da água nos poros — o que o piezômetro mede.
- **σ'** (tensão efetiva): a parcela transmitida grão a grão, responsável pela resistência do solo.

Se a tensão total σ fica constante mas a poropressão **u sobe**, a tensão efetiva **σ' cai** — e com
ela a resistência do solo. Em materiais fofos, saturados e mal drenados (típico de rejeito de
mineração), esse mecanismo pode levar à **liquefação**: o material perde a resistência e passa a se
comportar como um líquido denso. É exatamente o que aconteceu em Fundão e B1. Por isso: **nível
d'água alto no piezômetro = perigo**, nunca o contrário.

### Tipos de piezômetro (resumo)

| Tipo | Como mede | Uso |
|---|---|---|
| **Casagrande** (tubo aberto) | Água sobe no tubo até a cota da carga piezométrica; leitura manual com pio elétrico | Padrão de instalação e referência dos demais |
| **Corda vibrante** | Diafragma deforma sob pressão; frequência de vibração do fio varia com a pressão | Padrão de mercado para automação de barragens |
| Pneumático, hidráulico, resistivo, fibra óptica | Ver `BASE_DE_CONHECIMENTO.md` §1.3 | Nichos e legado |

### Piezômetro × INA — cuidado de terminologia

| | Piezômetro | INA (Indicador de Nível d'Água) |
|---|---|---|
| Filtro | Curto, **selado com bentonita** — isola uma camada específica | Longo, sem selo |
| Mede | Poropressão **daquela camada exata** | Nível freático geral (lençol livre) |

Confundir os dois é a crítica mais fácil que uma banca pode fazer. O protótipo do AquaSense, que
mede coluna d'água, se aproxima mais tecnicamente de um INA do que de um piezômetro Casagrande — a
eletrônica e a lógica de alerta são idênticas para os dois; o que muda é o **sensor e a instalação**
(bulbo selado com bentonita vs. tubo aberto).

### A conta: de pressão para metros de coluna d'água

```
u = γw × h
```

Onde **γw** (peso específico da água) = **9,807 kPa por metro de coluna d'água**, e **h** é a altura
da coluna. Exemplo numérico: uma coluna de 1,5 m de água gera uma poropressão de

```
u = 9,807 kPa/m × 1,5 m ≈ 14,71 kPa
```

É essa conversão que permite expressar a leitura tanto em unidade de pressão (kPa) quanto em "metros
de nível" — a forma que o dashboard do AquaSense usa, por ser mais intuitiva para quem lê o alerta.

**Fontes:** `docs/projeto/BASE_DE_CONHECIMENTO.md` (§1.1–1.3), `docs/prototipo/PREPARACAO_BANCA.md` (item b).

---

## 4. Leis e normas

| Norma | O que exige (resumo) | O que isso significa pro projeto |
|---|---|---|
| **Lei 12.334/2010** (PNSB original) | Cria a Política Nacional de Segurança de Barragens: classificação por CRI × DPA, exigência de Plano de Segurança da Barragem (PSB) e o cadastro SNISB. | É a lei-base que define o universo de barragens "enquadradas" (6.210 de 28.043) — o recorte que separa quem tem obrigação legal de quem fica de fora e é o nosso público-alvo. |
| **Lei 14.066/2020** (PNSB, pós-Brumadinho) | Proíbe o método construtivo "a montante"; exige mapa de inundação e Plano de Segurança da Barragem (PSB) operacional; multas de R$ 2 mil a R$ 1 bilhão. | É a lei que empurrou o setor inteiro para automação e planos de emergência — o pano de fundo regulatório que dá relevância ao projeto. |
| **Resolução ANM 95/2022** | Consolida a exigência de **monitoramento automatizado em tempo real e período integral, com redundância de energia**, mas só para barragens de **DPA (Dano Potencial Associado) alto**, com Centro de Monitoramento dedicado. | Define exatamente o público que o AquaSense **não** tenta atender (DPA alto, já servido pelo mercado industrial) e por exclusão define o nosso público-alvo: tudo que fica fora dessa obrigação. |
| **PAEBM e ZAS** | O Plano de Ação de Emergência para Barragens de Mineração define a **Zona de Autossalvamento (ZAS)** — a área que deve ser evacuada em até ~30 min/~10 km em caso de ruptura, com sirenes sob responsabilidade do empreendedor. | A página `alerta.html` do projeto simula esse conceito de forma didática: cada celular da plateia calcula sua posição dentro de um raio de 10 km da "barragem" e dispara alerta sonoro/visual quando o nível cruza o crítico. O sistema **não declara** Níveis de Emergência (NE1/NE2/NE3) — isso é decisão humana do responsável técnico; o sistema só fornece o dado. |
| **ISA-101 (interfaces de operação)** | Hierarquia, contexto e uso consistente de cores orientam a compreensão pelo operador. Não se adota percentual neutro como exigência universal. | Referência de projeto; ver [critérios e limites](CRITERIOS_UI_OPERACIONAL.md). |
| **ISA-18.2 (gestão de alarmes)** | Gestão de alarmes envolve ação definida e ciclo de vida. Taxas de alarme dependem do contexto e não são tratadas aqui como limite normativo universal. | Separação de condições, ocorrências e eventos; não constitui implementação completa da norma. |

**Fontes:** `docs/projeto/BASE_DE_CONHECIMENTO.md` (§2.3, §1.5–1.6), `docs/projeto/MAPEAMENTO_DEMANDA_E_MERCADO.md` (§2.4–2.5), `docs/projeto/DASHBOARD_PROFISSIONAL.md` (§5), `docs/prototipo/ALERTA_POPULACAO.md`.

---

## 5. Nossa solução, parte por parte

Para cada bloco: o que é, como funciona, e — o mais importante para o dia a dia da equipe — **como
saber se está funcionando**.

### (a) Sensor + ESP32

**O que é:** o microcontrolador (ESP32) que lê o sensor de nível e sinaliza localmente. No protótipo
de bancada, o sensor é um ultrassônico JSN-SR04T (mede de cima, "stand-in" de piezômetro); na
simulação Wokwi, é um BMP180 barométrico com escala didática (10 hPa = 1 m).

**Como funciona:** cada leitura é a **mediana de 5 medições** espaçadas de 30 ms, descartando ecos
fora da faixa útil (< 25 cm ou > 450 cm) — mais robusto a ruído que uma leitura única. Uma leitura
sem eco válido é marcada `valida=false` e **não é enviada** ao backend (a falha do sensor nunca
entra disfarçada de dado bom). O display OLED mostra o valor atual e o estado da rede; LEDs
verde/amarelo/vermelho e um buzzer sinalizam a faixa localmente, mesmo sem olhar o dashboard.

**Como saber se está funcionando:** o OLED mostra o nível e o ícone de WiFi conectado; no Serial
Monitor (115200 baud), cada ciclo imprime a leitura bruta e a mediana calculada; o LED correspondente
à faixa atual deve estar aceso (verde/amarelo/vermelho).

### (b) Store & forward

**O que é:** um buffer local que retém leituras feitas sem rede, para reenviar quando a conexão
volta — sem perder dado.

**Como funciona:** cada leitura carrega um timestamp sincronizado por NTP. Se a rede WiFi cai, as
leituras continuam sendo coletadas e ficam guardadas em um buffer local (até ~120 leituras no modo
sempre-ligado); quando a conexão volta, o dispositivo reenvia tudo de uma vez, preservando o
timestamp **original** da medição (não o do reenvio). O servidor faz **dedupe** por índice único
`(piezometro, ts)` — se a confirmação HTTP de um envio se perder e o firmware reenviar por segurança,
a linha duplicada é ignorada (`INSERT OR IGNORE`), nunca duplicada no histórico.

**Como saber se está funcionando:** desligue o WiFi do roteador por alguns minutos; o Serial Monitor
deve mostrar as leituras se acumulando no buffer; ao religar, todas devem chegar ao servidor de uma
vez, sem lacuna no gráfico do dashboard.

### (c) Transporte

**O que é:** o caminho HTTPS entre o ESP32 e o backend, autenticado por chave.

**Como funciona:** o ESP32 posta as leituras em `POST /ingest`, sempre via **HTTPS** (o Cloudflare
Worker só serve HTTPS), autenticando com a `DEVICE_KEY` no header `x-device-key`. A autenticação é
**fail-closed**: se a secret não estiver configurada no Worker, `/ingest` responde `503` e nada
entra — nunca "pula" a checagem por segurança. Chave incorreta responde `401`. O corpo da requisição
também é validado: `nivel_agua` precisa ser número finito, e `piezometro` (quando presente) precisa
casar com o formato `PZ-NN`.

**Como saber se está funcionando:** uma leitura com chave errada deve retornar `401`; sem nenhuma
`DEVICE_KEY` configurada, `503`; um envio válido retorna `204` sem corpo.

### (d) Backend — Cloudflare Worker + D1 + KV

**O que é:** o "cérebro" do sistema: recebe as leituras, grava no banco, roda o motor de alertas e
serve os dados para o dashboard. Publicado em `https://piezometro-worker.willianloopes123.workers.dev`.

**Como funciona:** o Worker roda em 8 módulos (`index.js` roteador, `config`, `http`, `db`,
`alertas`, `eventos`, `retencao`, `rotas`), gravando cada leitura no banco **D1** (SQLite gerenciado). Um
**Cron Trigger** roda a cada 1 minuto e executa o motor de alertas em **3 camadas independentes**:

| Camada | O que verifica | Registra quando |
|---|---|---|
| **Nível** | Faixa do último valor de cada piezômetro (com histerese na descida) | Muda de faixa (Normal→Atenção→Crítico), com repetição do Crítico a cada `ALERT_REPEAT_MIN` |
| **Comunicação** | Se um piezômetro cadastrado parou de enviar dado | Silêncio > `SILENCE_ALERT_SEC` — "instrumento silencioso" **nunca** conta como normal |
| **Taxa (m/dia)** | Velocidade de subida/descida do nível | Taxa acima de `TAXA_MAX_M_DIA`, mesmo dentro da faixa "normal" — referência: piezômetro subindo > 0,1 m/dia já é gatilho de investigação (ASDSO) |

O estado de alertas (última faixa registrada, contadores) fica no **Workers KV**, gravado **só
quando muda** — não a cada ciclo — para respeitar o limite gratuito de 1.000 escritas/dia. As
os eventos persistentes ficam disponíveis em `GET /alerts` para consulta e auditoria. O dashboard atual não carrega esse histórico após reload; ele mostra estados ao vivo e eventos locais da sessão. LEDs e buzzer mantêm a sinalização local no protótipo físico.

**Como saber se está funcionando:** `GET /health` deve retornar `{"status":"ok", ...}`; `GET
/ultimos` deve trazer a leitura mais recente de cada piezômetro com `ts` e `recebido_em` atuais;
`GET /alerts` mostra o histórico de eventos e o estado de comunicação/taxa por instrumento.

**Retenção de dados (histórico "infinito" sem estourar o banco):** uma vez por dia, o mesmo
`scheduled()` que roda o motor de alertas também consolida leituras mais antigas que
`RETENCAO_DIAS` em 1 linha/dia/piezômetro (média, mínimo, máximo e contagem) na tabela
`leituras_diario`, e apaga as leituras brutas já consolidadas da tabela `leituras` — o histórico
recente fica bruto (alta resolução) e o antigo fica resumido (baixo volume), sem crescer sem
limite dentro do free tier do D1.

### (e) Dashboard — plano de melhorias P1-P6

**O que é:** o painel web (`index.html`, GitHub Pages) que mostra o estado de cada piezômetro em
tempo real, com histórico e eventos.

**Como funciona (cada melhoria já implementada):**

| # | Melhoria | O que muda |
|---|---|---|
| **P1** | Estado "SEM SINAL" honesto | Card fica cinza-hachurado com "última leitura há X min" quando passa a janela de silêncio; leitura ausente **nunca** aparece como "normal" |
| **P2** | Taxa de variação (m/dia) | Derivada exibida por instrumento, mesmo dentro da faixa normal |
| **P3** | Alarmes vs. eventos separados | Duas listas: alarmes exigem ação; eventos são só informativos |
| **P4** | Pico junto da média | O gráfico mostra a média do intervalo **e** o máximo — a média nunca mascara um pico perigoso |
| **P5** | Sobriedade ISA-101 | Cards normais neutros (sem verde decorativo); cor + texto sempre juntos (daltonismo) |
| **P6** | Poropressão calculada e rotulada | O nível também é exibido convertido em pressão (kPa), deixando claro que é um valor **derivado**, não medido diretamente |

**Como saber se está funcionando:** nenhum card deve mostrar "Normal" para um instrumento sem dado
recente; o gráfico deve ter o pico visível mesmo quando a média está baixa; um banner amarelo de
simulação deve aparecer sempre que a fonte ativa for `FonteSimulada` — nunca misturado com dado real.

### (f) Relatório imprimível e exports com auditoria

**O que é:** três formas de tirar o dado do dashboard para análise ou evidência formal:
`relatorio.html` (página imprimível/PDF via navegador, com gráfico, tabela e bloco de auditoria),
exportação CSV (`assets/js/exportar.js`) e Excel formatado (`assets/js/exportar_xls.js`).

**Como funciona:** os três compartilham a mesma função de coleta de linhas
(`coletarLinhasExportacao`), garantindo que o **status de cada intervalo é sempre calculado pelo
pico**, nunca pela média — a mesma regra do dashboard (P4). Cada exportação carrega metadados de
auditoria: instrumento, período, intervalo de agregação, data de geração, se a fonte era real ou
simulada, e os limiares vigentes no momento da exportação.

**Como saber se está funcionando:** o cabeçalho do CSV/Excel deve trazer o bloco de metadados antes
da tabela de dados; se a fonte era simulação, isso deve aparecer explicitamente no arquivo exportado,
nunca escondido.

### (g) Página Alerta à População

**O que é:** `alerta.html`, uma página standalone que qualquer pessoa da plateia abre no próprio
celular via QR code, simulando o alerta que a Defesa Civil dispararia na ZAS.

**Como funciona:** cada celular consulta `GET /ultimos` a cada 5 s (a mesma API do dashboard) e
decide seu próprio estado — não existe um servidor central de "broadcast"; o sincronismo vem de
todos apontarem para a mesma fonte de dados no mesmo ritmo. Ao cruzar o nível crítico, todos os
celulares ativados tocam sirene, vibram (Android) e piscam vermelho ao mesmo tempo. Um banner preto
fixo — "⚠️ DEMONSTRAÇÃO ACADÊMICA — Nenhum alerta real" — evita qualquer confusão com um alerta de
verdade.

**Como saber se está funcionando:** o botão "🔔 ATIVAR ALERTA" deve mostrar "🟢 Monitoramento ativo"
com o nível atual antes de qualquer alerta disparar.

### (h) Firmware modular (core + adapters + interface Tela)

**O que é:** a organização do código do ESP32 que permite trocar sensor ou display sem reescrever o
resto.

**Como funciona:** `piezometro_core.h` concentra WiFi, NTP, buffer e envio — comum a todos os
cenários. Cada arquivo `sketch_*.ino` implementa só a leitura do seu sensor específico (adapter),
devolvendo sempre o mesmo contrato de saída (`nivel_agua`, `pressao`, `temperatura`, `piezometro`).
A tela fica atrás da interface `Tela` (`tela.h`), com o OLED SSD1306 como implementação concreta —
trocar por um TFT não toca no core nem nos sketches. É esse desenho que permite que o mesmo software
sirva tanto o BMP180 de simulação quanto o JSN-SR04T da bancada física quanto, no futuro, o
transdutor 4-20 mA industrial: só o adapter muda.

**Como saber se está funcionando:** o `lerSensor()` de qualquer adapter deve devolver os mesmos
quatro campos, independente do sensor por trás.

**Fontes:** `CLAUDE.md`, `readme.md`, `docs/projeto/CADEIA_DE_CONFIANCA.md` (§2), `docs/projeto/DASHBOARD_PROFISSIONAL.md` (§6), `docs/prototipo/ALERTA_POPULACAO.md`, `cloudflare-worker/src/rotas.js`, `cloudflare-worker/src/alertas.js`, `assets/js/exportar.js`, `assets/js/relatorio.js`.

---

## 6. Arquitetura em um desenho

```
┌──────────────────────┐
│ ESP32 + sensor        │   (bancada física com OLED, ou simulação Wokwi)
│ mediana de 5 leituras  │
└────────┬───────────────┘
         │  POST /ingest (JSON, header x-device-key)
         │  store & forward se a rede cair
┌────────▼──────────────────┐      ┌──────────────┐
│   Cloudflare Worker         │
│   ingest · /ultimos · /dados│
│   cron 1 min: registro de    │
│   alertas (nível/comunicação/│
│   taxa) · estado no KV      │
└─────┬──────────────┬────────┘
      │              │
  INSERT (D1)   GET /ultimos, /dados, /alerts, /config, /health
      │              │
┌─────▼────────┐ ┌───▼──────────────────────────┐
│ Cloudflare D1 │ │   GitHub Pages                 │
│ (SQLite)      │ │   index.html (dashboard)       │
│               │ │   alerta.html (Alerta ZAS)     │
│               │ │   relatorio.html (imprimível)  │
└───────────────┘ └────────────────────────────────┘
```

### Cada peça e seu papel

| Peça | Papel |
|---|---|
| **ESP32 + sensor** | Coleta a leitura, filtra ruído (mediana), sinaliza localmente (LED/buzzer/OLED), guarda em buffer se a rede cair |
| **Cloudflare Worker** | Único ponto de escrita no banco — o ESP32 nunca fala direto com o D1; autentica, valida e grava |
| **Cloudflare D1** | Histórico persistente (SQLite gerenciado), com índice único que impede duplicata |
| **Cloudflare KV** | Memória do motor de alertas entre execuções do cron (última faixa registrada por instrumento) |
| **Cron Trigger (1 min)** | Roda o motor de alertas 24/7, sem depender de nenhum ping externo — o Worker não hiberna |
| **Dashboard** | Exibe estados ao vivo e eventos locais da sessão; ausência de leitura aparece como **SEM SINAL**. Não hidrata `GET /alerts` após reload |
| **GitHub Pages** | Hospeda o dashboard, a página de Alerta à População e o relatório imprimível — só leem a API, nunca escrevem |

**Por que o Worker no meio, e não o ESP32 falando direto com o banco?** Porque nenhum segredo de
banco fica exposto no firmware nem no HTML público — todos os segredos ficam em *secrets* do
Cloudflare, fora do repositório e fora do dispositivo de campo.

**Fontes:** `CLAUDE.md`, `readme.md` (seção Arquitetura do Sistema).

---

## 7. Custos e viabilidade

> Estes são os **números oficiais** do projeto — únicos usados em qualquer comparação ou cálculo
> deste guia. Eles se referem à **UCT industrial** (produto especificado), não ao protótipo de
> bancada, que custa apenas R$ 150–220/ponto e não entra nesta conta (ver nota de escopo em
> `VIABILIDADE_ECONOMICA.md` §0).

### O que custa montar

| Item | Valor |
|---|---|
| Hardware por UCT (varejo pesquisado) | R$ 1.804 |
| Hardware por UCT (referência oficial, com margem de fabricação em série) | **R$ 2.965** |
| Investimento total (50 pontos) | **R$ 260.000** |
| Custo por ponto **instalado** (hardware + instalação + sobressalentes + bancada + contingência) | **R$ 5.200** |

### O que custa operar

| Item | Valor anual |
|---|---|
| OPEX total (50 pontos) | **R$ 39.155/ano** |
| OPEX por ponto | **R$ 783/ponto/ano** |

### Quanto se economiza

| Indicador | Valor |
|---|---|
| Gasto atual da empresa com leitura manual terceirizada | **R$ 600.000/ano** (≈ R$ 58/leitura, ~100 piezômetros lidos 2×/semana) |
| Economia líquida (a partir do ano 2) | **R$ 560.845/ano** — redução de **93,5%** |
| Economia líquida no ano 1 (já descontado o CAPEX) | **R$ 300.845** |
| **Payback** | **5,6 meses** |
| **ROI ano 1** | **116%** (cada R$ 1 investido volta R$ 2,16) |
| **ROI acumulado em 5 anos** | **978%** (cada R$ 1 investido volta quase R$ 11) |

### Comparação com o mercado

O mercado de telemetria geotécnica profissional (corda vibrante + datalogger + rede dedicada —
Geokon, Sisgeo, Worldsensing, Ackcio, Encardio-rite, RST, Canary Systems) é vendido **"sob
consulta"**: nenhum dos 8 fabricantes pesquisados publica preço. A única referência aberta de custo
de automação por instrumento encontrada em toda a pesquisa é um artigo técnico de **2007** (IBRACON,
sensores triortogonais, não piezômetro): **US$ 1.636 a US$ 2.370 por instrumento**. Mesmo sem
correção monetária de quase 20 anos, o custo do ponto instalado da UCT (R$ 5.200 ≈ pouco mais de
US$ 1.000) já compete nessa faixa histórica.

O nicho do AquaSense **não é competir com essa camada** (DPA alto, já atendida) — é a camada que
hoje é **lida à mão** porque não tem orçamento para o pacote industrial: pequenas barragens de água
(28.043 cadastradas, só 6.210 na PNSB), aterros sanitários (~700 unidades, obrigação legal já
vigente) e encostas urbanas monitoradas por defesa civil.

### E se as premissas forem mais pessimistas?

Os R$ 600 mil/ano de economia bruta são o número declarado pela Samarco no edital, aplicado
integralmente aos 50 pontos do projeto de referência (a leitura mais defensável entre duas
possíveis — ver `VIABILIDADE_ECONOMICA.md` §4.1). Dois testes de estresse mostram que a conclusão
de payback rápido não depende de tudo dar certo ao mesmo tempo: se a economia bruta fosse a metade
(R$ 300 mil/ano), o payback ainda ficaria em ~12 meses; se o CAPEX dobrasse (R$ 520.000, mantendo a
economia de R$ 600 mil/ano), o payback também ficaria em ~11 meses. Só quando os dois pessimismos
se somam ao mesmo tempo o payback ultrapassaria 1 ano — cenário que a análise não trata como
central por exigir dois desvios simultâneos das premissas de referência.

**Fontes:** `docs/projeto/VIABILIDADE_ECONOMICA.md` (todas as seções, especialmente §5), `docs/projeto/PROJETO_INDUSTRIAL.md` (§1.3, §6), `docs/tcc/TCC_AQUASENSE.md` (§1.3.6).

---

## 8. Cadeia de confiança (a resposta à pergunta dos professores)

A pergunta "quem garante que o monitoramento é válido?" mistura duas perguntas diferentes que
**não podem ser confundidas**:

| Pergunta | O que significa | Quem garante |
|---|---|---|
| **Integridade** | O dashboard mostra fielmente o que foi medido? (nada se perde, corrompe ou disfarça entre o sensor e a tela) | O AquaSense, **por construção de software** |
| **Validade metrológica** | A medição em si é verdadeira, dentro de uma incerteza conhecida? | Depende de calibração contra referência certificada |

### O que garantimos por construção (elo a elo)

| Elo | Proteção |
|---|---|
| Sensor | Mediana de 5 leituras; eco inválido descartado, nunca enviado disfarçado de dado bom |
| Transporte | `DEVICE_KEY` fail-closed (sem secret configurada, `/ingest` responde 503); TLS ponta a ponta; payload validado (`nivel_agua` numérico, `piezometro` no formato `PZ-NN`) |
| Armazenamento | Índice único `(piezometro, ts)` + `INSERT OR IGNORE` impede duplicata do reenvio; `ts` (hora da medição) e `recebido_em` (hora do servidor) desacoplados; API é append-only na prática (não existe rota de edição/exclusão) |
| Exibição | Dado velho nunca aparece como "normal" (estado "SEM SINAL" calculado por `recebido_em`); dado simulado sempre sinalizado por banner visível |

Cada linha é uma decisão de arquitetura: na dúvida, **não mostrar como bom** — descartar, marcar
como inválido, ou exibir estado neutro, nunca inventar ou disfarçar um valor.

### O que depende de calibração (fora do escopo do software)

- **Calibração rastreável por laboratório acreditado (RBC/Inmetro)** — o protótipo usa régua/trena
  como referência, não um padrão acreditado; é a "verdade terrestre" que um TCC não substitui.
- **Autenticação por chave compartilhada** — a `DEVICE_KEY` prova "alguém com a chave enviou", não
  "esta leitura específica não foi alterada em trânsito" com garantia criptográfica por mensagem.
- **Redundância** de energia e de armazenamento fora do D1 gerenciado.

### Quem garante no mundo real

O sistema **não substitui** a cadeia institucional de segurança de barragens — ele a **alimenta com
dados melhores**: o **projetista geotécnico** define os limiares por instrumento (por isso
`NIVEL_ATENCAO`/`NIVEL_CRITICO` são parametrizáveis, nunca fixos), o **engenheiro responsável**
decide e documenta a operação, e a **ANM** fiscaliza o cumprimento regulatório.

### Frase pronta para a banca

> "Este projeto separa duas garantias que costumam ser confundidas: a integridade do dado — que o
> número exibido é exatamente o que o sensor mediu, sem perda, duplicação ou disfarce — e a validade
> metrológica da medição — que esse número corresponde à realidade física dentro de uma incerteza
> conhecida. A primeira garantimos por construção. A segunda depende de calibração; validamos o
> sensor da maquete contra uma referência de régua em bancada, mas uma validação de produção exigiria
> instrumento certificado por laboratório acreditado RBC/Inmetro. Por isso este sistema não se propõe
> a substituir a cadeia institucional de segurança de barragens — e sim a alimentá-la com dados
> contínuos, auditáveis e mais baratos do que a medição manual terceirizada."

**Fontes:** `docs/projeto/CADEIA_DE_CONFIANCA.md` (integral).

---

## 9. Limitações honestas e "pegadinhas" de defesa

**Regra de ouro do projeto: nomear as limitações antes que a banca as descubra.**

| Limitação admitida | Detalhe |
|---|---|
| Sensor stand-in | O sensor da bancada (ultrassônico/BMP180) mede coluna d'água, mais próximo de um INA do que de um piezômetro de corda vibrante — mas a eletrônica/lógica de alerta é idêntica; troca-se via o contrato de adapter |
| Sem redundância de energia | A maquete depende de USB/rede, sem bateria/solar de backup — não atende ao exigido pela ANM 95/2022 para DPA alto (que não é o público-alvo do produto) |
| Autenticação por chave compartilhada | `DEVICE_KEY` prova origem, não integridade criptográfica por mensagem |
| Escala didática | O tubo/balde da bancada não reproduz poropressão real em solo saturado |

### Perguntas prováveis e respostas prontas

| Pergunta | Resposta curta |
|---|---|
| "Isso já existe no mercado?" | Existe para DPA alto, a preço sob consulta. Para a camada de baixo (28 mil barragens, ~700 aterros, encostas urbanas) não existe oferta viável — é o vácuo que o projeto ocupa. |
| "Por que não LoRa/satélite?" | Wokwi não simula LoRa; o protótipo usa WiFi por limitação do simulador. Na UCT industrial, a via principal é celular 4G (SIM7600), com LoRaWAN como alternativa quando já existir gateway próximo. |
| "E onde não tem sinal celular?" | *Store & forward* retém a leitura localmente e reenvia quando a conexão volta — não há perda por queda de **rede**. Falta de **energia** é um problema diferente (ver §5b vs. `ALIMENTACAO_ENERGIA.md`) e ainda não tem backup na bancada. |
| "Quem garante a medição?" | Ver §8 — integridade é garantida por construção; validade metrológica depende de calibração RBC/Inmetro, fora do escopo de um TCC. |
| "Esse sensor ultrassônico não é um piezômetro." | Correto — mede nível como um INA. É um stand-in porque o firmware isola o sensor num adapter; a Fase 2 troca por um transdutor 4-20 mA sem tocar no resto do sistema. |
| "A norma exige redundância de energia. Vocês têm?" | Não — e está declarado como limitação. A exigência vale só para DPA alto, que não é o público-alvo. O caminho (bateria + solar + celular como segunda via) está mapeado e dimensionado em `ALIMENTACAO_ENERGIA.md`. |
| "Um backend gratuito é confiável para algo tão crítico?" | A v1 (Render + InfluxDB) hibernava e expirava retenção — por isso foi trocada pela v2 (Cloudflare Worker + D1), que não hiberna. O free tier tem folga larga para o volume do protótipo; o caminho de produção é o plano pago (US$ 5/mês). |
| "Por que os limites do free tier não vão pegar o projeto de surpresa?" | O volume do protótipo (poucos pontos, leitura a cada 10 s) fica muito abaixo dos limites gratuitos de D1 (5 milhões de leituras/100 mil escritas por dia) e de Workers (100 mil requisições/dia); o único limite apertado é o KV (1.000 escritas/dia), já resolvido gravando só quando o estado muda de faixa, não a cada ciclo do cron. |
| "Isso é piezômetro ou INA, afinal?" | Hoje é mais próximo de um INA (mede coluna d'água). A eletrônica e a lógica de alerta são idênticas para os dois casos; o que muda é só o sensor e a instalação — ver §3 e o contrato de adapter em §5h. |

### O que o protótipo NÃO tenta ser (posicionamento)

Para evitar qualquer ambiguidade na apresentação: o protótipo de bancada nunca deve ser descrito
como "a UCT industrial montada" — ele é a prova de conceito da arquitetura de software. A energia
solar, o gabinete IP66, o transdutor 4-20 mA e o módulo celular 4G **só existem na especificação da
UCT** (`PROJETO_INDUSTRIAL.md`), não como hardware físico montado nesta entrega. Afirmar o contrário
para a banca seria alegar uma montagem que não aconteceu.

**Fontes:** `docs/prototipo/DEFESA_BANCA.md`, `docs/prototipo/PREPARACAO_BANCA.md` (itens b–e), `docs/projeto/ALIMENTACAO_ENERGIA.md` (§6).

---

## 10. Como detectar que algo está errado

| Onde olhar | O que verificar |
|---|---|
| **Dashboard** | Card cinza-hachurado "SEM SINAL" com "última leitura há X min"? Banner amarelo de simulação ligado quando deveria estar mostrando dado real (ou vice-versa)? Gráfico com pico visível junto da média, nunca só a média? |
| **Serial do ESP32** (115200 baud) | Leituras sendo impressas a cada ciclo? Buffer de store & forward crescendo quando a rede cai? Erros de conexão WiFi ou de resposta HTTP do `/ingest`? |
| **`GET /health` do Worker** | Deve responder `{"status":"ok", ...}` com `db: "D1"` — se não responder, o Worker está fora do ar ou mal configurado |
| **Dashboard** | Estados ao vivo e eventos locais da sessão? Estado **SEM SINAL** quando um ponto para de reportar? |

### Sintoma → causa provável → onde verificar

| Sintoma | Causa provável | Onde verificar |
|---|---|---|
| Card sempre "SEM SINAL" | Dispositivo sem energia/rede, ou `DEVICE_KEY` incorreta bloqueando o `/ingest` | Serial do ESP32 (erro de conexão?); `POST /ingest` retorna `401`? |
| Dashboard mostrando dado simulado sem avisar | `FonteApi` falhou silenciosamente e caiu para `FonteSimulada` sem o banner atualizar | Console do navegador; `assets/js/fontes.js` |
| Evento de alerta não aparece | Cron não está rodando ou não há leitura recente | `GET /alerts`; `wrangler dev --test-scheduled` |
| Leituras duplicadas no histórico | Não deveria acontecer — índice único bloqueia; se acontecer, é bug no dedupe | `cloudflare-worker/src/db.js` (`inserirLeituras`) |
| Nível "trava" numa faixa mesmo descendo | Comportamento esperado — histerese (P4/ISA-18.2): só desce de faixa com folga abaixo do limiar | `cloudflare-worker/src/alertas.js` (`classifyComHisterese`) |
| `POST /ingest` retorna `503` | `DEVICE_KEY` (ou `DEVICE_KEYS`) não configurada no Worker — fail-closed por desenho, não é bug | `wrangler secret put DEVICE_KEY` |
| `POST /ingest` retorna `400` | `nivel_agua` não é número finito, ou `piezometro` fora do formato `PZ-NN` | Payload enviado pelo firmware |

**Fontes:** `docs/projeto/CADEIA_DE_CONFIANCA.md` (§2), `docs/projeto/DASHBOARD_PROFISSIONAL.md` (§2), `cloudflare-worker/src/rotas.js`, `cloudflare-worker/src/alertas.js`.

---

## 11. Glossário

| Termo | Significado em 1 linha |
|---|---|
| **Poropressão (u)** | Pressão da água nos poros do solo — o que um piezômetro realmente mede |
| **Carga piezométrica** | A mesma poropressão, convertida em altura de coluna d'água equivalente (metros) |
| **Tensão efetiva (σ')** | Parcela da tensão transmitida grão a grão no solo; σ' = σ − u |
| **Liquefação** | Solo saturado e fofo que perde subitamente resistência e passa a se comportar como líquido |
| **INA** | Indicador de Nível d'Água — mede o lençol freático geral, diferente do piezômetro (camada específica) |
| **DPA** | Dano Potencial Associado — o que aconteceria a jusante se a barragem rompesse |
| **CRI** | Categoria de Risco — estado técnico da barragem |
| **PNSB** | Política Nacional de Segurança de Barragens (Lei 12.334/2010) |
| **PAEBM** | Plano de Ação de Emergência para Barragens de Mineração |
| **ZAS** | Zona de Autossalvamento — área de evacuação em até ~30 min/~10 km em caso de ruptura |
| **NE1/NE2/NE3** | Níveis de Emergência do PAEBM — declaração humana, o sistema não os declara |
| **Store & forward** | Buffer local que retém leituras sem rede e reenvia quando a conexão volta |
| **Fail-closed** | Em caso de falha/ausência de configuração de segurança, o sistema bloqueia por padrão (nunca libera por omissão) |
| **Histerese (deadband)** | Faixa de folga que evita "chattering" (repique) de alarme perto de um limiar |
| **NAMUR (NE 43)** | Padrão que define faixas de corrente de loop 4-20 mA como falha detectável (fora de 4-20 mA = erro elétrico) |
| **DEVICE_KEY / DEVICE_KEYS** | Chave secreta que autentica o dispositivo no `/ingest`; `DEVICE_KEYS` é o modo por-dispositivo (uma chave por piezômetro) |
| **Cron (cron trigger)** | Gatilho de tempo do Cloudflare Worker que roda o motor de alertas a cada minuto, sem depender de ping externo |
| **D1** | Banco de dados SQLite gerenciado da Cloudflare — armazena o histórico de leituras |
| **KV (Workers KV)** | Armazenamento chave-valor da Cloudflare — guarda o estado do motor de alertas entre execuções |
| **ADS1115** | Conversor analógico-digital externo de 16 bits, usado para ler o loop 4-20 mA com mais resolução que o ADC interno do ESP32 |
| **Loop 4-20 mA** | Padrão industrial de transmissão de sinal analógico por corrente, imune a ruído em cabos longos |
| **Bentonita** | Argila expansiva usada para selar o bulbo do piezômetro, isolando a camada de solo que ele mede |
| **Corda vibrante (vibrating wire)** | Tipo de sensor onde um fio tensionado muda a frequência de vibração conforme a pressão — padrão de mercado para automação de piezômetros |
| **Casagrande** | Tipo de piezômetro de tubo aberto com bulbo filtrante selado com bentonita; leitura manual com pio elétrico |
| **CAPEX** | Capital Expenditure — investimento único (ex.: os R$ 260.000 de hardware/instalação dos 50 pontos) |
| **OPEX** | Operational Expenditure — custo recorrente de operação (ex.: os R$ 39.155/ano de chip 4G, nuvem, manutenção e inspeção) |
| **UCT** | Unidade de Controle e Telemetria — o nome de engenharia da unidade de campo industrial especificada (não o protótipo de bancada) |
| **SIGBM/CNBM** | Sistema Integrado de Gestão de Barragens de Mineração / Cadastro Nacional de Barragens de Mineração — cadastro e painel público da ANM |

**Fontes:** consolidado de todos os documentos-fonte listados na seção 12 abaixo.

---

## 12. Estado atual e próximos passos

### O que está pronto e validado (18/07/2026)

- ✅ Plataforma em produção: Worker + D1 + KV no ar, dashboard publicado, eventos persistentes disponíveis para consulta/auditoria
  ativos, deploy automático no merge da `main`.
- ✅ Protótipo físico de bancada **validado ponta a ponta** (16/07/2026): ESP32 + sensor
  ultrassônico + OLED lendo nível real, dashboard atualizando ao vivo, *store & forward* comprovado
  (leituras seguradas sem rede, zero perda).
- ✅ Dashboard refinado com o plano de melhorias P1-P6 (SEM SINAL honesto, taxa de variação, pico
  junto da média, sobriedade ISA-101).
- ✅ Página Alerta à População (`alerta.html`) funcional, com QR code para demonstração coletiva.
- ✅ TCC oficial gerado a partir de `docs/tcc/TCC_AQUASENSE.md`, sobre o template INTEGRA SENAI-MG.
- ✅ Especificação de engenharia completa da UCT industrial (`PROJETO_INDUSTRIAL.md`) e protocolo de
  homologação em bancada (`HOMOLOGACAO_UCT.md`), incluindo o mecanismo de código para `DEVICE_KEYS`
  por dispositivo — já implementado em `cloudflare-worker/src/rotas.js` (modo por-dispositivo com
  checagem de que a chave autoriza aquele piezômetro específico).

### O que falta

| Pendência | Detalhe |
|---|---|
| Ensaio de validação do sensor | Protocolo pronto em `docs/prototipo/VALIDACAO_SENSOR.md` (5 alturas × 10 leituras) — falta executar e declarar a incerteza real (±2σ) |
| Cadastro de `DEVICE_KEYS` em produção | O **mecanismo** já existe no código; falta gerar e configurar as chaves reais por dispositivo via `wrangler secret put DEVICE_KEYS` |
| Eventos persistentes e painel | Confirmar eventos em `GET /alerts` para auditoria, estados ao vivo e **SEM SINAL** sem leitura recente |
| Protótipo v2 | Tubo acrílico + sensor de pressão MPS20N0040D + display TFT + BME280 — o firmware já foi preparado para essas trocas (interface `Tela` e adapters enxutos) |
| Homologação da UCT | Ensaios E1–E5 de `HOMOLOGACAO_UCT.md` (exatidão ±3 cm, resistência de 72h, energia) — pré-requisito para liberar a UCT para o piloto de campo |
| Piloto de campo | 1 unidade UCT completa operando 6–12 meses num açude/barragem parceira (fase 2 do roadmap de `PROJETO_INDUSTRIAL.md` §9) |

**Fontes:** `readme.md` (Estado do projeto), `docs/projeto/PROJETO_INDUSTRIAL.md` (§9, roadmap), `docs/projeto/HOMOLOGACAO_UCT.md`, `docs/prototipo/VALIDACAO_SENSOR.md`, `cloudflare-worker/src/rotas.js`.

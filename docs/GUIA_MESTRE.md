# Guia mestre do AquaSense

## O que a equipe entrega

Um protótipo funcional de bancada com ESP32 e HC-SR04, para demonstrar aquisição,
transmissão, armazenamento e apresentação de leituras no contexto de piezômetros.
O [escopo atual](ESCOPO_ATUAL.md) define as entregas. A conclusão do TCC não depende
de teste em mineração, troca de sensor ou fabricação de equipamento industrial.

## Medição e escala

O HC-SR04 mede distância até um alvo. O firmware usa mediana de tentativas válidas
e converte distância em nível equivalente: `max(0, 40 - distancia_cm) * 0,5`.
Por exemplo, distância de 20 cm corresponde a 10 m didáticos. O valor exibido não
é uma coluna real de dez metros nem uma medição direta de poropressão.

Normal, atenção e crítico representam faixas configuradas para a demonstração.
Os valores de referência são 12 e 15 m didáticos, com histerese de 0,2 m na descida.
Esses limites não são critérios de segurança de uma estrutura real.

Ausência de eco válido é falha do sensor. O último valor pode ser referência, mas
não é enviado como amostra nova. Um eco válido distante pode resultar em nível zero
pela fórmula; isso é diferente de ausência de eco.

## Cadeia de dados

1. ESP32 recebe a leitura do HC-SR04, registra a condição e prepara o envio.
2. `/ingest` autentica o dispositivo e valida o conteúdo recebido.
3. D1 guarda leituras e horários de medição e recepção; reenvios com o mesmo
   instrumento e horário são tratados pelo índice único existente.
4. O motor de alertas executa a cada minuto. Estado e registros ficam no KV.
5. A dashboard consulta `/ultimos`, `/dados`, `/alerts` e `/config`.

Horário da medição (`ts`) e recepção (`recebido_em`) têm funções diferentes.
O frescor usa recepção; a taxa de variação usa o tempo da medição. A taxa calculada
na bancada com alvo móvel não demonstra evolução geotécnica de uma estrutura.

## Interface atual

- Rede de instrumentos e mapa com coordenadas ilustrativas.
- Seleção de instrumento, leitura, origem, última recepção e condição.
- Gráficos 24h/7d/30d, com média, pico e lacunas temporais visíveis.
- Tema claro/escuro, preferência salva e seleção de instrumento por teclado.
- Simulação manual identificada; falha da API não a ativa automaticamente.
- SEM SINAL para leitura antiga; indisponibilidade para consulta sem confirmação.
- Registros do servidor separados dos eventos da sessão. O servidor retorna até
  50 eventos da rede; o filtro por instrumento pode mostrar menos.

CSV e Excel contêm os intervalos disponíveis, identificação de fonte e classificação
pelo pico. O relatório PDF consulta dados reais e fica bloqueado na simulação.
Não chamar esses arquivos de histórico bruto completo ou auditoria imutável.

## Firmware e hardware

A distribuição de uma aba está em `firmware/aquasense_hc_sr04/aquasense_hc_sr04.ino`.
O núcleo modular gera esse arquivo; consulte `firmware/UMA_ABA.md` antes de editar.
Credenciais ficam na cópia privada, fora do Git. Variantes de outros sensores são
legadas e não integram as entregas atuais.

O OLED permaneceu apagado e sua investigação está suspensa. Não há LEDs montados;
o buzzer não foi validado. A apresentação pode usar serial e dashboard. Não houve
nova gravação da placa nesta revisão documental.

## O que foi comprovado

O [registro de 12/09](VALIDACAO_BANCADA_2026-09-12.md) descreve observações de nível,
faixas, ausência de eco, recuperação e HTTP 204. Não mede precisão nem comprova
reenvio offline. Desligar Wi-Fi do computador não interrompe o ESP32 no roteador.

Em 13/09 a dashboard, o tema e as otimizações de consultas foram publicados.
A última suíte executada passou 49 testes. Os testes de SQLite usam banco local;
isso não substitui medição de consumo ou disponibilidade em produção.

## Limites operacionais

O buffer é RAM: até 120 envios, aproximadamente 20 minutos no intervalo de dez
segundos. Lotação descarta o mais antigo; reinício perde pendências. Se o horário
do dispositivo faltar, o servidor estima tempos do lote. Não há garantia de zero perda.

O D1 tem cota de uso. Em 13/09 ela bloqueou consultas. Os índices foram aplicados,
mas não restauram a cota consumida. [Otimização e validação](OTIMIZACAO_D1.md).

Os dados brutos têm retenção configurada de 180 dias; dias completos anteriores
são consolidados. A tabela diária ainda não tem endpoint de consulta no painel.
Essa consolidação preserva resumos, não cada amostra indefinidamente.

## Como demonstrar

Apresentar o objetivo, mostrar a distância física e a escala, mover um alvo para
observar as faixas, consultar histórico e exportação e explicar SEM SINAL e simulação.
Registrar data, firmware utilizado e o que foi observado. Para avaliar precisão,
comparar distâncias repetidas com uma régua disponível, sem pressupor resultado.

A documentação econômica usa recursos disponíveis e limitações; não promete
retorno comercial, substituição de equipes ou implantação de unidades em campo.

# Escopo atual do AquaSense

Decisão da equipe atualizada em 14/09/2026. Este documento define o escopo vigente;
planos anteriores não acrescentam requisitos ao TCC.

## Objetivo

Demonstrar, em bancada, a aquisição e transmissão de leituras com ESP32 e HC-SR04,
o armazenamento em nuvem, a visualização do histórico e o tratamento de falhas.
O contexto de aplicação é o monitoramento de piezômetros, representado por uma escala
didática. O protótipo não mede diretamente a poropressão de uma estrutura real.

## Estudo empresarial aprovado

O TCC também apresenta uma proposta empresarial para monitoramento de piezômetros em mineração, com especificação conceitual, referências de preços, custos e cenários financeiros. A bancada demonstra o conceito. Esse estudo não exige compra de equipamentos de campo nem implantação real. Cotações de referência, premissas e resultados calculados devem ser identificados. A documentação interna em `projeto/ESTUDO_VIABILIDADE_EMPRESARIAL.md` e o texto do TCC concentram a análise.

## Recursos e limites da execução física

- ESP32, HC-SR04, protoboard, cabos, USB e Wi-Fi já disponíveis.
- Não é necessária compra de outro sensor para concluir o projeto.
- Ensaios em mineração, unidade industrial, energia solar, comunicação celular e
  certificações de campo não fazem parte das entregas nem das pendências.
- OLED apagado: investigação suspensa até que a equipe disponha de substituto.
  O serial e a dashboard permitem continuar a demonstração. A causa não foi confirmada.
- LEDs não estão montados. Buzzer não foi validado na bancada registrada.
- Alertas são registros escritos e destaques visuais. Mensageria externa e aviso
  à população não fazem parte do sistema.

## O que existe

Firmware de bancada, distribuição em um único arquivo, API no Cloudflare Worker,
D1 para leituras, KV para estados e eventos, dashboard publicada no GitHub Pages,
mapa ilustrativo, gráficos, modo claro/escuro, simulação explícita e exportações.
A simulação não é ativada por falha da API. Dados antigos não determinam uma
condição atual normal. Os eventos persistidos consultam os últimos 50 registros
da rede; esse recorte não é um arquivo completo de auditoria.

A escala da demonstração é `nivel = max(0, 40 - distancia_cm) * 0,5`.
Os metros exibidos são equivalentes didáticos. Pressão calculada não é leitura de
um transdutor; temperatura só aparece quando a fonte fornece esse dado.

## Evidências até esta revisão

- Registro de bancada de 12/09: faixas, ausência de eco, recuperação e envio aceito
  pelo servidor observados. Não houve avaliação quantitativa de precisão.
- Publicação de dashboard e Worker confirmada em 13/09, incluindo tema e consultas
  indexadas. A última suíte executada passou 49 testes locais.
- O D1 atingiu a cota diária e retornou erro. A otimização foi publicada, mas sua
  economia em `rows_read` e a recuperação após o limite ainda precisam ser medidas.
- Testes locais, publicação e ensaios físicos são evidências diferentes.

## Pendências acessíveis

Conferir a medição contra uma régua disponível, registrar repetição e variação;
realizar perda de rede do ESP32 e recuperação quando for viável; guardar logs e
exportações com data, versão e condições do ensaio. São testes de bancada, sem
exigência de adquirir instrumentação industrial.

O buffer em RAM é limitado: até 120 envios pendentes, cerca de 20 minutos no
intervalo de dez segundos. Reinício/alimentação interrompida perde as pendências;
lotação descarta as mais antigas. Não declarar garantia de zero perda.

## Documentos e versões

- `GUIA_MESTRE.md`: explicação operacional.
- `VALIDACAO_BANCADA_2026-09-12.md`: registro histórico preservado.
- `CRITERIOS_UI_OPERACIONAL.md` e `OTIMIZACAO_D1.md`: decisões técnicas específicas.
- `tcc/TCC_AQUASENSE.md`: texto acadêmico revisado; substitui o rascunho antigo.
- `prototipo/`: guias e testes acessíveis à equipe.
- `projeto/`: contexto conceitual revisto; inclui o estudo empresarial aprovado, separado da execução física.

Os diretórios de documentação interna permanecem locais conforme o `.gitignore`.
Projeções antigas sem fonte não são resultados do protótipo. O estudo de 14/09 apresenta novos cenários com fontes e premissas explícitas.

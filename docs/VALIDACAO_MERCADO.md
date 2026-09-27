# Validação de mercado

Resumo da validação de mercado do AquaSense, alinhado à Seção 8.4 e ao Apêndice D
do TCC (v6.4, 27/09/2026).

**Regra:** número de mercado só com fonte citável. Onde o dado não existe em fonte
pública, está escrito o método e a fonte a consultar — nunca uma estimativa.

## Situação

| Camada | O que é | Situação |
|---|---|---|
| Secundária | Dados públicos e normas | Conferida nas fontes em 27/09/2026 |
| Primária | Questionário com profissionais da área | Instrumento pronto; **não aplicado**. A equipe não conseguiu contato com profissionais durante o trabalho. Nenhum resultado foi estimado. |

## 1. Camada secundária

| Fonte | Dado conferido | Uso |
|---|---|---|
| ANA, Relatório de Segurança de Barragens 2024/2025 (publicado em 01/07/2025) | 28.085 barragens no SNISB; 6.202 enquadradas na PNSB; 241 prioritárias, 51 delas de rejeitos de mineração | Dimensão do problema de segurança no país |
| Lei nº 14.066/2020 | Multas de R$ 2 mil a R$ 1 bilhão pelo descumprimento das obrigações de segurança | Motivação regulatória |
| Resolução ANM nº 95/2022, art. 7º, § 1º | Barragens de mineração com DPA alto devem manter monitoramento automatizado de instrumentação, com acompanhamento em tempo real, período integral e redundância de energia; a tecnologia é escolha do empreendedor, seguindo critérios do projetista | Requisito que o produto atende; abertura para novos fornecedores |
| Resolução ANM nº 220/2025 (publicada em 17/10/2025) | Substituirá a 95/2022 a partir de 02/08/2027 e mantém a obrigação de monitoramento automatizado (art. 20, § 2º) | Continuidade da exigência |
| ASDSO (EUA), ASDSO/FEMA Dam Seepage Monitoring Software | Software para organizar leituras de piezômetros de tubo aberto e reduzir a digitação manual | O tratamento de leituras manuais é um problema reconhecido também fora do Brasil |
| Demanda Samarco (desafio de inovação) | Custo da ordem de R$ 600 mil/ano com a leitura manual | Dado do cliente; não generalizável sem a camada primária |

**Atenção a um erro comum:** a Resolução ANM nº 95/2022 **não fixa a frequência de
leitura dos piezômetros**. A "periodicidade" do texto se refere a inspeções,
relatórios e declarações (DCE e DCO). A frequência de aquisição dos dados é definida
no plano de monitoramento e instrumentação de cada barragem, pelo projetista. Por
isso o mercado não pode ser calculado como "instrumentos × frequência obrigatória".

A Resolução ANM nº 13/2019 foi revogada pela 95/2022 (art. 82) e não deve ser citada
como vigente. Siglas: DCE — Declaração de Condição de Estabilidade; PAEBM — Plano de
Ação de Emergência para Barragens de Mineração; DCO — Declaração de Conformidade e
Operacionalidade do PAEBM.

## 2. Dados não disponíveis: método e fonte

| Dado necessário | Por que importa | Método e fonte |
|---|---|---|
| Barragens de mineração com DPA alto | Público obrigado pelo art. 7º, § 1º | Consulta ao SIGBM público da ANM, filtrando por DPA e por UF |
| Piezômetros por barragem e quantos são lidos manualmente | Tamanho do mercado; premissa P2 do Capítulo 9 | Perguntas 3 e 4 do questionário; Planos de Segurança de Barragem, quando disponibilizados pelo empreendedor |
| Frequência e custo da leitura manual em outras empresas | Generalizar o caso Samarco (premissa P1) | Perguntas 4 e 5 do questionário |
| Preço das soluções concorrentes | Posicionamento de preço | Pedido formal de cotação a fabricantes e distribuidores (Geokon, Sisgeo, Encardio-Rite) com a especificação da UCT |
| Disposição a pagar por ponto automatizado | Premissa P5 do Capítulo 9 | Pergunta 8 do questionário |

As premissas do Capítulo 9 (por exemplo, P2 ≈ 100 pontos) são **cenários de
cálculo**, não dados de mercado. A tabela de sensibilidade do TCC mostra o efeito
de variar o número de pontos.

## 3. Camada primária: questionário (Apêndice D)

- **Objetivo:** confirmar ou corrigir os dados da Seção 2 e as premissas P1, P2 e P5.
- **Público:** coordenadores de geotecnia, técnicos de instrumentação e profissionais
  de serviços geotécnicos que atuam com barragens.
- **Recrutamento:** Comitê Brasileiro de Barragens (CBDB), Associação Brasileira de
  Mecânica dos Solos e Engenharia Geotécnica (ABMS), rede do SENAI e contatos da
  demanda Samarco.
- **Aplicação:** formulário on-line anônimo (cerca de 10 minutos), com termo de
  consentimento e sem dados pessoais além da função e do tipo de empresa.
- **Critério mínimo:** usar os resultados somente com pelo menos 10 respostas válidas
  de ao menos 3 empresas; abaixo disso, apresentar como relatos, sem generalização.
- **Análise:** número de respostas e distribuição por pergunta; sem extrapolar além
  da amostra.

Perguntas (alternativas completas no Apêndice D do TCC):

1. Função.
2. Tipo de empresa.
3. Piezômetros de leitura manual sob sua responsabilidade (faixas) — valida P2.
4. Frequência de leitura.
5. Custo anual aproximado da leitura manual — compara com P1.
6. Ordem dos desafios: custo, tempo, segurança, atraso da informação, erro de registro.
7. Uso atual de leitura automática e tecnologia.
8. Faixa aceitável de investimento por ponto — valida P5.
9. Requisitos indispensáveis.
10. Interesse em piloto com um ponto instrumentado.

## 4. O que o protótipo já demonstra

O argumento de produto não depende de dado de mercado: a regulação exige
monitoramento **automatizado** nas barragens de DPA alto. O protótipo demonstra, em
bancada, medição contínua, classificação NORMAL/ATENÇÃO/CRÍTICO, registro de alertas
no painel e no servidor, retenção das leituras durante queda de rede e detecção de
perda de comunicação ([ensaios](ENSAIOS_V2.md)). Os alertas são registrados por
escrito no painel; o sistema não envia mensagens para canais externos.

## 5. Modelo de receita

O Capítulo 9 do TCC adota, como cenário, a venda da UCT com instalação por ponto
somada a um serviço mensal por ponto (comunicação, nuvem, suporte e manutenção).
A alternativa de monitoramento como serviço, sem venda do equipamento, não foi
avaliada. A escolha entre as duas depende da camada primária.

## Referências

- ANA. *RSB 2024/2025 indica 241 barragens prioritárias...* Brasília, 01 jul. 2025.
  <https://www.gov.br/ana/pt-br/assuntos/noticias-e-eventos/noticias/rsb-2024-2025-indica-241-barragens-prioritarias-que-necessitam-de-maior-atencao-em-termos-de-seguranca-em-23-estados-e-no-distrito-federal>
- BRASIL. Lei nº 14.066, de 30 set. 2020. Resumo das multas:
  <https://www.camara.leg.br/noticias/697154-SANCIONADA-LEI-QUE-MUDA-REGRAS-SOBRE-BARRAGENS-E-PREVE-MULTAS-DE-ATE-R$-1-BI>
- ANM. Resolução nº 95, de 7 fev. 2022.
  <https://www.gov.br/anm/pt-br/assuntos/barragens/legislacao/resolucao-no-95-2022.pdf>
- ANM. Resolução nº 220, de 16 out. 2025. <https://anmlegis.datalegis.net>
- ANM. SIGBM — versão pública. <https://sigbm.anm.gov.br/Publico>
- ANM. DCE e DCO. <https://www.gov.br/anm/pt-br/assuntos/barragens/dce-e-dco>
- ASDSO. ASDSO/FEMA Dam Seepage Monitoring Software.
  <https://damsafety.org/content/asdsofema-dam-seepage-monitoring-software>

Consultas feitas em 27/09/2026.

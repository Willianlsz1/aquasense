# Próxima etapa de refinamento — AquaSense

Proposta de 12/09/2026. Objetivo: tornar a demonstração do TCC clara, coerente
e reproduzível, aproveitando o sistema existente. Implementação das mudanças de
comportamento abaixo depende da escolha do responsável.

## Estado de partida

- Medição HC-SR04, faixas, falha de eco e recuperação já foram observadas na
  bancada. Isso não equivale a calibração ou precisão comprovada.
- A versão de uma aba compila. No último teste comparativo, o ESP32 recebeu
  novamente o firmware modular anterior; leitura e envio HTTP 204 funcionaram.
- OLED apagado também com o firmware anterior. Diagnóstico e substituição ficam
  suspensos por decisão do responsável até obter outro display. Defeito físico
  não foi confirmado.
- Teste de interrupção real do Wi-Fi/reenvio continua adiado.
- Correções recentes de servidor e painel permanecem locais, sem publicação.

## 1. Clareza do painel — recomendação para começar

**Evidência:** `poll()` em `assets/js/app.js` ativa `FonteSimulada` após falhas;
o banner identifica simulação, mas o modo é escolhido automaticamente. A mesma
rotina também trata ausência de valor no instrumento selecionado como erro.
`applyData()` calcula pressão equivalente a partir do nível quando não há sensor
de pressão; a bancada usa nível ampliado por uma escala de demonstração.

**Proposta:** monitoramento real como padrão. Falha da API mostra indisponibilidade;
ausência de recepção recente mostra SEM SINAL. Simulação somente por ação explícita,
com identificação consistente em indicadores, eventos e exportações. Explicar no
painel o nível equivalente da bancada e a pressão calculada, sem chamá-los de
medição direta de pressão ou de altura real de água.

**Decisão necessária:** aceitar substituir a entrada automática em simulação por
um controle explícito. A alternativa é manter o comportamento atual e melhorar
somente os textos; isso continua mudando a fonte de dados durante uma falha.

**Arquivos previstos:** `index.html`, `assets/styles.css`, `assets/js/app.js`,
`assets/js/fontes.js`, `assets/js/paineis.js`, testes de frontend; revisar
`assets/js/exportar.js` e documentação para consistência.

**Pronto quando:** queda da API não gera números fictícios; instrumento sem
leitura não provoca simulação global; entrada/saída de simulação não mistura
histórico, alarmes ou exportações entre fontes; recuperação real volta a ser
mostrada corretamente. Conferência local visual e testes das transições.

## 2. Histórico de alertas útil após recarregar

**Evidência:** o Worker expõe `/alerts`, mas o painel atual mantém eventos da
sessão sem carregar o histórico persistido.

**Proposta:** apresentar eventos persistidos com instrumento, data e horário;
distinguir registros do servidor dos eventos locais da sessão, evitando duplicação.
Antes de implementar, conferir formato, limites e atraso do endpoint existente.

**Arquivos previstos:** `assets/js/fontes.js`, `assets/js/paineis.js`,
`assets/js/estado.js`, `assets/js/app.js`, testes de integração do frontend.
Nenhuma migração ou mudança de API está aprovada por esta proposta.

**Pronto quando:** recarregar preserva acesso aos registros retornados pelo servidor,
trocar instrumento filtra corretamente e falha da consulta tem indicação própria.

## 3. Demonstração e documentação consistentes

**Proposta:** alinhar painel, relatórios exportados e roteiro curto de apresentação:
o que é medido, o que é calculado, como as faixas são demonstradas e quais limites
permanecem. Conferir CSV/Excel/PDF com o mesmo período e instrumento. Registrar
explicitamente protótipo de bancada versus aplicação futura em campo.

**Arquivos previstos:** `assets/js/exportar.js`, `assets/js/exportar_xls.js`,
`assets/js/relatorio.js`, `relatorio.html`, `readme.md` e documentação de bancada,
somente conforme inconsistências verificadas.

**Pronto quando:** apresentação e arquivos exportados explicam a mesma situação,
com unidades, período, origem dos dados e limitações identificados.

## Limites e execução

Uma etapa por vez, sem novas dependências ou reforma de arquitetura. Alterações
de interface exigem conferência visual; lógica exige testes de regressão.
Commits locais pequenos após validação. Publicação requer pedido explícito e
verificação posterior; sucesso local não comprova a versão online.

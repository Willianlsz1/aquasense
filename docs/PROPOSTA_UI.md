# Identidade e proposta de interface AquaSense

## Direção

AquaSense é o nome do produto. Água e medição orientam a identidade: símbolo de
gota seccionada, azul profundo, linhas de nível e uma escala vertical ilustrativa.
A leitura principal tem prioridade; a pressão calculada e os eventos têm papel
complementar. Cor, texto e forma identificam o estado, sem depender só da cor.

## Como conferir

Abra `proposta.html` no navegador, diretamente ou por servidor local.
Use os botões Normal, Atenção, Crítico, Sem sinal e Simulação. Todos os valores
são fictícios e isso fica indicado permanentemente. A página não consulta API,
não grava preferências e não envia leituras. É uma proposta navegável, ainda
separada do dashboard operacional em `index.html`.

No estado sem sinal, nível e pressão atuais ficam indisponíveis. A última leitura
aparece como informação passada; o histórico termina sem preencher a lacuna com
zero. A escala e os limites são exemplos didáticos, não indicação de segurança.

## Arquivos

- `proposta.html`: estrutura e semântica da página.
- `assets/proposta.css`: identidade visual e adaptação a telas estreitas.
- `assets/js/proposta.js`: cenários locais e determinísticos.

## Marca nos fontes existentes

Textos de produto do painel, página de alerta, mensagens do Worker, firmware e
README passaram a usar AquaSense. O firmware de uma aba foi regenerado a partir
dos fontes. As referências bibliográficas/históricas em documentos de pesquisa
permanecem como fontes, sem atribuir a outra empresa a identidade do produto.

Não houve publicação nem gravação do ESP32. Mensagens antigas já persistidas
no serviço online e o firmware atualmente na placa não foram reescritos.
O diagnóstico do OLED continua suspenso.

## Verificação desta proposta

Os cinco estados foram exercitados no navegador. Layouts de desktop (1440 px)
e celular (390 px) conferidos visualmente; o gráfico permite rolagem horizontal
no celular para preservar a leitura dos eixos. Sintaxe JS conferida e suíte
existente com 33 testes aprovada após a mudança de marca.

Próxima etapa do plano aprovado: integrar o desenho ao painel real, incluindo
seleção de instrumento, períodos, exportações, separação explícita de simulação
e estados de indisponibilidade. Não tratar os cenários desta proposta como
validação da integração com a API ou do firmware.

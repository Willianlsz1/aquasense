# Nosso modo de trabalho — versão 0.1

## Para que serve
Você explica o que precisa; o Codex transforma isso em uma mudança pequena,
verifica o resultado e explica o que foi feito. Este é nosso “harness”: o acordo
que organiza o trabalho. Não exige instalar outra ferramenta.

A meta é atender à demanda do SENAI com clareza e funcionamento demonstrável.
Não precisamos acrescentar recursos só porque seriam possíveis.

## O fluxo na prática
1. **Você pede:** descreve o problema ou resultado em suas palavras.
2. **Eu delimito:** explico o que vou resolver e como conferir se deu certo.
   Se existir uma decisão importante, apresento minha recomendação e seu motivo.
3. **Eu faço e confiro:** executo o necessário dentro do pedido autorizado.
4. **Você recebe:** o que mudou, o que foi testado e o que ainda depende de você.
5. **Ajustamos:** seu feedback melhora o próximo ciclo. Uma nova regra permanente
   só entra quando você pedir ou concordar com a proposta concreta.

Você não precisa escolher um modelo ou organizar vários agentes em cada pedido.
Começamos com o modelo atual e só discutimos uma troca se houver dificuldade ou
custo que justifique. Mais ferramentas e etapas não são uma meta.

## Exemplos de pedidos
- “Quero retomar o TCC. Confira o que funciona e o que falta para demonstrar.”
- “O painel parou de atualizar. Descubra a causa e faça a menor correção necessária.”
- “Explique essa parte para eu conseguir apresentar na banca.”
- “Ficou complicado. Reduza o plano ao necessário para resolver a demanda.”

## Ponto de partida registrado em 08/09/2026
- O repositório contém firmware para ESP32, serviço Cloudflare, painel web,
  documentação e testes locais. Sua estrutura será aproveitada.
- O README relata uma demonstração física anterior. A bancada e os serviços
  publicados não foram verificados nesta preparação do acordo.
- Há documentação industrial e propostas futuras. Elas não viram tarefas aprovadas
  automaticamente. O projeto segue pausado até você pedir sua retomada.
- O arquivo legado `CLAUDE.md` menciona um fluxo com Fable e canais Telegram/SMS;
  o README e os módulos atuais descrevem eventos escritos/visuais. Portanto,
  consultar o código antes de tratar instruções antigas como estado atual.

## Quando retomarmos
Primeiro, combinar qual demonstração a disciplina exige. Depois, verificar a cadeia
sensor → envio → armazenamento → painel, incluindo perda de comunicação e indicação
de alerta. Corrigir somente os bloqueios encontrados e registrar o que foi comprovado.
Esse roteiro é uma proposta de retomada, não uma validação já realizada.

## Onde ficam as regras
As instruções do Codex ficam em `../AGENTS.md` em relação à raiz `aquasense`
(isto é, `TCC/AGENTS.md`). Abra o Codex na pasta TCC ou AquaSense.
Este guia explica o acordo; o README e o Guia Mestre continuam descrevendo o projeto.

# AquaSense — critérios do painel operacional

## Escopo

Aplicação no painel principal (`index.html`). Preserva mapa, gráficos, histórico e
exportações. O sistema é um protótipo didático; esta revisão não certifica conformidade
com normas nem transforma a leitura de um instrumento em avaliação de segurança.

## Referências e decisões

- [ISA-101 — visão pública da norma](https://www.isa.org/standards-and-publications/isa-standards/isa-101-standards):
  hierarquia e compreensão pelo operador. Rede primeiro, instrumento selecionado,
  leitura e tendência, condição e registros. Superfícies neutras e destaque das exceções.
- [ISA-18 — gestão de alarmes](https://www.isa.org/standards-and-publications/isa-standards/isa-18-series-of-standards):
  separar condição presente de registros históricos. As ocorrências da sessão não são
  uma lista de alarmes ativos. Não há implementação completa de reconhecimento,
  supressão, racionalização ou ciclo de vida de alarmes.
- [Vista Data Vision — interface](https://help.vistadatavision.com/web-interface):
  referência funcional para mapa, tendências, registros e exportações.
- [Sixense — plataformas de monitoramento](https://www.sixense-group.com/en/services/monitoring-testing/monitoring-software-platform):
  referência para leitura conjunta de localização, dados e eventos.

As páginas públicas orientam o projeto; não substituem o texto integral das normas.
Não se adotam percentuais de cor ou taxas de alarme como exigências universais.

## Comportamentos verificáveis

1. A abertura inicia a fonte real. Erro de API não aciona simulação.
2. Simulação depende do botão e permanece identificada. PDF real fica bloqueado nesse modo.
3. Trocar a fonte limpa leituras e séries anteriores. Falha de consulta deixa a condição
   atual sem confirmação e identifica valores anteriores como referência.
4. O mapa declara que as posições são ilustrativas.
5. O histórico do servidor consulta `/alerts`: até 50 registros da rede, filtrados
   pelo instrumento selecionado. Não equivale a arquivo completo ou imutável de auditoria.
6. CSV de alertas identifica origem, filtro, horário local/UTC e eventual cache.
7. CSV/Excel de leituras usam os intervalos disponíveis; não são anunciados como
   exportação integral de amostras brutas.
8. O gráfico posiciona dados no tempo, interrompe a linha nas lacunas e não preenche
   essas lacunas com área colorida. Períodos longos incluem data nos rótulos.

## Limitações

Acesso local à API e aos mapas depende da rede e das permissões de origem do servidor.
Testes locais e simulação não validam bancada, serviço publicado ou instrumentação industrial.
Limiares precisam ser definidos pelo responsável pelo caso de uso. Firmware/OLED não
fazem parte desta revisão. Nenhuma publicação remota é realizada por este trabalho.

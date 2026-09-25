# AquaSense

Sistema de monitoramento remoto de piezômetros em barragens de mineração.
Trabalho de Conclusão do Curso Técnico em Automação Industrial — SENAI, Belo Horizonte, 2026.
Equipe: Isadora Muniz, Matheus Martins e Willian Lopes. Orientador: Prof. Jairo.

## Problema

A leitura de piezômetros ainda é, em grande parte, manual: um técnico vai até cada
instrumento e mede o nível d'água. O processo custa caro, expõe a equipe a áreas de
risco e deixa intervalos sem informação entre as campanhas.

## Solução

Uma Unidade de Controle e Telemetria (UCT) mede o nível dentro do tubo, classifica
a condição (NORMAL, ATENÇÃO, CRÍTICO) e envia a leitura ao servidor. A nuvem guarda
o histórico e avalia alertas de nível, taxa de variação e perda de comunicação.
Um painel web mostra os pontos, gráficos, eventos e relatórios.

```
Sensor → ESP32 → HTTPS /ingest → Cloudflare Worker → D1 (leituras) + KV (alertas) → painel web
```

## Situação atual

| Etapa | Situação |
|---|---|
| Protótipo V1 — ESP32 + HC-SR04 em bancada, Wi-Fi | Validado em 12/09/2026 ([registro](docs/VALIDACAO_BANCADA_2026-09-12.md)) |
| Protótipo V2 — mesmo sistema num tubo de acrílico com água | Planejado ([roteiro de ensaios](docs/ENSAIOS_V2.md)) |
| UCT comercial — sonda 4–20 mA, ADS1115, 4G, energia solar | Especificada no TCC; não montada |
| Servidor e painel | [Publicados](https://willianlsz1.github.io/aquasense/); 49 testes locais aprovados |

O V1 usa uma escala didática: a distância do sensor vira nível equivalente
(`max(0, 40 - distancia_cm) * 0,5`). Não é uma coluna real de vários metros nem
medição de poropressão. Os limites de 12 m e 15 m são de demonstração.
Estar publicado não garante disponibilidade contínua; a cota diária do D1 já
bloqueou consultas uma vez.

Detalhes, evidências e limites: [guia mestre](docs/GUIA_MESTRE.md).

## Estrutura

| Pasta / arquivo | Conteúdo |
|---|---|
| `index.html`, `relatorio.html`, `assets/` | Painel web e relatório PDF (GitHub Pages) |
| `cloudflare-worker/` | API, motor de alertas, esquema e migrações do banco ([README](cloudflare-worker/README.md)) |
| `firmware/aquasense_hc_sr04/` | Firmware do protótipo em uma aba ([instruções](firmware/UMA_ABA.md)) |
| `firmware/*.h`, `sketch_demo_hc_sr04.ino` | Código modular que gera o firmware de uma aba |
| `firmware/sketch_uct_4a20ma.ino` | Firmware de referência da UCT comercial (não ensaiado) |
| `tests/`, `tools/` | Testes automatizados e gerador do firmware |
| `docs/` | Guia mestre, validação, ensaios do V2, critérios da interface e fotos |

## Executar e manter

- Testes: Node.js 24, `npm test` na raiz.
- Credenciais ficam na cópia local do firmware; nunca no Git.
- Um push em `main` publica o site e, se o backend mudar, o Worker (migrações antes).
- A API aceita apenas a origem do GitHub Pages; um servidor local pode receber
  bloqueio de CORS.

O texto completo do TCC e os documentos internos da equipe ficam fora do repositório.

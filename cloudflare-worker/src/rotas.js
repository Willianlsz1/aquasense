// ── ROTAS HTTP ────────────────────────────────────────────────────────────────
// Um handler por endpoint (/ingest, /ultimos, /dados, /alerts, /config,
// /health) — orquestram config, db e alertas para montar a resposta JSON.

import { RANGES, PIEZOMETRO_ID_RE, INGEST_MAX_BYTES, INGEST_MAX_LEITURAS } from "./config.js";
import { corsHeaders, json, readBodyLimited } from "./http.js";
import { normalizarLeitura, inserirLeituras, lerUltimasLeiturasTodas, lerLeituraBaseline, lerDadosAgregados } from "./db.js";
import { calcularTaxaMDia, lerEstado } from "./alertas.js";

export async function handleIngest(request, env, cfg) {
  // Autenticação de sistema de segurança falha FECHADA: sem NENHUMA das duas
  // formas de chave configurada (DEVICE_KEYS por dispositivo OU DEVICE_KEY
  // única, via wrangler secret put) não há como validar quem está enviando,
  // então nenhuma leitura entra — o alternativo (pular a checagem) deixaria
  // qualquer um injetar leituras falsas anônimas no histórico de
  // monitoramento de segurança da barragem.
  //
  // Modo por dispositivo (DEVICE_KEYS): cada piezômetro de campo tem sua
  // própria chave, então vazar a chave de UM device não compromete a frota
  // inteira — revogar é só trocar aquela entrada no JSON do secret e fazer
  // `wrangler secret put DEVICE_KEYS` de novo, sem afetar os demais.
  const modoPorDispositivo = cfg.DEVICE_KEYS && typeof cfg.DEVICE_KEYS === "object";
  if (!modoPorDispositivo && !cfg.DEVICE_KEY) {
    return json(cfg, 503, {
      error: "DEVICE_KEY não configurada no Worker (wrangler secret put DEVICE_KEY) — ingestão bloqueada",
    });
  }

  // Auth GLOBAL, fail-closed: a chave recebida precisa bater com ALGUMA
  // chave válida conhecida (alguma entrada de DEVICE_KEYS, ou a DEVICE_KEY
  // única). A checagem fina de qual pz cada chave autoriza só é possível
  // depois do parse/normalização do corpo (o pz normalizado vem de lá) —
  // ver mais abaixo, após o loop de normalizarLeitura.
  const chaveRecebida = request.headers.get("x-device-key");
  const chavesValidas = modoPorDispositivo ? Object.values(cfg.DEVICE_KEYS) : [cfg.DEVICE_KEY];
  if (!chaveRecebida || !chavesValidas.includes(chaveRecebida)) {
    return json(cfg, 401, { error: "Chave de dispositivo inválida" });
  }

  const { tooLarge, text } = await readBodyLimited(request, INGEST_MAX_BYTES);
  if (tooLarge) return json(cfg, 413, { error: "Payload muito grande" });

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return json(cfg, 400, { error: "JSON inválido" });
  }

  const leituras = Array.isArray(payload && payload.leituras) ? payload.leituras : [payload];

  if (!leituras.length) {
    return json(cfg, 400, { error: "Nenhuma leitura enviada" });
  }
  if (leituras.length > INGEST_MAX_LEITURAS) {
    return json(cfg, 400, { error: "Máximo de 200 leituras por lote" });
  }

  const normalizadas = [];
  for (let i = 0; i < leituras.length; i++) {
    // Passa a posição no lote (i, total) para permitir reconstruir o ts
    // aproximado quando o device não envia ts (NTP falhou) — ver comentário
    // em normalizarLeitura, em db.js.
    const norm = normalizarLeitura(leituras[i], i, leituras.length);
    if (!norm) {
      return json(cfg, 400, {
        error:
          "Leitura inválida: 'nivel_agua' deve ser número finito e 'piezometro', quando presente, deve ter formato PZ-NN",
      });
    }
    normalizadas.push(norm);
  }

  // Checagem POR PIEZÔMETRO (modo DEVICE_KEYS): um device só pode enviar
  // leituras do(s) piezômetro(s) cuja chave bate com a que ele apresentou —
  // um lote com pz de outro device (chave roubada ou config errada no
  // firmware) é rejeitado inteiro, mesmo que a chave seja válida para OUTRO
  // piezômetro da frota.
  if (modoPorDispositivo) {
    for (const norm of normalizadas) {
      if (cfg.DEVICE_KEYS[norm.piezometro] !== chaveRecebida) {
        return json(cfg, 401, {
          error: `Chave de dispositivo não autoriza leituras de '${norm.piezometro}'`,
        });
      }
    }
  }

  try {
    await inserirLeituras(env, normalizadas);

    console.log(`📥 Ingestão: ${normalizadas.length} leitura(s) gravada(s) no D1`);
    return new Response(null, { status: 204, headers: corsHeaders(cfg) });
  } catch (e) {
    console.error("📥 Ingestão: erro ao gravar no D1:", e.message);
    return json(cfg, 502, { error: e.message });
  }
}

// GET /ultimos — última leitura de cada piezômetro, para o dashboard exibir
// o status atual sem precisar varrer o histórico inteiro.
export async function handleUltimos(env, cfg) {
  try {
    const ultimas = await lerUltimasLeiturasTodas(env);

    const out = {};
    for (const [pz, row] of Object.entries(ultimas)) {
      // P3 — taxa de variação (m/dia) desde a leitura mais próxima de
      // "agora - TAXA_JANELA_MIN", mesmo cálculo usado no motor de alertas.
      // null quando ainda não há baseline suficiente (instrumento novo).
      const tsAlvo = row.ts - cfg.TAXA_JANELA_MIN * 60;
      const baseline = await lerLeituraBaseline(env, pz, tsAlvo);
      const taxa = calcularTaxaMDia(cfg, { nivel_agua: row.nivel_agua, ts: row.ts }, baseline);

      out[pz] = {
        nivel_agua: row.nivel_agua,
        pressao: row.pressao,
        temperatura: row.temperatura,
        ts: row.ts,
        recebido_em: row.recebido_em, // hora de RECEBIMENTO pelo Worker — fonte de frescor/"sem sinal"
        taxa_m_dia: taxa,
      };
    }
    return json(cfg, 200, out);
  } catch (e) {
    console.error("/ultimos:", e.message);
    return json(cfg, 502, { error: e.message });
  }
}

// GET /dados?pz=PZ-01&range=24h — série histórica agregada em buckets, para
// alimentar os gráficos do dashboard sem devolver ponto a ponto (que num
// device relatando a cada poucos segundos viraria uma resposta enorme).
export async function handleDados(url, env, cfg) {
  const pzParam = url.searchParams.get("pz") || "PZ-01";
  if (!PIEZOMETRO_ID_RE.test(pzParam)) {
    return json(cfg, 400, { error: "Parâmetro 'pz' inválido" });
  }

  const rangeParam = url.searchParams.get("range") || "24h";
  const range = RANGES[rangeParam];
  if (!range) {
    return json(cfg, 400, { error: "Parâmetro 'range' deve ser um de: 24h, 7d, 30d" });
  }

  const desde = Math.floor(Date.now() / 1000) - range.janela;

  try {
    const linhas = await lerDadosAgregados(env, pzParam, range, desde);

    // P5 — a MÉDIA do bucket mascara excursões breves acima do limiar (ex.:
    // um pico de 15,3 m por 2 min dentro de um bucket de 30 min vira uma
    // média de 12,1 m no gráfico). nivel_max preserva o PICO, que é o que
    // importa em monitoramento de segurança — ver
    // docs/projeto/DASHBOARD_PROFISSIONAL.md §5.
    // nivel_min e n_leituras (nº de amostras agregadas no bucket) alimentam a
    // coluna de qualidade do CSV exportado pelo dashboard (ver exportar.js).
    const pontos = linhas.map((row) => ({
      ts: row.t,
      nivel_agua: row.nivel_agua,
      nivel_max: row.nivel_max,
      nivel_min: row.nivel_min,
      n_leituras: row.n_leituras,
      pressao: row.pressao,
      temperatura: row.temperatura,
    }));

    // bucket_seg: tamanho do intervalo de agregação (segundos), usado pelo
    // dashboard nos metadados de auditoria do CSV exportado.
    return json(cfg, 200, { pz: pzParam, range: rangeParam, bucket_seg: range.bucket, pontos });
  } catch (e) {
    console.error("/dados:", e.message);
    return json(cfg, 502, { error: e.message });
  }
}

export async function handleAlerts(env, cfg) {
  const estado = await lerEstado(env);
  return json(cfg, 200, {
    limiares: { atencao: cfg.NIVEL_ATENCAO, critico: cfg.NIVEL_CRITICO },
    piezometros: { ...estado.lastNotifiedLevel },
    comunicacao: { ...estado.commStatus }, // P2
    taxas: { ...estado.taxaStatus }, // P3
    notificacoes: estado.alertLog
      .filter((registro) => registro && typeof registro === "object")
      .slice(0, 50)
      .map(({ telegram, sms, ...registro }) => registro),
  });
}

// GET /config — fonte única de verdade dos contratos que hoje ficam
// duplicados "na mão" no firmware e no dashboard (limiares de alerta,
// ranges aceitos por /dados e o catálogo de piezômetros cadastrados). Os
// níveis de controle (atenção/crítico) são definidos por projeto pelo
// projetista geotécnico — parametrização é requisito do domínio, não um
// detalhe de implementação — então o dashboard carrega isso no boot em vez
// de hard-codar, evitando os três lugares ficarem fora de sincronia.
export function handleConfig(env, cfg) {
  let piezometros = [];
  try {
    const parsed = JSON.parse(env.PIEZOMETROS || "[]");
    if (Array.isArray(parsed)) piezometros = parsed;
  } catch {
    piezometros = [];
  }

  return json(cfg, 200, {
    limiares: { atencao: cfg.NIVEL_ATENCAO, critico: cfg.NIVEL_CRITICO },
    ranges: Object.keys(RANGES),
    piezometros,
    stale_seg: cfg.STALE_SEG, // P2 — janela que o dashboard usa p/ marcar "sem sinal" na UI
    taxa_max_m_dia: cfg.TAXA_MAX_M_DIA, // P3 — limiar de variação rápida
    histerese_m: cfg.HISTERESE_M, // P4 — deadband de descida de faixa (ISA-18.2)
  });
}

export function handleHealth(cfg) {
  return json(cfg, 200, {
    status: "ok",
    ts: new Date().toISOString(),
    db: "D1",
    alertas: { modo: "registro_escrito", cron: "1min" },
  });
}

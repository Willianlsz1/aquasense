// ── EVENTOS DE ALERTA ─────────────────────────────────────────────────────────
// Registra transições do motor de alertas no estado persistido, sem depender de
// serviços externos. O log é consumido pelo dashboard como histórico local.

function adicionarEvento(alertLog, evento) {
  alertLog.unshift({ ts: new Date().toISOString(), ...evento });
  if (alertLog.length > 100) alertLog.pop();
}

export function registrarEventoNivel(cfg, alertLog, pz, nivel, valor) {
  const emoji = { NORMAL: "🟢", ATENCAO: "🟡", CRITICO: "🔴" }[nivel];
  const acao = {
    NORMAL: "Nível retornou à faixa segura.",
    ATENCAO: `Nível acima de ${cfg.NIVEL_ATENCAO} m — intensificar monitoramento.`,
    CRITICO: `Nível acima de ${cfg.NIVEL_CRITICO} m — ACIONAR EQUIPE DE GEOTECNIA!`,
  }[nivel];

  adicionarEvento(alertLog, {
    tipo: "nivel",
    piezometro: pz,
    nivel,
    valor,
    mensagem: `${emoji} AQUASENSE PIEZÔMETRO ${pz} — ${nivel}\nNível d'água: ${valor.toFixed(2)} m`,
    acao,
  });
  console.log(`🔔 Evento de nível ${pz} ${nivel} (${valor.toFixed(2)} m)`);
}

export function registrarEventoComunicacao(cfg, alertLog, pz, status, ultimaLeituraTs, silencioMin) {
  const semSinal = status === "SEM_SINAL";
  const temUltimaLeitura = Number.isFinite(ultimaLeituraTs) && Number.isFinite(silencioMin);
  const dataUltima = temUltimaLeitura
    ? new Date(ultimaLeituraTs * 1000).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : null;

  const evento = {
    tipo: "comunicacao",
    piezometro: pz,
    status,
    mensagem: semSinal
      ? temUltimaLeitura
        ? `⚠️ AQUASENSE PIEZÔMETRO ${pz} — SEM SINAL\nSem leituras há ${silencioMin} min (última: ${dataUltima}).`
        : `⚠️ AQUASENSE PIEZÔMETRO ${pz} — SEM SINAL\nNenhuma leitura recebida.`
      : `🟢 AQUASENSE PIEZÔMETRO ${pz} — COMUNICAÇÃO RESTABELECIDA\nInstrumento voltou a reportar.`,
    acao: semSinal ? "Verificar instrumento/comunicação." : "Comunicação normalizada.",
  };
  if (temUltimaLeitura) {
    evento.ultimaLeituraTs = ultimaLeituraTs;
    evento.silencioMin = silencioMin;
  }
  adicionarEvento(alertLog, evento);
  console.log(`🔔 Evento de comunicação ${pz} ${status}`);
}

export function registrarEventoTaxa(cfg, alertLog, pz, status, taxa, limite) {
  const taxaAlta = status === "TAXA_ALTA";

  adicionarEvento(alertLog, {
    tipo: "taxa",
    piezometro: pz,
    status,
    taxa,
    limite,
    mensagem: taxaAlta
      ? `📈 AQUASENSE PIEZÔMETRO ${pz} — VARIAÇÃO RÁPIDA\nNível ${taxa >= 0 ? "subindo" : "descendo"} ${Math.abs(taxa).toFixed(2)} m/dia (limite ${limite})`
      : `🟢 AQUASENSE PIEZÔMETRO ${pz} — VARIAÇÃO NORMALIZADA\nTaxa de variação voltou abaixo do limite.`,
    acao: taxaAlta ? "Investigar mesmo dentro da faixa normal." : "Variação normalizada.",
  });
  console.log(`🔔 Evento de taxa ${pz} ${status} (${taxa != null ? taxa.toFixed(2) : "?"} m/dia)`);
}

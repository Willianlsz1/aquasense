// ── UTIL ──────────────────────────────────────────────────────────────────────
// Funções puras, sem estado nem efeitos colaterais: classificação de faixa de
// nível (com e sem histerese), cor por status, estado de comunicação e formatação
// de "há X min/h/d" a partir de um timestamp. Usadas por praticamente todo o resto.

const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

// Classifica um nível d'água (m) nas 3 faixas do desafio SAGA
function classifyNivel(n) {
  if (n < CFG.thrAtencao) return { lv: "normal",  lbl: "Normal" };
  if (n < CFG.thrCritico) return { lv: "atencao", lbl: "Atenção" };
  return { lv: "critico", lbl: "Crítico" };
}
function corPorStatus(lv) {
  // P6/ISA-101: normal é NEUTRO (cinza-azulado) — cor saturada só para anormalidade.
  return { normal: "#8a94ad", atencao: "#f0c040", critico: "#f04848", info: "#4da8f0", semsinal: "#8a90a3" }[lv] || "#4da8f0";
}

// P4 — histerese na detecção de borda (ISA-18.2: evita repicar bem em cima do limiar).
// Na SUBIDA de faixa a classificação é imediata (prioridade é detectar risco rápido); na
// DESCIDA só confirma a faixa nova quando o nível cair abaixo de (limiar da faixa anterior −
// CFG.histereseM). Helper puro, reaproveita classifyNivel — usado tanto para decidir se
// registra uma linha de alarme/evento quanto para o badge/faixa exibida (mesma regra:
// o badge não fica piscando na borda).
function classifyComHisterese(nivel, faixaAnterior) {
  const bruta = classifyNivel(nivel);
  if (!faixaAnterior || bruta.lv === faixaAnterior) return bruta;
  const ordem = { normal: 0, atencao: 1, critico: 2 };
  const subindo = ordem[bruta.lv] > ordem[faixaAnterior];
  if (subindo) return bruta;
  // descida: só confirma se caiu abaixo do limiar da faixa anterior menos a histerese;
  // senão, mantém a classificação da faixa anterior (não pisca na borda)
  if (faixaAnterior === "critico") {
    return nivel < (CFG.thrCritico - CFG.histereseM) ? bruta : { lv: "critico", lbl: "Crítico" };
  }
  if (faixaAnterior === "atencao") {
    return nivel < (CFG.thrAtencao - CFG.histereseM) ? bruta : { lv: "atencao", lbl: "Atenção" };
  }
  return bruta;
}

// ── ESTADO DE COMUNICAÇÃO (P1) ───────────────────────────────────────────────
// Helper puro: decide se a leitura de um piezômetro está "ok" ou "stale" (sem sinal).
// Dado ausente NUNCA é avaliado como normal — ver docs/projeto/DASHBOARD_PROFISSIONAL.md §2.
// Frescor = última RECEPÇÃO no servidor (leitura.recebidoEm), não a hora da medição no
// device (leitura.ts) — imune à deriva do relógio simulado do Wokwi. `ts` segue sendo
// usado só para exibição ("há X min") e gráficos; aqui é só fallback quando recebidoEm
// não vier (dado antigo/fonte simulada sem o campo).
function estadoComunicacao(leitura, agoraSeg = Date.now() / 1000) {
  if (!leitura) return "stale";
  const base = Number.isFinite(leitura.recebidoEm) ? leitura.recebidoEm : leitura.ts;
  if (!Number.isFinite(base)) return "stale";
  const idadeSeg = agoraSeg - base;
  return idadeSeg > CFG.staleSeg ? "stale" : "ok";
}

// Centraliza o contrato de consumo da leitura atual: uma amostra sem comunicação
// recente ainda pode exibir o último nível conhecido, mas não atualiza tendências
// nem indicadores operacionais.
function avaliarTelemetriaAtual(leitura, agoraSeg = Date.now() / 1000) {
  const status = estadoComunicacao(leitura, agoraSeg);
  const nivelConhecido = Number.isFinite(leitura?.nivel) ? leitura.nivel : null;
  const taxaAtual = status === "ok" && Number.isFinite(leitura?.taxa_m_dia)
    ? leitura.taxa_m_dia
    : null;

  return {
    status,
    nivelConhecido,
    taxaAtual,
    podeAtualizarIndicadores: status === "ok",
  };
}

// Formata "há X min/h/d" a partir de um timestamp em segundos (epoch)
function formatUltimaLeitura(ts) {
  if (!Number.isFinite(ts)) return "sem dados";
  const seg = Math.max(0, Date.now() / 1000 - ts);
  const min = Math.floor(seg / 60);
  if (min < 1) return "há <1 min";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

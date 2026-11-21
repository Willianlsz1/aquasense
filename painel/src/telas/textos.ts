import { CFG } from "../nucleo/config";
import type { EstadoPainel } from "../nucleo/painel";
import { fmtBR, type Estado } from "../nucleo/util";

export const nomes = (e: EstadoPainel) => Object.fromEntries(e.piezometros.map(p => [p.id, p.nome]));

export function tendencia(taxa: number | null) {
  if (taxa === null) return "sem taxa calculada";
  if (Math.abs(taxa) < 0.05) return "estável";
  return taxa > 0 ? `subindo ${fmtBR(taxa)} m/dia` : `descendo ${fmtBR(-taxa)} m/dia`;
}

export const taxaRapida = (taxa: number | null) => taxa !== null && Math.abs(taxa) >= CFG.taxaMaxMDia;

// Variação nas últimas 24 h: só com leitura atual confirmada e histórico.
export function var24(e: EstadoPainel, id: string, s: Estado) {
  const h = e.historicoRede[id];
  if (!Array.isArray(h) || h.length < 2 || s.nivel === null || s.lv === "semsinal") return null;
  return s.nivel - h[0].v;
}

// ── PREVISÃO DE CHEGADA AO LIMITE ─────────────────────────────────────────────
// Conta simples: distância até o próximo limite dividida pela taxa atual. É uma
// estimativa (supõe que a taxa continue igual), nunca uma garantia.
export type Previsao = { titulo: string; valor: string; det: string; tom: "neutro" | "wr" | "cr"; estimativa?: boolean };

function duracao(dias: number) {
  const h = dias * 24;
  if (h < 1) return "menos de 1 h";
  if (h < 48) return `cerca de ${Math.round(h)} h`;
  if (dias < 60) return `cerca de ${Math.round(dias)} dias`;
  return "mais de 2 meses";
}

export function previsao(s: Estado): Previsao {
  const titulo = "Chegada ao limite";
  if (s.lv === "semsinal" || s.nivel === null) return { titulo, valor: "—", det: "sem leitura recente para estimar", tom: "neutro" };
  if (s.nivel >= CFG.thrCritico) return { titulo, valor: "Acima do crítico", det: `já passou de ${fmtBR(CFG.thrCritico, 0)} m`, tom: "cr" };
  const alvo = s.nivel >= CFG.thrAtencao ? CFG.thrCritico : CFG.thrAtencao;
  const nomeAlvo = alvo === CFG.thrCritico ? "crítico" : "atenção";
  if (s.taxa === null) return { titulo, valor: "—", det: "sem taxa calculada", tom: "neutro" };
  if (s.taxa < 0.05) return { titulo, valor: "Sem subida", det: `nível ${s.taxa <= -0.05 ? "descendo" : "estável"}: sem previsão de chegar a ${fmtBR(alvo, 0)} m`, tom: "neutro" };
  const dias = (alvo - s.nivel) / s.taxa;
  return { titulo, valor: duracao(dias), det: `até ${nomeAlvo} (${fmtBR(alvo, 0)} m), se a taxa de ${fmtBR(s.taxa)} m/dia continuar`, tom: dias < 2 ? "wr" : "neutro", estimativa: true };
}

// ── REGRAS PURAS ──────────────────────────────────────────────────────────────
// Classificação de faixa (com e sem histerese), frescor da comunicação e
// formatação. Dado ausente ou antigo NUNCA é avaliado como normal.
import { CFG } from "./config";

export type Faixa = "normal" | "atencao" | "critico";
export type Situacao = Faixa | "semsinal";

export type Leitura = {
  nivel: number | null;
  pressao?: number | null;
  temperatura?: number | null;
  ts?: number;          // hora da medição no instrumento (s)
  recebidoEm?: number;  // hora em que o servidor recebeu (s) — base do frescor
  taxa_m_dia: number | null;
};

export const ROTULO: Record<Situacao, string> = { normal: "Normal", atencao: "Atenção", critico: "Crítico", semsinal: "Sem sinal" };
export const PRIORIDADE: Record<Situacao, number> = { critico: 0, atencao: 1, semsinal: 2, normal: 3 };

export const clamp = (v: number, mn: number, mx: number) => Math.max(mn, Math.min(mx, v));
export const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// Números no formato brasileiro (15,58) em toda a interface.
// Zero negativo (ex.: nível exatamente no limite, ou -0,001 arredondado) sai
// como "0,00", nunca "-0,00".
export const fmtBR = (v: number, casas = 2) => {
  const s = Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return /^-[0,.]+$/.test(s) ? s.slice(1) : s;
};

export function classificarNivel(n: number): Faixa {
  if (n < CFG.thrAtencao) return "normal";
  if (n < CFG.thrCritico) return "atencao";
  return "critico";
}

// Subida de faixa é imediata; descida só confirma abaixo do limite − histerese.
export function classificarComHisterese(nivel: number, anterior: Faixa | null): Faixa {
  const bruta = classificarNivel(nivel);
  if (!anterior || bruta === anterior) return bruta;
  const ordem = { normal: 0, atencao: 1, critico: 2 };
  if (ordem[bruta] > ordem[anterior]) return bruta;
  if (anterior === "critico") return nivel < CFG.thrCritico - CFG.histereseM ? bruta : "critico";
  if (anterior === "atencao") return nivel < CFG.thrAtencao - CFG.histereseM ? bruta : "atencao";
  return bruta;
}

// Frescor = última RECEPÇÃO no servidor; `ts` só como reserva para dado antigo.
export function timestampRecepcao(l?: Leitura | null): number | undefined {
  if (fin(l?.recebidoEm)) return l.recebidoEm;
  return fin(l?.ts) ? l.ts : undefined;
}

export function estadoComunicacao(l: Leitura | null | undefined, agoraSeg = Date.now() / 1000): "ok" | "stale" {
  const base = timestampRecepcao(l);
  if (!fin(base)) return "stale";
  return agoraSeg - base > CFG.staleSeg ? "stale" : "ok";
}

export type Estado = { lv: Situacao; nivel: number | null; taxa: number | null; recepcao?: number };

// Situação de um instrumento: nunca "normal" sem dado recente. A taxa só vale com
// comunicação recente.
export function situacaoPz(l: Leitura | null | undefined, agoraSeg = Date.now() / 1000): Estado {
  const nivel = fin(l?.nivel) ? l.nivel : null;
  const recepcao = timestampRecepcao(l);
  if (estadoComunicacao(l, agoraSeg) === "stale" || nivel === null) return { lv: "semsinal", nivel, taxa: null, recepcao };
  return { lv: classificarNivel(nivel), nivel, taxa: fin(l?.taxa_m_dia) ? l.taxa_m_dia : null, recepcao };
}

export function formatUltima(tsSeg: number | undefined | null, agoraMs = Date.now()): string {
  if (!fin(tsSeg)) return "sem dados";
  const min = Math.floor(Math.max(0, agoraMs / 1000 - tsSeg) / 60);
  if (min < 1) return "há <1 min";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

export const hora = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
export const diaHora = (ms: number) =>
  new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const escalaNivel = () => Math.max(4, Math.ceil(CFG.thrCritico * 1.2));

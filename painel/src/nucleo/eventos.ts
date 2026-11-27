// ── REGISTROS DO SERVIDOR E OCORRÊNCIAS ───────────────────────────────────────
// GET /alerts devolve até 50 transições registradas pelo Worker. No monitoramento
// real, as ocorrências vêm só daí; na demonstração, das transições da sessão.
import { fmtBR, fin, type Situacao } from "./util";

export const LIMITE_API_ALERTAS = 50;

export type EventoServidor = { ts: string; dataLocal: string; instrumento: string; tipo: string; evento: string; acao: string;
  valor?: number; taxa?: number; silencioMin?: number };
export type Ocorrencia = { pz: string; lv: Situacao | "ok"; t: number; titulo: string; det: string; servidor?: boolean };

function textoSeguro(valor: unknown, reserva = "—"): string {
  if (typeof valor !== "string" && typeof valor !== "number") return reserva;
  const texto = String(valor).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return texto || reserva;
}

export function normalizarEvento(r: Record<string, unknown> | null): EventoServidor | null {
  if (!r || typeof r !== "object" || typeof r.ts !== "string") return null;
  const data = new Date(r.ts);
  if (!Number.isFinite(data.getTime())) return null;
  const estado = textoSeguro(r.nivel || r.status, "");
  return {
    ts: data.toISOString(),
    dataLocal: data.toLocaleString("pt-BR"),
    instrumento: textoSeguro(r.piezometro, "Instrumento não informado"),
    tipo: textoSeguro(r.tipo, "evento").toUpperCase(),
    evento: textoSeguro(r.mensagem, estado || "Evento registrado"),
    acao: textoSeguro(r.acao, "Sem ação registrada"),
    ...(fin(r.valor) ? { valor: r.valor } : {}),
    ...(fin(r.taxa) ? { taxa: r.taxa } : {}),
    ...(fin(r.silencioMin) ? { silencioMin: r.silencioMin } : {}),
  };
}

// Vocabulário fixo: verbo curto + valor numa coluna própria (sem emoji, sem caixa alta).
const TITULOS_SERVIDOR: Record<string, string> = {
  CRITICO: "Entrou em crítico", "CRÍTICO": "Entrou em crítico", ATENCAO: "Entrou em atenção", "ATENÇÃO": "Entrou em atenção",
  NORMAL: "Voltou ao normal", "SEM SINAL": "Perdeu comunicação", "COMUNICAÇÃO RESTABELECIDA": "Comunicação restabelecida",
  "VARIAÇÃO RÁPIDA": "Variação rápida", "VARIAÇÃO NORMALIZADA": "Variação normalizada",
};

// Primeiro número do texto do servidor ("4.04 m"), caso o registro não traga o campo.
const numeroNoTexto = (t: string) => { const m = t.match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };

// "⚠️ AQUASENSE PIEZÔMETRO PZ-01 — SEM SINAL …" → título curto, valor e estado.
export function ocorrenciaDoServidor(ev: EventoServidor): Ocorrencia {
  const texto = String(ev.evento || "");
  const depois = (texto.split("—")[1] ?? texto).trim();
  const m = depois.match(/^([A-ZÀ-Ý ]+?)(?:\s+(?=[A-ZÀ-Ý][a-zà-ÿ])|$)/);
  const chave = m ? m[1].trim() : depois;
  const detalhe = m ? depois.slice(m[0].length).trim() : "";
  let lv: Ocorrencia["lv"] = "ok";
  if (/CR[IÍ]TICO/.test(chave)) lv = "critico";
  else if (chave.includes("SEM SINAL")) lv = "semsinal";
  else if (/ATEN|R[AÁ]PIDA/.test(chave)) lv = "atencao";
  const titulo = TITULOS_SERVIDOR[chave] || chave.toLowerCase().replace(/^./, c => c.toUpperCase());
  let det = "—";
  if (/R[AÁ]PIDA/.test(chave)) {
    const n = numeroNoTexto(detalhe);
    const t = ev.taxa ?? (n === null ? null : /descendo/i.test(detalhe) ? -n : n);
    if (fin(t)) det = `${t >= 0 ? "+" : ""}${fmtBR(t)} m/dia`;
  } else if (lv === "semsinal") {
    det = fin(ev.silencioMin) && ev.silencioMin > 0 ? `há ${ev.silencioMin} min sem leitura` : /nenhuma/i.test(detalhe) ? "nenhuma leitura" : "—";
  } else if (/CR[IÍ]TICO|ATEN|NORMAL$/.test(chave) && !/VARIA/.test(chave)) {
    const v = ev.valor ?? numeroNoTexto(detalhe);
    if (fin(v)) det = `${fmtBR(v)} m`;
  }
  return { pz: ev.instrumento, lv, t: new Date(ev.ts).getTime(), titulo, det, servidor: true };
}

export function textoOcorrencia(lv: Situacao, nivel: number | null): { titulo: string; det: string } {
  const v = fin(nivel) ? `${fmtBR(nivel)} m` : "—";
  if (lv === "critico") return { titulo: "Entrou em crítico", det: v };
  if (lv === "atencao") return { titulo: "Entrou em atenção", det: v };
  if (lv === "semsinal") return { titulo: "Perdeu comunicação", det: fin(nivel) ? `última ${v}` : "nenhuma leitura" };
  return { titulo: "Voltou ao normal", det: v };
}

// ── CSV seguro ────────────────────────────────────────────────────────────────
export function campoCsv(valor: unknown): string {
  let texto = String(valor ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(texto)) texto = "'" + texto; // planilha não interpreta como fórmula
  return `"${texto.replace(/"/g, '""')}"`;
}

export function baixar(conteudo: string, tipo: string, nome: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportarEventosCsv(eventos: EventoServidor[], pz: string, comErro: boolean) {
  const gerado = new Date();
  const meta: (string | number)[][] = [
    ["Relatório", "Histórico de alertas AquaSense"],
    ["Origem", "API do sistema (/alerts)"],
    ["Escopo", `Registros retornados pela API; máximo de ${LIMITE_API_ALERTAS}, não é histórico completo`],
    ["Filtro de instrumento", pz],
    ["Estado da consulta", comErro ? "cache; última atualização falhou" : "consulta atualizada"],
    ["Gerado em (local)", gerado.toLocaleString("pt-BR")],
    ["Gerado em (UTC)", gerado.toISOString()],
    ["Registros exportados", eventos.length],
  ];
  const linhas = [
    ...meta.map(l => l.map(campoCsv).join(";")), "",
    ["Data/hora local", "Data/hora UTC", "Instrumento", "Tipo", "Evento", "Ação"].map(campoCsv).join(";"),
    ...eventos.map(e => [e.dataLocal, e.ts, e.instrumento, e.tipo, e.evento, e.acao].map(campoCsv).join(";")),
  ];
  baixar("﻿" + linhas.join("\r\n"), "text/csv;charset=utf-8;", `alertas_${pz}_${gerado.toISOString().slice(0, 10)}.csv`);
}

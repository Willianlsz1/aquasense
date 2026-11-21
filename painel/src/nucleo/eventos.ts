// ── REGISTROS DO SERVIDOR E OCORRÊNCIAS ───────────────────────────────────────
// GET /alerts devolve até 50 transições registradas pelo Worker. No monitoramento
// real, as ocorrências vêm só daí; na demonstração, das transições da sessão.
import { CFG } from "./config";
import { fmtBR, fin, type Situacao } from "./util";

export const LIMITE_API_ALERTAS = 50;

export type EventoServidor = { ts: string; dataLocal: string; instrumento: string; tipo: string; evento: string; acao: string };
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
  };
}

const TITULOS_SERVIDOR: Record<string, string> = {
  CRITICO: "Nível crítico", "CRÍTICO": "Nível crítico", ATENCAO: "Nível em atenção", "ATENÇÃO": "Nível em atenção",
  NORMAL: "Voltou à faixa normal", "SEM SINAL": "Sem sinal", "COMUNICAÇÃO RESTABELECIDA": "Comunicação restabelecida",
  "VARIAÇÃO RÁPIDA": "Variação rápida", "VARIAÇÃO NORMALIZADA": "Variação normalizada",
};

// "⚠️ AQUASENSE PIEZÔMETRO PZ-01 — SEM SINAL …" → título curto, detalhe e estado.
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
  return { pz: ev.instrumento, lv, t: new Date(ev.ts).getTime(), titulo, det: detalhe || ev.acao, servidor: true };
}

export function textoOcorrencia(lv: Situacao, nivel: number | null): { titulo: string; det: string } {
  const v = fin(nivel) ? `${fmtBR(nivel)} m` : "";
  if (lv === "critico") return { titulo: "passou de " + fmtBR(CFG.thrCritico, 0) + " m (nível crítico)", det: `${v} · acionar a geotecnia` };
  if (lv === "atencao") return { titulo: "passou de " + fmtBR(CFG.thrAtencao, 0) + " m (atenção)", det: v };
  if (lv === "semsinal") return { titulo: "parou de comunicar", det: fin(nivel) ? `última leitura ${v}` : "nenhuma leitura recebida" };
  return { titulo: "voltou à faixa normal", det: v };
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

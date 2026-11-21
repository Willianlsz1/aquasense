// ── EXPORTAR LEITURAS (CSV e Excel) ───────────────────────────────────────────
// Mesmas linhas para os dois formatos. Status SEMPRE pelo pico do intervalo, nunca
// pela média. A fonte (real ou simulação) vai no cabeçalho do arquivo.
import { CFG, PERIODOS } from "./config";
import { baixar } from "./eventos";
import { classificarNivel, fin, ROTULO, type Faixa } from "./util";

export type PontoHist = { t: number; v: number; max: number; min?: number; n?: number };

type LinhaExp = { dataHora: string; pz: string; value: number; min?: number; max: number; n?: number; status: string; statusLv: Faixa; qualidade: string };

function linhas(pontos: PontoHist[], pz: string): LinhaExp[] {
  return pontos.map(p => {
    const lv = classificarNivel(p.max);
    let qualidade = "ok";
    if (p.max === 0) qualidade = "suspeito: nível zero";
    else if (fin(p.n) && p.n < 3) qualidade = "poucas leituras";
    return { dataHora: new Date(p.t).toLocaleString("pt-BR"), pz, value: p.v, min: p.min, max: p.max, n: p.n, status: ROTULO[lv], statusLv: lv, qualidade };
  });
}

const num = (n: number | undefined, casas = 2) => (fin(n) ? n.toFixed(casas).replace(".", ",") : "");

function meta(pz: string, periodo: string, bucketSeg: number | undefined, simulada: boolean, total: number) {
  return {
    pz, periodo: PERIODOS[periodo]?.label ?? periodo,
    intervalo: fin(bucketSeg) ? `${Math.round(bucketSeg / 60)} min` : "ao vivo",
    geradoEm: new Date().toLocaleString("pt-BR"),
    fonte: simulada ? "SIMULAÇÃO: dados fictícios de demonstração" : "Sistema real (API de produção)",
    at: num(CFG.thrAtencao, 1), cr: num(CFG.thrCritico, 1), total,
  };
}

export function exportarCsv(pontos: PontoHist[], pz: string, periodo: string, bucketSeg: number | undefined, simulada: boolean) {
  const ls = linhas(pontos, pz);
  const m = meta(pz, periodo, bucketSeg, simulada, ls.length);
  const cab = [
    `Instrumento;${m.pz}`, `Período solicitado;${m.periodo}`, `Intervalo de agregação;${m.intervalo}`,
    `Gerado em;${m.geradoEm}`, `Fonte dos dados;${m.fonte}`,
    `Limiares vigentes;atenção ${m.at} m / crítico ${m.cr} m`, `Total de intervalos exportados;${m.total}`,
  ];
  const header = ["Data/Hora", "Piezômetro", "Nível médio (m)", "Nível mín (m)", "Nível máx (m)", "Leituras no intervalo", "Status (pelo pico)", "Qualidade"].join(";");
  const rows = ls.map(l => [l.dataHora, l.pz, num(l.value), num(l.min), num(l.max), fin(l.n) ? String(l.n) : "", l.status, l.qualidade].join(";"));
  baixar("﻿" + [...cab, "", header, ...rows].join("\r\n"), "text/csv;charset=utf-8;", `piezometro_${pz}_${periodo}.csv`);
}

// ── Excel (SpreadsheetML 2003, sem biblioteca) ────────────────────────────────
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const CORES: Record<Faixa, { bg: string; fg: string }> = {
  normal: { bg: "#C9F5DA", fg: "#14532D" }, atencao: { bg: "#FDEEB3", fg: "#7A5B00" }, critico: { bg: "#FBD2D2", fg: "#7A1414" },
};
function estilo(id: string, o: { bg?: string; fg?: string; bold?: boolean; size?: number; align?: string; wrap?: boolean } = {}) {
  return `<Style ss:ID="${id}"><Font ss:Bold="${o.bold ? 1 : 0}"${o.size ? ` ss:Size="${o.size}"` : ""}${o.fg ? ` ss:Color="${o.fg}"` : ""}/>` +
    `${o.bg ? `<Interior ss:Color="${o.bg}" ss:Pattern="Solid"/>` : ""}<Alignment ss:Horizontal="${o.align || "Left"}" ss:Vertical="Center"${o.wrap ? ' ss:WrapText="1"' : ""}/>` +
    `<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D4DC"/></Borders></Style>`;
}
const cel = (t: unknown, s?: string, merge?: number) => `<Cell${s ? ` ss:StyleID="${s}"` : ""}${merge ? ` ss:MergeAcross="${merge}"` : ""}><Data ss:Type="String">${esc(t)}</Data></Cell>`;
const lin = (cs: string[]) => `<Row>${cs.join("")}</Row>`;

export function exportarXls(pontos: PontoHist[], pz: string, periodo: string, bucketSeg: number | undefined, simulada: boolean) {
  const ls = linhas(pontos, pz);
  const m = meta(pz, periodo, bucketSeg, simulada, ls.length);
  const mins = ls.map(l => (fin(l.min) ? l.min : l.value));
  const maxs = ls.map(l => l.max);
  const media = ls.length ? ls.reduce((a, l) => a + l.value, 0) / ls.length : NaN;
  const estilos = "<Styles>" + [
    estilo("sTit", { bg: "#0B2545", fg: "#FFFFFF", bold: true, size: 14, align: "Center" }),
    estilo("sCtx", { bg: "#1E3A5F", fg: "#DCE6F0", size: 10, align: "Center" }),
    estilo("sHead", { bg: "#1E88E5", fg: "#FFFFFF", bold: true, size: 10, align: "Center", wrap: true }),
    estilo("sCel"), estilo("sNum", { align: "Right" }),
    estilo("sNormal", { ...CORES.normal, bold: true, align: "Center" }),
    estilo("sAtencao", { ...CORES.atencao, bold: true, align: "Center" }),
    estilo("sCritico", { ...CORES.critico, bold: true, align: "Center" }),
    estilo("sRes", { align: "Center" }),
  ].join("") + "</Styles>";
  const st = { normal: "sNormal", atencao: "sAtencao", critico: "sCritico" };
  const rows = [
    lin([cel("MONITORAMENTO DE NÍVEL D'ÁGUA EM PIEZÔMETROS · RELATÓRIO DE LEITURAS", "sTit", 7)]),
    lin([cel(`Instrumento: ${m.pz}  |  Período: ${m.periodo}  |  Intervalo: ${m.intervalo}  |  Fonte: ${m.fonte}`, "sCtx", 7)]),
    lin([cel(`Gerado em: ${m.geradoEm}  |  Limiares: atenção ${m.at} m / crítico ${m.cr} m  |  Intervalos: ${m.total}`, "sCtx", 7)]),
    lin(["Data/Hora", "Piezômetro", "Nível médio (m)", "Nível mín (m)", "Nível máx (m)", "Leituras no intervalo", "Status (pelo pico)", "Qualidade"].map(t => cel(t, "sHead"))),
    ...ls.map(l => lin([cel(l.dataHora, "sCel"), cel(l.pz, "sCel"), cel(num(l.value), "sNum"), cel(num(l.min), "sNum"), cel(num(l.max), "sNum"),
      cel(fin(l.n) ? String(l.n) : "", "sNum"), cel(l.status, st[l.statusLv]), cel(l.qualidade, "sCel")])),
    lin([cel("")]),
    lin([cel("RESUMO DO PERÍODO", "sTit", 4)]),
    lin(["Nível mínimo", "Nível máximo", "Média", "Intervalos em atenção (pico)", "Intervalos em crítico (pico)"].map(t => cel(t, "sHead"))),
    lin([cel(num(mins.length ? Math.min(...mins) : NaN), "sRes"), cel(num(maxs.length ? Math.max(...maxs) : NaN), "sRes"), cel(num(media), "sRes"),
      cel(String(ls.filter(l => l.statusLv === "atencao").length), "sRes"), cel(String(ls.filter(l => l.statusLv === "critico").length), "sRes")]),
  ];
  const cols = [110, 90, 110, 90, 90, 120, 110, 150].map(w => `<Column ss:Width="${w}"/>`).join("");
  const xml = '<?xml version="1.0"?>\r\n<?mso-application progid="Excel.Sheet"?>\r\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">' +
    estilos + `<Worksheet ss:Name="Relatorio"><Table>${cols}${rows.join("")}</Table></Worksheet></Workbook>`;
  baixar(xml, "application/vnd.ms-excel;charset=utf-8;", `piezometro_${pz}_${periodo}.xls`);
}

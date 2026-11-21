// ── RELATÓRIO IMPRIMÍVEL ──────────────────────────────────────────────────────
// Lê ?pz= e ?range=, busca o histórico agregado (/dados) e o último valor
// (/ultimos) do sistema real. Se a API não responder, mostra o erro: nunca
// inventa números. Sempre em tema claro (impressão).
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Printer } from "lucide-react";
import "./index.css";
import { carregarConfig, CFG, PERIODOS, PIEZOMETROS } from "./nucleo/config";
import { FonteApi, type PontoBruto } from "./nucleo/fontes";
import { classificarNivel, fin, fmtBR, formatUltima, ROTULO, situacaoPz, type Leitura } from "./nucleo/util";
import { Logo } from "./componentes/base";

document.documentElement.dataset.tema = "claro";

const q = new URLSearchParams(location.search);
const nd = (v: number | undefined | null, casas = 2) => (fin(v) ? fmtBR(v, casas) : "n/d");
const dh = (tsSeg: number) => new Date(tsSeg * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const pico = (p: PontoBruto) => (fin(p.nivel_max) ? p.nivel_max : p.nivel_agua);

type Carga = { estado: "carregando" } | { estado: "erro"; msg: string }
  | { estado: "ok"; pontos: PontoBruto[]; bucketSeg?: number; ultimo: Leitura | null; em: Date };

function Relatorio() {
  const [pronto, setPronto] = useState(false);
  const [pz, setPz] = useState(q.get("pz") || "PZ-01");
  const [range, setRange] = useState(PERIODOS[q.get("range") || ""] ? q.get("range")! : "24h");
  const [carga, setCarga] = useState<Carga>({ estado: "carregando" });
  const gerado = useState(() => new Date())[0];
  const endpoint = `/dados?pz=${pz}&range=${range}`;

  useEffect(() => {
    void carregarConfig().then(() => {
      if (!PIEZOMETROS.some(p => p.id === pz)) setPz(PIEZOMETROS[0]?.id || "PZ-01");
      setPronto(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pronto) return;
    document.title = `Relatorio_AquaSense_${pz}_${range}`;
    let vivo = true;
    void (async () => {
      setCarga({ estado: "carregando" });
      let pontos: PontoBruto[], bucketSeg: number | undefined;
      try {
        const h = await FonteApi.historico(pz, range);
        pontos = h.pontos.filter(p => fin(p.nivel_agua)); bucketSeg = h.bucket_seg;
      } catch (e) {
        console.warn("Relatório:", (e as Error).message);
        if (vivo) setCarga({ estado: "erro", msg: "Sem conexão com o sistema · relatório indisponível" });
        return;
      }
      if (!pontos.length) {
        if (vivo) setCarga({ estado: "erro", msg: `Nenhuma leitura registrada para ${pz} no período selecionado (${PERIODOS[range].label}).` });
        return;
      }
      // Nível atual é complementar: se /ultimos falhar, usa o último intervalo (dito na auditoria).
      let ultimo: Leitura | null = null;
      try { ultimo = (await FonteApi.ultimos())[pz] ?? null; } catch (e) { console.warn("Relatório: /ultimos indisponível —", (e as Error).message); }
      if (vivo) setCarga({ estado: "ok", pontos, bucketSeg, ultimo, em: new Date() });
    })();
    return () => { vivo = false; };
  }, [pronto, pz, range]);

  const navegar = (p: string, r: string) => { history.replaceState(null, "", `?pz=${encodeURIComponent(p)}&range=${encodeURIComponent(r)}`); setPz(p); setRange(r); };
  const nome = PIEZOMETROS.find(p => p.id === pz)?.nome ?? "";

  return (
    <div className="min-h-full bg-fundo py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 px-4">
        <select aria-label="Instrumento" value={pz} onChange={e => navegar(e.target.value, range)} className="h-9 rounded-lg border border-linha bg-card px-2.5 text-[13.5px]">
          {PIEZOMETROS.map(p => <option key={p.id} value={p.id}>{p.id} · {p.nome}</option>)}
        </select>
        <select aria-label="Período" value={range} onChange={e => navegar(pz, e.target.value)} className="h-9 rounded-lg border border-linha bg-card px-2.5 text-[13.5px]">
          {Object.entries(PERIODOS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        </select>
        <button type="button" onClick={() => window.print()} disabled={carga.estado !== "ok"}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-texto px-3.5 py-2 text-[13.5px] font-semibold text-card disabled:opacity-50">
          <Printer size={15} /> Imprimir / salvar PDF
        </button>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[#17202B] shadow-card print:shadow-none">
        <header className="flex items-start gap-3 border-b-2 border-[#17202B] pb-3">
          <Logo tam={30} />
          <div>
            <div className="text-[18px] font-semibold tracking-tight">aquasense</div>
            <div className="text-[12px] text-[#5A6676]">Relatório de monitoramento de piezômetro</div>
          </div>
          <div className="ml-auto text-right text-[12px] text-[#5A6676]">
            <div className="text-[16px] font-semibold text-[#17202B]">{pz}{nome ? ` · ${nome}` : ""}</div>
            <div>Período: {PERIODOS[range].label}</div>
            <div>Gerado em: {(carga.estado === "ok" ? carga.em : gerado).toLocaleString("pt-BR")}</div>
          </div>
        </header>
        {carga.estado === "carregando" && <p className="py-16 text-center text-[#5A6676]">Carregando dados do sistema…</p>}
        {carga.estado === "erro" && <p role="alert" className="my-10 rounded-lg border border-[#C9CED6] bg-[#F2F4F7] px-4 py-6 text-center text-[14px] font-medium">⚠ {carga.msg}</p>}
        {carga.estado === "ok" && <Corpo pontos={carga.pontos} bucketSeg={carga.bucketSeg} ultimo={carga.ultimo} endpoint={endpoint} />}
      </article>
    </div>
  );
}

function Corpo({ pontos, bucketSeg, ultimo, endpoint }: { pontos: PontoBruto[]; bucketSeg?: number; ultimo: Leitura | null; endpoint: string }) {
  const medias = pontos.map(p => p.nivel_agua);
  const maxs = pontos.map(pico);
  const mins = pontos.map(p => (fin(p.nivel_min) ? p.nivel_min : p.nivel_agua));
  const temN = pontos.some(p => fin(p.n_leituras));
  const somaN = pontos.reduce((a, p) => a + (fin(p.n_leituras) ? p.n_leituras : 0), 0);
  const peso = (p: PontoBruto) => (fin(p.n_leituras) ? p.n_leituras : 1);
  const media = temN ? pontos.reduce((a, p) => a + p.nivel_agua * peso(p), 0) / pontos.reduce((a, p) => a + peso(p), 0)
    : medias.reduce((a, b) => a + b, 0) / medias.length;
  const s = ultimo ? situacaoPz(ultimo) : null;
  const stale = s?.lv === "semsinal";
  const nivelAtual = s && s.nivel !== null ? s.nivel : medias[medias.length - 1];
  const subAtual = stale ? `SEM SINAL · ${formatUltima(s!.recepcao)}` : ultimo && fin(ultimo.ts) ? formatUltima(ultimo.ts) : "último intervalo agregado";
  const alarmes = pontos.filter(p => classificarNivel(pico(p)) !== "normal").length;
  const cards: [string, string, string?][] = [
    [stale ? "Última leitura conhecida" : "Nível atual", `${nd(nivelAtual)} m`, subAtual],
    ["Mínimo do período", `${nd(Math.min(...mins))} m`],
    ["Média do período", `${nd(media)} m`, temN ? "ponderada por leituras" : "média simples"],
    ["Máximo (médias)", `${nd(Math.max(...medias))} m`],
    ["Pico máximo do período", `${nd(Math.max(...maxs))} m`],
    ["Leituras recebidas", temN ? somaN.toLocaleString("pt-BR") : "n/d"],
    ["Alarmes no período", String(alarmes), "pico em atenção/crítico"],
  ];
  const dados = pontos.map(p => ({ t: p.ts * 1000, v: p.nivel_agua, max: pico(p) }));
  const mn = Math.floor(Math.min(...medias, CFG.thrAtencao) - 1), mx = Math.ceil(Math.max(...maxs, CFG.thrCritico) + 1);
  const curto = pontos[pontos.length - 1].ts - pontos[0].ts <= 2 * 86400;
  // Marcas do eixo em horas cheias (ou à meia-noite, em períodos longos).
  const ini = dados[0].t, fim = dados[dados.length - 1].t, span = fim - ini;
  const passo = span <= 12 * 3600e3 ? 3600e3 : span <= 2 * 86400e3 ? 4 * 3600e3 : span <= 10 * 86400e3 ? 86400e3 : span <= 40 * 86400e3 ? 5 * 86400e3 : 15 * 86400e3;
  const d0 = new Date(ini); d0.setMinutes(0, 0, 0); if (passo >= 86400e3) d0.setHours(0);
  const ticks: number[] = [];
  for (let t = d0.getTime(); t <= fim; t += passo) if (t >= ini) ticks.push(t);
  const fx = (t: number) => new Date(t).toLocaleString("pt-BR", curto ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" });
  const auditoria: [string, string][] = [
    ["Fonte dos dados", "Sistema real (Cloudflare Worker + D1)"],
    [stale ? "Última leitura conhecida" : "Nível atual", stale ? `GET /ultimos · SEM SINAL (${formatUltima(s!.recepcao)})`
      : ultimo ? "GET /ultimos (leitura mais recente recebida)" : "GET /ultimos indisponível · usado o último intervalo agregado"],
    ["Limiares vigentes", `atenção ${fmtBR(CFG.thrAtencao)} m · crítico ${fmtBR(CFG.thrCritico)} m`],
    ["Intervalo de agregação", fin(bucketSeg) ? `${Math.round(bucketSeg / 60)} min` : "n/d"],
    ["Endpoint", endpoint],
    ["Status por intervalo", "classificado pelo pico (máximo), nunca pela média"],
  ];
  const cor = (lv: string) => (lv === "critico" ? "#B3261E" : lv === "atencao" ? "#8A5A00" : "#17202B");
  return (
    <>
      <h2 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-[#5A6676]">Resumo</h2>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {cards.map(([r, v, sub]) => (
          <div key={r} className="rounded-lg border border-[#DDE2E8] px-3 py-2">
            <div className="text-[11px] text-[#5A6676]">{r}</div>
            <div className="num text-[17px] font-semibold">{v}</div>
            {sub && <div className="text-[10.5px] text-[#5A6676]">{sub}</div>}
          </div>
        ))}
      </div>
      <h2 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-[#5A6676]">Nível d'água no período</h2>
      <div className="mt-1 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 8, right: 70, bottom: 0, left: -10 }}>
            <CartesianGrid vertical={false} stroke="#E4E8EF" />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fx} tick={{ fill: "#4A5268", fontSize: 10.5 }} tickLine={false} axisLine={false} ticks={ticks} />
            <YAxis domain={[mn, mx]} tickFormatter={v => `${v} m`} tick={{ fill: "#4A5268", fontSize: 10.5 }} tickLine={false} axisLine={false} width={48} allowDecimals={false} />
            <ReferenceLine y={CFG.thrCritico} stroke="#B3261E" strokeDasharray="5 4" label={{ value: `crítico ${fmtBR(CFG.thrCritico, 0)} m`, position: "right", fill: "#B3261E", fontSize: 10.5 }} />
            <ReferenceLine y={CFG.thrAtencao} stroke="#B07A00" strokeDasharray="5 4" label={{ value: `atenção ${fmtBR(CFG.thrAtencao, 0)} m`, position: "right", fill: "#8A5A00", fontSize: 10.5 }} />
            <Line dataKey="max" stroke="#8C99AB" strokeDasharray="3 3" strokeWidth={1.2} dot={false} isAnimationActive={false} />
            <Line dataKey="v" stroke="#1E5AA8" strokeWidth={1.8} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10.5px] text-[#5A6676]">Linha cheia: média do intervalo · tracejada: máximo do intervalo.</p>
      <h2 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-[#5A6676]">Intervalos ({pontos.length})</h2>
      <table className="mt-2 w-full text-[11.5px]">
        <thead className="border-b border-[#17202B] text-left"><tr><th className="py-1">Data / hora</th><th>Média (m)</th><th>Mínimo (m)</th><th>Máximo (m)</th><th>Leituras</th><th>Status (pico)</th></tr></thead>
        <tbody className="divide-y divide-[#E4E8EF]">
          {pontos.map(p => {
            const lv = classificarNivel(pico(p));
            return (
              <tr key={p.ts} className="break-inside-avoid">
                <td className="num py-0.5">{dh(p.ts)}</td><td className="num">{nd(p.nivel_agua)}</td><td className="num">{nd(p.nivel_min)}</td>
                <td className="num">{nd(pico(p))}</td><td className="num">{fin(p.n_leituras) ? p.n_leituras : "n/d"}</td>
                <td style={{ color: cor(lv), fontWeight: lv === "normal" ? 400 : 600 }}>{ROTULO[lv]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-[#5A6676]">Auditoria</h2>
      <dl className="mt-2 grid grid-cols-[180px_1fr] gap-x-4 gap-y-1 text-[11.5px]">
        {auditoria.map(([k, v]) => <div key={k} className="contents"><dt className="text-[#5A6676]">{k}</dt><dd className="font-mono">{v}</dd></div>)}
      </dl>
      <p className="mt-5 border-t border-[#DDE2E8] pt-2 text-[10px] text-[#5A6676]">AquaSense · SENAI Belo Horizonte HORTO · Desafio INTEGRA MG</p>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Relatorio /></StrictMode>);

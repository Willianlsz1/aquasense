import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CFG } from "../nucleo/config";
import type { PontoHist } from "../nucleo/exportar";
import { classificarNivel, diaHora, fmtBR, hora, ROTULO, type Situacao } from "../nucleo/util";

const H = 3600_000;

// Insere um ponto vazio onde falta dado: a linha é interrompida, nunca ligada
// por cima da lacuna.
function comLacunas<T extends { t: number }>(pts: T[], limiteMs: number, vazio: (t: number) => T): T[] {
  const out: T[] = [];
  pts.forEach((p, i) => {
    if (i && p.t - pts[i - 1].t > limiteMs) out.push(vazio((p.t + pts[i - 1].t) / 2));
    out.push(p);
  });
  return out;
}

function ticksHora(ini: number, fim: number, passoH: number, dia = false) {
  const d = new Date(ini); d.setMinutes(0, 0, 0); if (dia) d.setHours(0);
  const out: number[] = [];
  for (let t = d.getTime(); t <= fim; t += passoH * H) if (t >= ini) out.push(t);
  return out;
}
// ── HISTÓRICO DO INSTRUMENTO ──────────────────────────────────────────────────
// Direção A: limites em cinza tracejado; a linha só ganha cor no trecho acima de
// um limite (âmbar acima da atenção, vermelho acima do crítico). Lacuna = faixa
// hachurada "Sem dados · N h", nunca preenchida. Linha fina cinza = máximo do
// intervalo (o pico nunca fica escondido atrás da média).
type Lacuna = { de: number; ate: number };

function lacunas(pontos: PontoHist[], ini: number, fim: number, limiteMs: number): Lacuna[] {
  const out: Lacuna[] = [];
  if (!pontos.length) return [{ de: ini, ate: fim }];
  if (pontos[0].t - ini > limiteMs) out.push({ de: ini, ate: pontos[0].t });
  pontos.forEach((p, i) => { if (i && p.t - pontos[i - 1].t > limiteMs) out.push({ de: pontos[i - 1].t, ate: p.t }); });
  if (fim - pontos[pontos.length - 1].t > limiteMs) out.push({ de: pontos[pontos.length - 1].t, ate: fim });
  return out;
}

const duracaoLacuna = (ms: number) => ms >= 48 * H ? `${Math.round(ms / (24 * H))} dias` : ms >= H ? `${Math.round(ms / H)} h` : `${Math.max(1, Math.round(ms / 60000))} min`;

// Gradiente vertical da linha (caixa do próprio traço): cor por faixa de valor.
function paradas(vmin: number, vmax: number) {
  const off = (v: number) => Math.min(1, Math.max(0, (vmax - v) / (vmax - vmin)));
  const c = off(CFG.thrCritico), a = off(CFG.thrAtencao);
  return [
    { o: 0, c: "var(--cr)" }, { o: c, c: "var(--cr)" }, { o: c, c: "var(--wr)" },
    { o: a, c: "var(--wr)" }, { o: a, c: "var(--agua-linha)" }, { o: 1, c: "var(--agua-linha)" },
  ];
}

export function GraficoInstrumento({ pontos, bucketMs, longo, estado, ini, fim }:
  { pontos: PontoHist[]; bucketMs: number; longo: boolean; estado: Situacao; ini: number; fim: number }) {
  const ordenados = useMemo(() => {
    const m = new Map<number, PontoHist>();
    pontos.forEach(p => m.set(p.t, p));
    return [...m.values()].sort((x, y) => x.t - y.t);
  }, [pontos]);
  const dados = useMemo(() => comLacunas(ordenados.map(p => ({ t: p.t, v: p.v as number | null, max: p.max as number | null })), 2 * bucketMs,
    t => ({ t, v: null, max: null })), [ordenados, bucketMs]);
  const buracos = lacunas(ordenados, ini, fim, 2 * bucketMs);
  const vs = ordenados.map(p => p.v);
  const vmin = Math.min(...vs), vmax = Math.max(...vs);
  const plano = !(vmax - vmin > 1e-6);
  const corPlana = vmax >= CFG.thrCritico ? "var(--cr)" : vmax >= CFG.thrAtencao ? "var(--wr)" : "var(--agua-linha)";
  const passoH = longo ? (fim - ini > 20 * 24 * H ? 24 * 7 : 24) : 4;
  const fmtX = (t: number) => longo ? new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : hora(t);
  const u = ordenados[ordenados.length - 1];
  const yMax = Math.max(CFG.thrCritico + 3, Math.ceil(Math.max(...ordenados.map(p => p.max)) + 1));
  const ticksY = [0, 5, 10, 15, 20, 25, 30].filter(v => v <= yMax);
  return (
    <div className="h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 12, right: 16, bottom: 0, left: -4 }}>
          <defs>
            <linearGradient id="g-agua" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4FA3DB" stopOpacity=".22" /><stop offset="1" stopColor="#4FA3DB" stopOpacity="0" /></linearGradient>
            <linearGradient id="g-linha" x1="0" y1="0" x2="0" y2="1">{paradas(vmin, vmax).map((p, i) => <stop key={i} offset={p.o} stopColor={p.c} />)}</linearGradient>
            <pattern id="g-hach" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--card)" /><line x1="0" y1="0" x2="0" y2="8" stroke="#1E252C" strokeWidth="3" /></pattern>
          </defs>
          <CartesianGrid vertical={false} stroke="#1E252C" />
          <XAxis dataKey="t" type="number" scale="time" domain={[ini, fim]} ticks={ticksHora(ini, fim, passoH, longo)} tickFormatter={fmtX} tickLine={false} axisLine={false} />
          <YAxis domain={[0, yMax]} ticks={ticksY} tickFormatter={v => `${v} m`} tickLine={false} axisLine={false} width={44} />
          {buracos.map(b => (
            <ReferenceArea key={b.de} x1={b.de} x2={b.ate} y1={0} y2={yMax} fill="url(#g-hach)" fillOpacity={1} stroke="none" ifOverflow="hidden"
              label={b.ate - b.de > (fim - ini) * 0.12 ? { value: `Sem dados · ${duracaoLacuna(b.ate - b.de)}`, position: "center", fill: "var(--texto-3)", fontSize: 12 } : undefined} />
          ))}
          <ReferenceLine y={CFG.thrCritico} stroke="#56606B" strokeDasharray="4 4" label={{ value: `Crítico ${fmtBR(CFG.thrCritico, 0)} m`, position: "insideTopLeft", fill: "var(--texto-2)", fontSize: 11, offset: 6 }} />
          <ReferenceLine y={CFG.thrAtencao} stroke="#56606B" strokeDasharray="4 4" label={{ value: `Atenção ${fmtBR(CFG.thrAtencao, 0)} m`, position: "insideTopLeft", fill: "var(--texto-2)", fontSize: 11, offset: 6 }} />
          <Tooltip content={<DicaInstrumento />} cursor={{ stroke: "var(--texto-3)", strokeDasharray: "3 3" }} />
          <Area dataKey="v" stroke="none" fill="url(#g-agua)" type="monotone" connectNulls={false} isAnimationActive={false} activeDot={false} />
          <Line dataKey="max" stroke="var(--texto-3)" strokeOpacity={0.6} strokeWidth={1} strokeDasharray="2 3" dot={false} type="monotone" connectNulls={false} activeDot={false} isAnimationActive={false} />
          <Line dataKey="v" stroke={plano ? corPlana : "url(#g-linha)"} strokeWidth={1.9} dot={false} type="monotone" connectNulls={false} isAnimationActive={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--agua-linha)" }} />
          {u && <ReferenceDot x={u.t} y={u.v} r={4} fill={estado === "critico" ? "var(--cr)" : estado === "atencao" ? "var(--wr)" : estado === "semsinal" ? "var(--of)" : "var(--agua-linha)"} stroke="var(--card)" strokeWidth={2} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function DicaInstrumento({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number | null }[]; label?: number }) {
  if (!active || !payload?.length || label == null) return null;
  const v = payload.find(p => p.dataKey === "v")?.value, mx = payload.find(p => p.dataKey === "max")?.value;
  if (v == null) return <div className="rounded-lg border border-linha-2 bg-card-2 px-3 py-2 text-[12px]">Sem dados neste intervalo</div>;
  const pico = mx ?? v;
  return (
    <div className="rounded-lg border border-linha-2 bg-card-2 px-3 py-2.5 text-[12px]">
      <div className="num mb-1.5 font-semibold">{diaHora(label)}</div>
      <div className="flex justify-between gap-6"><span className="text-texto-2">Nível (média)</span><b className="num">{fmtBR(v)} m</b></div>
      {pico !== v && <div className="flex justify-between gap-6"><span className="text-texto-2">Máx. do intervalo</span><b className="num">{fmtBR(pico)} m</b></div>}
      <div className="flex justify-between gap-6"><span className="text-texto-2">Faixa (pelo pico)</span><b>{ROTULO[classificarNivel(pico)]}</b></div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CFG } from "../nucleo/config";
import type { PontoHist } from "../nucleo/exportar";
import type { PontoRede } from "../nucleo/painel";
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

function dominioY(valores: number[]) {
  const mn = Math.min(0, ...valores), mx = Math.max(CFG.thrCritico + 2, ...valores);
  return [Math.floor(mn), Math.ceil(mx)];
}

const rotuloLimite = (v: number, txt: string, cor: string) => ({ value: `${txt} ${fmtBR(v, 0)} m`, position: "right" as const, fill: cor, fontSize: 11.5 });

// ── NÍVEL DA REDE (24 h) ──────────────────────────────────────────────────────
// Só o instrumento em alarme ganha cor; os normais ficam em tons neutros, com o
// nome na ponta da linha. Sem sinal: tracejado cinza.
export type SerieRede = { id: string; nome: string; lv: Situacao; pontos: PontoRede[] | null };

export function GraficoRede({ series, agora, realce }: { series: SerieRede[]; agora: number; realce?: string | null }) {
  const [ocultos, setOcultos] = useState<string[]>([]);
  const neutras = ["var(--serie-1)", "var(--serie-2)", "var(--serie-3)"];
  const cor = (s: SerieRede, i: number) => s.lv === "critico" ? "var(--cr)" : s.lv === "atencao" ? "var(--wr)" : s.lv === "semsinal" ? "var(--of)" : neutras[i % 3];
  const t0 = agora - 24 * H;
  // Cada trecho contínuo de um instrumento vira uma linha própria ("PZ-01#0",
  // "PZ-01#1"…): leituras de horários diferentes entre instrumentos não cortam a
  // linha, e uma lacuna real (> 1,5 h sem dado) continua interrompendo.
  const { dados, trechos } = useMemo(() => {
    const mapa = new Map<number, Record<string, number>>();
    const trechos: Record<string, string[]> = {};
    series.forEach(s => {
      const pts = (s.pontos ?? []).filter(p => p.t >= t0 - H);
      let k = 0;
      trechos[s.id] = pts.length ? [`${s.id}#0`] : [];
      pts.forEach((p, i) => {
        if (i && p.t - pts[i - 1].t > 3 * 30 * 60 * 1000) trechos[s.id].push(`${s.id}#${++k}`);
        const l = mapa.get(p.t) || {}; l[`${s.id}#${k}`] = p.v; mapa.set(p.t, l);
      });
    });
    return { dados: [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([t, l]) => ({ t, ...l })), trechos };
  }, [series, t0]);
  const valores = series.flatMap(s => s.pontos?.map(p => p.v) ?? []);
  const comDados = series.filter(s => s.pontos?.length);
  if (!comDados.length)
    return <div className="grid h-[260px] place-items-center text-[13px] text-texto-3">{series.some(s => s.pontos === null) ? "Histórico da rede indisponível no momento." : "Nenhuma leitura da rede nas últimas 24 h."}</div>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {series.map((s, i) => {
          const off = ocultos.includes(s.id);
          return (
            <button key={s.id} type="button" aria-pressed={!off} onClick={() => setOcultos(o => off ? o.filter(x => x !== s.id) : [...o, s.id])}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] ${off ? "border-linha text-texto-3 line-through" : "border-linha text-texto-2"}`}
              style={!off && s.lv !== "normal" ? { borderColor: cor(s, i), color: cor(s, i), fontWeight: 600 } : undefined}>
              <span className="h-2 w-2 rounded-full" style={{ background: off ? "var(--linha)" : cor(s, i) }} /> {s.id}
            </button>
          );
        })}
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 10, right: 96, bottom: 0, left: -6 }}>
            <CartesianGrid vertical={false} stroke="var(--linha)" />
            <XAxis dataKey="t" type="number" scale="time" domain={[t0, agora]} ticks={ticksHora(t0, agora, 4)} tickFormatter={hora} tickLine={false} axisLine={false} />
            <YAxis domain={dominioY(valores)} tickFormatter={v => `${v} m`} tickLine={false} axisLine={false} width={50} allowDecimals={false} />
            <ReferenceLine y={CFG.thrCritico} stroke="var(--cr)" strokeDasharray="5 4" label={rotuloLimite(CFG.thrCritico, "crítico", "var(--cr)")} />
            <ReferenceLine y={CFG.thrAtencao} stroke="var(--wr)" strokeDasharray="5 4" label={rotuloLimite(CFG.thrAtencao, "atenção", "var(--wr)")} />
            <Tooltip content={<DicaRede series={series} />} cursor={{ stroke: "var(--texto-3)", strokeDasharray: "3 3" }} />
            {series.flatMap((s, i) => ocultos.includes(s.id) ? [] : (trechos[s.id] ?? []).map(chave => (
              <Line key={chave} dataKey={chave} name={s.id} stroke={cor(s, i)} dot={false} type="monotone" connectNulls isAnimationActive={false}
                strokeWidth={realce === s.id ? 3 : s.lv === "normal" ? 1.6 : 2.4} strokeDasharray={s.lv === "semsinal" ? "5 4" : undefined}
                strokeOpacity={realce && realce !== s.id ? 0.25 : 1} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
            )))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type ItemDica = { dataKey: string; value: number | null; color: string };
function DicaRede({ active, payload, label, series }: { active?: boolean; payload?: ItemDica[]; label?: number; series: SerieRede[] }) {
  if (!active || !payload?.length || label == null) return null;
  return (
    <div className="rounded-xl border border-linha bg-card px-3 py-2.5 text-[12.5px] shadow-card">
      <div className="num mb-1.5 font-semibold">{diaHora(label)}</div>
      {payload.filter(p => p.value != null).map(p => {
        const id = String(p.dataKey).split("#")[0];
        return (
        <div key={id} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-texto-2">{id} {series.find(s => s.id === id)?.nome}</span>
          <span className="num ml-auto pl-4 font-semibold">{fmtBR(p.value!)} m</span>
        </div>
        );
      })}
    </div>
  );
}

// ── HISTÓRICO DO INSTRUMENTO ──────────────────────────────────────────────────
// Média do intervalo (linha cheia) e máximo do intervalo (tracejado): o pico
// nunca fica escondido atrás da média.
export function GraficoInstrumento({ pontos, bucketMs, longo, estado }: { pontos: PontoHist[]; bucketMs: number; longo: boolean; estado: Situacao }) {
  const dados = useMemo(() => comLacunas(pontos.map(p => ({ t: p.t, v: p.v as number | null, max: p.max as number | null })), 2 * bucketMs,
    t => ({ t, v: null, max: null })), [pontos, bucketMs]);
  const ini = pontos[0].t, fim = pontos[pontos.length - 1].t;
  const passoH = longo ? (fim - ini > 20 * 24 * H ? 24 * 7 : 24) : (fim - ini > 12 * H ? 4 : 1);
  const cor = estado === "critico" ? "var(--cr)" : estado === "atencao" ? "var(--wr)" : "var(--marca)";
  const fmtX = (t: number) => longo ? new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : hora(t);
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 10, right: 96, bottom: 0, left: -6 }}>
          <CartesianGrid vertical={false} stroke="var(--linha)" />
          <XAxis dataKey="t" type="number" scale="time" domain={[ini, fim]} ticks={ticksHora(ini, fim, passoH, longo)} tickFormatter={fmtX} tickLine={false} axisLine={false} />
          <YAxis domain={dominioY(pontos.flatMap(p => [p.v, p.max]))} tickFormatter={v => `${v} m`} tickLine={false} axisLine={false} width={50} allowDecimals={false} />
          <ReferenceLine y={CFG.thrCritico} stroke="var(--cr)" strokeDasharray="5 4" label={rotuloLimite(CFG.thrCritico, "crítico", "var(--cr)")} />
          <ReferenceLine y={CFG.thrAtencao} stroke="var(--wr)" strokeDasharray="5 4" label={rotuloLimite(CFG.thrAtencao, "atenção", "var(--wr)")} />
          <Tooltip content={<DicaInstrumento />} cursor={{ stroke: "var(--texto-3)", strokeDasharray: "3 3" }} />
          <Line dataKey="max" stroke={cor} strokeOpacity={0.5} strokeWidth={1.2} strokeDasharray="3 3" dot={false} type="monotone" connectNulls={false} activeDot={false} animationDuration={600} />
          <Line dataKey="v" stroke={cor} strokeWidth={2.2} dot={false} type="monotone" connectNulls={false} activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--card)" }} animationDuration={600} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DicaInstrumento({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number | null }[]; label?: number }) {
  if (!active || !payload?.length || label == null) return null;
  const v = payload.find(p => p.dataKey === "v")?.value, mx = payload.find(p => p.dataKey === "max")?.value;
  if (v == null) return <div className="rounded-xl border border-linha bg-card px-3 py-2 text-[12.5px] shadow-card">Sem dados neste intervalo</div>;
  const pico = mx ?? v;
  return (
    <div className="rounded-xl border border-linha bg-card px-3 py-2.5 text-[12.5px] shadow-card">
      <div className="num mb-1.5 font-semibold">{diaHora(label)}</div>
      <div className="flex justify-between gap-6"><span className="text-texto-2">Nível (média)</span><b className="num">{fmtBR(v)} m</b></div>
      {pico !== v && <div className="flex justify-between gap-6"><span className="text-texto-2">Máx. do intervalo</span><b className="num">{fmtBR(pico)} m</b></div>}
      <div className="flex justify-between gap-6"><span className="text-texto-2">Faixa (pelo pico)</span><b>{ROTULO[classificarNivel(pico)]}</b></div>
    </div>
  );
}

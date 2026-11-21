import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CFG } from "../nucleo/config";
import { clamp, escalaNivel, fmtBR, ROTULO, type Situacao } from "../nucleo/util";

export const COR: Record<Situacao | "ok", string> = {
  critico: "var(--cr)", atencao: "var(--wr)", semsinal: "var(--of)", normal: "var(--texto-3)", ok: "var(--texto-3)",
};
const FUNDO: Record<Situacao, string> = { critico: "var(--cr-soft)", atencao: "var(--wr-soft)", semsinal: "var(--of-soft)", normal: "var(--card-2)" };

// Codificação redundante do estado: forma + cor + texto.
// Crítico = octógono · atenção = triângulo · sem sinal = anel tracejado · normal = anel.
export function corpoForma(estado: Situacao | "ok", c = COR[estado]) {
  if (estado === "critico") return `<path d="M5.2 1h5.6L15 5.2v5.6L10.8 15H5.2L1 10.8V5.2z" fill="${c}"/>`;
  if (estado === "atencao") return `<path d="M8 1.5 15 14H1z" fill="${c}"/>`;
  if (estado === "semsinal") return `<circle cx="8" cy="8" r="5.6" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="2.6 2.2"/>`;
  return `<circle cx="8" cy="8" r="5.6" fill="none" stroke="${c}" stroke-width="2"/>`;
}
export function Forma({ estado, size = 14, cor }: { estado: Situacao | "ok"; size?: number; cor?: string }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ flex: "none" }}
    dangerouslySetInnerHTML={{ __html: corpoForma(estado, cor) }} />;
}

export function Selo({ estado, texto }: { estado: Situacao; texto?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
      style={{ background: FUNDO[estado], color: estado === "normal" ? "var(--texto-2)" : COR[estado] }}>
      <Forma estado={estado} size={12} /> {texto ?? ROTULO[estado]}
    </span>
  );
}

// Número que conta até o valor novo.
export function Contador({ valor, casas = 2 }: { valor: number; casas?: number }) {
  const [v, setV] = useState(valor);
  const atual = useRef(valor);
  useEffect(() => {
    const de = atual.current, ate = valor, t0 = performance.now(), dur = 800;
    if (de === ate || matchMedia("(prefers-reduced-motion: reduce)").matches) { atual.current = ate; setV(ate); return; }
    let id = 0;
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      atual.current = de + (ate - de) * e; setV(atual.current);
      if (k < 1) id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [valor]);
  return <span className="num">{fmtBR(v, casas)}</span>;
}

// Medidor vertical do tubo (0 até a escala) com as marcas de atenção e crítico.
export function Medidor({ nivel, estado, altura = 112 }: { nivel: number | null; estado: Situacao; altura?: number }) {
  const esc = escalaNivel();
  const pct = nivel === null ? 0 : (clamp(nivel, 0, esc) / esc) * 100;
  const cor = estado === "critico" ? "var(--cr)" : estado === "atencao" ? "var(--wr)" : "var(--neutro)";
  const marca = (m: number, c: string) => (
    <div className="absolute left-[-4px] right-[-4px]" style={{ bottom: `${(m / esc) * 100}%` }}>
      <div className="h-[1.5px]" style={{ background: c }} />
      <span className="num absolute left-[calc(100%+5px)] top-[-7px] text-[11px] font-medium" style={{ color: c }}>{fmtBR(m, 0)}</span>
    </div>
  );
  return (
    <div className="relative w-[22px] rounded-[7px] bg-card-2" style={{ height: altura, border: `1.5px ${estado === "semsinal" ? "dashed var(--of)" : "solid var(--linha)"}` }}
      role="img" aria-label={nivel === null ? "Sem leitura" : `Nível ${fmtBR(nivel)} m na escala de 0 a ${esc} m`}>
      <div className={`absolute bottom-0 left-0 right-0 rounded-[5px] transition-[height] duration-700 ${estado === "semsinal" ? "hachura" : ""}`}
        style={{ height: `${pct}%`, background: estado === "semsinal" ? undefined : cor }} />
      {marca(CFG.thrCritico, "var(--cr)")}
      {marca(CFG.thrAtencao, "var(--wr)")}
    </div>
  );
}

// Tendência de 24 h (sem eixos). Linha tracejada quando o instrumento está sem sinal.
export function Mini({ pontos, cor, w = 300, h = 40, tracejado = false }:
  { pontos: { t: number; v: number }[] | null | undefined; cor: string; w?: number; h?: number; tracejado?: boolean }) {
  const id = useRef(`g${Math.random().toString(36).slice(2)}`).current;
  if (!Array.isArray(pontos) || pontos.length < 2)
    return <div className="flex h-10 items-center text-[12px] text-texto-3">{pontos === null ? "histórico indisponível" : "sem leituras nas últimas 24 h"}</div>;
  const vs = pontos.map(p => p.v);
  let mn = Math.min(...vs), mx = Math.max(...vs);
  const folga = Math.max(0.15, (mx - mn) * 0.15); mn -= folga; mx += folga;
  const t0 = pontos[0].t, t1 = pontos[pontos.length - 1].t;
  const x = (t: number) => 2 + ((t - t0) / (t1 - t0 || 1)) * (w - 8);
  const y = (v: number) => h - 3 - ((v - mn) / (mx - mn)) * (h - 6);
  const d = pontos.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join("");
  const u = pontos[pontos.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={cor} stopOpacity=".22" /><stop offset="1" stopColor={cor} stopOpacity="0" /></linearGradient></defs>
      {!tracejado && <path d={`${d}L${x(u.t).toFixed(1)} ${h}L${x(t0).toFixed(1)} ${h}Z`} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={cor} strokeWidth="1.8" strokeDasharray={tracejado ? "4 3" : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Anel({ pct, cor = "var(--marca)", tam = 88 }: { pct: number | null; cor?: string; tam?: number }) {
  const r = tam / 2 - 10, c = 2 * Math.PI * r;
  return (
    <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} aria-hidden>
      <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="var(--card-2)" strokeWidth="9" />
      {pct !== null && <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={cor} strokeWidth="9" strokeLinecap="round"
        transform={`rotate(-90 ${tam / 2} ${tam / 2})`} strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
        style={{ transition: "stroke-dashoffset 1s ease-out" }} />}
    </svg>
  );
}

export function Cartao({ titulo, sub, acoes, children, className = "", corpo = "p-5" }:
  { titulo?: ReactNode; sub?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string; corpo?: string }) {
  return (
    <section className={`card ${className}`}>
      {(titulo || acoes) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-4">
          <div className="min-w-0"><h2 className="titulo-card">{titulo}</h2>{sub && <p className="sub-card">{sub}</p>}</div>
          {acoes && <div className="ml-auto flex flex-wrap items-center gap-2">{acoes}</div>}
        </div>
      )}
      <div className={corpo}>{children}</div>
    </section>
  );
}

export function Segmentado<T extends string>({ opcoes, valor, aoMudar, rotulo }:
  { opcoes: { v: T; t: ReactNode }[]; valor: T; aoMudar: (v: T) => void; rotulo: string }) {
  return (
    <div className="flex gap-0.5 rounded-xl bg-card-2 p-1" role="group" aria-label={rotulo}>
      {opcoes.map(o => (
        <button key={o.v} type="button" aria-pressed={valor === o.v} onClick={() => aoMudar(o.v)}
          className={`rounded-lg px-3 py-1 text-[12.5px] font-medium transition-colors ${valor === o.v ? "bg-card text-texto shadow-card" : "text-texto-3 hover:text-texto-2"}`}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

export const Botao = ({ children, onClick, escuro = false, disabled, title, href }:
  { children: ReactNode; onClick?: () => void; escuro?: boolean; disabled?: boolean; title?: string; href?: string }) => {
  const cls = `inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-medium transition-colors ${escuro
    ? "bg-texto text-card hover:opacity-90" : "border border-linha bg-card text-texto-2 hover:bg-card-2"} ${disabled ? "pointer-events-none opacity-50" : ""}`;
  if (href) return <a className={cls} href={disabled ? undefined : href} target="_blank" rel="noopener" title={title} aria-disabled={disabled}>{children}</a>;
  return <button type="button" className={cls} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
};

export function Logo({ tam = 30 }: { tam?: number }) {
  // IDs únicos: duas cópias do logo na página (lateral e topo móvel) não podem
  // compartilhar gradientes, senão a cópia escondida "leva" as definições.
  const u = useId().replace(/:/g, "");
  return (
    <svg width={tam} height={tam * 660 / 630} viewBox="0 0 630 660" aria-hidden>
      <defs>
        <linearGradient id={`lg1${u}`} x1=".2" y1="0" x2=".6" y2="1"><stop offset="0" stopColor="#4FC3F7" /><stop offset="1" stopColor="#1E88E5" /></linearGradient>
        <linearGradient id={`lg2${u}`} x1="0" y1=".5" x2="1" y2=".3"><stop offset="0" stopColor="#2196F3" /><stop offset="1" stopColor="#1565C0" /></linearGradient>
        <linearGradient id={`lg3${u}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#29A3F0" /><stop offset="1" stopColor="#1565C0" /></linearGradient>
        <clipPath id={`lgs${u}`}><path d="M310 45 C352 98 368 175 338 238 C318 280 288 312 252 332 C330 322 404 298 446 244 C500 300 526 372 516 442 C504 560 410 620 300 616 C172 612 104 540 100 452 C96 330 230 170 310 45 Z" /></clipPath>
        <mask id={`lgm${u}`} maskUnits="userSpaceOnUse" x="-100" y="-100" width="830" height="860"><rect x="-100" y="-100" width="830" height="860" fill="#fff" /><path d="M80 480 C140 395 195 345 260 332 C300 325 330 322 360 318" stroke="#000" strokeWidth="22" fill="none" strokeLinecap="round" /><path d="M175 612 C230 520 360 480 420 470 C470 466 500 450 530 425" stroke="#000" strokeWidth="22" fill="none" strokeLinecap="round" /></mask>
        <clipPath id={`lga${u}`}><path d="M-60 -60 L372 -60 L372 318 C320 323 290 327 260 332 C195 345 140 395 80 480 L-60 480 Z" /></clipPath>
        <clipPath id={`lgb${u}`}><path d="M-60 480 L80 480 C140 395 195 345 260 332 C290 327 320 323 372 318 L372 -60 L700 -60 L700 425 L530 425 C500 450 470 466 420 470 C360 480 230 520 175 612 L-60 612 Z" /></clipPath>
        <clipPath id={`lgc${u}`}><path d="M-60 612 L175 612 C230 520 360 480 420 470 C470 466 500 450 530 425 L700 425 L700 720 L-60 720 Z" /></clipPath>
      </defs>
      <g mask={`url(#lgm${u})`}><g clipPath={`url(#lgs${u})`}>
        <rect x="-100" y="-100" width="830" height="860" fill={`url(#lg1${u})`} clipPath={`url(#lga${u})`} />
        <rect x="-100" y="-100" width="830" height="860" fill={`url(#lg2${u})`} clipPath={`url(#lgb${u})`} />
        <rect x="-100" y="-100" width="830" height="860" fill={`url(#lg3${u})`} clipPath={`url(#lgc${u})`} />
      </g></g>
    </svg>
  );
}

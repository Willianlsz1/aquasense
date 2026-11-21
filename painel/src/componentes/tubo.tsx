import { useEffect, useRef } from "react";
import { CFG } from "../nucleo/config";
import { clamp, escalaNivel, fmtBR, type Situacao } from "../nucleo/util";

// Poço de observação: solo, tubo, coluna d'água, limites e a UCT no topo.
// viewBox 280 × 500: superfície em y=150, fundo do tubo em y=482.
const TOPO = 150, FUNDO = 482;

export function Tubo({ nivel, estado, recepcao }: { nivel: number | null; estado: Situacao; recepcao?: number }) {
  const e = escalaNivel();
  const y = (n: number) => FUNDO - (clamp(n, 0, e) / e) * (FUNDO - TOPO - 8);
  const tem = nivel !== null;
  const ya = tem ? y(nivel) : FUNDO;
  const sem = estado === "semsinal";
  const arcos = useRef<SVGGElement>(null);
  useEffect(() => {
    // Nova recepção: a antena da UCT "emite".
    const g = arcos.current;
    if (!g || sem) return;
    g.classList.remove("emitindo"); void g.getBoundingClientRect(); g.classList.add("emitindo");
  }, [recepcao, sem]);
  const passo = e > 12 ? 3 : 2;
  const marcas = [];
  for (let m = 0; m <= e; m += passo) marcas.push(m);
  const cota = (n: number, cor: string, txt: string) => (
    <g key={txt}>
      <line x1="96" x2="184" y1={y(n)} y2={y(n)} stroke={cor} strokeWidth="1.6" strokeDasharray="5 4" />
      <text x="190" y={y(n) + 4} fill={cor} fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fontWeight="600">{txt}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 280 500" role="img" aria-label={tem ? `Nível d'água ${fmtBR(nivel)} m no tubo` : "Sem leitura"} className="mx-auto block w-full max-w-[280px]">
      <defs>
        <clipPath id="tg-clip"><rect x="130" y={TOPO - 10} width="28" height={FUNDO - TOPO + 10} rx="6" /></clipPath>
        <linearGradient id="tg-agua" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4FC3F7" /><stop offset="1" stopColor="#0D47A1" /></linearGradient>
        <linearGradient id="tg-solo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--solo-1)" /><stop offset="1" stopColor="var(--solo-2)" /></linearGradient>
        <pattern id="tg-grao" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1" fill="#000" opacity=".16" /><circle cx="10" cy="10" r="1.3" fill="#000" opacity=".12" /></pattern>
        <pattern id="tg-hach" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="7" fill="#8B9BAA" /></pattern>
      </defs>
      <rect x="0" y={TOPO} width="280" height={500 - TOPO} fill="url(#tg-solo)" opacity=".85" rx="10" />
      <rect x="0" y={TOPO} width="280" height={500 - TOPO} fill="url(#tg-grao)" />
      <path d={`M0 ${TOPO} H280`} stroke="#8A6A4A" strokeWidth="2" />
      <rect x="118" y={TOPO - 10} width="52" height={FUNDO - TOPO + 16} fill="#0C141B" opacity=".35" />
      {marcas.map(m => (
        <g key={m}>
          <line x1="122" x2="128" y1={y(m)} y2={y(m)} stroke="#E8D9C8" opacity=".7" />
          <text x="116" y={y(m) + 3.5} textAnchor="end" fontSize="9.5" fill="#F3E9DC" fontFamily="IBM Plex Mono, monospace">{m}</text>
        </g>
      ))}
      <rect x="130" y={TOPO - 10} width="28" height={FUNDO - TOPO + 10} rx="6" fill="#0F1A22" stroke="#9FB3C4" strokeWidth="2" />
      <g clipPath="url(#tg-clip)">
        <g style={{ transform: `translateY(${ya}px)`, transition: "transform .9s cubic-bezier(.2,.8,.2,1)" }}>
          <path className={sem ? "" : "onda"} d="M80 0 q5 -3 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 V400 H80Z"
            fill={sem ? "url(#tg-hach)" : "url(#tg-agua)"} opacity={sem ? 0.7 : 1} />
        </g>
      </g>
      <rect x="139" y={FUNDO - 34} width="10" height="28" rx="5" fill="#16242F" stroke="#4FC3F7" strokeWidth="1.5" />
      <line x1="144" x2="144" y1={TOPO - 22} y2={FUNDO - 34} stroke="#4FC3F7" strokeWidth="1" opacity=".45" />
      {cota(CFG.thrCritico, "#EF5A5A", `CRÍTICO ${fmtBR(CFG.thrCritico, 0)} m`)}
      {cota(CFG.thrAtencao, "#E3A53A", `ATENÇÃO ${fmtBR(CFG.thrAtencao, 0)} m`)}
      {tem && (
        <g style={{ transform: `translateY(${ya}px)`, transition: "transform .9s cubic-bezier(.2,.8,.2,1)" }}>
          <path d="M100 0 H126" stroke="var(--texto)" strokeWidth="1.6" /><path d="M126 0 l-6 -4 v8z" fill="var(--texto)" />
          <rect x="18" y="-15" width="82" height="30" rx="8" fill={sem ? "var(--of)" : "var(--texto)"} />
          <text x="59" y="5" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif" fontWeight="600" fontSize="16" fill="var(--card)">{fmtBR(nivel)} m</text>
          {sem && <text x="59" y="30" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fill="#F3E9DC">última conhecida</text>}
        </g>
      )}
      <rect x="112" y={TOPO - 62} width="64" height="40" rx="7" fill="#16242F" stroke="#3A5A6E" strokeWidth="1.5" />
      <circle cx="126" cy={TOPO - 42} r="4" fill={sem ? "#8A9AA8" : "#35C67E"} />
      <text x="150" y={TOPO - 38} textAnchor="middle" fill="#AEBDCA" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="600">UCT</text>
      <line x1="166" x2="166" y1={TOPO - 62} y2={TOPO - 98} stroke="#AEBDCA" strokeWidth="2" strokeLinecap="round" />
      <g ref={arcos} transform={`translate(166 ${TOPO - 100})`} fill="none" stroke="#4FC3F7" strokeWidth="2" strokeLinecap="round" opacity={sem ? 0.2 : 1}>
        <path d="M8 -6 a10 10 0 0 1 0 12" /><path d="M14 -11 a17 17 0 0 1 0 22" /><path d="M20 -16 a24 24 0 0 1 0 32" />
      </g>
      <line x1="144" x2="144" y1={TOPO - 22} y2={TOPO - 10} stroke="#3A5A6E" strokeWidth="3" />
      <text x="12" y={TOPO - 8} fontSize="10" fill="var(--texto-3)" fontFamily="IBM Plex Mono, monospace">superfície</text>
      <text x="12" y={FUNDO + 12} fontSize="10" fill="#E8D9C8" fontFamily="IBM Plex Mono, monospace" opacity=".8">fundo do tubo</text>
    </svg>
  );
}

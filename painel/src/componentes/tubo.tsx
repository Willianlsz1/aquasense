import { CFG } from "../nucleo/config";
import { clamp, escalaNivel, fmtBR, type Situacao } from "../nucleo/util";

// Poço: coluna d'água no tubo (0 até a escala) com as marcas de atenção e crítico.
// A marca só ganha cor quando o nível passou dela. Sem sinal: hachurado cinza,
// com o último valor identificado como não confirmado.
export function Tubo({ nivel, estado }: { nivel: number | null; estado: Situacao }) {
  const H = 300, topo = 16, esc = escalaNivel();
  const y = (v: number) => topo + (1 - clamp(v, 0, esc) / esc) * (H - topo - 12);
  const sem = estado === "semsinal";
  const cor = sem ? "var(--of)" : estado === "critico" ? "var(--cr)" : estado === "atencao" ? "var(--wr)" : "var(--agua)";
  const marcas: [number, string, string][] = [[CFG.thrCritico, `Crítico ${fmtBR(CFG.thrCritico, 0)}`, "var(--cr)"], [CFG.thrAtencao, `Atenção ${fmtBR(CFG.thrAtencao, 0)}`, "var(--wr)"]];
  const escala = [0, 5, 10].filter(v => v < CFG.thrAtencao - 1);
  const perto = nivel !== null && marcas.some(([v]) => Math.abs(nivel - v) < 1.3);
  return (
    <svg width="150" height={H} viewBox={`0 0 150 ${H}`} role="img"
      aria-label={nivel === null ? "Sem leitura" : `Nível ${fmtBR(nivel)} m na escala de 0 a ${esc} m${sem ? ", não confirmado" : ""}`}>
      <defs>
        <pattern id="tubo-hach" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--of)" strokeWidth="2" opacity=".45" />
        </pattern>
      </defs>
      <rect x="30" y={topo} width="44" height={H - topo - 8} rx="8" fill="rgba(255,255,255,.03)" stroke={sem ? "var(--of)" : "rgba(255,255,255,.16)"} strokeDasharray={sem ? "4 3" : undefined} />
      {nivel !== null && <>
        <rect x="36" y={y(nivel)} width="32" height={Math.max(0, H - 14 - y(nivel))} rx="4" fill={sem ? "url(#tubo-hach)" : cor} className="transition-all duration-700" />
        {!sem && <rect x="36" y={y(nivel)} width="32" height="3" rx="1.5" fill="#fff" opacity=".35" />}
      </>}
      {marcas.map(([v, t, c]) => (
        <g key={t}>
          <line x1="22" x2="82" y1={y(v)} y2={y(v)} stroke={!sem && nivel !== null && nivel >= v ? c : "var(--texto-3)"} strokeWidth="1.5" />
          <text x="88" y={y(v) + 4} fontSize="11" fill="var(--texto-2)">{t}</text>
        </g>
      ))}
      {escala.map(v => <text key={v} x="20" y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--texto-3)">{v}</text>)}
      {nivel !== null && (
        <text x="88" y={perto ? y(nivel) + 34 : y(nivel) + 4} fontSize="12" fontWeight="600" fill={sem ? "var(--texto-3)" : estado === "normal" ? "var(--texto)" : cor} className="num">
          {fmtBR(nivel)} m
        </text>
      )}
    </svg>
  );
}

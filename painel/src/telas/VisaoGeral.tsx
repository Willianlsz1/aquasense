import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { CFG } from "../nucleo/config";
import { naoConfirmado, ocorrencias, painel, porPrioridade, type EstadoPainel } from "../nucleo/painel";
import { clamp, escalaNivel, fmtBR, formatUltima, hora, ROTULO, type Situacao } from "../nucleo/util";
import { Forma } from "../componentes/base";
import { FaixaAlarmes, margem, Tendencia } from "../componentes/alarmes";
import { MapaInstrumentos } from "../componentes/mapa";
import { TabelaOcorrencias } from "../componentes/ocorrencias";

type Item = ReturnType<typeof porPrioridade>[number];

// Visão geral (direção A): faixa de alarmes → tabela de piezômetros → mapa e ocorrências.
export function VisaoGeral({ e }: { e: EstadoPainel }) {
  const itens = porPrioridade(e);
  const [realce, setRealce] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <FaixaAlarmes e={e} />
      <Tabela e={e} itens={itens} aoRealcar={setRealce} />
      <div className="grid gap-6 xl:grid-cols-[7fr_5fr]">
        <BlocoMapa e={e} itens={itens} realce={realce} />
        <section className="card flex flex-col">
          <Cab titulo="Últimas ocorrências" href="#alertas" link="Ver todas" />
          <TabelaOcorrencias lista={ocorrencias(e).slice(0, 7)}
            vazio={e.simulada ? "Nenhuma mudança de estado até agora." : e.servidor.erro ? "Registros do servidor indisponíveis." : e.servidor.atualizadoEm ? "Nenhum registro no servidor." : "Consultando o servidor…"} />
        </section>
      </div>
    </div>
  );
}

function Cab({ titulo, href, link, children }: { titulo: string; href?: string; link?: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-12 items-center justify-between gap-3 border-b border-linha px-4">
      <h2 className="text-[16px] font-semibold">{titulo}</h2>
      {children}
      {href && <a href={href} className="flex items-center gap-1 text-[12px] text-marca-2 hover:underline">{link}<ChevronRight size={14} strokeWidth={1.75} /></a>}
    </div>
  );
}

function BlocoMapa({ e, itens, realce }: { e: EstadoPainel; itens: Item[]; realce: string | null }) {
  const [camada, setCamada] = useState<"satelite" | "ruas">("satelite");
  return (
    <section className="card flex flex-col">
      <Cab titulo="Localização" href="#mapa" link="Abrir mapa" />
      <div className="relative">
        <MapaInstrumentos itens={itens} modo="visao" altura={360} agora={e.agora} realce={realce} camada={camada} />
        <div className="seg-mapa absolute left-3 top-3 z-[500]" role="group" aria-label="Camada do mapa">
          <button type="button" aria-pressed={camada === "satelite"} onClick={() => setCamada("satelite")}>Satélite</button>
          <button type="button" aria-pressed={camada === "ruas"} onClick={() => setCamada("ruas")}>Ruas</button>
        </div>
        <span className="nota-mapa absolute bottom-3 left-3 z-[500]">Posições ilustrativas</span>
      </div>
    </section>
  );
}

// ── TABELA DE PIEZÔMETROS ─────────────────────────────────────────────────────
const COLS = "grid grid-cols-[160px_116px_100px_220px_180px_1fr] items-center gap-4 px-4";
const COR_EST: Record<Situacao, string> = { critico: "text-cr", atencao: "text-wr", semsinal: "text-texto-2", normal: "text-texto-2" };

function Tabela({ e, itens, aoRealcar }: { e: EstadoPainel; itens: Item[]; aoRealcar: (id: string | null) => void }) {
  const esc = escalaNivel();
  return (
    <section className="card overflow-x-auto" aria-label="Piezômetros">
      <div className="flex min-w-[1000px] items-baseline justify-between px-4 pb-3 pt-4">
        <h2 className="text-[16px] font-semibold">Piezômetros</h2>
        <span className="num text-[12px] text-texto-3">Limites: atenção {fmtBR(CFG.thrAtencao, 0)} m · crítico {fmtBR(CFG.thrCritico, 0)} m</span>
      </div>
      <div className="min-w-[1000px]" role="table">
        <div role="row" className={`${COLS} h-9 border-t border-linha text-[12px] font-medium text-texto-3`}>
          <span role="columnheader">Instrumento</span><span role="columnheader">Estado</span><span role="columnheader">Nível</span>
          <span role="columnheader">Faixa 0–{esc} m e margem</span><span role="columnheader">Tendência 24 h</span><span role="columnheader">Última leitura</span>
        </div>
        {itens.map(x => <Linha key={x.pz.id} e={e} x={x} esc={esc} aoRealcar={aoRealcar} />)}
      </div>
    </section>
  );
}

function Linha({ e, x, esc, aoRealcar }: { e: EstadoPainel; x: Item; esc: number; aoRealcar: (id: string | null) => void }) {
  const { pz, s } = x;
  const nc = naoConfirmado(e);
  const lv: Situacao = nc ? "semsinal" : s.lv;
  const conf = !nc && lv !== "semsinal" && s.nivel !== null;
  const ultimo = nc ? null : s.nivel; // sem sinal: último valor, nunca como atual
  const pc = (v: number) => `${(clamp(v, 0, esc) / esc) * 100}%`;
  const corV = lv === "critico" ? "var(--cr)" : lv === "atencao" ? "var(--wr)" : "var(--agua)";
  const h = e.historicoRede[pz.id];
  const abrir = () => painel.abrirInstrumento(pz.id);
  return (
    <div role="row" tabIndex={0} aria-label={`Abrir ${pz.id} ${pz.nome}`} onClick={abrir}
      onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrir(); } }}
      onMouseEnter={() => aoRealcar(pz.id)} onMouseLeave={() => aoRealcar(null)} onFocus={() => aoRealcar(pz.id)} onBlur={() => aoRealcar(null)}
      className={`${COLS} h-16 cursor-pointer border-t border-linha hover:bg-card-2`}>
      <div role="cell" className="min-w-0"><b className="font-semibold">{pz.id}</b><span className="block truncate text-[12px] text-texto-2">{pz.nome}</span></div>
      <div role="cell" className={`flex items-center gap-2 whitespace-nowrap font-medium ${COR_EST[lv]}`}><Forma estado={lv} />{nc ? "Sem resposta" : ROTULO[lv]}</div>
      <div role="cell" className={`num text-[20px] font-semibold ${COR_EST[lv] === "text-texto-2" ? "" : COR_EST[lv]}`}>
        {conf ? <>{fmtBR(s.nivel!)}<small className="ml-0.5 text-[14px] font-normal text-texto-2">m</small></> : <span className="text-texto-3">—</span>}
      </div>
      <div role="cell">
        <div className="relative h-1.5 rounded-[3px]" style={conf ? { background: "var(--card-2)" } : { background: "repeating-linear-gradient(135deg, var(--linha-2) 0 2px, transparent 2px 6px)" }}>
          {ultimo !== null && <div className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: pc(ultimo), background: conf ? corV : "var(--of)", opacity: conf ? 1 : .35 }} />}
          {ultimo !== null && <>
            <div className="absolute -inset-y-[5px] w-0.5 rounded-[1px] bg-texto-3" style={{ left: pc(CFG.thrAtencao) }} />
            <div className="absolute -inset-y-[5px] w-0.5 rounded-[1px] bg-texto-3" style={{ left: pc(CFG.thrCritico) }} />
          </>}
        </div>
        <div className="num mt-1.5 text-[12px] text-texto-2">{nc ? "Servidor sem resposta" : ultimo === null ? "Sem leitura" : conf ? margem(s.nivel) : "Último valor não confirmado"}</div>
      </div>
      <div role="cell" className="flex items-center gap-3 whitespace-nowrap">
        <Spark pontos={conf && Array.isArray(h) ? h : null} />
        {conf ? <Tendencia taxa={s.taxa} /> : <span className="text-texto-3">—</span>}
      </div>
      <div role="cell" className="num whitespace-nowrap text-texto-2">
        {nc ? "—" : s.recepcao ? `${hora(s.recepcao * 1000)} · ${formatUltima(s.recepcao, e.agora).replace(/^há /, "")}` : "Nunca reportou"}
      </div>
    </div>
  );
}

// Tendência de 24 h em cinza (cor só no estado). Sem dado: linha tracejada.
function Spark({ pontos, w = 72, h = 20 }: { pontos: { v: number }[] | null; w?: number; h?: number }) {
  if (!pontos || pontos.length < 2)
    return <svg width={w} height={h} aria-hidden><line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="var(--linha-2)" strokeDasharray="3 3" /></svg>;
  const vs = pontos.map(p => p.v);
  const mx0 = Math.max(...vs), mn0 = Math.min(...vs), r = Math.max(mx0 - mn0, 3), mn = (mx0 + mn0) / 2 - r / 2;
  const pts = vs.map((v, i) => `${((i / (vs.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - mn) / r) * (h - 4)).toFixed(1)}`).join(" ");
  return <svg width={w} height={h} aria-hidden><polyline points={pts} fill="none" stroke="var(--texto-2)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

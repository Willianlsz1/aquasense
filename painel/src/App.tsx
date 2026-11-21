import { useEffect, useState } from "react";
import { Bell, BellOff, FileText, Gauge, LayoutGrid, Map as MapIcon, MapPin, Moon, Play, Square, Sun, Volume2, VolumeX } from "lucide-react";
import { CFG } from "./nucleo/config";
import { naoConfirmado, painel, porPrioridade, ROTEIRO_DEMO, usePainel, VISTAS, type EstadoPainel, type Vista } from "./nucleo/painel";
import { fmtBR } from "./nucleo/util";
import { Forma, Logo } from "./componentes/base";
import { MODO_GRAVACAO } from "./nucleo/gravacao";
import { VisaoGeral } from "./telas/VisaoGeral";
import { TelaMapa } from "./telas/Mapa";
import { TelaInstrumento } from "./telas/Instrumento";
import { TelaAlertas } from "./telas/Alertas";

const ICONE: Record<Vista, typeof LayoutGrid> = { visao: LayoutGrid, mapa: MapIcon, instrumento: Gauge, alertas: Bell };

function useTema() {
  const [tema, setTema] = useState(document.documentElement.dataset.tema === "escuro" ? "escuro" : "claro");
  useEffect(() => { document.documentElement.dataset.tema = tema; }, [tema]);
  const alternar = () => {
    const t = tema === "claro" ? "escuro" : "claro";
    try { localStorage.setItem("aquasense-tema", t); } catch { /* só nesta aba */ }
    setTema(t);
  };
  return { tema, alternar };
}

export default function App() {
  const e = usePainel();
  const { tema, alternar } = useTema();
  const emAlerta = porPrioridade(e).filter(x => x.s.lv === "critico" || x.s.lv === "atencao").length;
  const relatorio = `relatorio.html?pz=${encodeURIComponent(e.pzSel)}&range=${encodeURIComponent(e.periodo)}`;
  return (
    <div className="flex min-h-full">
      <aside className="no-print hidden w-[232px] flex-none border-r border-linha bg-card lg:block">
        <div className="sticky top-0 flex h-screen flex-col gap-1 px-4 py-5">
          <a href="#visao" className="mb-5 flex items-center gap-2.5 px-2" aria-label="aquasense · Visão geral">
            <Logo tam={28} /><span className="text-[17px] font-semibold tracking-tight">aquasense</span>
          </a>
          <nav className="flex flex-col gap-1" aria-label="Seções">
            {(Object.keys(VISTAS) as Vista[]).map(v => {
              const I = ICONE[v], ativo = e.vista === v;
              return (
                <a key={v} href={`#${v}`} aria-current={ativo ? "page" : undefined} data-gravacao={v === "visao" ? "nav-visao voltar" : `nav-${v}`}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors ${ativo ? "bg-marca-soft font-semibold text-marca" : "text-texto-2 hover:bg-card-2"}`}>
                  <I size={18} strokeWidth={1.8} /><span className="flex-1">{VISTAS[v]}</span>
                  {v === "visao" && emAlerta > 0 && <span className="num rounded-full bg-cr px-1.5 text-[11.5px] font-semibold text-white" aria-label={`${emAlerta} em alerta`}>{emAlerta}</span>}
                </a>
              );
            })}
            <a href={e.simulada ? undefined : relatorio} target="_blank" rel="noopener" aria-disabled={e.simulada}
              title={e.simulada ? "O relatório usa só dados reais: indisponível na demonstração" : "Documento A4 para salvar como PDF"}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-texto-2 ${e.simulada ? "cursor-not-allowed opacity-50" : "hover:bg-card-2"}`}>
              <FileText size={18} strokeWidth={1.8} /><span className="flex-1">Relatório PDF</span>
            </a>
          </nav>
          <div className="mt-auto space-y-3">
            <div className="rounded-2xl bg-card-2 p-3.5 text-[12.5px] leading-relaxed text-texto-2">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-texto"><MapPin size={14} /> Mariana/MG</div>
              {e.piezometros.length} piezômetros · posições ilustrativas<br />
              Limites: atenção <span className="num">{fmtBR(CFG.thrAtencao, 0)} m</span> · crítico <span className="num">{fmtBR(CFG.thrCritico, 0)} m</span>
            </div>
            <button type="button" onClick={alternar} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] text-texto-2 hover:bg-card-2">
              {tema === "claro" ? <Moon size={17} /> : <Sun size={17} />} {tema === "claro" ? "Tema escuro" : "Tema claro"}
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 space-y-5 px-4 pb-24 pt-4 sm:px-7 sm:pt-6 lg:pb-8 max-w-[1520px]">
        <Topo e={e} alternarTema={alternar} tema={tema} />
        {e.simulada && !MODO_GRAVACAO && <BarraDemo e={e} />}
        {e.vista !== "visao" && <FaixaAlarme e={e} />}
        {!e.pronto ? <p className="py-16 text-center text-texto-3">Carregando configuração…</p>
          : e.vista === "visao" ? <VisaoGeral e={e} />
          : e.vista === "mapa" ? <TelaMapa e={e} />
          : e.vista === "instrumento" ? <TelaInstrumento e={e} />
          : <TelaAlertas e={e} />}
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-[1500] grid grid-cols-4 border-t border-linha bg-card lg:hidden" aria-label="Seções">
        {(Object.keys(VISTAS) as Vista[]).map(v => {
          const I = ICONE[v], ativo = e.vista === v;
          return (
            <a key={v} href={`#${v}`} aria-current={ativo ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${ativo ? "font-semibold text-marca" : "text-texto-3"}`}>
              <I size={19} strokeWidth={1.8} />{v === "alertas" ? "Alertas" : VISTAS[v]}
              {v === "visao" && emAlerta > 0 && <span className="num absolute right-[calc(50%-20px)] top-1 rounded-full bg-cr px-1.5 text-[10.5px] font-semibold text-white">{emAlerta}</span>}
            </a>
          );
        })}
      </nav>

      {e.aviso && <div role="status" className="fixed bottom-20 left-1/2 z-[2500] -translate-x-1/2 rounded-xl bg-texto px-4 py-2.5 text-[13.5px] font-medium text-card shadow-card lg:bottom-6">{e.aviso}</div>}
    </div>
  );
}

function Relogio() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return <span className="num" data-gravacao="relogio">{t.toLocaleTimeString("pt-BR")}</span>;
}

function Topo({ e, alternarTema, tema }: { e: EstadoPainel; alternarTema: () => void; tema: string }) {
  const cor = e.status.tipo === "live" ? "var(--marca)" : e.status.tipo === "err" ? "var(--of)" : e.status.tipo === "sim" ? "var(--wr)" : "var(--texto-3)";
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <a href="#visao" className="lg:hidden" aria-label="aquasense"><Logo tam={26} /></a>
      <div className="min-w-0 flex-1">
        <h1 className="text-[21px] font-semibold tracking-tight sm:text-[22px]">{VISTAS[e.vista]}</h1>
        <p className="text-[13px] text-texto-3">{hoje.charAt(0).toUpperCase() + hoje.slice(1)} · <Relogio /></p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span role="status" data-gravacao="status" className="hidden items-center gap-2 rounded-full bg-card px-3 py-1.5 text-[12.5px] text-texto-2 shadow-card sm:inline-flex">
          <span className={`h-2 w-2 rounded-full ${e.status.tipo === "live" ? "pulsar" : ""}`} style={{ background: cor }} />{e.status.msg}
        </span>
        <button type="button" onClick={() => painel.alternarSom()} title={e.som.ligado ? "Som do alarme ligado: clique para desligar" : "Som do alarme desligado: clique para ligar"}
          aria-pressed={e.som.ligado} data-gravacao="som" className="relative grid h-10 w-10 place-items-center rounded-xl bg-card text-texto-2 shadow-card">
          {e.som.ligado ? <Volume2 size={18} /> : <VolumeX size={18} />}
          {e.som.ativo && !e.som.silenciado && e.som.ligado && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-cr ring-2 ring-card" />}
        </button>
        <button type="button" onClick={alternarTema} className="grid h-10 w-10 place-items-center rounded-xl bg-card text-texto-2 shadow-card lg:hidden" aria-label={tema === "claro" ? "Tema escuro" : "Tema claro"}>
          {tema === "claro" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>
      <p role="status" className="w-full text-[12.5px] text-texto-2 sm:hidden"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: cor }} />{e.status.msg}</p>
    </header>
  );
}

function BarraDemo({ e }: { e: EstadoPainel }) {
  return (
    <div className="no-print flex flex-wrap items-center gap-3 rounded-2xl border border-wr/40 bg-wr-soft px-4 py-3 text-[13px]">
      <span className="font-semibold text-texto">Demonstração · dados fictícios em tempo acelerado.</span>
      <span className="text-texto-2">Não são leituras dos instrumentos.</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="cenario">Cenário</label>
        <select id="cenario" value={e.demo.passo} onChange={ev => painel.escolherCenario(Number(ev.target.value))}
          className="rounded-lg border border-linha bg-card px-2.5 py-1.5 text-[13px] text-texto">
          {ROTEIRO_DEMO.map((p, i) => <option key={p.titulo} value={i}>{i + 1}. {p.titulo}</option>)}
        </select>
        {e.demo.rodando
          ? <button type="button" onClick={() => painel.pararRoteiro()} className="inline-flex items-center gap-1.5 rounded-lg border border-linha bg-card px-3 py-1.5 font-medium"><Square size={13} /> Parar</button>
          : <button type="button" onClick={() => painel.iniciarRoteiro()} className="inline-flex items-center gap-1.5 rounded-lg bg-texto px-3 py-1.5 font-medium text-card"><Play size={13} /> Reproduzir roteiro</button>}
      </div>
      <p className="w-full text-[12.5px] text-texto-2">{ROTEIRO_DEMO[e.demo.passo].texto(painel.idsDemo())}</p>
    </div>
  );
}

// Faixa fina nas outras telas: o alarme nunca some de vista.
function FaixaAlarme({ e }: { e: EstadoPainel }) {
  if (naoConfirmado(e))
    return (
      <div role="status" data-gravacao="faixa-alarme" className="flex items-center gap-2.5 rounded-xl bg-of-soft px-4 py-2.5 text-[13px] font-medium text-texto">
        <Forma estado="semsinal" /> Estado dos instrumentos não confirmado: o servidor não respondeu.
      </div>
    );
  const lista = porPrioridade(e).filter(x => x.s.lv === "critico" || x.s.lv === "atencao");
  if (!lista.length) return null;
  if (e.vista === "instrumento" && lista.length === 1 && lista[0].pz.id === e.pzSel) return null;
  const cr = lista.filter(x => x.s.lv === "critico");
  const forte = cr.length > 0;
  return (
    <div role="alert" data-gravacao="faixa-alarme" className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-4 py-2.5 text-[13px] ${forte ? "bg-cr text-white" : "bg-wr-soft text-texto"}`}>
      <Forma estado={forte ? "critico" : "atencao"} cor={forte ? "#fff" : undefined} />
      <span className="font-semibold">{forte ? "Alarme ativo" : "Atenção"}</span>
      {lista.map(x => (
        <button key={x.pz.id} type="button" onClick={() => painel.abrirInstrumento(x.pz.id)} className={`num underline-offset-2 hover:underline ${forte ? "" : "text-texto"}`}>
          {x.pz.id} {x.s.nivel !== null ? `${fmtBR(x.s.nivel)} m` : ""}
        </button>
      ))}
      {forte && e.som.ativo && e.som.ligado && !e.som.silenciado && (
        <button type="button" onClick={() => painel.silenciar()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1 hover:bg-white/25"><BellOff size={14} /> Silenciar</button>
      )}
    </div>
  );
}

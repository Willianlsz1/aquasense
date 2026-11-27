import { useEffect } from "react";
import { Bell, FileText, Gauge, LayoutGrid, Map as MapIcon, Play, Square } from "lucide-react";
import { painel, porPrioridade, ROTEIRO_DEMO, usePainel, VISTAS, type EstadoPainel, type Vista } from "./nucleo/painel";
import { Forma, Logo, Marca } from "./componentes/base";
import { BotaoSom, FonteDados } from "./componentes/topo";
import { FaixaAlarmes } from "./componentes/alarmes";
import { VisaoGeral } from "./telas/VisaoGeral";
import { TelaMapa } from "./telas/Mapa";
import { TelaInstrumento } from "./telas/Instrumento";
import { TelaAlertas } from "./telas/Alertas";

const ICONE: Record<Vista, typeof LayoutGrid> = { visao: LayoutGrid, mapa: MapIcon, instrumento: Gauge, alertas: Bell };

// Direção A: tema escuro fixo (o relatório A4 continua claro, para impressão).
document.documentElement.dataset.tema = "escuro";

export default function App() {
  const e = usePainel();
  // Cada tela abre do topo (sem herdar a rolagem da tela anterior).
  useEffect(() => { window.scrollTo(0, 0); }, [e.vista]);
  const ativos = porPrioridade(e).filter(x => x.s.lv === "critico" || x.s.lv === "atencao");
  const pior = ativos.some(x => x.s.lv === "critico") ? "critico" : ativos.length ? "atencao" : null;
  const relatorio = `relatorio.html?pz=${encodeURIComponent(e.pzSel)}&range=${encodeURIComponent(e.periodo)}`;
  return (
    <div className="flex min-h-full">
      <aside className="lateral no-print hidden w-[224px] flex-none lg:block">
        <div className="sticky top-0 flex h-screen flex-col gap-1 px-4 py-6">
          <a href="#visao" className="flex items-center px-2 pb-7" aria-label="aquasense · Visão geral"><Marca /></a>
          <nav className="flex flex-col gap-1" aria-label="Seções">
            {(Object.keys(VISTAS) as Vista[]).map(v => {
              const I = ICONE[v], ativo = e.vista === v;
              return (
                <a key={v} href={`#${v}`} aria-current={ativo ? "page" : undefined} className="item">
                  <I className="n" size={20} strokeWidth={1.5} /><span className="flex-1">{VISTAS[v]}</span>
                  {v === "alertas" && pior && <span aria-label={`${ativos.length} em alarme`}><Forma estado={pior} /></span>}
                </a>
              );
            })}
            <a href={e.simulada ? undefined : relatorio} target="_blank" rel="noopener" aria-disabled={e.simulada}
              title={e.simulada ? "O relatório usa só dados reais: indisponível na simulação" : "Documento A4 para salvar como PDF"}
              className={`item ${e.simulada ? "cursor-not-allowed opacity-50" : ""}`}>
              <FileText className="n" size={20} strokeWidth={1.5} /><span className="flex-1">Relatório</span>
            </a>
          </nav>
          <div className="rodape mt-auto p-3 text-[12px] leading-relaxed">
            Mariana/MG<br /><span className="num">{e.piezometros.length}</span> piezômetros
          </div>
        </div>
      </aside>

      <main className="min-w-0 max-w-[1520px] flex-1 space-y-6 px-4 pb-24 pt-4 sm:px-8 sm:pt-6 lg:pb-8">
        {e.vista !== "instrumento" && <Topo e={e} />}
        {e.simulada && <BarraDemo e={e} />}
        {e.vista === "mapa" && <FaixaAlarmes e={e} />}
        {!e.pronto ? <p className="py-16 text-center text-texto-3">Carregando configuração…</p>
          : e.vista === "visao" ? <VisaoGeral e={e} />
          : e.vista === "mapa" ? <TelaMapa e={e} />
          : e.vista === "instrumento" ? <TelaInstrumento e={e} />
          : <TelaAlertas e={e} />}
      </main>

      <nav className="lateral no-print fixed inset-x-0 bottom-0 z-[1500] grid grid-cols-4 lg:hidden" aria-label="Seções">
        {(Object.keys(VISTAS) as Vista[]).map(v => {
          const I = ICONE[v], ativo = e.vista === v;
          return (
            <a key={v} href={`#${v}`} aria-current={ativo ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[12px] ${ativo ? "font-semibold text-marca" : "text-[var(--lat-texto)]"}`}>
              <I size={20} strokeWidth={1.5} />{VISTAS[v]}
              {v === "alertas" && pior && <span className="absolute right-[calc(50%-22px)] top-1.5"><Forma estado={pior} size={12} /></span>}
            </a>
          );
        })}
      </nav>

      {e.aviso && <div role="status" className="fixed bottom-20 left-1/2 z-[2500] -translate-x-1/2 rounded-lg border border-linha-2 bg-card-2 px-4 py-2.5 text-[14px] font-medium text-texto lg:bottom-6">{e.aviso}</div>}
    </div>
  );
}

function Topo({ e }: { e: EstadoPainel }) {
  return (
    <header className="sticky top-0 z-[1100] -mx-4 -mt-4 bg-fundo px-4 py-4 sm:-mx-8 sm:-mt-6 sm:px-8 sm:py-5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <a href="#visao" className="lg:hidden" aria-label="aquasense"><Logo tam={22} /></a>
      <h1 className="min-w-0 flex-1 text-[24px] font-semibold leading-none tracking-tight">{VISTAS[e.vista]}</h1>
      <div className="ml-auto flex items-center gap-4"><FonteDados e={e} /><BotaoSom e={e} /></div>
    </header>
  );
}

function BarraDemo({ e }: { e: EstadoPainel }) {
  return (
    <div className="no-print flex flex-wrap items-center gap-3 rounded-lg border border-sim/40 bg-card px-4 py-3 text-[14px]">
      <span className="fonte-pt sim" />
      <span className="font-semibold text-texto">Simulação</span>
      <span className="text-texto-2">Dados fictícios em tempo acelerado, não são leituras dos instrumentos.</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="cenario">Cenário</label>
        <select id="cenario" value={e.demo.passo} onChange={ev => painel.escolherCenario(Number(ev.target.value))}
          className="h-8 rounded-lg border border-linha-2 bg-card-2 px-2.5 text-[14px] text-texto">
          {ROTEIRO_DEMO.map((p, i) => <option key={p.titulo} value={i}>{i + 1}. {p.titulo}</option>)}
        </select>
        {e.demo.rodando
          ? <button type="button" onClick={() => painel.pararRoteiro()} className="btn"><Square size={14} /> Parar</button>
          : <button type="button" onClick={() => painel.iniciarRoteiro()} className="btn forte"><Play size={14} /> Reproduzir roteiro</button>}
      </div>
      <p className="w-full text-[12px] text-texto-2">{ROTEIRO_DEMO[e.demo.passo].texto(painel.idsDemo())}</p>
    </div>
  );
}

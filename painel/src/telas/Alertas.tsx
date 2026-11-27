import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { exportarEventosCsv, LIMITE_API_ALERTAS, ocorrenciaDoServidor, type EventoServidor, type Ocorrencia } from "../nucleo/eventos";
import { PIEZOMETROS } from "../nucleo/config";
import { painel, type EstadoPainel } from "../nucleo/painel";
import { ROTULO } from "../nucleo/util";
import { Forma } from "../componentes/base";
import { FaixaAlarmes } from "../componentes/alarmes";
import { TabelaOcorrencias } from "../componentes/ocorrencias";

type Filtro = "todos" | Ocorrencia["lv"];
const FILTROS: { v: Filtro; t: string }[] = [
  { v: "todos", t: "Todos" }, { v: "critico", t: "Crítico" }, { v: "atencao", t: "Atenção" }, { v: "semsinal", t: "Sem sinal" }, { v: "ok", t: "Retorno ao normal" },
];
const COR: Record<Ocorrencia["lv"], string> = { critico: "text-cr", atencao: "text-wr", semsinal: "text-texto-2", normal: "text-texto-2", ok: "text-texto-2" };
const COLS = "grid grid-cols-[92px_128px_184px_minmax(0,1fr)_136px_minmax(0,1.1fr)] items-center gap-4 px-4";
const Rotulo = ({ children }: { children: string }) => <h2 className="mb-2 text-[12px] font-semibold text-texto-2">{children}</h2>;

function rotuloDia(t: number) {
  const d = new Date(t), hoje = new Date(), ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  const dm = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (d.toDateString() === hoje.toDateString()) return `Hoje · ${dm}`;
  if (d.toDateString() === ontem.toDateString()) return `Ontem · ${dm}`;
  return d.getFullYear() === hoje.getFullYear() ? dm : d.toLocaleDateString("pt-BR");
}

// Alertas (direção A): ativos agora (mesma faixa da Visão geral) + histórico do servidor.
export function TelaAlertas({ e }: { e: EstadoPainel }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [pz, setPz] = useState("todos");
  const sv = e.servidor;
  const doPz = sv.lista.filter(ev => pz === "todos" || ev.instrumento === pz);
  const pares = doPz.map(ev => ({ ev, oc: ocorrenciaDoServidor(ev) })).filter(x => filtro === "todos" || x.oc.lv === filtro);
  const lista: EventoServidor[] = pares.map(x => x.ev);
  const nomes = Object.fromEntries(e.piezometros.map(p => [p.id, p.nome]));
  const atualizado = sv.atualizadoEm ? ` Atualizado às ${new Date(sv.atualizadoEm).toLocaleTimeString("pt-BR")}.` : "";
  const nota = e.simulada ? "A simulação não grava registros no servidor: abaixo, só as mudanças de estado desta sessão."
    : sv.carregando && !sv.atualizadoEm ? "Consultando registros do servidor…"
    : `Mostrando os ${sv.lista.length} registros mais recentes da rede (limite da API: ${LIMITE_API_ALERTAS}). Não é o histórico completo.${atualizado}${sv.erro ? (sv.atualizadoEm ? " A última atualização falhou: exibindo a consulta anterior." : " Consulta indisponível.") : ""}`;
  const chip = (ativo: boolean) => `inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[12px] font-medium ${ativo ? "border-marca bg-marca-soft text-texto" : "border-linha-2 text-texto-2 hover:text-texto"} disabled:pointer-events-none disabled:opacity-50`;

  let diaAnterior = "";
  return (
    <div className="space-y-6">
      <div><Rotulo>Ativos agora</Rotulo><FaixaAlarmes e={e} /></div>

      <div>
        <Rotulo>Histórico do servidor</Rotulo>
        <section className="card overflow-x-auto">
          <div className="flex min-w-[1000px] flex-wrap items-center gap-2 border-b border-linha px-4 py-3">
            {FILTROS.map(f => (
              <button key={f.v} type="button" aria-pressed={filtro === f.v} disabled={e.simulada} onClick={() => setFiltro(f.v)} className={chip(filtro === f.v)}>
                {f.v !== "todos" && <Forma estado={f.v} />}{f.t}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <label className="btn gap-2 text-[12px] font-normal text-texto-3">Instrumento
                <select value={pz} onChange={ev => setPz(ev.target.value)} disabled={e.simulada} className="bg-transparent font-semibold text-texto outline-none">
                  <option value="todos">Todos</option>
                  {e.piezometros.map(p => <option key={p.id} value={p.id}>{p.id} · {p.nome}</option>)}
                </select>
              </label>
              <button type="button" className="btn w-8 justify-center px-0" disabled={e.simulada || sv.carregando} onClick={() => void painel.carregarEventos(true)} title="Consultar de novo" aria-label="Atualizar"><RefreshCw size={16} strokeWidth={1.75} className={sv.carregando ? "animate-spin" : ""} /></button>
              <button type="button" className="btn text-[12px] font-semibold" disabled={e.simulada || !lista.length}
                onClick={() => exportarEventosCsv(lista, pz === "todos" ? (filtro === "todos" ? "rede" : `rede_${filtro}`) : pz, !!sv.erro)}>Exportar CSV</button>
            </div>
          </div>
          <p role="status" className="flex min-w-[1000px] items-center gap-2 border-b border-linha px-4 py-2 text-[12px] text-texto-3"><Forma estado="normal" />{nota}</p>

          {e.simulada ? (
            <TabelaOcorrencias lista={e.ocorrenciasSessao} vazio="Nenhuma mudança de estado até agora." />
          ) : (
            <div className="max-h-[640px] min-w-[1000px] overflow-auto" role="table">
              <div role="row" className={`${COLS} sticky top-0 z-10 h-9 border-b border-linha bg-card text-[12px] font-medium text-texto-3`}>
                {["Hora", "Estado", "Instrumento", "Evento", "Valor", "Ação registrada"].map(h => <span key={h} role="columnheader">{h}</span>)}
              </div>
              {!pares.length ? (
                <p className="py-6 text-center text-texto-3">{sv.erro ? "Não foi possível atualizar os registros do servidor." : sv.atualizadoEm ? "Nenhum registro neste filtro." : "Consultando…"}</p>
              ) : pares.map(({ ev, oc }, i) => {
                const dia = rotuloDia(oc.t);
                const cab = dia !== diaAnterior; diaAnterior = dia;
                const existe = PIEZOMETROS.some(p => p.id === oc.pz);
                return (
                  <div key={`${ev.ts}-${i}`}>
                    {cab && <div className="flex h-7 items-center border-b border-linha bg-fundo px-4 text-[12px] font-medium text-texto-3">{dia}</div>}
                    <div role="row" className={`${COLS} h-11 border-b border-linha`}>
                      <span role="cell" className="num font-mono text-[12px] font-medium text-texto-2">{new Date(oc.t).toLocaleTimeString("pt-BR")}</span>
                      <span role="cell" className={`flex items-center gap-2 whitespace-nowrap font-medium ${COR[oc.lv]}`}><Forma estado={oc.lv} />{oc.lv === "ok" ? "Normal" : ROTULO[oc.lv]}</span>
                      <span role="cell" className="truncate">
                        {existe ? <button type="button" className="font-semibold hover:underline" onClick={() => painel.abrirInstrumento(oc.pz)}>{oc.pz}</button> : <b className="font-semibold">{oc.pz}</b>}
                        {nomes[oc.pz] && <span className="ml-1.5 text-texto-2">{nomes[oc.pz]}</span>}
                      </span>
                      <span role="cell" className="truncate">{oc.titulo}</span>
                      <span role="cell" className="num whitespace-nowrap">{oc.det || "—"}</span>
                      <span role="cell" className="truncate text-[12px] text-texto-2">{oc.acao ?? "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

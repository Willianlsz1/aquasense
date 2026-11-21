import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { exportarEventosCsv, LIMITE_API_ALERTAS, ocorrenciaDoServidor } from "../nucleo/eventos";
import { painel, type EstadoPainel } from "../nucleo/painel";
import { Botao, Cartao, Forma } from "../componentes/base";
import { ListaOcorrencias } from "../componentes/ocorrencias";
import { nomes } from "./textos";

export function TelaAlertas({ e }: { e: EstadoPainel }) {
  const [filtro, setFiltro] = useState("todos");
  const sv = e.servidor;
  const lista = sv.lista.filter(ev => filtro === "todos" || ev.instrumento === filtro);
  const seletor = (
    <select aria-label="Instrumento" value={filtro} onChange={ev => setFiltro(ev.target.value)} disabled={e.simulada}
      className="h-8 rounded-lg border border-linha bg-card px-2.5 text-[13px]">
      <option value="todos">Todos os instrumentos</option>
      {e.piezometros.map(p => <option key={p.id} value={p.id}>{p.id} · {p.nome}</option>)}
    </select>
  );
  const atualizado = sv.atualizadoEm ? ` Atualizado às ${new Date(sv.atualizadoEm).toLocaleTimeString("pt-BR")}.` : "";
  const status = e.simulada ? "Indisponível no modo simulação: a demonstração não grava registros no servidor."
    : sv.carregando && !sv.atualizadoEm ? "Consultando registros do servidor…"
    : `${lista.length} ${lista.length === 1 ? "registro disponível" : "registros disponíveis"}. A API retorna até ${LIMITE_API_ALERTAS} registros da rede; não representa o histórico completo.${atualizado}${sv.erro ? (sv.atualizadoEm ? " A última atualização falhou; exibindo a consulta anterior." : " Consulta indisponível.") : ""}`;
  return (
    <div className="space-y-5">
      <Cartao titulo="Histórico registrado no servidor" sub="eventos gravados pelo servidor quando um instrumento muda de estado"
        acoes={<>
          {seletor}
          <Botao disabled={e.simulada || sv.carregando} onClick={() => void painel.carregarEventos(true)} title="Consultar de novo"><RefreshCw size={14} /> Atualizar</Botao>
          <Botao disabled={e.simulada || !lista.length} onClick={() => exportarEventosCsv(lista, filtro === "todos" ? "rede" : filtro, !!sv.erro)}><Download size={14} /> Exportar CSV</Botao>
        </>}>
        <p role="status" className="mb-3 text-[12.5px] text-texto-3">{status}</p>
        {!e.simulada && <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="sticky top-0 bg-card text-left text-[12px] text-texto-3">
              <tr><th className="py-2 font-medium">Data / hora</th><th className="font-medium">Instrumento</th><th className="font-medium">Tipo</th><th className="font-medium">Evento</th><th className="font-medium">Ação</th></tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {!lista.length ? <tr><td colSpan={5} className="py-6 text-center text-texto-3">{sv.erro ? "Não foi possível atualizar os registros do servidor." : sv.atualizadoEm ? "Nenhum registro disponível." : "Consultando…"}</td></tr>
                : lista.map((ev, i) => {
                  const oc = ocorrenciaDoServidor(ev);
                  return (
                    <tr key={`${ev.ts}-${i}`} className="align-top">
                      <td className="num whitespace-nowrap py-2 pr-3 text-texto-2">{ev.dataLocal}</td>
                      <td className="whitespace-nowrap pr-3"><button type="button" className="font-medium hover:underline" onClick={() => painel.abrirInstrumento(ev.instrumento)}>{ev.instrumento}</button></td>
                      <td className="pr-3"><span className="inline-flex items-center gap-1.5"><Forma estado={oc.lv} size={12} />{ev.tipo}</span></td>
                      <td className="pr-3">{ev.evento}</td>
                      <td className="text-texto-2">{ev.acao}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>}
      </Cartao>
      {e.simulada && (
        <Cartao titulo="Ocorrências desta demonstração" sub="mudanças de estado desde que a página abriu · dados fictícios">
          <ListaOcorrencias lista={e.ocorrenciasSessao} nomes={nomes(e)} vazio="Nenhuma mudança de estado até agora." />
        </Cartao>
      )}
    </div>
  );
}

import { PIEZOMETROS } from "../nucleo/config";
import type { Ocorrencia } from "../nucleo/eventos";
import { painel } from "../nucleo/painel";
import { Forma } from "./base";

function rotuloDia(t: number) {
  const d = new Date(t), hoje = new Date();
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Ocorrências em colunas fixas (hora · indicador · PZ + verbo · valor), agrupadas por dia.
export function TabelaOcorrencias({ lista, vazio, comPz = true }: { lista: Ocorrencia[]; vazio: string; comPz?: boolean }) {
  if (!lista.length) return <p className="px-4 py-6 text-center text-texto-3">{vazio}</p>;
  const grupos: { dia: string; itens: Ocorrencia[] }[] = [];
  lista.forEach(o => {
    const dia = rotuloDia(o.t);
    if (grupos[grupos.length - 1]?.dia !== dia) grupos.push({ dia, itens: [] });
    grupos[grupos.length - 1].itens.push(o);
  });
  return (
    <div>
      {grupos.map(g => (
        <div key={g.dia}>
          <div className="flex h-7 items-center border-b border-linha bg-fundo px-4 text-[12px] font-medium text-texto-3">{g.dia}</div>
          {g.itens.map((o, i) => {
            const existe = PIEZOMETROS.some(p => p.id === o.pz);
            return (
              <button key={`${o.t}-${o.pz}-${i}`} type="button" disabled={!existe} onClick={() => painel.abrirInstrumento(o.pz)}
                className="grid h-11 w-full grid-cols-[44px_16px_1fr_auto] items-center gap-3 border-b border-linha px-4 text-left last:border-b-0 hover:bg-card-2 disabled:hover:bg-transparent">
                <span className="num font-mono text-[12px] font-medium text-texto-3">{new Date(o.t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                <Forma estado={o.lv} />
                <span className="truncate text-texto-2">{comPz && <b className="mr-1.5 font-semibold text-texto">{o.pz}</b>}{o.titulo}</span>
                <span className="num whitespace-nowrap text-[12px] text-texto-2">{o.det || "—"}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

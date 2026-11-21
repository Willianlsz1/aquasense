import { PIEZOMETROS } from "../nucleo/config";
import type { Ocorrencia } from "../nucleo/eventos";
import { painel } from "../nucleo/painel";
import { Forma } from "./base";

function quando(t: number) {
  const d = new Date(t);
  const hoje = new Date().toDateString() === d.toDateString();
  const h = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return hoje ? h : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${h}`;
}

// Linha do tempo das ocorrências. Clicar abre o instrumento.
export function ListaOcorrencias({ lista, vazio, comNome = true, nomes }: { lista: Ocorrencia[]; vazio: string; comNome?: boolean; nomes: Record<string, string> }) {
  if (!lista.length) return <p className="py-6 text-center text-[13px] text-texto-3">{vazio}</p>;
  return (
    <ol className="relative space-y-1 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-linha">
      {lista.map((o, i) => {
        const existe = PIEZOMETROS.some(p => p.id === o.pz);
        const forte = o.lv === "critico";
        return (
          <li key={`${o.t}-${o.pz}-${i}`}>
            <button type="button" disabled={!existe} onClick={() => painel.abrirInstrumento(o.pz)}
              className="relative flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-card-2 disabled:opacity-100 disabled:hover:bg-transparent">
              <span className="relative z-10 mt-0.5 rounded-full bg-card p-[3px]"><Forma estado={o.lv} size={14} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px]" style={{ fontWeight: forte ? 600 : 500, color: forte ? "var(--cr)" : undefined }}>
                  {o.pz}{comNome && nomes[o.pz] ? ` ${nomes[o.pz]}` : ""}{o.servidor ? " · " : " "}{o.titulo}
                </span>
                {o.det && <span className="block text-[12.5px] text-texto-3">{o.det}</span>}
              </span>
              <span className="num pt-0.5 text-[12px] text-texto-3">{quando(o.t)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

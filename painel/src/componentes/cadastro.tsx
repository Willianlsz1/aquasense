import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Cadastro } from "../nucleo/cadastro";
import { painel } from "../nucleo/painel";

const Campo = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1 text-[12.5px] font-medium text-texto-2">{rotulo}{children}</label>
);
const inp = "rounded-lg border border-linha bg-card-2 px-3 py-2 text-[14px] font-normal text-texto outline-none focus:border-marca";

// Edição do cadastro. O código do instrumento não muda: é o que a UCT envia.
export function ModalCadastro({ id, nome, aoFechar }: { id: string; nome: string; aoFechar: () => void }) {
  const inicial = painel.cadastro(id);
  const [c, setC] = useState<Cadastro>({ ...inicial, nome });
  const [prof, setProf] = useState(inicial.prof === null ? "" : String(inicial.prof).replace(".", ","));
  const nomeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nomeRef.current?.select();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aoFechar]);
  const mudar = (k: keyof Cadastro) => (e: { target: { value: string } }) => setC({ ...c, [k]: e.target.value });
  const salvar = (e: FormEvent) => {
    e.preventDefault();
    const p = parseFloat(prof.replace(",", "."));
    painel.salvarCadastro(id, { ...c, local: c.local.trim(), sensor: c.sensor.trim(), resp: c.resp.trim(), obs: c.obs.trim(), prof: Number.isFinite(p) ? p : null });
    aoFechar();
  };
  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/45 p-4" onMouseDown={e => { if (e.target === e.currentTarget) aoFechar(); }}>
      <form onSubmit={salvar} className="card w-full max-w-[520px] p-6" role="dialog" aria-modal="true" aria-labelledby="modal-tit">
        <h2 id="modal-tit" className="text-[17px] font-semibold">Editar cadastro · {id}</h2>
        <div className="mt-4 grid gap-3">
          <Campo rotulo="Nome do instrumento"><input ref={nomeRef} className={inp} value={c.nome} onChange={mudar("nome")} maxLength={40} required /></Campo>
          <Campo rotulo="Local / descrição"><input className={inp} value={c.local} onChange={mudar("local")} maxLength={80} placeholder="ex.: Berma 3, ombreira esquerda" /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Sensor"><input className={inp} value={c.sensor} onChange={mudar("sensor")} maxLength={40} /></Campo>
            <Campo rotulo="Profundidade do tubo (m)"><input className={inp} value={prof} onChange={e => setProf(e.target.value)} inputMode="decimal" /></Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Instalado em"><input className={inp} type="date" value={c.instalado} onChange={mudar("instalado")} /></Campo>
            <Campo rotulo="Responsável"><input className={inp} value={c.resp} onChange={mudar("resp")} maxLength={40} /></Campo>
          </div>
          <Campo rotulo="Observações"><textarea className={inp} rows={2} value={c.obs} onChange={mudar("obs")} maxLength={200} /></Campo>
          <p className="rounded-lg bg-card-2 px-3 py-2 text-[12.5px] text-texto-2">O código <b>{id}</b> não muda: é ele que a UCT envia ao servidor. Por enquanto, o cadastro fica salvo neste navegador.</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={aoFechar} className="rounded-xl border border-linha px-4 py-2 text-[13.5px] text-texto-2 hover:bg-card-2">Cancelar</button>
          <button type="submit" className="rounded-xl bg-texto px-4 py-2 text-[13.5px] font-semibold text-card">Salvar</button>
        </div>
      </form>
    </div>
  );
}

import { useState } from "react";
import type { Pz } from "../nucleo/config";
import { naoConfirmado, porPrioridade, type EstadoPainel } from "../nucleo/painel";
import { fmtBR, formatUltima, ROTULO, type Situacao } from "../nucleo/util";
import { Forma, Segmentado } from "../componentes/base";
import { MapaInstrumentos } from "../componentes/mapa";

export function TelaMapa({ e }: { e: EstadoPainel }) {
  const itens = porPrioridade(e);
  const [camada, setCamada] = useState<"satelite" | "ruas">("satelite");
  const [voar, setVoar] = useState<{ pz: Pz; n: number } | null>(null);
  const [sel, setSel] = useState<string | undefined>();
  const nc = naoConfirmado(e);
  // Altura que sobra abaixo do topo e da faixa de alarmes (cabeçalho 40 px + 56 px por linha).
  const linhas = nc ? 1 : itens.filter(x => x.s.lv === "critico" || x.s.lv === "atencao").length + (itens.some(x => x.s.lv === "semsinal") ? 1 : 0);
  const faixa = linhas ? 40 + 56 * linhas : 56;
  const altura = `max(420px, calc(100vh - ${144 + faixa + (e.simulada ? 112 : 0)}px))`;
  return (
    <div className="card relative overflow-hidden">
      <MapaInstrumentos itens={itens} modo="completo" camada={camada} altura={altura} voar={voar} sel={sel} lista agora={e.agora} />
      <div className="pointer-events-none absolute inset-0 z-[1000] flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="pointer-events-auto rounded-xl bg-card/95 p-1 shadow-card">
            <Segmentado rotulo="Camada do mapa" valor={camada} aoMudar={setCamada} opcoes={[{ v: "satelite", t: "Satélite" }, { v: "ruas", t: "Ruas" }]} />
          </div>
          <span className="pointer-events-auto ml-auto rounded-lg bg-card/95 px-2.5 py-1.5 text-[12px] font-medium text-texto-2 shadow-card">Posições ilustrativas</span>
        </div>
        <section className="pointer-events-auto hidden w-[320px] rounded-2xl bg-card/95 p-3 shadow-card backdrop-blur md:block" aria-label="Instrumentos por prioridade">
          <h2 className="px-2 pb-1 text-[13.5px] font-semibold">Instrumentos <span className="font-normal text-texto-3">· por prioridade</span></h2>
          <ul>
            {itens.map(({ pz, s }) => (
              <li key={pz.id}>
                <button type="button" onClick={() => { setSel(pz.id); setVoar({ pz, n: Date.now() }); }} aria-pressed={sel === pz.id}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-card-2 ${sel === pz.id ? "bg-card-2" : ""}`}>
                  <Forma estado={nc ? "semsinal" : s.lv} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{pz.id} · {pz.nome}</span>
                    <span className="block text-[12px] text-texto-3">{nc ? "não confirmado" : `${ROTULO[s.lv]} · ${s.lv === "semsinal" ? `última ${formatUltima(s.recepcao, e.agora)}` : `recebido ${formatUltima(s.recepcao, e.agora)}`}`}</span>
                  </span>
                  <span className="num text-[13.5px] font-semibold" style={{ color: s.lv === "critico" && !nc ? "var(--cr)" : s.lv === "semsinal" || nc ? "var(--texto-3)" : undefined }}>
                    {nc || s.nivel === null ? "–" : `${s.lv === "semsinal" ? "últ. " : ""}${fmtBR(s.nivel)} m`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <div className="pointer-events-auto mt-auto flex w-fit flex-wrap gap-x-3 gap-y-1 rounded-xl bg-card/95 px-3 py-2 text-[12px] text-texto-2 shadow-card">
          {(["critico", "atencao", "semsinal", "normal"] as Situacao[]).map(lv => <span key={lv} className="inline-flex items-center gap-1.5"><Forma estado={lv} size={12} />{ROTULO[lv]}</span>)}
        </div>
      </div>
    </div>
  );
}

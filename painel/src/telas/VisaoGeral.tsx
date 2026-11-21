import { useMemo, useState } from "react";
import { BellOff, ChevronRight, Search } from "lucide-react";
import { CFG } from "../nucleo/config";
import { disponibilidade24h, naoConfirmado, ocorrencias, painel, porPrioridade, type EstadoPainel } from "../nucleo/painel";
import { fin, fmtBR, formatUltima, ROTULO, type Estado, type Situacao } from "../nucleo/util";
import type { Pz } from "../nucleo/config";
import { Anel, Cartao, COR, Contador, Forma, Medidor, Mini, Segmentado, Selo } from "../componentes/base";
import { MapaInstrumentos } from "../componentes/mapa";
import { ListaOcorrencias } from "../componentes/ocorrencias";
import { GraficoRede } from "../componentes/graficos";
import { nomes, taxaRapida, var24 } from "./textos";

type Item = ReturnType<typeof porPrioridade>[number];

export function VisaoGeral({ e }: { e: EstadoPainel }) {
  const itens = porPrioridade(e);
  const [realce, setRealce] = useState<string | null>(null);
  const series = useMemo(() => e.piezometros.map(pz => ({ id: pz.id, nome: pz.nome, lv: itens.find(i => i.pz.id === pz.id)!.s.lv, pontos: e.historicoRede[pz.id] ?? [] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [e.piezometros, e.historicoRede, itens.map(i => i.s.lv).join()]);
  const oc = ocorrencias(e).slice(0, 8);
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[1.35fr_1fr_0.85fr]">
        <Destaque e={e} itens={itens} />
        <PorEstado e={e} itens={itens} />
        <Comunicacao e={e} itens={itens} />
      </div>
      <Instrumentos e={e} itens={itens} aoRealcar={setRealce} />
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Cartao titulo="Onde estão" sub="posições ilustrativas · imagem de satélite Esri" corpo="p-0 pt-3"
          acoes={<a className="text-[13px] font-medium text-marca hover:underline" href="#mapa">Abrir mapa →</a>}>
          <div className="overflow-hidden rounded-b-[18px]">
            <MapaInstrumentos itens={itens} modo="visao" altura={320} agora={e.agora} realce={realce} />
          </div>
        </Cartao>
        <Cartao titulo={e.simulada ? "Ocorrências desta demonstração" : "Últimos registros do servidor"}
          sub={e.simulada ? "mudanças de estado desde que a página abriu" : "eventos gravados pelo servidor"}
          acoes={<a className="text-[13px] font-medium text-marca hover:underline" href="#alertas">Ver todos →</a>}>
          <ListaOcorrencias lista={oc} nomes={nomes(e)}
            vazio={e.simulada ? "Nenhuma mudança de estado até agora." : e.servidor.erro ? "Registros do servidor indisponíveis no momento." : e.servidor.atualizadoEm ? "Nenhum registro no servidor." : "Consultando o servidor…"} />
        </Cartao>
      </div>
      <Cartao titulo="Nível da água · últimas 24 h" sub="só o instrumento em alarme ganha cor · clique no nome para esconder ou mostrar">
        <GraficoRede series={series} agora={e.agora} realce={realce} />
        {series.some(s => s.lv === "semsinal") && <p className="mt-2 text-[12px] text-texto-3">Linha tracejada: instrumento sem sinal. O painel não completa o trecho sem dado.</p>}
      </Cartao>
    </div>
  );
}

// ── DESTAQUE: o que exige ação agora ──────────────────────────────────────────
function Destaque({ e, itens }: { e: EstadoPainel; itens: Item[] }) {
  const pior = itens[0];
  const semDados = !Object.keys(e.ultimos).length;
  const base = "relative overflow-hidden rounded-[18px] p-6 shadow-card";
  if (naoConfirmado(e))
    return (
      <div className={`${base} bg-of-soft`} style={{ outline: "1.5px dashed var(--of)" }} role="status">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-texto-2"><Forma estado="semsinal" /> Estado não confirmado</div>
        <h3 className="mt-4 text-[21px] font-semibold leading-tight">O servidor não respondeu</h3>
        <p className="mt-1.5 max-w-[48ch] text-[13.5px] text-texto-2">
          Sem resposta {e.falhas === 1 ? "na última consulta" : `em ${e.falhas} consultas seguidas`}. Nenhum valor é mostrado como atual até a comunicação voltar.
        </p>
      </div>
    );
  if (semDados || !pior)
    return <div className={`${base} bg-card`}><p className="text-[13px] font-semibold text-texto-3">Situação da barragem</p><h3 className="mt-4 text-[20px] font-semibold">Aguardando a primeira leitura…</h3></div>;

  const { s, pz } = pior;
  if (s.lv === "critico" || s.lv === "atencao") {
    const cr = s.lv === "critico";
    const outros = itens.filter(x => x !== pior && (x.s.lv === "critico" || x.s.lv === "atencao"));
    const inc = e.inicioAlerta[pz.id];
    const limite = cr ? CFG.thrCritico : CFG.thrAtencao;
    const desde = inc?.desde ? `desde ${new Date(inc.desde).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "já ativo ao abrir o painel";
    const tocando = cr && e.som.ativo && e.som.ligado && !e.som.silenciado;
    return (
      <div className={`${base} ${cr ? "text-white" : "bg-wr-soft text-texto"}`} role="alert"
        style={cr ? { background: "linear-gradient(135deg, #C42536, #9E1B2A)" } : { outline: "1.5px solid var(--wr)" }}>
        <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
          <span className={cr ? "pulsar" : ""}><Forma estado={s.lv} cor={cr ? "#fff" : undefined} size={16} /></span>
          {cr ? "Alarme ativo" : "Atenção"} · {desde}
          {tocando && <button type="button" onClick={() => painel.silenciar()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1 text-[12.5px] hover:bg-white/25"><BellOff size={14} /> Silenciar som</button>}
        </div>
        <h3 className="mt-4 text-[22px] font-semibold leading-tight">{pz.id} {pz.nome} {cr ? "em nível crítico" : "em atenção"}</h3>
        <p className={`mt-1.5 max-w-[50ch] text-[13.5px] ${cr ? "opacity-90" : "text-texto-2"}`}>
          <span className="num font-semibold">{fmtBR(s.nivel!)} m</span>, {fmtBR(s.nivel! - limite)} m acima do limite de {fmtBR(limite, 0)} m.{" "}
          {cr ? "Acionar a equipe de geotecnia responsável e seguir o plano de ação de emergência." : "Intensificar o acompanhamento e avisar o responsável técnico."}
        </p>
        {outros.length > 0 && <p className={`mt-2 text-[12.5px] ${cr ? "opacity-85" : "text-texto-2"}`}>Também em alerta: {outros.map(o => `${o.pz.id} (${ROTULO[o.s.lv].toLowerCase()})`).join(", ")}</p>}
        <button type="button" onClick={() => painel.abrirInstrumento(pz.id)}
          className={`mt-5 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13.5px] font-semibold ${cr ? "bg-white text-[#9E1B2A]" : "bg-texto text-card"}`}>
          Abrir {pz.id} <ChevronRight size={16} />
        </button>
      </div>
    );
  }
  if (s.lv === "semsinal") {
    const sem = itens.filter(x => x.s.lv === "semsinal");
    return (
      <div className={`${base} bg-card`} style={{ outline: "1.5px dashed var(--of)" }} role="status">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-texto-2"><Forma estado="semsinal" size={16} /> Sem sinal</div>
        <h3 className="mt-4 text-[21px] font-semibold leading-tight">{sem.length === 1 ? `${pz.id} ${pz.nome} parou de comunicar` : `${sem.length} instrumentos sem comunicação`}</h3>
        <p className="mt-1.5 max-w-[50ch] text-[13.5px] text-texto-2">
          {sem.map(x => `${x.pz.id}: última recepção ${formatUltima(x.s.recepcao, e.agora)}`).join(" · ")}. O último valor não é tratado como atual. Verificar alimentação e comunicação da UCT.
        </p>
        <p className="mt-2 text-[12.5px] text-texto-3">Os demais instrumentos estão em faixa normal.</p>
        <button type="button" onClick={() => painel.abrirInstrumento(pz.id)} className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-texto px-4 py-2 text-[13.5px] font-semibold text-card">Abrir {pz.id} <ChevronRight size={16} /></button>
      </div>
    );
  }
  return (
    <div className={`${base} text-white`} style={{ background: "linear-gradient(135deg, #1E88E5, #1565C0)" }}>
      <svg className="pointer-events-none absolute bottom-0 left-0 w-full opacity-20" viewBox="0 0 400 60" preserveAspectRatio="none" height="60" aria-hidden>
        <path className="onda" fill="#fff" d="M0 30 Q50 18 100 30 T200 30 T300 30 T400 30 T500 30 T600 30 V60 H0z" />
      </svg>
      <div className="text-[13px] font-semibold opacity-90">Situação da barragem</div>
      <h3 className="mt-4 text-[22px] font-semibold">Todos os piezômetros normais</h3>
      <p className="relative mt-1.5 max-w-[46ch] text-[13.5px] opacity-90">
        Nenhum alarme ativo. {itens.length === 1 ? "O instrumento está" : `Os ${itens.length} instrumentos estão`} comunicando e abaixo de {fmtBR(CFG.thrAtencao, 0)} m.
      </p>
    </div>
  );
}

function PorEstado({ e, itens }: { e: EstadoPainel; itens: Item[] }) {
  const ordem: Situacao[] = ["critico", "atencao", "semsinal", "normal"];
  const nc = naoConfirmado(e);
  return (
    <Cartao titulo="Instrumentos por estado">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-card-2">
        {!nc && ordem.map(lv => {
          const n = itens.filter(x => x.s.lv === lv).length;
          return <div key={lv} className={`h-full transition-[width] duration-700 ${lv === "semsinal" ? "hachura" : ""}`}
            style={{ width: `${(n / Math.max(1, itens.length)) * 100}%`, background: lv === "semsinal" ? undefined : lv === "normal" ? "var(--neutro)" : COR[lv] }} />;
        })}
      </div>
      <ul className="mt-3 divide-y divide-linha">
        {ordem.map(lv => {
          const lista = nc ? [] : itens.filter(x => x.s.lv === lv);
          return (
            <li key={lv} className="flex items-center gap-2.5 py-2 text-[13.5px]">
              <Forma estado={lv} cor={lista.length ? undefined : "var(--linha)"} />
              <span className={lista.length ? "font-medium" : "text-texto-3"}>{ROTULO[lv]}</span>
              <span className="truncate text-[12.5px] text-texto-3">{lista.map(x => x.pz.id).join(", ")}</span>
              <span className={`num ml-auto font-semibold ${lista.length ? "" : "text-texto-3"}`}>{nc ? "–" : lista.length}</span>
            </li>
          );
        })}
      </ul>
      {nc && <p className="mt-1 text-[12px] text-texto-3">não confirmado: servidor sem resposta</p>}
    </Cartao>
  );
}

function Comunicacao({ e, itens }: { e: EstadoPainel; itens: Item[] }) {
  const nc = naoConfirmado(e);
  const disp = e.piezometros.map(p => disponibilidade24h(e, p.id));
  const pct = !nc && disp.length && disp.every(Boolean) ? disp.reduce((a, d) => a + d!.pct, 0) / disp.length : null;
  const ok = itens.filter(x => x.s.lv !== "semsinal").length;
  const ultima = Math.max(...itens.map(x => x.s.recepcao ?? -Infinity));
  return (
    <Cartao titulo="Comunicação" sub="disponibilidade nas últimas 24 h">
      <div className="flex items-center gap-4">
        <div className="relative flex-none">
          <Anel pct={pct} cor={pct !== null && pct < 90 ? "var(--of)" : "var(--marca)"} />
          <span className="num absolute inset-0 grid place-items-center text-[15px] font-semibold">{pct === null ? "–" : `${fmtBR(pct, 1)}%`}</span>
        </div>
        <dl className="space-y-1.5 text-[12.5px]">
          <div><dt className="text-texto-3">Comunicando</dt>
            <dd className="num font-semibold" style={{ color: !nc && ok < itens.length ? "var(--of)" : undefined }}>{nc ? "não confirmado" : `${ok} de ${itens.length}`}</dd></div>
          <div><dt className="text-texto-3">Última recepção</dt><dd className="font-semibold">{nc || !fin(ultima) ? "–" : formatUltima(ultima, e.agora)}</dd></div>
        </dl>
      </div>
      <p className="mt-2 text-[12px] text-texto-3">{pct === null ? "Disponibilidade indisponível: histórico da rede incompleto." : `Leituras recebidas ÷ esperadas (uma a cada ${CFG.intervaloEnvioSeg} s).`}</p>
    </Cartao>
  );
}

// ── CARTÕES DOS PIEZÔMETROS ───────────────────────────────────────────────────
function Instrumentos({ e, itens, aoRealcar }: { e: EstadoPainel; itens: Item[]; aoRealcar: (id: string | null) => void }) {
  const [filtro, setFiltro] = useState<"todos" | "alerta" | "semsinal">("todos");
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  const lista = itens.filter(x => (filtro === "todos" || (filtro === "alerta" ? x.s.lv === "critico" || x.s.lv === "atencao" : x.s.lv === "semsinal"))
    && (!q || `${x.pz.id} ${x.pz.nome}`.toLowerCase().includes(q)));
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold">Piezômetros <span className="font-normal text-texto-3">· ordenados por gravidade</span></h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {itens.length > 3 && (
            <label className="flex items-center gap-2 rounded-xl bg-card px-3 py-1.5 shadow-card">
              <Search size={15} className="text-texto-3" /><span className="sr-only">Buscar instrumento</span>
              <input value={busca} onChange={ev => setBusca(ev.target.value)} placeholder="Buscar" className="w-28 bg-transparent text-[13px] outline-none" />
            </label>
          )}
          <Segmentado rotulo="Filtro" valor={filtro} aoMudar={setFiltro}
            opcoes={[{ v: "todos", t: "Todos" }, { v: "alerta", t: "Em alerta" }, { v: "semsinal", t: "Sem sinal" }]} />
        </div>
      </div>
      {lista.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {lista.map(x => <CartaoPz key={x.pz.id} e={e} pz={x.pz} s={x.s} aoRealcar={aoRealcar} />)}
        </div>
      ) : <p className="card p-6 text-center text-[13px] text-texto-3">Nenhum instrumento neste filtro.</p>}
    </section>
  );
}

function CartaoPz({ e, pz, s, aoRealcar }: { e: EstadoPainel; pz: Pz; s: Estado; aoRealcar: (id: string | null) => void }) {
  const nc = naoConfirmado(e);
  const sem = s.lv === "semsinal", cr = s.lv === "critico", at = s.lv === "atencao";
  const d24 = var24(e, pz.id, s);
  const h = e.historicoRede[pz.id];
  const cor = sem ? "var(--of)" : cr ? "var(--cr)" : at ? "var(--wr)" : "var(--marca)";
  let folga = null;
  if (!sem && s.nivel !== null) {
    const fa = CFG.thrAtencao - s.nivel, fc = CFG.thrCritico - s.nivel;
    folga = fa > 0 ? <>folga de {fmtBR(fa)} m até atenção</>
      : fc > 0 ? <span className="font-semibold text-wr">{fmtBR(-fa)} m acima da atenção · {fmtBR(fc)} m até crítico</span>
      : <span className="font-semibold text-cr">{fmtBR(-fc)} m acima do limite crítico</span>;
  }
  return (
    <article tabIndex={0} role="button" aria-label={`Abrir ${pz.id} ${pz.nome}`}
      onClick={() => painel.abrirInstrumento(pz.id)} onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); painel.abrirInstrumento(pz.id); } }}
      onMouseEnter={() => aoRealcar(pz.id)} onMouseLeave={() => aoRealcar(null)} onFocus={() => aoRealcar(pz.id)} onBlur={() => aoRealcar(null)}
      className="card relative cursor-pointer overflow-hidden p-5 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-marca"
      style={cr ? { outline: "2px solid var(--cr)", background: "linear-gradient(180deg, var(--cr-soft), var(--card) 42%)" }
        : at ? { outline: "1.5px solid var(--wr)" } : sem ? { outline: "1.5px dashed var(--of)" } : undefined}>
      <div className="flex items-center gap-2">
        {nc ? <Selo estado="semsinal" texto="Não confirmado" /> : <Selo estado={s.lv} />}
        <span className="ml-auto text-[12px] text-texto-3">{nc ? "" : sem ? `última ${formatUltima(s.recepcao, e.agora)}` : `recebido ${formatUltima(s.recepcao, e.agora)}`}</span>
      </div>
      <h3 className="mt-3 text-[14.5px] font-semibold">{pz.id} <span className="font-normal text-texto-2">· {pz.nome}</span></h3>
      <div className="mt-3 flex items-end gap-5">
        <div className="min-w-0 flex-1">
          {nc ? (
            <div className="num text-[30px] font-semibold leading-none text-texto-3">– <span className="text-[15px]">m</span></div>
          ) : sem ? (
            <>
              <div className="num text-[30px] font-semibold leading-none text-texto-3">{s.nivel !== null ? fmtBR(s.nivel) : "–"} <span className="text-[15px]">m</span></div>
              <div className="mt-2 inline-flex rounded-md bg-of-soft px-2 py-0.5 text-[12px] font-semibold text-texto-2">{s.nivel !== null ? "Última conhecida · não confirmada" : "Nenhuma leitura recebida"}</div>
            </>
          ) : (
            <>
              <div className="text-[40px] font-semibold leading-none" style={{ color: cr ? "var(--cr)" : undefined }}>
                <Contador valor={s.nivel!} /> <span className="text-[17px] text-texto-3">m</span>
              </div>
              <div className="num mt-2 text-[12.5px] text-texto-2">{folga}</div>
              {taxaRapida(s.taxa) && <div className="num mt-1 text-[12px] font-semibold text-wr">↗ variação rápida: {s.taxa! >= 0 ? "+" : ""}{fmtBR(s.taxa!)} m/dia</div>}
            </>
          )}
        </div>
        <div className="pr-6"><Medidor nivel={nc ? null : s.nivel} estado={nc ? "semsinal" : s.lv} /></div>
      </div>
      <div className="mt-4 border-t border-linha pt-3">
        <Mini pontos={h === undefined ? [] : h} cor={cor} tracejado={sem} />
        <div className="mt-1 flex justify-between text-[12px] text-texto-3">
          <span>últimas 24 h</span>
          <span className="num" style={{ color: cr ? "var(--cr)" : undefined }}>{d24 === null ? (sem ? "sem dados recentes" : "") : `${d24 >= 0 ? "+" : ""}${fmtBR(d24)} m em 24 h`}</span>
        </div>
      </div>
    </article>
  );
}

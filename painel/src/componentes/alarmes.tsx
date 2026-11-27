import { ArrowDownRight, ArrowUpRight, BellOff, ChevronRight, Minus } from "lucide-react";
import { CFG } from "../nucleo/config";
import { naoConfirmado, painel, porPrioridade, type EstadoPainel } from "../nucleo/painel";
import { fmtBR, hora, ROTULO, type Situacao } from "../nucleo/util";
import { Forma } from "./base";

type Item = ReturnType<typeof porPrioridade>[number];

// Margem até o próximo limite: sempre o mesmo formato.
export function margem(n: number | null) {
  if (n === null) return "—";
  if (n >= CFG.thrCritico) return `+${fmtBR(n - CFG.thrCritico)} m acima de ${fmtBR(CFG.thrCritico, 0)} m`;
  if (n >= CFG.thrAtencao) return `+${fmtBR(n - CFG.thrAtencao)} m acima de ${fmtBR(CFG.thrAtencao, 0)} m`;
  return `${fmtBR(CFG.thrAtencao - n)} m abaixo de ${fmtBR(CFG.thrAtencao, 0)} m`;
}

// Seta + taxa em m/dia (Lucide, traço único). Sem taxa: travessão.
export function Tendencia({ taxa }: { taxa: number | null }) {
  if (taxa === null) return <span className="text-texto-3">—</span>;
  const I = Math.abs(taxa) < 0.05 ? Minus : taxa > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <I size={16} strokeWidth={1.75} className="flex-none" />
      <span className="num font-medium">{taxa > 0 ? "+" : ""}{fmtBR(taxa)} m/dia</span>
    </span>
  );
}

const K = ({ children }: { children: React.ReactNode }) => <span className="block text-[12px] leading-tight text-texto-3">{children}</span>;

function duracao(ms: number) {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ${String(min % 60).padStart(2, "0")}` : `${Math.floor(h / 24)} d`;
}

const COLS = "grid-cols-[116px_184px_104px_196px_136px_1fr_auto]";
const LINHA = `relative grid ${COLS} h-14 items-center gap-4 border-b border-linha px-4 last:border-b-0`;
const FILETE: Record<string, string> = {
  critico: "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-cr bg-cr-soft",
  atencao: "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-wr bg-wr-soft",
  semsinal: "before:absolute before:inset-y-0 before:left-0 before:w-1 before:[background:repeating-linear-gradient(180deg,var(--of)_0_4px,transparent_4px_8px)]",
};
const COR_EST: Record<Situacao, string> = { critico: "text-cr", atencao: "text-wr", semsinal: "text-texto-2", normal: "text-texto-2" };

// Faixa de alarmes: uma linha por alarme, colunas fixas, ordenadas por prioridade.
// Ordem de leitura: estado → piezômetro → nível → margem → tendência → desde → ação.
export function FaixaAlarmes({ e }: { e: EstadoPainel }) {
  const itens = porPrioridade(e);
  const tocando = e.som.ativo && e.som.ligado && !e.som.silenciado;
  const silenciar = tocando && (
    <button type="button" onClick={() => painel.silenciar()} className="btn ml-2 h-7 text-[12px]"><BellOff size={14} strokeWidth={1.75} /> Silenciar</button>
  );

  if (naoConfirmado(e))
    return (
      <section className="card overflow-x-auto bg-card" role="status" aria-label="Alarmes ativos">
        <div className="flex h-10 items-center gap-3 border-b border-linha px-4 text-[12px] font-medium text-texto-2">
          <b className="text-[14px] font-semibold text-texto">Alarmes ativos</b><span>estado não confirmado</span>
        </div>
        <div className={`${LINHA} ${FILETE.semsinal}`}>
          <div className="flex items-center gap-2 whitespace-nowrap font-semibold text-texto-2"><Forma estado="semsinal" />Sem resposta</div>
          <div className="col-span-2 truncate"><b className="font-semibold">{e.piezometros.map(p => p.id).join(", ")}</b><span className="ml-1.5 text-texto-2">estado não confirmado</span></div>
          <div className="col-span-3"><K>Consultas seguidas sem resposta</K><span className="num font-medium">{e.falhas}</span></div>
          <span />
        </div>
      </section>
    );

  const ativos = itens.filter(x => x.s.lv === "critico" || x.s.lv === "atencao");
  const sem = itens.filter(x => x.s.lv === "semsinal");
  if (!Object.keys(e.ultimos).length && !e.falhas)
    return <section className="card flex h-14 items-center gap-3 px-4 text-texto-2"><Forma estado="normal" /><b className="font-medium text-texto">Aguardando a primeira leitura…</b></section>;

  if (!ativos.length && !sem.length)
    return (
      <section className="card flex h-14 items-center gap-3 px-4 text-texto-2" role="status" aria-label="Alarmes ativos">
        <Forma estado="normal" /><b className="font-medium text-texto">Nenhum alarme ativo</b>
        <span>· <span className="num">{itens.length} de {itens.length}</span> piezômetros comunicando</span>
      </section>
    );

  const cont = (["critico", "atencao"] as const).map(l => { const k = ativos.filter(x => x.s.lv === l).length; return k ? `${k} ${ROTULO[l].toLowerCase()}` : ""; }).filter(Boolean);
  if (sem.length) cont.push(`${sem.length} sem sinal`);
  return (
    <section className="card overflow-x-auto" role={ativos.some(x => x.s.lv === "critico") ? "alert" : "status"} aria-label="Alarmes ativos">
      <div className="flex h-10 min-w-[1000px] items-center gap-3 border-b border-linha px-4 text-[12px] font-medium text-texto-2">
        <b className="text-[14px] font-semibold text-texto">Alarmes ativos</b><span className="num">{cont.join(" · ")}</span>
        <span className="ml-auto">Ordenados por prioridade</span>{silenciar}
      </div>
      <div className="min-w-[1000px]">
        {ativos.map(x => <LinhaAlarme key={x.pz.id} e={e} x={x} />)}
        {sem.length > 0 && (
          <div className={`${LINHA} ${FILETE.semsinal}`}>
            <div className="flex items-center gap-2 font-semibold text-texto-2"><Forma estado="semsinal" size={20} />Sem sinal</div>
            <div className="col-span-2 truncate"><b className="font-semibold">{sem.map(x => x.pz.id).join(", ")}</b>
              <span className="ml-1.5 text-texto-2">{sem.length > 1 ? "sem comunicação" : sem[0].pz.nome}</span></div>
            <div className="col-span-3"><K>Verificar</K><span className="font-medium">Alimentação e rede da UCT</span></div>
            <button type="button" className="btn" onClick={() => painel.abrirInstrumento(sem[0].pz.id)}>Abrir {sem[0].pz.id}<ChevronRight size={16} strokeWidth={1.75} /></button>
          </div>
        )}
      </div>
    </section>
  );
}

function LinhaAlarme({ e, x }: { e: EstadoPainel; x: Item }) {
  const { pz, s } = x;
  const cr = s.lv === "critico";
  const inc = e.inicioAlerta[pz.id];
  const desde = inc?.desde ? `${hora(inc.desde)} · ${duracao(e.agora - inc.desde)}` : "antes de abrir";
  return (
    <div className={`${LINHA} ${FILETE[s.lv]}`}>
      <div className={`flex items-center gap-2 font-semibold ${COR_EST[s.lv]}`}><span className={cr ? "pulsar" : ""}><Forma estado={s.lv} size={20} /></span>{ROTULO[s.lv]}</div>
      <div className="truncate"><b className="font-semibold">{pz.id}</b><span className="ml-1.5 text-texto-2">{pz.nome}</span></div>
      <div className={`num text-[20px] font-semibold ${COR_EST[s.lv]}`}>{fmtBR(s.nivel!)}<small className="ml-0.5 text-[14px] font-normal text-texto-2">m</small></div>
      <div><K>Margem</K><span className="num whitespace-nowrap font-medium">{margem(s.nivel)}</span></div>
      <div><K>Tendência</K><Tendencia taxa={s.taxa} /></div>
      <div><K>Desde</K><span className="num whitespace-nowrap font-medium">{desde}</span></div>
      <button type="button" className={`btn ${cr ? "forte" : ""}`} onClick={() => painel.abrirInstrumento(pz.id)}>Abrir {pz.id}<ChevronRight size={16} strokeWidth={1.75} /></button>
    </div>
  );
}

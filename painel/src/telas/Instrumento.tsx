import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText } from "lucide-react";
import { CFG, PERIODOS } from "../nucleo/config";
import { disponibilidade24h, naoConfirmado, ocorrencias, painel, porPrioridade, type EstadoPainel } from "../nucleo/painel";
import { exportarCsv, exportarXls, type PontoHist } from "../nucleo/exportar";
import { classificarNivel, diaHora, fin, fmtBR, formatUltima, hora, ROTULO, situacaoPz, variacaoRapida, type Estado, type Situacao } from "../nucleo/util";
import { Forma } from "../componentes/base";
import { margem } from "../componentes/alarmes";
import { Tubo } from "../componentes/tubo";
import { GraficoInstrumento } from "../componentes/graficos";
import { TabelaOcorrencias } from "../componentes/ocorrencias";
import { ModalCadastro } from "../componentes/cadastro";
import { BotaoSom, FonteDados } from "../componentes/topo";
import { previsao } from "./textos";

const DIAS: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };
const COR_EST: Record<Situacao, string> = { critico: "text-cr", atencao: "text-wr", semsinal: "text-texto-2", normal: "text-texto-2" };

function Bloco({ titulo, acoes, children, className = "" }: { titulo: string; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card flex flex-col ${className}`}>
      <div className="flex h-12 flex-none items-center justify-between gap-3 border-b border-linha px-4">
        <h2 className="text-[16px] font-semibold">{titulo}</h2>{acoes}
      </div>
      {children}
    </section>
  );
}
const LinkCab = ({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) =>
  href ? <a href={href} className="flex items-center gap-1 text-[12px] text-marca-2 hover:underline">{children}<ChevronRight size={14} strokeWidth={1.75} /></a>
    : <button type="button" onClick={onClick} className="flex items-center gap-1 text-[12px] text-marca-2 hover:underline">{children}<ChevronRight size={14} strokeWidth={1.75} /></button>;

// Tela do instrumento (direção A): cabeçalho → faixa do incidente → poço, números,
// gráfico, comunicação e cadastro → leituras por intervalo e ocorrências.
export function TelaInstrumento({ e }: { e: EstadoPainel }) {
  const [editando, setEditando] = useState(false);
  const fechar = useCallback(() => setEditando(false), []);
  const idx = Math.max(0, e.piezometros.findIndex(p => p.id === e.pzSel));
  const pz = e.piezometros[idx];
  const s = situacaoPz(e.ultimos[pz.id], e.agora / 1000);
  const nc = naoConfirmado(e);
  // Faixa com histerese (evita piscar perto do limite); variação rápida eleva o normal para atenção.
  const lv: Situacao = nc || s.lv === "semsinal" ? "semsinal" : e.faixaSel === "normal" && s.lv === "atencao" ? "atencao" : (e.faixaSel ?? s.lv);
  const n = e.piezometros.length;
  const ir = (k: number) => painel.selecionarPz(e.piezometros[(idx + k + n) % n].id);
  return (
    <div className="space-y-6">
      <header className="md:sticky md:top-0 md:z-[1100] -mx-4 -mt-4 bg-fundo px-4 py-4 sm:-mx-8 sm:-mt-6 sm:px-8 sm:py-5 flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <div className="mb-1.5 text-[12px] text-texto-3"><a href="#visao" className="text-marca-2 hover:underline">Piezômetros</a> / {pz.id}</div>
          <h1 className="flex flex-wrap items-center gap-3 text-[24px] font-semibold leading-none">
            {pz.id} <span className="font-normal text-texto-2">{pz.nome}</span>
            <span className={`flex items-center gap-1.5 text-[14px] font-medium ${COR_EST[lv]}`}><Forma estado={lv} />{nc ? "Sem resposta" : ROTULO[lv]}</span>
          </h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <FonteDados e={e} curto />
          <button type="button" onClick={() => ir(-1)} className="btn w-8 justify-center px-0" aria-label="Instrumento anterior"><ChevronLeft size={16} strokeWidth={1.75} /></button>
          <label className="sr-only" htmlFor="sel-pz">Instrumento</label>
          <select id="sel-pz" value={pz.id} onChange={ev => painel.selecionarPz(ev.target.value)} className="btn bg-fundo pr-2 font-medium">
            {porPrioridade(e).sort((a, b) => a.i - b.i).map(x => <option key={x.pz.id} value={x.pz.id}>{x.pz.id} · {x.pz.nome}{!nc && x.s.lv !== "normal" ? ` (${ROTULO[x.s.lv].toLowerCase()})` : ""}</option>)}
          </select>
          <button type="button" onClick={() => ir(1)} className="btn w-8 justify-center px-0" aria-label="Próximo instrumento"><ChevronRight size={16} strokeWidth={1.75} /></button>
          <BotaoSom e={e} />
        </div>
      </header>

      <Incidente e={e} s={s} lv={lv} nc={nc} />

      <div className="grid items-start gap-6 xl:grid-cols-[200px_minmax(0,1fr)_300px]">
        <Bloco titulo="Poço">
          <div className="flex justify-center pb-2 pt-4"><Tubo nivel={nc ? null : s.nivel} estado={lv} /></div>
          {!nc && s.lv === "semsinal" && <p className="px-4 pb-3 text-center text-[12px] text-texto-3">{s.nivel !== null ? "Último valor, não confirmado" : "Nenhuma leitura recebida"}</p>}
        </Bloco>
        <section className="card min-w-0">
          <Numeros e={e} s={s} lv={lv} nc={nc} />
          <Historico e={e} lv={lv} />
        </section>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1">
          <Comunicacao e={e} s={s} nc={nc} />
          <Cadastro e={e} aoEditar={() => setEditando(true)} />
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Leituras e={e} />
        <Bloco titulo="Ocorrências deste piezômetro" acoes={<LinkCab href="#alertas">Ver todas</LinkCab>}>
          <TabelaOcorrencias comPz={false} lista={ocorrencias(e).filter(o => o.pz === pz.id).slice(0, 8)}
            vazio={e.simulada ? "Nenhuma mudança de estado nesta simulação." : e.servidor.erro ? "Registros do servidor indisponíveis." : "Nenhum registro deste piezômetro."} />
        </Bloco>
      </div>
      {editando && <ModalCadastro id={pz.id} nome={pz.nome} aoFechar={fechar} />}
    </div>
  );
}

// ── FAIXA DO INCIDENTE ────────────────────────────────────────────────────────
// Instrumento em alarme: situação, margem, desde, pico e o procedimento.
// Outros instrumentos em alarme aparecem logo abaixo, na mesma faixa.
const K = ({ children }: { children: ReactNode }) => <span className="block text-[12px] leading-tight text-texto-3">{children}</span>;

function Incidente({ e, s, lv, nc }: { e: EstadoPainel; s: Estado; lv: Situacao; nc: boolean }) {
  const [proc, setProc] = useState(false);
  const pz = e.piezometros.find(p => p.id === e.pzSel)!;
  const outros = nc ? [] : porPrioridade(e).filter(x => x.pz.id !== pz.id && (x.s.lv === "critico" || x.s.lv === "atencao"));
  const alarme = !nc && (lv === "critico" || lv === "atencao") && s.nivel !== null;
  const semSinal = !nc && lv === "semsinal";
  useEffect(() => setProc(false), [pz.id]);
  if (!alarme && !semSinal && !outros.length) return null;
  const cr = lv === "critico";
  const inc = e.inicioAlerta[pz.id];
  const tocando = e.som.ativo && e.som.ligado && !e.som.silenciado;
  const situacao = cr ? `Acima do limite crítico (${fmtBR(CFG.thrCritico, 0)} m)`
    : s.nivel !== null && s.nivel >= CFG.thrAtencao ? `Acima do limite de atenção (${fmtBR(CFG.thrAtencao, 0)} m)`
    : variacaoRapida(s.taxa) ? `Variação rápida (limite ${fmtBR(CFG.taxaMaxMDia, 1)} m/dia)`
    : `Descendo: volta ao normal abaixo de ${fmtBR(CFG.thrAtencao - CFG.histereseM)} m`;
  const linha = "relative grid h-14 items-center gap-4 px-4 before:absolute before:inset-y-0 before:left-0 before:w-1";
  return (
    <section className="card overflow-x-auto" role={cr ? "alert" : "status"} aria-label="Alarme deste piezômetro">
      {alarme && (
        <div className={`${linha} min-w-[960px] grid-cols-[116px_1fr_196px_136px_136px_auto] ${cr ? "bg-cr-soft before:bg-cr" : "bg-wr-soft before:bg-wr"}`}>
          <div className={`flex items-center gap-2 font-semibold ${COR_EST[lv]}`}><span className={cr ? "pulsar" : ""}><Forma estado={lv} size={20} /></span>{ROTULO[lv]}</div>
          <div className="min-w-0"><K>Situação</K><span className="block truncate font-medium">{situacao}</span></div>
          <div><K>Margem</K><span className="num whitespace-nowrap font-medium">{margem(s.nivel)}</span></div>
          <div><K>Desde</K><span className="num whitespace-nowrap font-medium">{inc?.desde ? `${hora(inc.desde)} · ${formatUltima(inc.desde / 1000, e.agora).replace(/^há /, "")}` : "antes de abrir"}</span></div>
          <div><K>Pico no alarme</K><span className="num whitespace-nowrap font-medium">{fmtBR(inc?.pico ?? s.nivel!)} m</span></div>
          <div className="flex items-center gap-2">
            {cr && tocando && <button type="button" onClick={() => painel.silenciar()} className="btn">Silenciar</button>}
            <button type="button" className={`btn ${cr ? "forte" : ""}`} aria-expanded={proc} onClick={() => setProc(v => !v)}>
              Procedimento<ChevronDown size={16} strokeWidth={1.75} className={`transition-transform ${proc ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
      )}
      {alarme && proc && (
        <ol className="min-w-[960px] list-decimal space-y-1 border-t border-linha py-3 pl-10 pr-4 text-[14px] text-texto-2">
          <li>Confirmar a leitura: tendência, instrumentos vizinhos e comunicação.</li>
          <li>{cr ? "Acionar a equipe de geotecnia responsável e seguir o plano de ação de emergência." : "Intensificar o acompanhamento e avisar o responsável técnico."}</li>
          <li>Registrar a ocorrência e as providências tomadas.</li>
        </ol>
      )}
      {semSinal && (
        <div className={`${linha} min-w-[960px] grid-cols-[116px_1fr_196px_auto] before:[background:repeating-linear-gradient(180deg,var(--of)_0_4px,transparent_4px_8px)]`}>
          <div className="flex items-center gap-2 whitespace-nowrap font-semibold text-texto-2"><Forma estado="semsinal" size={20} />Sem sinal</div>
          <div><K>Última leitura</K><span className="num font-medium">{fin(s.recepcao) ? `${diaHora(s.recepcao * 1000)} · ${formatUltima(s.recepcao, e.agora).replace(/^há /, "")}` : "Nunca reportou"}</span></div>
          <div><K>Verificar</K><span className="font-medium">Alimentação e rede da UCT</span></div>
          <span />
        </div>
      )}
      {outros.map(x => (
        <div key={x.pz.id} className={`${linha} min-w-[960px] grid-cols-[116px_1fr_196px_auto] border-t border-linha ${x.s.lv === "critico" ? "before:bg-cr" : "before:bg-wr"}`}>
          <div className={`flex items-center gap-2 font-semibold ${COR_EST[x.s.lv]}`}><Forma estado={x.s.lv} />{ROTULO[x.s.lv]}</div>
          <div className="truncate"><K>Outro piezômetro</K><b className="font-semibold">{x.pz.id}</b><span className="ml-1.5 text-texto-2">{x.pz.nome}</span></div>
          <div><K>Nível</K><span className={`num font-medium ${COR_EST[x.s.lv]}`}>{fmtBR(x.s.nivel!)} m</span></div>
          <button type="button" className="btn" onClick={() => painel.selecionarPz(x.pz.id)}>Abrir {x.pz.id}<ChevronRight size={16} strokeWidth={1.75} /></button>
        </div>
      ))}
    </section>
  );
}

// ── 4 NÚMEROS ─────────────────────────────────────────────────────────────────
function Numeros({ e, s, lv, nc }: { e: EstadoPainel; s: Estado; lv: Situacao; nc: boolean }) {
  const sem = nc || lv === "semsinal";
  const nivel = sem ? null : s.nivel;
  const pts = e.hist.estado === "ok" ? e.hist.pontos : [];
  const pico = pts.length ? pts.reduce((a, p) => (p.max > a.max ? p : a), pts[0]) : null;
  const per = PERIODOS[e.periodo].label;
  const pv = previsao(sem ? { lv: "semsinal", nivel: null, taxa: null } : s);
  const dirTxt = s.taxa === null ? "" : Math.abs(s.taxa) < 0.05 ? "estável" : s.taxa > 0 ? "subindo" : "descendo";
  const tendDet = sem ? "sem leitura recente" : s.taxa === null ? "sem taxa calculada"
    : pv.estimativa ? `${dirTxt} · ${pv.valor} até ${s.nivel! >= CFG.thrAtencao ? "crítico" : "atenção"} (estimativa)`
    : `${dirTxt} · sem previsão de limite`;
  const cor = lv === "critico" ? "text-cr" : lv === "atencao" ? "text-wr" : "";
  const mDet = nivel === null ? "" : nivel >= CFG.thrCritico ? `acima de crítico (${fmtBR(CFG.thrCritico, 0)} m)` : nivel >= CFG.thrAtencao ? `acima de atenção (${fmtBR(CFG.thrAtencao, 0)} m)` : `abaixo de atenção (${fmtBR(CFG.thrAtencao, 0)} m)`;
  const mVal = nivel === null ? "—" : margem(nivel).replace(/ (acima|abaixo) de .*$/, "");
  const recente = pico && e.agora - pico.t < PERIODOS[e.periodo].bucketMs * 1.5;
  return (
    <div className="grid grid-cols-2 border-b border-linha md:grid-cols-[1.3fr_1fr_1fr_1fr]">
      <div className="p-4">
        <div className="mb-1.5 text-[12px] text-texto-3">Nível d'água agora</div>
        <div className={`num text-[32px] font-semibold leading-none tracking-tight ${sem ? "text-texto-3" : cor}`}>
          {nivel !== null ? fmtBR(nivel) : "—"}<small className="ml-0.5 text-[16px] font-normal text-texto-2">m</small>
        </div>
        <div className="num mt-1.5 text-[12px] text-texto-2">
          {nc ? "servidor sem resposta" : sem ? (s.nivel !== null ? `último ${fmtBR(s.nivel)} m · não confirmado` : "nenhuma leitura") : `${hora(s.recepcao! * 1000)} · ${formatUltima(s.recepcao, e.agora).replace("há <1 min", "há menos de 1 min")}`}
        </div>
      </div>
      <Kpi k="Margem" v={mVal} det={mDet} />
      <Kpi k="Tendência" v={sem || s.taxa === null ? "—" : `${s.taxa > 0 ? "+" : ""}${fmtBR(s.taxa)} m/dia`} det={tendDet} />
      <Kpi k={`Máx. ${per}`} v={pico ? `${fmtBR(pico.max)} m` : "—"} det={pico ? `${e.periodo === "24h" ? hora(pico.t) : diaHora(pico.t)}${recente ? " · agora" : ""}` : "sem histórico"} />
    </div>
  );
}
const Kpi = ({ k, v, det }: { k: string; v: string; det: string }) => (
  <div className="border-l border-linha p-4 pr-3 max-md:[&:nth-child(3)]:border-l-0">
    <div className="mb-1.5 text-[12px] text-texto-3">{k}</div>
    <div className="num whitespace-nowrap text-[18px] font-semibold leading-tight">{v}</div>
    <div className="mt-1.5 text-[12px] text-texto-2">{det}</div>
  </div>
);

// ── GRÁFICO + EXPORTAR ────────────────────────────────────────────────────────
function Historico({ e, lv }: { e: EstadoPainel; lv: Situacao }) {
  const h = e.hist;
  const ok = h.estado === "ok" && h.pontos.length > 0;
  const per = PERIODOS[e.periodo];
  const fim = e.agora, ini = fim - (DIAS[e.periodo] ?? 1) * 86400_000;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h3 className="text-[14px] font-semibold">Nível {e.periodo === "24h" ? "nas últimas 24 h" : `nos últimos ${per.label}`}</h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-linha-2 bg-fundo p-0.5" role="group" aria-label="Período">
            {Object.entries(PERIODOS).map(([v, p]) => (
              <button key={v} type="button" aria-pressed={e.periodo === v} onClick={() => painel.selecionarPeriodo(v)}
                className={`h-[26px] whitespace-nowrap rounded-md px-2 sm:px-2.5 text-[12px] font-medium ${e.periodo === v ? "bg-card-2 text-texto" : "text-texto-2 hover:text-texto"}`}>{p.label}</button>
            ))}
          </div>
          <Exportar e={e} ok={ok} />
        </div>
      </div>
      <div className="px-2 pb-2">
        {ok ? <GraficoInstrumento pontos={h.pontos} bucketMs={per.bucketMs} longo={e.periodo !== "24h"} estado={lv} ini={ini} fim={fim} />
          : <div className="grid h-[250px] place-items-center text-texto-3">{h.estado === "carregando" ? "Carregando histórico…" : h.msg}</div>}
      </div>
    </div>
  );
}

function Exportar({ e, ok }: { e: EstadoPainel; ok: boolean }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (ev: MouseEvent) => { if (!ref.current?.contains(ev.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  const h = e.hist;
  const relatorio = `relatorio.html?pz=${encodeURIComponent(e.pzSel)}&range=${encodeURIComponent(e.periodo)}`;
  const item = "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[14px] hover:bg-card-2 disabled:pointer-events-none disabled:opacity-50";
  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn" aria-expanded={aberto} aria-haspopup="menu" onClick={() => setAberto(v => !v)}>Exportar<ChevronDown size={16} strokeWidth={1.75} /></button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-9 z-[1200] w-60 rounded-lg border border-linha-2 bg-card p-1 shadow-[0_8px_24px_rgba(0,0,0,.4)]">
          <button role="menuitem" type="button" disabled={!ok} className={item} title="Intervalos do gráfico, com identificação da fonte"
            onClick={() => { exportarCsv(h.pontos, e.pzSel, e.periodo, h.bucketSeg, e.simulada); setAberto(false); }}><Download size={16} strokeWidth={1.75} />CSV dos intervalos</button>
          <button role="menuitem" type="button" disabled={!ok} className={item} title="Planilha com estado pelo máximo e resumo do período"
            onClick={() => { exportarXls(h.pontos, e.pzSel, e.periodo, h.bucketSeg, e.simulada); setAberto(false); }}><FileSpreadsheet size={16} strokeWidth={1.75} />Planilha Excel</button>
          {e.simulada
            ? <span role="menuitem" aria-disabled className={`${item} cursor-not-allowed opacity-50`} title="O relatório usa só dados reais: indisponível na simulação"><FileText size={16} strokeWidth={1.75} />Relatório PDF · só dados reais</span>
            : <a role="menuitem" className={item} href={relatorio} target="_blank" rel="noopener" onClick={() => setAberto(false)}><FileText size={16} strokeWidth={1.75} />Relatório PDF (A4)</a>}
          {e.simulada && <p className="px-3 pb-1.5 pt-1 text-[12px] text-texto-3">Arquivos marcados como SIMULAÇÃO.</p>}
        </div>
      )}
    </div>
  );
}

// ── COMUNICAÇÃO E CADASTRO (compactos) ────────────────────────────────────────
function Kv({ itens }: { itens: [string, ReactNode, boolean?][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 pb-4 pt-3 text-[12px]">
      {itens.map(([k, v, vazio]) => [
        <dt key={`${k}-k`} className="text-texto-3">{k}</dt>,
        <dd key={`${k}-v`} className={`num text-right ${vazio ? "text-texto-3" : "font-medium text-texto"}`}>{v}</dd>,
      ])}
    </dl>
  );
}

function Comunicacao({ e, s, nc }: { e: EstadoPainel; s: Estado; nc: boolean }) {
  const ok = !nc && s.lv !== "semsinal";
  const ts = s.recepcao;
  const disp = disponibilidade24h(e, e.pzSel);
  const falhas = ocorrencias(e).filter(o => o.pz === e.pzSel && o.lv === "semsinal");
  const ultimaFalha = nc ? "—" : !ok ? "em andamento" : falhas.length ? diaHora(falhas[0].t).replace(",", "") : "nenhuma registrada";
  const esperadas = Math.round(86400 / CFG.intervaloEnvioSeg);
  return (
    <Bloco titulo="Comunicação">
      <Kv itens={[
        ["Última leitura", nc ? "servidor sem resposta" : fin(ts) ? `${new Date(ts * 1000).toLocaleTimeString("pt-BR")} · ${formatUltima(ts, e.agora).replace(/^há /, "")}` : "nunca", !fin(ts) || nc],
        ["Intervalo de envio", `${CFG.intervaloEnvioSeg} s`],
        ["Leituras em 24 h", disp ? `${disp.recebidas.toLocaleString("pt-BR")} de ${esperadas.toLocaleString("pt-BR")}` : "—", !disp],
        ["Disponibilidade 24 h", disp ? `${fmtBR(disp.pct, 1)}%` : "—", !disp],
        ["Última falha", ultimaFalha],
      ]} />
    </Bloco>
  );
}

function Cadastro({ e, aoEditar }: { e: EstadoPainel; aoEditar: () => void }) {
  const pz = e.piezometros.find(p => p.id === e.pzSel)!;
  const c = painel.cadastro(pz.id);
  const campos: [string, string | null][] = [
    ["Sensor", c.sensor || null],
    ["Coordenadas", `${fmtBR(pz.lat, 4)}, ${fmtBR(pz.lng, 4)}`],
    ["Local", c.local || null],
    ["Profundidade", c.prof !== null ? `${fmtBR(c.prof)} m` : null],
    ["Instalação", c.instalado ? new Date(`${c.instalado}T12:00`).toLocaleDateString("pt-BR") : null],
    ["Responsável", c.resp || null],
  ];
  const vazios = campos.filter(([, v]) => v === null).length;
  return (
    <Bloco titulo="Cadastro" acoes={<LinkCab onClick={aoEditar}>Editar</LinkCab>}>
      <Kv itens={campos.map(([k, v]) => [k, v ?? "—", v === null])} />
      {vazios > 0 && <p className="px-4 pb-4 text-[12px] text-texto-3">{vazios} {vazios === 1 ? "campo" : "campos"} sem preenchimento · <button type="button" onClick={aoEditar} className="text-marca-2 hover:underline">Completar</button></p>}
    </Bloco>
  );
}

// ── LEITURAS POR INTERVALO ────────────────────────────────────────────────────
// Mais recentes primeiro, sem duplicatas; estado pelo máximo; lacunas numa linha própria.
type LinhaLeit = { tipo: "p"; p: PontoHist } | { tipo: "lacuna"; de: number; ate: number };

function Leituras({ e }: { e: EstadoPainel }) {
  const h = e.hist;
  const longo = e.periodo !== "24h";
  const limite = 2 * PERIODOS[e.periodo].bucketMs;
  // Um registro por intervalo: a leitura ao vivo que cai no intervalo já listado
  // não vira linha nova; só atualiza o máximo.
  const passo = (h.bucketSeg ? h.bucketSeg * 1000 : 0) || PERIODOS[e.periodo].bucketMs;
  const m = new Map<number, PontoHist>();
  [...(h.estado === "ok" ? h.pontos : [])].sort((a, b) => a.t - b.t).forEach(p => {
    const k = Math.floor(p.t / passo), ja = m.get(k);
    m.set(k, ja ? { ...ja, max: Math.max(ja.max, p.max) } : p);
  });
  const pts = [...m.values()].sort((a, b) => b.t - a.t).slice(0, 12);
  const linhas: LinhaLeit[] = [];
  pts.forEach((p, i) => {
    if (i && pts[i - 1].t - p.t > limite) linhas.push({ tipo: "lacuna", de: p.t, ate: pts[i - 1].t });
    linhas.push({ tipo: "p", p });
  });
  const quando = (t: number) => longo ? diaHora(t).replace(",", "") : hora(t);
  const dataCurta = (t: number) => {
    const d = new Date(t);
    return new Date().toDateString() === d.toDateString() ? hora(t) : `${hora(t)} (${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })})`;
  };
  const COLS = "grid grid-cols-[96px_1fr_1fr_120px] items-center gap-4 px-4";
  return (
    <Bloco titulo="Leituras por intervalo" acoes={<span className="text-[12px] text-texto-3">Mais recentes primeiro · estado pelo máximo</span>}>
      {linhas.length ? (
        <div className="max-h-[440px] overflow-auto">
          <div className={`${COLS} sticky top-0 h-8 border-b border-linha bg-card text-[12px] font-medium text-texto-3`}><span>{longo ? "Data" : "Hora"}</span><span>Média</span><span>Máxima</span><span>Estado</span></div>
          {linhas.map(l => {
            if (l.tipo === "lacuna")
              return (
                <div key={`l${l.de}`} className="flex h-8 items-center gap-2 border-b border-linha px-4 text-[12px] text-texto-3 [background:repeating-linear-gradient(135deg,transparent_0_6px,rgba(255,255,255,.02)_6px_12px)]">
                  <Forma estado="semsinal" size={12} />Sem dados de {dataCurta(l.de)} a {dataCurta(l.ate)}
                </div>
              );
            const lv = classificarNivel(l.p.max);
            return (
              <div key={l.p.t} className={`${COLS} h-10 border-b border-linha last:border-b-0`}>
                <span className="num text-texto-2">{quando(l.p.t)}</span>
                <span className="num">{fmtBR(l.p.v)} m</span>
                <span className="num">{fmtBR(l.p.max)} m</span>
                <span className={`flex items-center gap-2 ${COR_EST[lv]}`}><Forma estado={lv} size={12} />{ROTULO[lv]}</span>
              </div>
            );
          })}
        </div>
      ) : <p className="px-4 py-6 text-center text-texto-3">{h.estado === "carregando" ? "Carregando…" : "Nenhuma leitura no período."}</p>}
    </Bloco>
  );
}

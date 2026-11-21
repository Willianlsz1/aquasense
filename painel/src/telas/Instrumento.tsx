import { useCallback, useState, type ReactNode } from "react";
import { BellOff, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Pencil } from "lucide-react";
import { CFG, PERIODOS } from "../nucleo/config";
import { disponibilidade24h, naoConfirmado, ocorrencias, painel, porPrioridade, type EstadoPainel } from "../nucleo/painel";
import { exportarCsv, exportarXls } from "../nucleo/exportar";
import { classificarNivel, fin, fmtBR, formatUltima, hora, diaHora, ROTULO, situacaoPz, type Situacao } from "../nucleo/util";
import { Botao, Cartao, Forma, Segmentado, Selo } from "../componentes/base";
import { Tubo } from "../componentes/tubo";
import { GraficoInstrumento } from "../componentes/graficos";
import { ListaOcorrencias } from "../componentes/ocorrencias";
import { MapaInstrumentos } from "../componentes/mapa";
import { ModalCadastro } from "../componentes/cadastro";
import { nomes, previsao, taxaRapida, tendencia, var24 } from "./textos";

export function TelaInstrumento({ e }: { e: EstadoPainel }) {
  const [editando, setEditando] = useState(false);
  const fechar = useCallback(() => setEditando(false), []);
  const idx = Math.max(0, e.piezometros.findIndex(p => p.id === e.pzSel));
  const pz = e.piezometros[idx];
  const d = e.ultimos[pz.id];
  const s = situacaoPz(d, e.agora / 1000);
  const nc = naoConfirmado(e);
  const sem = s.lv === "semsinal";
  // Selo do instrumento aberto: faixa com histerese (evita piscar perto do limite).
  const lvSelo: Situacao = nc || sem ? "semsinal" : (e.faixaSel ?? s.lv);
  const n = e.piezometros.length;
  const ir = (k: number) => painel.selecionarPz(e.piezometros[(idx + k + n) % n].id);
  const cad = painel.cadastro(pz.id);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[20px] font-semibold tracking-tight">{pz.id} <span className="font-normal text-texto-2">· {pz.nome}</span></h2>
            {nc ? <Selo estado="semsinal" texto="Não confirmado" /> : <Selo estado={lvSelo} />}
            <button type="button" onClick={() => setEditando(true)} className="grid h-8 w-8 place-items-center rounded-lg text-texto-3 hover:bg-card-2 hover:text-texto" title="Editar cadastro" aria-label="Editar cadastro"><Pencil size={15} /></button>
          </div>
          <p className="mt-0.5 text-[12.5px] text-texto-3">
            {e.simulada ? "Origem: demonstração (dados fictícios)" : "Origem: sistema real"} · {nc ? "estado não confirmado: servidor sem resposta"
              : sem ? `sem sinal · última recepção ${formatUltima(s.recepcao, e.agora)}` : `recebido ${formatUltima(s.recepcao, e.agora)}`}
            {cad.local ? ` · ${cad.local}` : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => ir(-1)} className="grid h-9 w-9 place-items-center rounded-xl bg-card text-texto-2 shadow-card" aria-label="Instrumento anterior"><ChevronLeft size={18} /></button>
          <select aria-label="Instrumento" value={pz.id} onChange={ev => painel.selecionarPz(ev.target.value)} className="h-9 rounded-xl border-0 bg-card px-3 text-[13.5px] shadow-card">
            {porPrioridade(e).sort((a, b) => a.i - b.i).map(x => <option key={x.pz.id} value={x.pz.id}>{x.pz.id} · {x.pz.nome}{!nc && x.s.lv !== "normal" ? ` (${ROTULO[x.s.lv].toLowerCase()})` : ""}</option>)}
          </select>
          <button type="button" onClick={() => ir(1)} className="grid h-9 w-9 place-items-center rounded-xl bg-card text-texto-2 shadow-card" aria-label="Próximo instrumento"><ChevronRight size={18} /></button>
        </div>
      </div>

      {!nc && <Incidente e={e} />}

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <Cartao titulo="Poço de observação" sub="coluna d'água no tubo · tracejados = limites">
          <Tubo nivel={nc ? null : s.nivel} estado={nc ? "semsinal" : s.lv} recepcao={s.recepcao} />
        </Cartao>

        <div className="min-w-0 space-y-5">
          <Indicadores e={e} />
          <Historico e={e} />
          <div className="grid gap-5 xl:grid-cols-2">
            <Leituras e={e} />
            <Cartao titulo="Ocorrências deste instrumento">
              <ListaOcorrencias lista={ocorrencias(e).filter(o => o.pz === pz.id).slice(0, 10)} comNome={false} nomes={nomes(e)}
                vazio={e.simulada ? "Nenhuma mudança de estado nesta demonstração." : e.servidor.erro ? "Registros do servidor indisponíveis." : "Nenhum registro deste instrumento."} />
            </Cartao>
          </div>
        </div>

        <div className="grid content-start gap-5 md:grid-cols-2 lg:col-span-2 xl:grid-cols-3 2xl:col-span-1 2xl:grid-cols-1">
          <CartaoComunicacao e={e} />
          <Cartao titulo="Cadastro" acoes={<button type="button" onClick={() => setEditando(true)} className="text-[13px] font-medium text-marca hover:underline">Editar</button>}>
            <dl className="space-y-2 text-[13px]">
              <Linha k="Código" v={<span className="num">{pz.id}</span>} />
              <Linha k="Nome" v={pz.nome} />
              <Linha k="Local" v={cad.local || <i className="text-texto-3">não informado</i>} />
              <Linha k="Sensor" v={cad.sensor || <i className="text-texto-3">não informado</i>} />
              <Linha k="Profundidade" v={cad.prof !== null ? <span className="num">{fmtBR(cad.prof)} m</span> : <i className="text-texto-3">não informada</i>} />
              <Linha k="Instalado em" v={cad.instalado ? new Date(`${cad.instalado}T12:00`).toLocaleDateString("pt-BR") : <i className="text-texto-3">não informado</i>} />
              <Linha k="Responsável" v={cad.resp || <i className="text-texto-3">não informado</i>} />
              {cad.obs && <Linha k="Observações" v={cad.obs} />}
              <Linha k="Coordenadas" v={<span className="num">{fmtBR(pz.lat, 4)}, {fmtBR(pz.lng, 4)}</span>} />
            </dl>
            <p className="mt-3 text-[12px] text-texto-3">Cadastro salvo neste navegador. Coordenadas ilustrativas.</p>
          </Cartao>
          <Cartao titulo="Localização" corpo="p-0 pt-3">
            <div className="overflow-hidden rounded-b-[18px]">
              <MapaInstrumentos itens={porPrioridade(e)} modo="ins" sel={pz.id} altura={200} agora={e.agora} />
            </div>
          </Cartao>
        </div>
      </div>
      {editando && <ModalCadastro id={pz.id} nome={pz.nome} aoFechar={fechar} />}
    </div>
  );
}

const Linha = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex justify-between gap-3"><dt className="text-texto-3">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
);

// ── QUADRO DE INCIDENTE (atenção ou crítico) ──────────────────────────────────
function Incidente({ e }: { e: EstadoPainel }) {
  const d = e.ultimos[e.pzSel];
  const s = situacaoPz(d, e.agora / 1000);
  if ((s.lv !== "atencao" && s.lv !== "critico") || s.nivel === null) return null;
  const cr = s.lv === "critico";
  const pz = e.piezometros.find(p => p.id === e.pzSel)!;
  const inc = e.inicioAlerta[pz.id] ?? { pico: s.nivel, desde: null };
  const limite = cr ? CFG.thrCritico : CFG.thrAtencao;
  const desde = inc.desde ? `detectado às ${new Date(inc.desde).toLocaleTimeString("pt-BR")} (${formatUltima(inc.desde / 1000, e.agora)})` : "já estava nesta faixa quando o painel abriu";
  const vizinhos = porPrioridade(e).filter(x => x.pz.id !== pz.id);
  const tocando = cr && e.som.ativo && e.som.ligado && !e.som.silenciado;
  return (
    <section role="alert" className="card overflow-hidden" style={{ outline: `2px solid ${cr ? "var(--cr)" : "var(--wr)"}` }}>
      <div className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${cr ? "bg-cr text-white" : "bg-wr-soft"}`}>
        <Forma estado={s.lv} size={18} cor={cr ? "#fff" : undefined} />
        <div><h3 className="text-[16px] font-semibold">{pz.id} {cr ? "em nível crítico" : "em atenção"}</h3><p className={`text-[12.5px] ${cr ? "opacity-90" : "text-texto-2"}`}>{desde}</p></div>
        {tocando && <button type="button" onClick={() => painel.silenciar()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[13px] hover:bg-white/25"><BellOff size={14} /> Silenciar som</button>}
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_1.3fr_1.5fr]">
        <Bloco r="Agora" v={`${fmtBR(s.nivel)} m`} det={`${fmtBR(s.nivel - limite)} m acima do limite de ${fmtBR(limite, 0)} m`} forte={cr} />
        <Bloco r="Pico desde a detecção" v={`${fmtBR(inc.pico ?? s.nivel)} m`} det={`tendência: ${tendencia(s.taxa)}`} />
        <Bloco r="Comunicação" v="Online" det={`recebido ${formatUltima(s.recepcao, e.agora)}`} />
        <div>
          <div className="text-[12px] font-medium text-texto-3">Instrumentos vizinhos</div>
          <ul className="mt-1.5 space-y-1 text-[13px]">
            {vizinhos.length ? vizinhos.map(x => {
              const v = var24(e, x.pz.id, x.s);
              return <li key={x.pz.id} className="flex items-center gap-1.5"><Forma estado={x.s.lv} size={12} /><b>{x.pz.id}</b> {ROTULO[x.s.lv].toLowerCase()}
                {x.s.nivel !== null && x.s.lv !== "semsinal" ? <span className="num"> · {fmtBR(x.s.nivel)} m</span> : null}
                {v !== null && <span className="num text-texto-3"> ({v >= 0 ? "+" : ""}{fmtBR(v)} m em 24 h)</span>}</li>;
            }) : <li className="text-texto-3">Nenhum outro instrumento cadastrado.</li>}
          </ul>
        </div>
        <div>
          <div className="text-[12px] font-medium text-texto-3">O que fazer</div>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[13px]">
            <li>Confirmar a leitura: tendência, vizinhos e comunicação.</li>
            <li>{cr ? "Acionar a equipe de geotecnia responsável pela estrutura e seguir o plano de ação de emergência." : "Intensificar o acompanhamento e avisar o responsável técnico."}</li>
            <li>Registrar a ocorrência e as providências tomadas.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}

const Bloco = ({ r, v, det, forte }: { r: string; v: string; det: string; forte?: boolean }) => (
  <div>
    <div className="text-[12px] font-medium text-texto-3">{r}</div>
    <div className="num mt-1 text-[22px] font-semibold" style={{ color: forte ? "var(--cr)" : undefined }}>{v}</div>
    <div className="text-[12.5px] text-texto-2">{det}</div>
  </div>
);

// ── INDICADORES ───────────────────────────────────────────────────────────────
function Indicadores({ e }: { e: EstadoPainel }) {
  const s = situacaoPz(e.ultimos[e.pzSel], e.agora / 1000);
  const nc = naoConfirmado(e);
  const sem = nc || s.lv === "semsinal";
  const nivel = sem ? null : s.nivel;
  const folga = (lim: number, tipo: "wr" | "cr") => {
    if (nivel === null) return { v: "–", det: `limite ${fmtBR(lim, 0)} m`, tom: undefined };
    const f = lim - nivel;
    return f > 0 ? { v: `${fmtBR(f)} m`, det: `limite ${fmtBR(lim, 0)} m`, tom: undefined }
      : { v: `+${fmtBR(-f)} m`, det: `acima do limite de ${fmtBR(lim, 0)} m`, tom: tipo };
  };
  const fa = folga(CFG.thrAtencao, "wr"), fc = folga(CFG.thrCritico, "cr");
  const pts = e.hist.estado === "ok" ? e.hist.pontos : [];
  const mins = pts.map(p => p.min ?? p.v), maxs = pts.map(p => p.max);
  const per = PERIODOS[e.periodo].label;
  const pv = previsao(nc ? { lv: "semsinal", nivel: null, taxa: null } : s);
  const cor = (t?: string) => t === "cr" ? "var(--cr)" : t === "wr" ? "var(--wr)" : undefined;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Tile r="Nível d'água" v={nc ? "–" : s.nivel !== null ? `${fmtBR(s.nivel)} m` : "–"} muted={sem}
        det={nc ? "não confirmado" : sem ? (s.nivel !== null ? "última conhecida · não confirmada" : "nenhuma leitura") : `recebido ${formatUltima(s.recepcao, e.agora)}`}
        cor={!sem && s.lv === "critico" ? "var(--cr)" : undefined} destaque />
      <Tile r="Folga até atenção" v={fa.v} det={fa.det} cor={cor(fa.tom)} />
      <Tile r="Folga até crítico" v={fc.v} det={fc.det} cor={cor(fc.tom)} />
      <Tile r="Taxa de variação" v={s.taxa === null || sem ? "–" : `${s.taxa >= 0 ? "+" : ""}${fmtBR(s.taxa)} m/dia`}
        det={sem ? "sem leitura recente" : taxaRapida(s.taxa) ? "variação rápida: investigar" : "janela de 1 h no servidor"} cor={!sem && taxaRapida(s.taxa) ? "var(--wr)" : undefined} />
      <Tile r={`Faixa · ${per}`} v={pts.length ? `${fmtBR(Math.min(...mins))}–${fmtBR(Math.max(...maxs))} m` : "–"}
        det={pts.length ? `variação de ${fmtBR(Math.max(...maxs) - Math.min(...mins))} m no período` : "sem histórico"} />
      <Tile r={pv.titulo} v={pv.valor} det={pv.det} cor={cor(pv.tom)} selo={pv.estimativa ? "estimativa pela taxa atual" : undefined} />
    </div>
  );
}

function Tile({ r, v, det, cor, muted, destaque, selo }: { r: string; v: string; det: string; cor?: string; muted?: boolean; destaque?: boolean; selo?: string }) {
  return (
    <div className="card min-w-0 p-4" style={destaque ? { background: "linear-gradient(180deg, var(--marca-soft), var(--card) 75%)" } : undefined}>
      <div className="text-[12px] font-medium text-texto-3">{r}</div>
      <div className={`num mt-1 font-semibold leading-tight ${destaque ? "text-[26px]" : "text-[19px]"}`} style={{ color: cor ?? (muted ? "var(--texto-3)" : undefined) }}>{v}</div>
      <div className="mt-1 text-[12px] leading-snug text-texto-2">{det}</div>
      {selo && <div className="mt-2 inline-flex rounded-md bg-card-2 px-1.5 py-0.5 text-[11px] font-medium text-texto-3">{selo}</div>}
    </div>
  );
}

// ── HISTÓRICO ─────────────────────────────────────────────────────────────────
function Historico({ e }: { e: EstadoPainel }) {
  const s = situacaoPz(e.ultimos[e.pzSel], e.agora / 1000);
  const h = e.hist;
  const ok = h.estado === "ok" && h.pontos.length > 0;
  const longo = e.periodo !== "24h";
  const relatorio = `relatorio.html?pz=${encodeURIComponent(e.pzSel)}&range=${encodeURIComponent(e.periodo)}`;
  return (
    <Cartao titulo="Histórico do nível d'água" sub="linha cheia = média do intervalo · tracejada = máximo do intervalo"
      acoes={<>
        <Segmentado rotulo="Período" valor={e.periodo} aoMudar={p => painel.selecionarPeriodo(p)} opcoes={Object.entries(PERIODOS).map(([v, p]) => ({ v, t: p.label }))} />
        <Botao disabled={!ok} onClick={() => exportarCsv(h.pontos, e.pzSel, e.periodo, h.bucketSeg, e.simulada)} title="Intervalos do gráfico, com identificação da fonte"><Download size={14} /> CSV</Botao>
        <Botao disabled={!ok} onClick={() => exportarXls(h.pontos, e.pzSel, e.periodo, h.bucketSeg, e.simulada)} title="Planilha com status pelo pico e resumo do período"><FileSpreadsheet size={14} /> Excel</Botao>
        <Botao escuro href={relatorio} disabled={e.simulada} title={e.simulada ? "O relatório usa só dados reais: indisponível na demonstração" : "Documento A4 para salvar como PDF"}><FileText size={14} /> Relatório PDF</Botao>
      </>}>
      {ok ? <GraficoInstrumento pontos={h.pontos} bucketMs={PERIODOS[e.periodo].bucketMs} longo={longo} estado={s.lv} />
        : <div className="grid h-[280px] place-items-center text-[13px] text-texto-3">{h.estado === "carregando" ? "Carregando histórico…" : h.msg}</div>}
      <p className="mt-2 text-[12px] text-texto-3">Série por intervalos. Exportações seguem os intervalos do gráfico, não as amostras brutas{e.simulada ? "; na demonstração, vêm marcadas como SIMULAÇÃO" : ""}.</p>
    </Cartao>
  );
}

function Leituras({ e }: { e: EstadoPainel }) {
  const h = e.hist;
  const linhas = h.estado === "ok" ? h.pontos.slice(-12).reverse() : [];
  const longo = e.periodo !== "24h";
  return (
    <Cartao titulo="Leituras disponíveis" sub={`últimos intervalos · ${PERIODOS[e.periodo].label} · status pelo pico`} corpo="px-5 pb-4 pt-2">
      {linhas.length ? (
        <div className="max-h-[320px] overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-card text-left text-[12px] text-texto-3"><tr><th className="py-1.5 font-medium">{longo ? "Data / hora" : "Hora"}</th><th className="font-medium">Média</th><th className="font-medium">Máx.</th><th className="font-medium">Status</th></tr></thead>
            <tbody className="divide-y divide-linha">
              {linhas.map(p => {
                const lv = classificarNivel(p.max);
                return (
                  <tr key={p.t}>
                    <td className="num py-1.5 text-texto-2">{longo ? diaHora(p.t) : hora(p.t)}</td>
                    <td className="num">{fmtBR(p.v)} m</td>
                    <td className="num text-texto-2">{fmtBR(p.max)} m</td>
                    <td><span className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: lv === "critico" ? "var(--cr)" : lv === "atencao" ? "var(--wr)" : "var(--texto-2)", fontWeight: lv === "normal" ? 400 : 600 }}><Forma estado={lv} size={11} />{ROTULO[lv]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="py-6 text-center text-[13px] text-texto-3">{h.estado === "carregando" ? "Carregando…" : "Nenhuma leitura no período."}</p>}
    </Cartao>
  );
}

function CartaoComunicacao({ e }: { e: EstadoPainel }) {
  const d = e.ultimos[e.pzSel];
  const s = situacaoPz(d, e.agora / 1000);
  const nc = naoConfirmado(e);
  const ok = !nc && s.lv !== "semsinal";
  const ts = s.recepcao;
  const disp = disponibilidade24h(e, e.pzSel);
  const falhas = ocorrencias(e).filter(o => o.pz === e.pzSel && o.lv === "semsinal");
  const ultimaFalha = !ok && fin(ts) ? `em andamento · ${formatUltima(ts, e.agora)}` : falhas.length ? diaHora(falhas[0].t) : "nenhuma registrada";
  const esperadas = Math.round(86400 / CFG.intervaloEnvioSeg);
  return (
    <Cartao titulo="Comunicação" acoes={nc ? <Selo estado="semsinal" texto="Não confirmado" /> : <Selo estado={ok ? "normal" : "semsinal"} texto={ok ? "Online" : "Sem sinal"} />}>
      <div className="text-[22px] font-semibold" style={{ color: ok ? undefined : "var(--texto-3)" }}>{nc ? "–" : fin(ts) ? formatUltima(ts, e.agora) : "nunca"}</div>
      <div className="text-[12.5px] text-texto-3">{nc ? "servidor sem resposta" : fin(ts) ? `última recepção · ${new Date(ts * 1000).toLocaleString("pt-BR")}` : "nenhuma leitura recebida"}</div>
      <dl className="mt-4 space-y-2 text-[13px]">
        <Linha k="Intervalo de envio" v={<span className="num">{CFG.intervaloEnvioSeg} s</span>} />
        <Linha k="Leituras recebidas 24 h" v={<span className="num">{disp ? `${disp.recebidas.toLocaleString("pt-BR")} de ${esperadas.toLocaleString("pt-BR")}` : "–"}</span>} />
        <div>
          <Linha k="Disponibilidade 24 h" v={<span className="num">{disp ? `${fmtBR(disp.pct, 1)}%` : "–"}</span>} />
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-card-2"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${disp?.pct ?? 0}%`, background: disp && disp.pct < 98 ? "var(--of)" : "var(--marca)" }} /></div>
        </div>
        <Linha k="Última falha" v={ultimaFalha} />
        <Linha k="Sinal da UCT" v={<i className="font-normal text-texto-3">não enviado pelo firmware</i>} />
      </dl>
    </Cartao>
  );
}

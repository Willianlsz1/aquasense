// ── ESTADO DO PAINEL ──────────────────────────────────────────────────────────
// Um único objeto de estado, trocado inteiro a cada mudança, e as ações que o
// alteram: consulta periódica da fonte, histórico do instrumento e da rede,
// registros do servidor, transições (ocorrências), som do alarme e demonstração.
// As telas só leem este estado (usePainel) e chamam as ações (painel.*).
import { useSyncExternalStore } from "react";
import { CFG, carregarConfig, MODO_DEMO, PERIODOS, PIEZOMETROS, apiGet, type Pz } from "./config";
import { FonteApi, FonteSimulada, type Fonte } from "./fontes";
import { normalizarEvento, ocorrenciaDoServidor, textoOcorrencia, type EventoServidor, type Ocorrencia } from "./eventos";
import { cadastroDe, gravarCadastros, lerCadastros, type Cadastro } from "./cadastro";
import { tocarAlarme } from "./som";
import type { PontoHist } from "./exportar";
import { classificarComHisterese, fin, fmtBR, situacaoPz, type Faixa, type Leitura, type Situacao } from "./util";

export type Vista = "visao" | "mapa" | "instrumento" | "alertas";
export const VISTAS: Record<Vista, string> = { visao: "Visão geral", mapa: "Mapa", instrumento: "Instrumento", alertas: "Alertas" };
const VISTAS_ANTIGAS: Record<string, Vista> = { "visao-geral": "visao", registros: "alertas", leituras: "instrumento" };

export type PontoRede = { t: number; v: number; max: number; n: number | null };
export type Hist = { estado: "carregando" | "ok" | "vazio" | "erro"; pontos: PontoHist[]; bucketSeg?: number; msg?: string };
export type Status = { tipo: "con" | "live" | "sim" | "err"; msg: string };

export type EstadoPainel = {
  pronto: boolean;
  simulada: boolean;
  piezometros: Pz[];
  ultimos: Record<string, Leitura>;
  falhas: number;
  status: Status;
  agora: number;
  vista: Vista;
  pzSel: string;
  periodo: string;
  hist: Hist;
  faixaSel: Faixa | null;
  historicoRede: Record<string, PontoRede[] | null>;
  ocorrenciasSessao: Ocorrencia[];
  inicioAlerta: Record<string, { lv: Faixa; desde: number | null; pico: number }>;
  servidor: { lista: EventoServidor[]; atualizadoEm: number | null; erro: string | null; carregando: boolean };
  som: { ligado: boolean; silenciado: boolean; ativo: boolean };
  demo: { passo: number; rodando: boolean };
  cadastros: Record<string, Partial<Cadastro>>;
  aviso: string | null;
};

function vistaDoEndereco(): Vista {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h in VISTAS) return h as Vista;
  return VISTAS_ANTIGAS[h] || "visao";
}

function lerSom() { try { return localStorage.getItem("aquasense-som") !== "off"; } catch { return true; } }

// ── ROTEIRO DA DEMONSTRAÇÃO ───────────────────────────────────────────────────
export const ROTEIRO_DEMO: { titulo: string; texto: (ids: string[]) => string;
  estado: (ids: string[], ref: number[]) => { alvo: Record<string, number>; offline: string[] } }[] = [
  { titulo: "Operação normal", texto: () => "Todos os instrumentos comunicando e dentro da faixa normal.",
    estado: () => ({ alvo: {}, offline: [] }) },
  { titulo: "Chuva forte", texto: ids => `Depois de chuva forte, o ${ids[1]} sobe e entra em atenção. O ${ids[0]}, vizinho, sobe pouco.`,
    estado: (ids, ref) => ({ alvo: { [ids[1]]: 12.8, [ids[0]]: ref[0] + 0.7 }, offline: [] }) },
  { titulo: "Nível crítico", texto: ids => `O ${ids[1]} passa de 15 m: o painel avisa, toca o alarme e abre o quadro de incidente.`,
    estado: (ids, ref) => ({ alvo: { [ids[1]]: 15.6, [ids[0]]: ref[0] + 0.9 }, offline: [] }) },
  { titulo: "Perda de comunicação", texto: ids => `O ${ids[2]} para de enviar. O painel mostra SEM SINAL, nunca um valor antigo como atual.`,
    estado: (ids, ref) => ({ alvo: { [ids[1]]: 15.6, [ids[0]]: ref[0] + 0.9 }, offline: [ids[2]] }) },
  { titulo: "Normalização", texto: ids => `A equipe atua, o ${ids[1]} volta à faixa normal e o ${ids[2]} volta a comunicar.`,
    estado: (ids, ref) => ({ alvo: { [ids[1]]: ref[1] + 0.5, [ids[0]]: ref[0] + 0.3 }, offline: [] }) },
];
const ROTEIRO_AUTO: { t: number; passo?: number; vista?: Vista; abrir?: number; fim?: boolean }[] = [
  { t: 0, passo: 0, vista: "visao" }, { t: 8, passo: 1, vista: "visao" }, { t: 26, passo: 2, vista: "visao" },
  { t: 44, abrir: 1 }, { t: 62, passo: 3, vista: "visao" }, { t: 76, passo: 4, vista: "visao" }, { t: 104, fim: true },
];

class Painel {
  e: EstadoPainel;
  private ouvintes = new Set<() => void>();
  private fonte: Fonte = FonteApi;
  private histReq = 0;
  private redeReq = 0;
  private redeEm = 0;
  private evReq = 0;
  private pollEmAndamento = false;
  private pollPendente = false;
  private situacaoAnterior: Record<string, Situacao> = {};
  private timersDemo: ReturnType<typeof setTimeout>[] = [];
  private iniciado = false;

  constructor() {
    this.e = {
      pronto: false, simulada: MODO_DEMO, piezometros: [...PIEZOMETROS], ultimos: {}, falhas: 0,
      status: { tipo: "con", msg: "Conectando ao servidor…" }, agora: Date.now(),
      vista: typeof location !== "undefined" ? vistaDoEndereco() : "visao",
      pzSel: PIEZOMETROS[0].id, periodo: "24h", hist: { estado: "carregando", pontos: [] }, faixaSel: null,
      historicoRede: {}, ocorrenciasSessao: [], inicioAlerta: {},
      servidor: { lista: [], atualizadoEm: null, erro: null, carregando: false },
      som: { ligado: lerSom(), silenciado: false, ativo: false },
      demo: { passo: 0, rodando: false }, cadastros: lerCadastros(), aviso: null,
    };
  }

  subscribe = (f: () => void) => { this.ouvintes.add(f); return () => { this.ouvintes.delete(f); }; };
  private set(p: Partial<EstadoPainel>) {
    this.e = { ...this.e, ...p };
    const s = this.e.som;
    tocarAlarme(s.ativo && s.ligado && !s.silenciado);
    this.ouvintes.forEach(f => f());
  }

  // ── INÍCIO ──────────────────────────────────────────────────────────────────
  async iniciar() {
    if (this.iniciado) return;
    this.iniciado = true;
    window.addEventListener("hashchange", () => this.set({ vista: vistaDoEndereco() }));
    setInterval(() => this.set({ agora: Date.now() }), 5000);
    await carregarConfig();
    if (MODO_DEMO) {
      CFG.poll = 3000; // tempo acelerado
      this.fonte = FonteSimulada;
      document.title = "aquasense · Demonstração";
    }
    const pzSel = PIEZOMETROS.some(p => p.id === this.e.pzSel) ? this.e.pzSel : PIEZOMETROS[0].id;
    this.set({ pronto: true, piezometros: this.aplicarNomes(), pzSel, simulada: this.fonte.simulada,
      status: this.fonte.simulada ? { tipo: "sim", msg: "Simulação · dados fictícios" } : this.e.status });
    void this.carregarHistorico();
    void this.carregarHistoricoRede(true);
    void this.carregarEventos(true);
    await this.solicitarPoll();
    setInterval(() => void this.solicitarPoll(), CFG.poll);
    // Aba em segundo plano estrangula o intervalo: ao voltar, consulta na hora.
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void this.solicitarPoll(); });
  }

  // Nomes editados no cadastro valem sobre os do servidor.
  private nomesServidor: Record<string, string> = {};
  private aplicarNomes(): Pz[] {
    return PIEZOMETROS.map(p => {
      if (!(p.id in this.nomesServidor)) this.nomesServidor[p.id] = p.nome;
      return { ...p, nome: this.e.cadastros[p.id]?.nome || this.nomesServidor[p.id] };
    });
  }
  nomeServidor(id: string) { return this.nomesServidor[id] ?? id; }

  // ── CONSULTA PERIÓDICA ──────────────────────────────────────────────────────
  solicitarPoll(): Promise<void> | void {
    if (this.pollEmAndamento) { this.pollPendente = true; return; }
    return this.poll();
  }

  private async poll() {
    this.pollEmAndamento = true;
    const fonte = this.fonte;
    try {
      const dados = await fonte.ultimos();
      if (fonte !== this.fonte) return;
      const agora = Date.now();
      this.set({
        ultimos: dados, falhas: 0, agora,
        status: fonte.simulada ? { tipo: "sim", msg: "Simulação · dados fictícios" }
          : { tipo: "live", msg: `Dados reais · consulta às ${new Date().toLocaleTimeString("pt-BR")}` },
      });
      this.registrarTransicoes(dados);
      this.aplicarSelecionado();
      if (!fonte.simulada) { void this.carregarEventos(); void this.carregarHistoricoRede(); }
      else { void this.carregarHistoricoRede(true); void this.carregarHistorico({ silencioso: true }); }
    } catch (err) {
      if (fonte !== this.fonte) return;
      const m = (err as Error).message || "";
      const motivo = /failed to fetch|networkerror|load failed|abort/i.test(m) ? "servidor sem resposta" : m;
      console.warn("Fonte de leituras:", m);
      this.set({ falhas: this.e.falhas + 1, ultimos: {}, agora: Date.now(), status: { tipo: "err", msg: `Monitoramento real indisponível · ${motivo}` } });
      this.situacaoAnterior = {};
      this.set({ som: { ...this.e.som, ativo: false } });
    } finally {
      this.pollEmAndamento = false;
      if (this.pollPendente) { this.pollPendente = false; void this.solicitarPoll(); }
    }
  }

  // Selo do instrumento aberto (com histerese) e leitura ao vivo no gráfico de 24 h.
  private aplicarSelecionado() {
    const l = this.e.ultimos[this.e.pzSel];
    const s = situacaoPz(l);
    if (s.lv === "semsinal" || s.nivel === null) return; // sem sinal: não reavalia faixa nem tendência
    const faixaSel = classificarComHisterese(s.nivel, this.e.faixaSel);
    const h = this.e.hist;
    let hist = h;
    if (!this.fonte.simulada && this.e.periodo === "24h" && h.estado === "ok" && fin(s.recepcao)) {
      const t = s.recepcao * 1000;
      const ult = h.pontos[h.pontos.length - 1];
      if (!ult || t > ult.t) hist = { ...h, pontos: [...h.pontos, { t, v: s.nivel, max: s.nivel }] };
    }
    this.set({ faixaSel, hist });
  }

  // ── TRANSIÇÕES → OCORRÊNCIAS DA SESSÃO, INCIDENTE E SOM ─────────────────────
  // A primeira leitura de cada instrumento só define o estado inicial.
  private registrarTransicoes(mapa: Record<string, Leitura>) {
    if (!Object.keys(mapa).length) { this.set({ som: { ...this.e.som, ativo: false } }); return; }
    const agora = Date.now();
    const inicio = { ...this.e.inicioAlerta };
    const ocorr = [...this.e.ocorrenciasSessao];
    let novoCritico = false;
    PIEZOMETROS.forEach(pz => {
      const s = situacaoPz(mapa[pz.id]);
      const anterior = this.situacaoAnterior[pz.id];
      this.situacaoAnterior[pz.id] = s.lv;
      if ((s.lv === "atencao" || s.lv === "critico") && s.nivel !== null) {
        const inc = inicio[pz.id];
        if (!inc) inicio[pz.id] = { lv: s.lv, desde: anterior ? agora : null, pico: s.nivel };
        else inicio[pz.id] = { ...inc, pico: Math.max(inc.pico, s.nivel), lv: s.lv === "critico" ? "critico" : inc.lv };
      } else if (s.lv === "normal") delete inicio[pz.id];
      if (anterior === undefined || anterior === s.lv) return;
      const nivel = s.nivel ?? mapa[pz.id]?.nivel ?? null;
      let txt = textoOcorrencia(s.lv, nivel);
      if (s.lv === "normal" && anterior === "semsinal") txt = { titulo: "Comunicação restabelecida", det: txt.det };
      if (anterior === "critico" && s.lv === "atencao") txt.titulo = "Desceu para atenção";
      if (s.lv === "atencao" && s.nivel !== null && s.nivel < CFG.thrAtencao && s.taxa !== null)
        txt = { titulo: "Variação rápida", det: `${s.taxa >= 0 ? "+" : ""}${fmtBR(s.taxa)} m/dia` };
      ocorr.unshift({ pz: pz.id, lv: s.lv === "normal" ? "ok" : s.lv, t: agora, ...txt });
      if (s.lv === "critico") novoCritico = true;
    });
    const haCritico = PIEZOMETROS.some(pz => situacaoPz(mapa[pz.id]).lv === "critico");
    const som = { ...this.e.som };
    if (novoCritico) som.silenciado = false;
    if (som.ativo !== haCritico) { som.ativo = haCritico; if (!haCritico) som.silenciado = false; }
    this.set({ inicioAlerta: inicio, ocorrenciasSessao: ocorr.slice(0, 40), som });
  }

  // ── HISTÓRICO DO INSTRUMENTO ABERTO ─────────────────────────────────────────
  // O token descarta respostas atrasadas de uma seleção anterior.
  async carregarHistorico({ silencioso = false } = {}) {
    const meu = ++this.histReq;
    const fonte = this.fonte, pz = this.e.pzSel, periodo = this.e.periodo;
    if (!silencioso) this.set({ hist: { estado: "carregando", pontos: [] } });
    try {
      const { pontos, bucket_seg } = await fonte.historico(pz, periodo);
      if (meu !== this.histReq || fonte !== this.fonte) return;
      const pts: PontoHist[] = pontos.filter(p => fin(p.nivel_agua)).map(p => ({
        t: p.ts * 1000, v: p.nivel_agua, max: fin(p.nivel_max) ? p.nivel_max : p.nivel_agua,
        min: fin(p.nivel_min) ? p.nivel_min : undefined, n: fin(p.n_leituras) ? p.n_leituras : undefined,
      }));
      this.set({ hist: pts.length ? { estado: "ok", pontos: pts, bucketSeg: bucket_seg }
        : { estado: "vazio", pontos: [], msg: `Nenhuma leitura histórica disponível para ${pz} (${PERIODOS[periodo].label}).` } });
    } catch {
      if (meu !== this.histReq || fonte !== this.fonte) return;
      this.set({ hist: { estado: "erro", pontos: [], msg: `Histórico indisponível: não foi possível carregar ${pz} (${PERIODOS[periodo].label}).` } });
    }
  }

  // ── 24 H DA REDE (tendência e disponibilidade) ──────────────────────────────
  // Real: recarrega a cada 30 min (cada consulta lê o D1). Demonstração: a cada consulta.
  async carregarHistoricoRede(forcar = false) {
    if (!forcar && this.redeEm && Date.now() - this.redeEm < 30 * 60 * 1000) return;
    const meu = ++this.redeReq;
    const fonte = this.fonte;
    if (!forcar) this.redeEm = Date.now();
    const novo: Record<string, PontoRede[] | null> = {};
    await Promise.all(PIEZOMETROS.map(async pz => {
      try {
        const { pontos } = await fonte.historico(pz.id, "24h");
        novo[pz.id] = pontos.filter(p => fin(p.nivel_agua)).map(p => ({
          t: p.ts * 1000, v: p.nivel_agua, max: fin(p.nivel_max) ? p.nivel_max : p.nivel_agua, n: fin(p.n_leituras) ? p.n_leituras : null,
        }));
      } catch { novo[pz.id] = null; } // falha de consulta não é o mesmo que "sem leituras"
    }));
    if (meu !== this.redeReq || fonte !== this.fonte) return;
    this.redeEm = Date.now();
    this.set({ historicoRede: novo });
  }

  // ── REGISTROS DO SERVIDOR (/alerts) ─────────────────────────────────────────
  async carregarEventos(forcar = false) {
    if (this.fonte.simulada) return;
    const sv = this.e.servidor;
    if (sv.carregando) return;
    if (!forcar && sv.atualizadoEm && Date.now() - sv.atualizadoEm < 60 * 1000) return;
    const meu = ++this.evReq;
    this.set({ servidor: { ...sv, carregando: true } });
    try {
      const r = await apiGet<{ notificacoes?: Record<string, unknown>[] }>("/alerts");
      if (meu !== this.evReq) return;
      const lista = (Array.isArray(r?.notificacoes) ? r.notificacoes : []).map(normalizarEvento).filter((x): x is EventoServidor => !!x);
      this.set({ servidor: { lista, atualizadoEm: Date.now(), erro: null, carregando: false } });
    } catch (err) {
      if (meu !== this.evReq) return;
      this.set({ servidor: { ...this.e.servidor, erro: (err as Error).message || "Falha na consulta", carregando: false } });
    }
  }

  // ── NAVEGAÇÃO E SELEÇÃO ─────────────────────────────────────────────────────
  irPara(v: Vista) {
    if (location.hash.slice(1) === v) this.set({ vista: v });
    else location.hash = v;
  }

  selecionarPz(id: string) {
    if (!PIEZOMETROS.some(p => p.id === id) || id === this.e.pzSel) return;
    this.set({ pzSel: id, faixaSel: null });
    void this.carregarHistorico();
    this.aplicarSelecionado();
  }

  abrirInstrumento(id: string) { this.selecionarPz(id); this.irPara("instrumento"); }

  selecionarPeriodo(p: string) {
    if (!PERIODOS[p] || p === this.e.periodo) return;
    this.set({ periodo: p });
    void this.carregarHistorico();
  }

  // ── SOM ─────────────────────────────────────────────────────────────────────
  alternarSom() {
    const ligado = !this.e.som.ligado;
    try { localStorage.setItem("aquasense-som", ligado ? "on" : "off"); } catch { /* só nesta aba */ }
    this.set({ som: { ...this.e.som, ligado } });
  }
  silenciar() { this.set({ som: { ...this.e.som, silenciado: true } }); }

  // ── CADASTRO ────────────────────────────────────────────────────────────────
  salvarCadastro(id: string, c: Cadastro) {
    const nome = c.nome.trim();
    const cadastros = { ...this.e.cadastros, [id]: { ...c, nome: nome && nome !== this.nomesServidor[id] ? nome : "" } };
    gravarCadastros(cadastros);
    this.e = { ...this.e, cadastros };
    this.set({ piezometros: this.aplicarNomes() });
    this.avisar(`Cadastro de ${id} atualizado`);
  }
  cadastro(id: string) { return cadastroDe(this.e.cadastros, id); }

  private avisoTimer: ReturnType<typeof setTimeout> | null = null;
  avisar(texto: string) {
    if (this.avisoTimer) clearTimeout(this.avisoTimer);
    this.set({ aviso: texto });
    this.avisoTimer = setTimeout(() => this.set({ aviso: null }), 2400);
  }

  // ── DEMONSTRAÇÃO ────────────────────────────────────────────────────────────
  idsDemo() {
    const ids = PIEZOMETROS.map(p => p.id);
    while (ids.length < 3) ids.push(ids[ids.length - 1] || "PZ-01");
    return ids;
  }

  aplicarPassoDemo(i: number) {
    const ids = this.idsDemo();
    const ref = ids.map(id => FonteSimulada.estadoDe(id).ref);
    const { alvo, offline } = ROTEIRO_DEMO[i].estado(ids, ref);
    FonteSimulada.alvo = alvo;
    const agora = Math.floor(Date.now() / 1000);
    const novo: Record<string, number> = {};
    offline.forEach(id => { novo[id] = FonteSimulada.offline[id] || agora - CFG.staleSeg - 5; });
    FonteSimulada.offline = novo;
    this.set({ demo: { ...this.e.demo, passo: i } });
    void this.solicitarPoll();
  }

  escolherCenario(i: number) { this.pararRoteiro(); this.aplicarPassoDemo(i); }

  pararRoteiro() {
    this.timersDemo.forEach(clearTimeout);
    this.timersDemo = [];
    this.set({ demo: { ...this.e.demo, rodando: false } });
  }

  iniciarRoteiro() {
    this.pararRoteiro();
    FonteSimulada.reiniciar();
    ROTEIRO_AUTO.forEach(et => this.timersDemo.push(setTimeout(() => {
      if (et.fim) { this.timersDemo = []; this.set({ demo: { ...this.e.demo, rodando: false } }); return; }
      if (Number.isInteger(et.passo)) this.aplicarPassoDemo(et.passo!);
      if (Number.isInteger(et.abrir)) this.abrirInstrumento(this.idsDemo()[et.abrir!]);
      else if (et.vista) this.irPara(et.vista);
    }, et.t * 1000)));
    this.set({ demo: { ...this.e.demo, rodando: true } });
  }
}

export const painel = new Painel();
export function usePainel(): EstadoPainel {
  return useSyncExternalStore(painel.subscribe, () => painel.e);
}

// ── DERIVADOS ─────────────────────────────────────────────────────────────────
export const naoConfirmado = (e: EstadoPainel) => e.falhas > 0 && !Object.keys(e.ultimos).length;

export function disponibilidade24h(e: EstadoPainel, id: string) {
  const pts = e.historicoRede[id];
  if (!Array.isArray(pts) || !pts.length || pts.some(p => p.n === null)) return null;
  const recebidas = pts.reduce((s, p) => s + (p.n ?? 0), 0);
  const esperadas = Math.round(86400 / CFG.intervaloEnvioSeg);
  return { recebidas, esperadas, pct: Math.min(100, (recebidas / esperadas) * 100) };
}

export function ocorrencias(e: EstadoPainel): Ocorrencia[] {
  if (e.simulada) return e.ocorrenciasSessao;
  return e.servidor.lista.map(ocorrenciaDoServidor);
}

// Lista ordenada por prioridade (crítico, atenção, sem sinal, normal).
export function porPrioridade(e: EstadoPainel) {
  const agoraSeg = e.agora / 1000;
  const prio = { critico: 0, atencao: 1, semsinal: 2, normal: 3 };
  return e.piezometros.map((pz, i) => ({ pz, i, d: e.ultimos[pz.id], s: situacaoPz(e.ultimos[pz.id], agoraSeg) }))
    .sort((a, b) => prio[a.s.lv] - prio[b.s.lv] || a.i - b.i);
}

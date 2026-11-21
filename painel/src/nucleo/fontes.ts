// ── FONTES DE LEITURAS ────────────────────────────────────────────────────────
// Duas fontes com a mesma interface: a API real (Worker + D1) e a simulação da
// demonstração. O painel nunca troca para a simulação por causa de uma falha da API.
import { apiGet, CFG, PIEZOMETROS } from "./config";
import { clamp, fin, type Leitura } from "./util";
import { aleatorio } from "./gravacao";

export type PontoBruto = {
  ts: number; nivel_agua: number; nivel_max?: number; nivel_min?: number; n_leituras?: number;
};
export type Historico = { pontos: PontoBruto[]; bucket_seg?: number };

export type Fonte = {
  simulada: boolean;
  ultimos(): Promise<Record<string, Leitura>>;
  historico(pz: string, range: string): Promise<Historico>;
};

type LinhaUltimos = { nivel_agua?: number; pressao?: number; temperatura?: number; ts?: number; recebido_em?: number; taxa_m_dia?: number };

export const FonteApi: Fonte = {
  simulada: false,
  // GET /ultimos → { "PZ-01": {nivel_agua, ts, recebido_em, taxa_m_dia}, ... }
  async ultimos() {
    const json = await apiGet<Record<string, LinhaUltimos>>("/ultimos");
    const out: Record<string, Leitura> = {};
    Object.entries(json || {}).forEach(([id, row]) => {
      out[id] = {
        nivel: fin(row?.nivel_agua) ? row.nivel_agua : null,
        pressao: row?.pressao ?? null, temperatura: row?.temperatura ?? null,
        ts: row?.ts, recebidoEm: fin(row?.recebido_em) ? row.recebido_em : row?.ts,
        taxa_m_dia: fin(row?.taxa_m_dia) ? row.taxa_m_dia : null,
      };
    });
    return out;
  },
  // GET /dados?pz=&range= → { pontos: [{ts, nivel_agua, nivel_min, nivel_max, n_leituras}], bucket_seg }
  async historico(pz, range) {
    const json = await apiGet<{ pontos?: PontoBruto[]; bucket_seg?: number }>(
      `/dados?pz=${encodeURIComponent(pz)}&range=${encodeURIComponent(range)}`);
    return { pontos: json?.pontos || [], bucket_seg: json?.bucket_seg };
  },
};

// ── SIMULAÇÃO (só em ?demo) ───────────────────────────────────────────────────
// Cada instrumento tem um nível de referência, um alvo do passo atual do roteiro e
// o nível corrente, que anda até o alvo a cada consulta (tempo acelerado: cada
// consulta representa ~15 min).
type EstadoSim = { n: number; ref?: number };

export const FonteSimulada: Fonte & {
  base: Record<string, EstadoSim>; alvo: Record<string, number>; offline: Record<string, number>;
  registro: Record<string, { v: number; max: number }[]>;
  estadoDe(pz: string): EstadoSim & { ref: number }; reiniciar(): void;
} = {
  simulada: true,
  base: { "PZ-01": { n: 10.2 }, "PZ-02": { n: 10.8 }, "PZ-03": { n: 9.0 } },
  alvo: {},
  offline: {},
  registro: {},

  estadoDe(pz) {
    if (!this.base[pz]) this.base[pz] = { n: 6 + (pz.charCodeAt(pz.length - 1) % 5) };
    const s = this.base[pz];
    if (!fin(s.ref)) s.ref = s.n;
    return s as EstadoSim & { ref: number };
  },

  reiniciar() {
    Object.values(this.base).forEach(s => { if (fin(s.ref)) s.n = s.ref; });
    this.alvo = {}; this.offline = {}; this.registro = {};
  },

  async ultimos() {
    const agora = Math.floor(Date.now() / 1000);
    const todos: Record<string, Leitura> = {};
    PIEZOMETROS.map(p => p.id).forEach(pz => {
      const s = this.estadoDe(pz);
      if (this.offline[pz]) {
        todos[pz] = { nivel: s.n, ts: this.offline[pz], recebidoEm: this.offline[pz], taxa_m_dia: null };
        return;
      }
      const alvo = fin(this.alvo[pz]) ? this.alvo[pz] : s.ref;
      const passo = clamp(alvo - s.n, -0.42, 0.42);
      s.n = Math.max(0, s.n + passo + (aleatorio() - 0.5) * 0.05);
      const taxa = Math.abs(alvo - s.n) > 0.08 ? clamp(passo * 6, -2.5, 2.5) : (aleatorio() - 0.5) * 0.08;
      const reg = this.registro[pz] || (this.registro[pz] = []);
      reg.push({ v: s.n, max: s.n + aleatorio() * 0.06 });
      if (reg.length > 32) reg.shift();
      todos[pz] = { nivel: s.n, ts: agora, recebidoEm: agora, taxa_m_dia: parseFloat(taxa.toFixed(3)) };
    });
    return todos;
  },

  // Fundo estável em torno da referência e, no fim, as leituras da própria demonstração.
  async historico(pz, range) {
    const s = this.estadoDe(pz);
    const fb = ({
      "24h": { count: 48, stepMs: 30 * 60 * 1000 },
      "7d": { count: 84, stepMs: 2 * 60 * 60 * 1000 },
      "30d": { count: 90, stepMs: 8 * 60 * 60 * 1000 },
      "90d": { count: 90, stepMs: 24 * 60 * 60 * 1000 },
    } as Record<string, { count: number; stepMs: number }>)[range] || { count: 48, stepMs: 30 * 60 * 1000 };
    let semente = [...(pz + range)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 2147483647, 7);
    const rnd = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
    const now = Date.now();
    const fimRecepcao = this.offline[pz] ? this.offline[pz] * 1000 : now;
    let pontos: PontoBruto[] = [];
    let v = s.ref;
    for (let i = fb.count - 1; i >= 0; i--) {
      const time = now - i * fb.stepMs;
      v += (rnd() - 0.5) * 0.18 + (s.ref - v) * 0.12;
      if (time > fimRecepcao + fb.stepMs) continue; // sem sinal: o fim da série fica vazio
      pontos.push({ ts: Math.floor(time / 1000), nivel_agua: v, nivel_max: v + rnd() * 0.12, nivel_min: v - rnd() * 0.12,
        n_leituras: Math.round((fb.stepMs / 1000 / CFG.intervaloEnvioSeg) * (0.985 + rnd() * 0.015)) });
    }
    const reg = this.registro[pz] || [];
    if (reg.length) {
      const passo = 15 * 60 * 1000, fim = Math.min(now, fimRecepcao);
      const inicio = fim - (reg.length - 1) * passo;
      const antes = pontos.filter(p => p.ts * 1000 < inicio - fb.stepMs / 2);
      const recentes: PontoBruto[] = range === "24h"
        ? reg.map((r, i) => ({ ts: Math.floor((inicio + i * passo) / 1000), nivel_agua: r.v, nivel_max: r.max, nivel_min: r.v - 0.03, n_leituras: 90 }))
        : [{ ts: Math.floor(fim / 1000), nivel_agua: reg[reg.length - 1].v, nivel_max: Math.max(...reg.map(r => r.max)),
            nivel_min: Math.min(...reg.map(r => r.v)), n_leituras: Math.round(fb.stepMs / 1000 / CFG.intervaloEnvioSeg) }];
      pontos = [...antes, ...recentes];
    }
    pontos.forEach(p => {
      p.nivel_agua = parseFloat(p.nivel_agua.toFixed(3));
      if (fin(p.nivel_max)) p.nivel_max = parseFloat(p.nivel_max.toFixed(3));
      if (fin(p.nivel_min)) p.nivel_min = parseFloat(p.nivel_min.toFixed(3));
    });
    return { pontos, bucket_seg: fb.stepMs / 1000 };
  },
};

// ── MODO DE GRAVAÇÃO (só com ?demo&gravacao) ──────────────────────────────────
// Usado para gravar o vídeo do pitch e o deck. Sempre sobre a demonstração
// (dados fictícios), nunca sobre a fonte real. Fica tudo determinístico:
//  · relógio virtual (?relogio=ISO&escala=0.15), aplicado antes do painel iniciar;
//  · sorteio com semente fixa (as leituras simuladas saem iguais a cada gravação);
//  · sem consulta automática: o gravador avança com poll();
//  · barra de controle da demo escondida, sem cursor e sem barra de rolagem.
// Os demais indicadores de simulação continuam na tela.
import { MODO_DEMO } from "./config";

const q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
export const MODO_GRAVACAO = MODO_DEMO && q.has("gravacao");

// ── Sorteio ───────────────────────────────────────────────────────────────────
let semente = 0;
let fixo = false;
export function semear(s: number) { semente = Math.abs(Math.floor(s)) % 2147483647 || 1; fixo = true; }
export function aleatorio() {
  if (!fixo) return Math.random();
  semente = (semente * 16807) % 2147483647;
  return (semente - 1) / 2147483646;
}

// ── Relógio virtual ───────────────────────────────────────────────────────────
// Troca Date para que tudo (rótulos, idade das leituras, histórico simulado)
// use o mesmo horário. performance.now e requestAnimationFrame seguem reais.
const DataReal = Date;
let base = 0, inicioReal = 0, escala = 1, ativo = false;
const agoraVirtual = () => base + (DataReal.now() - inicioReal) * escala;

export function definirRelogio(iso: string, esc = 1) {
  const t = new DataReal(iso).getTime();
  if (!Number.isFinite(t)) throw new Error(`Horário inválido: ${iso}`);
  base = t; inicioReal = DataReal.now(); escala = Number.isFinite(esc) && esc >= 0 ? esc : 1;
  if (ativo) return;
  ativo = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Virtual = function (this: unknown, ...a: any[]) {
    if (!new.target) return new DataReal(agoraVirtual()).toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return a.length ? new (DataReal as any)(...a) : new DataReal(agoraVirtual());
  } as unknown as DateConstructor;
  Object.setPrototypeOf(Virtual, DataReal);
  Object.defineProperty(Virtual, "prototype", { value: DataReal.prototype });
  Virtual.now = () => Math.floor(agoraVirtual());
  globalThis.Date = Virtual;
}

// Salto no relógio virtual (ms), sem consultar leituras.
export function avancarRelogio(ms: number) { if (ativo) base += ms; }

export function iniciarGravacao() {
  if (!MODO_GRAVACAO) return;
  semear(Number(q.get("semente")) || 20261024);
  if (q.get("relogio")) definirRelogio(q.get("relogio")!, Number(q.get("escala") ?? 1));
  document.documentElement.classList.add("gravacao");
}

// Roda ao carregar o módulo, antes de o painel ler o relógio pela primeira vez.
iniciarGravacao();

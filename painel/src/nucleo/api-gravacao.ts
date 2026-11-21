// ── window.aquasenseGravacao ──────────────────────────────────────────────────
// Controle do painel para o gravador do pitch (puppeteer). Existe só em ?demo:
// age sobre a simulação, nunca sobre a fonte real.
import { MODO_DEMO } from "./config";
import { avancarRelogio, definirRelogio, MODO_GRAVACAO } from "./gravacao";
import { painel, ROTEIRO_DEMO } from "./painel";
import { situacaoPz } from "./util";

const espera = (ms: number) => new Promise(r => setTimeout(r, ms));
// Dois quadros desenhados; em aba oculta o navegador pausa os quadros, então
// há um tempo-limite para pronto() nunca travar.
const quadro = () => Promise.race([new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), espera(200)]);

// Resolve quando a tela assentou: sem mudança de estado há 900 ms (cobre as
// animações de números e gráficos), sem transição CSS finita em andamento,
// fontes carregadas e mapas sem ladrilho pendente. Limite de 15 s.
async function pronto(limiteMs = 15000) {
  const t0 = performance.now();
  await document.fonts?.ready;
  for (;;) {
    await quadro();
    const animando = document.getAnimations().some(a => {
      const fim = a.effect?.getComputedTiming().endTime;
      return a.playState === "running" && typeof fim === "number" && Number.isFinite(fim);
    });
    const ladrilhos = document.querySelector(".leaflet-tile:not(.leaflet-tile-loaded)");
    const quieto = performance.now() - painel.mudouEm > 900;
    if ((!animando && !ladrilhos && quieto) || performance.now() - t0 > limiteMs) return;
    await espera(50);
  }
}

export function instalarApiGravacao() {
  if (!MODO_DEMO) return;
  const api = {
    modoGravacao: MODO_GRAVACAO,
    cenarios: ROTEIRO_DEMO.map(c => c.titulo),
    // Cenário do roteiro (0 normal, 1 chuva forte, 2 crítico, 3 perda de comunicação, 4 normalização).
    // Só define os alvos; as leituras andam com poll().
    passo: (n: number) => painel.aplicarPassoDemo(n, false),
    // Alvo livre para um instrumento (ex.: alvo("PZ-02", 15.1)).
    alvo: (pz: string, metros: number) => painel.alvoDemo(pz, metros),
    // n consultas à simulação (cada uma anda até 0,42 m rumo ao alvo).
    poll: async (n = 1) => { for (let i = 0; i < n; i++) await painel.consultar(); return api.estado(); },
    // Salto no relógio virtual, em ms (não consulta leituras).
    avancar: (ms: number) => avancarRelogio(ms),
    // Troca o relógio e recomeça a demonstração do zero.
    definirRelogio: async (iso: string, escala = 1) => { definirRelogio(iso, escala); await painel.reiniciarDemo(); },
    nivel: (pz: string) => painel.e.ultimos[pz]?.nivel ?? null,
    situacao: (pz: string) => situacaoPz(painel.e.ultimos[pz]).lv,
    abrir: (pz: string) => painel.abrirInstrumento(pz),
    voltar: () => painel.irPara("visao"),
    ir: (vista: "visao" | "mapa" | "instrumento" | "alertas") => painel.irPara(vista),
    silenciar: () => painel.silenciar(),
    estado: () => ({
      vista: painel.e.vista, instrumento: painel.e.pzSel, agora: new Date().toISOString(),
      leituras: Object.fromEntries(painel.e.piezometros.map(p => [p.id, { nivel: painel.e.ultimos[p.id]?.nivel ?? null, situacao: situacaoPz(painel.e.ultimos[p.id]).lv }])),
    }),
    pronto,
  };
  (window as unknown as { aquasenseGravacao: typeof api }).aquasenseGravacao = api;
}

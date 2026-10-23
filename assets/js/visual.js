// ── VISUAL ────────────────────────────────────────────────────────────────────
// Navegação em abas (Visão geral, Mapa, Instrumento, Alertas), tubo do piezômetro
// desenhado em SVG e ícone do estado da rede.
// Só apresentação: não lê a fonte de dados nem decide estados de alerta.

const reduzMovimento = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── ABAS ──────────────────────────────────────────────────────────────────────
const VISTAS = { visao: "Visão geral", mapa: "Mapa da rede", instrumento: "Instrumento", alertas: "Alertas e eventos" };
// Âncoras antigas continuam funcionando (links salvos, README).
const VISTAS_ANTIGAS = { "visao-geral": "visao", registros: "alertas", leituras: "instrumento" };
let vistaAtual = null;
let mapaEnquadrado = false;

function vistaDoEndereco() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (VISTAS[h]) return h;
  return VISTAS_ANTIGAS[h] || "visao";
}

function irParaVista(v) {
  if (location.hash.slice(1) === v) aplicarVista();
  else location.hash = v;
}

function atualizarTituloVista() {
  const crumb = document.getElementById("crumb");
  if (crumb) crumb.textContent = vistaAtual === "instrumento" ? `Monitoramento · ${pzSelecionado}` : "Monitoramento";
}

function aplicarVista() {
  const v = vistaDoEndereco();
  const mudou = v !== vistaAtual;
  vistaAtual = v;
  document.querySelectorAll(".vista").forEach(s => s.classList.toggle("ativa", s.dataset.vista === v));
  document.querySelectorAll("a[data-vista]").forEach(a => {
    a.classList.toggle("on", a.dataset.vista === v);
    if (a.dataset.vista === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const titulo = document.getElementById("top-titulo");
  if (titulo) titulo.textContent = VISTAS[v];
  atualizarTituloVista();
  document.getElementById("conteudo")?.classList.toggle("cheio", v === "mapa");
  if (mudou) window.scrollTo(0, 0);

  // Canvas e mapa medidos enquanto ocultos ficam com tamanho zero: redesenhar ao mostrar.
  if (v === "mapa" && typeof leafletMap !== "undefined" && leafletMap) {
    setTimeout(() => {
      leafletMap.invalidateSize();
      if (!mapaEnquadrado && typeof enquadrarMapa === "function") { enquadrarMapa(); mapaEnquadrado = true; }
    }, 50);
  }
  if (v === "instrumento") {
    requestAnimationFrame(() => {
      if (typeof redrawCharts === "function") redrawCharts();
      if (mudou) revelarGrafico();
      if (typeof desenharMapaMini === "function") desenharMapaMini("ins");
    });
  }
  if (v === "visao") {
    requestAnimationFrame(() => {
      if (typeof desenharGraficoRede === "function") desenharGraficoRede();
      if (typeof desenharMapaMini === "function") desenharMapaMini("visao", { enquadrar: mudou });
    });
  }
}

// Contador de instrumentos que pedem atenção, no menu lateral e na barra do celular.
function atualizarContadorNav(qtd, critico) {
  document.querySelectorAll("[data-cont-alerta]").forEach(el => {
    el.textContent = qtd ? String(qtd) : "";
    el.classList.toggle("cr", Boolean(critico));
  });
}

function revelarGrafico() {
  const area = document.getElementById("chart-area-n");
  if (!area || reduzMovimento) return;
  area.classList.remove("revela");
  void area.offsetWidth;
  area.classList.add("revela");
}

// ── ÍCONES DE ESTADO (resumo da rede) ─────────────────────────────────────────
const ICONES_ESTADO = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
  wr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".7" fill="currentColor"/></svg>',
  cr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M12 8v5"/><circle cx="12" cy="16.5" r=".7" fill="currentColor"/></svg>',
  of: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0"/><path d="M3 3l18 18"/></svg>',
};
function definirIconeResumo(tipo) {
  const hero = document.getElementById("visao-geral");
  const ico = document.getElementById("hero-ico");
  if (!hero || !ico) return;
  hero.classList.remove("h-ok", "h-wr", "h-cr", "h-of");
  if (!tipo) { ico.innerHTML = ""; return; }
  hero.classList.add("h-" + tipo);
  if (ico.dataset.tipo !== tipo) { ico.innerHTML = ICONES_ESTADO[tipo]; ico.dataset.tipo = tipo; }
}

// ── TUBO GRANDE (aba Instrumento) ─────────────────────────────────────────────
// viewBox 280 × 500: superfície em y=150, fundo do tubo em y=482.
const TUBO = { topo: 150, fundo: 482 };
function escalaTubo() { return Math.max(4, Math.ceil(CFG.thrCritico * 1.2)); }
function yTubo(n) {
  const e = escalaTubo();
  return TUBO.fundo - (clamp(n, 0, e) / e) * (TUBO.fundo - TUBO.topo - 8);
}

function montarTuboInstrumento() {
  const box = document.getElementById("tubo-instrumento");
  if (!box || box.dataset.escala === String(escalaTubo())) return;
  box.dataset.escala = String(escalaTubo());
  const { topo, fundo } = TUBO;
  const e = escalaTubo(), passo = e > 12 ? 3 : 2;
  let marcas = "";
  for (let m = 0; m <= e; m += passo) {
    marcas += `<line x1="122" x2="128" y1="${yTubo(m)}" y2="${yTubo(m)}" style="stroke:var(--text-mute)"/><text class="tubo-escala" x="116" y="${yTubo(m) + 3.5}" text-anchor="end" font-size="9.5">${m}</text>`;
  }
  const cota = (n, cor, txt) => `<line x1="96" x2="184" y1="${yTubo(n)}" y2="${yTubo(n)}" stroke="${cor}" stroke-width="1.6" stroke-dasharray="5 4"/>
    <text class="tubo-cota" x="190" y="${yTubo(n) + 4}" fill="${cor}" font-family="IBM Plex Mono, monospace" font-size="10.5" font-weight="600">${txt}</text>`;
  box.innerHTML = `<svg viewBox="0 0 280 500" id="tubo-svg" role="img" aria-label="Nível d'água no tubo do piezômetro">
    <defs>
      <clipPath id="tg-clip"><rect x="130" y="${topo - 10}" width="28" height="${fundo - topo + 10}" rx="6"/></clipPath>
      <linearGradient id="tg-agua-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4FC3F7"/><stop offset="1" stop-color="#0D47A1"/></linearGradient>
      <linearGradient id="tg-solo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--solo-1)"/><stop offset="1" style="stop-color:var(--solo-2)"/></linearGradient>
      <pattern id="tg-grao" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1" fill="#000" opacity=".16"/><circle cx="10" cy="10" r="1.3" fill="#000" opacity=".12"/></pattern>
    </defs>
    <rect x="0" y="${topo}" width="280" height="${500 - topo}" fill="url(#tg-solo)" opacity=".85" rx="10"/>
    <rect x="0" y="${topo}" width="280" height="${500 - topo}" fill="url(#tg-grao)"/>
    <path d="M0 ${topo} H280" stroke="#8A6A4A" stroke-width="2"/>
    <rect x="118" y="${topo - 10}" width="52" height="${fundo - topo + 16}" fill="#0C141B" opacity=".35"/>
    ${marcas}
    <rect class="tubo-corpo" x="130" y="${topo - 10}" width="28" height="${fundo - topo + 10}" rx="6" stroke-width="2"/>
    <g clip-path="url(#tg-clip)"><g class="agua" id="tg-agua" style="transform:translateY(${fundo}px)">
      <path class="onda agua-cor" d="M80 0 q5 -3 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 V400 H80Z" fill="url(#tg-agua-g)"/>
      <path class="onda2" d="M80 2 q5 3 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0" fill="none" stroke="#B3E5FC" stroke-width="1.2"/>
    </g></g>
    <rect x="139" y="${fundo - 34}" width="10" height="28" rx="5" fill="#16242F" stroke="#4FC3F7" stroke-width="1.5"/>
    <line x1="144" x2="144" y1="${topo - 22}" y2="${fundo - 34}" stroke="#4FC3F7" stroke-width="1" opacity=".45"/>
    ${cota(CFG.thrCritico, "#EF5A5A", `CRÍTICO ${CFG.thrCritico} m`)}
    ${cota(CFG.thrAtencao, "#E3A53A", `ATENÇÃO ${CFG.thrAtencao} m`)}
    <g id="tg-marca" class="agua" style="transform:translateY(${fundo}px);opacity:0">
      <path d="M100 0 H126" style="stroke:var(--text)" stroke-width="1.6"/><path d="M126 0 l-6 -4 v8z" style="fill:var(--text)"/>
      <rect x="20" y="-14" width="78" height="28" rx="8" style="fill:var(--text)"/>
      <text id="tg-txt" x="59" y="5" text-anchor="middle" font-family="Barlow Semi Condensed, sans-serif" font-weight="700" font-size="17" style="fill:var(--panel)">–</text>
    </g>
    <rect x="112" y="${topo - 62}" width="64" height="40" rx="7" fill="#16242F" stroke="#3A5A6E" stroke-width="1.5"/>
    <circle cx="126" cy="${topo - 42}" r="4" fill="#8A9AA8" id="tg-led"/>
    <text x="150" y="${topo - 38}" text-anchor="middle" fill="#AEBDCA" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600">UCT</text>
    <line x1="166" x2="166" y1="${topo - 62}" y2="${topo - 98}" stroke="#AEBDCA" stroke-width="2" stroke-linecap="round"/>
    <g id="tg-arcos" transform="translate(166 ${topo - 100})">
      <path class="sinal-arco" d="M8 -6 a10 10 0 0 1 0 12"/><path class="sinal-arco" d="M14 -11 a17 17 0 0 1 0 22"/><path class="sinal-arco" d="M20 -16 a24 24 0 0 1 0 32"/>
    </g>
    <line x1="144" x2="144" y1="${topo - 22}" y2="${topo - 10}" stroke="#3A5A6E" stroke-width="3"/>
    <text class="tubo-texto" x="12" y="${topo - 8}" font-size="10">superfície</text>
    <text x="12" y="${fundo + 12}" font-size="10" fill="#E8D9C8" font-family="IBM Plex Mono, monospace" opacity=".8">fundo do tubo</text>
  </svg>`;
}

// nivel: último nível conhecido (ou null); estado: normal|atencao|critico|semsinal.
// novaLeitura: dispara as ondas da antena da UCT.
function atualizarTuboInstrumento(nivel, estado, novaLeitura = false) {
  montarTuboInstrumento();
  const svg = document.getElementById("tubo-svg");
  if (!svg) return;
  const temNivel = Number.isFinite(nivel);
  const y = temNivel ? yTubo(nivel) : TUBO.fundo;
  document.getElementById("tg-agua").style.transform = `translateY(${y}px)`;
  const marca = document.getElementById("tg-marca");
  marca.style.transform = `translateY(${y}px)`;
  marca.style.opacity = temNivel ? "1" : "0";
  document.getElementById("tg-txt").textContent = temNivel ? `${nivel.toFixed(2)} m` : "–";
  svg.classList.toggle("sem-sinal", estado === "semsinal");
  document.getElementById("tg-led").setAttribute("fill", estado === "semsinal" ? "#EF5A5A" : "#35C67E");
  if (novaLeitura && !reduzMovimento) {
    const arcos = document.getElementById("tg-arcos");
    arcos.classList.remove("emitindo"); void arcos.getBoundingClientRect(); arcos.classList.add("emitindo");
  }
}

window.addEventListener("hashchange", aplicarVista);
document.addEventListener("DOMContentLoaded", aplicarVista);

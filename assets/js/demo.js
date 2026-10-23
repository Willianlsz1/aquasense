// ── DEMONSTRAÇÃO (index.html?demo) ────────────────────────────────────────────
// Roteiro com dados fictícios para apresentar o painel sem a bancada: operação
// normal, chuva forte, nível crítico, perda de comunicação e normalização. A faixa
// de DEMONSTRAÇÃO fica sempre visível; o endereço normal nunca entra neste modo.

const ROTEIRO_DEMO = [
  { titulo: "Operação normal", texto: "Todos os instrumentos comunicando e dentro da faixa normal.",
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

// Roteiro automático (segundos desde o início): passo do roteiro e aba exibida.
const ROTEIRO_AUTO = [
  { t: 0, passo: 0, vista: "visao" },
  { t: 8, passo: 1, vista: "visao" },
  { t: 26, passo: 2, vista: "visao" },
  { t: 44, abrir: 1 },
  { t: 62, passo: 3, vista: "visao" },
  { t: 76, passo: 4, vista: "visao" },
  { t: 104, fim: true },
];

let passoDemo = 0;
let timersDemo = [];

function idsDemo() {
  const ids = PIEZOMETROS.map(p => p.id);
  while (ids.length < 3) ids.push(ids[ids.length - 1] || "PZ-01");
  return ids;
}

function aplicarPassoDemo(i) {
  passoDemo = i;
  const ids = idsDemo();
  const ref = ids.map(id => FonteSimulada.estadoDe(id).ref);
  const { alvo, offline } = ROTEIRO_DEMO[i].estado(ids, ref);
  FonteSimulada.alvo = alvo;
  const agora = Math.floor(Date.now() / 1000);
  const novoOffline = {};
  offline.forEach(id => { novoOffline[id] = FonteSimulada.offline[id] || agora - CFG.staleSeg - 5; });
  FonteSimulada.offline = novoOffline;
  renderBarraDemo();
  solicitarPoll();
}

function pararRoteiroDemo() {
  timersDemo.forEach(clearTimeout);
  timersDemo = [];
  renderBarraDemo();
}

function iniciarRoteiroDemo() {
  pararRoteiroDemo();
  FonteSimulada.reiniciar();
  ROTEIRO_AUTO.forEach(etapa => timersDemo.push(setTimeout(() => {
    if (etapa.fim) { timersDemo = []; renderBarraDemo(); return; }
    if (Number.isInteger(etapa.passo)) aplicarPassoDemo(etapa.passo);
    if (Number.isInteger(etapa.abrir)) abrirInstrumento(idsDemo()[etapa.abrir]);
    else if (etapa.vista) irParaVista(etapa.vista);
  }, etapa.t * 1000)));
  renderBarraDemo();
}

function renderBarraDemo() {
  const barra = document.getElementById("demo-barra");
  if (!barra) return;
  const ids = idsDemo();
  const passo = ROTEIRO_DEMO[passoDemo];
  const texto = typeof passo.texto === "function" ? passo.texto(ids) : passo.texto;
  const rodando = timersDemo.length > 0;
  barra.hidden = false;
  barra.innerHTML = `
    <span class="demo-rot">Roteiro</span>
    <div class="demo-passos" role="group" aria-label="Passos da demonstração">
      ${ROTEIRO_DEMO.map((p, i) => `<button type="button" data-passo="${i}" aria-pressed="${i === passoDemo}"><b>${i + 1}</b>${textoHtml(p.titulo)}</button>`).join("")}
    </div>
    <span class="demo-texto">${textoHtml(texto)}</span>
    <button type="button" class="btn-export${rodando ? "" : " btn-escuro"}" data-demo-auto>${rodando ? "■ Parar" : "▶ Roteiro automático"}</button>`;
}

if (MODO_DEMO) {
  CFG.poll = 3000; // tempo acelerado: uma consulta a cada 3 s
  trocarFonte(FonteSimulada);
  document.title = "aquasense · Demonstração";
  document.addEventListener("DOMContentLoaded", () => {
    renderBarraDemo();
    document.getElementById("demo-barra").addEventListener("click", e => {
      const passo = e.target.closest("[data-passo]");
      if (passo) { pararRoteiroDemo(); aplicarPassoDemo(Number(passo.dataset.passo)); return; }
      if (e.target.closest("[data-demo-auto]")) {
        if (timersDemo.length) pararRoteiroDemo(); else iniciarRoteiroDemo();
      }
    });
  });
}

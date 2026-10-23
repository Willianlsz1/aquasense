// ── CADASTRO DOS INSTRUMENTOS ─────────────────────────────────────────────────
// Nome, local e dados de instalação que a equipe vê. O código (PZ-01) nunca muda:
// é ele que a UCT envia. Por enquanto o cadastro fica salvo neste navegador
// (localStorage); o servidor continua sendo a origem dos nomes padrão (/config).

const CADASTRO_CHAVE = "aquasense-cadastro";
const CADASTRO_PADRAO = { local: "", sensor: "Ultrassônico (protótipo V1)", prof: null, instalado: "", resp: "", obs: "" };
let cadastroLocal = {};
const nomesServidor = {}; // nome vindo do /config, para saber o que foi editado

function lerCadastroLocal() {
  try { cadastroLocal = JSON.parse(localStorage.getItem(CADASTRO_CHAVE) || "{}") || {}; } catch { cadastroLocal = {}; }
}

function cadastroDe(id) {
  return { ...CADASTRO_PADRAO, ...(cadastroLocal[id] || {}) };
}

// Aplica os nomes editados sobre a lista de instrumentos (chamado após loadConfig).
function aplicarCadastro() {
  PIEZOMETROS.forEach(pz => {
    if (!(pz.id in nomesServidor)) nomesServidor[pz.id] = pz.nome;
    const nome = cadastroLocal[pz.id]?.nome;
    pz.nome = nome || nomesServidor[pz.id];
  });
}

function renderCartaoCadastro() {
  const box = document.getElementById("cartao-cad");
  if (!box) return;
  const pz = PIEZOMETROS.find(p => p.id === pzSelecionado);
  if (!pz) { box.innerHTML = ""; return; }
  const c = cadastroDe(pz.id);
  const vazio = '<span class="falta">não informado</span>';
  const linha = (rotulo, valor, mono = false) => `<div class="lin"><span>${rotulo}</span><b${mono ? ' class="m"' : ""}>${valor}</b></div>`;
  box.innerHTML = `
    <div class="p-cab"><h2>Cadastro</h2><div class="p-acoes"><button type="button" class="btn-export" data-editar-cadastro>Editar</button></div></div>
    ${linha("Código", textoHtml(pz.id), true)}
    ${linha("Nome", textoHtml(pz.nome))}
    ${linha("Local", c.local ? textoHtml(c.local) : vazio)}
    ${linha("Sensor", c.sensor ? textoHtml(c.sensor) : vazio)}
    ${linha("Profundidade do tubo", Number.isFinite(c.prof) ? `${fmtBR(c.prof, 1)} m` : vazio, true)}
    ${linha("Limites", `${fmtBR(CFG.thrAtencao, 0)} m · ${fmtBR(CFG.thrCritico, 0)} m`, true)}
    ${linha("Coordenadas", `${pz.lat.toFixed(4)}, ${pz.lng.toFixed(4)}`, true)}
    ${linha("Instalado em", c.instalado ? new Date(c.instalado + "T12:00").toLocaleDateString("pt-BR") : vazio, true)}
    ${linha("Responsável", c.resp ? textoHtml(c.resp) : vazio)}
    ${c.obs ? linha("Observações", textoHtml(c.obs)) : ""}
    <p class="p-nota pad">Limites iguais para todos por enquanto. Cadastro salvo neste navegador.</p>`;
}

function abrirModalCadastro() {
  const pz = PIEZOMETROS.find(p => p.id === pzSelecionado);
  if (!pz) return;
  const c = cadastroDe(pz.id);
  const campo = id => document.getElementById(id);
  campo("m-codigo").textContent = pz.id;
  campo("m-codigo2").textContent = pz.id;
  campo("m-nome").value = pz.nome;
  campo("m-local").value = c.local;
  campo("m-sensor").value = c.sensor;
  campo("m-prof").value = Number.isFinite(c.prof) ? c.prof : "";
  campo("m-inst").value = c.instalado;
  campo("m-resp").value = c.resp;
  campo("m-obs").value = c.obs;
  campo("modal-cadastro").hidden = false;
  setTimeout(() => campo("m-nome").select(), 30);
}

function fecharModalCadastro() {
  document.getElementById("modal-cadastro").hidden = true;
}

function salvarCadastro(evento) {
  evento.preventDefault();
  const id = pzSelecionado;
  const v = campo => document.getElementById(campo).value.trim();
  const prof = parseFloat(v("m-prof").replace(",", "."));
  const nome = v("m-nome");
  cadastroLocal[id] = {
    nome: nome && nome !== nomesServidor[id] ? nome : "",
    local: v("m-local"), sensor: v("m-sensor"), prof: Number.isFinite(prof) ? prof : null,
    instalado: v("m-inst"), resp: v("m-resp"), obs: v("m-obs"),
  };
  try { localStorage.setItem(CADASTRO_CHAVE, JSON.stringify(cadastroLocal)); } catch { /* bloqueado: vale só nesta aba */ }
  aplicarCadastro();
  fecharModalCadastro();
  updatePzLabels();
  atualizarVisaoGeral(pzLatest);
  atualizarMapa(pzLatest);
  renderCartaoCadastro();
  mostrarAviso(`Cadastro de ${id} atualizado`);
}

function mostrarAviso(texto) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = texto;
  el.classList.add("on");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("on"), 2400);
}

lerCadastroLocal();
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-editar-cadastro")?.addEventListener("click", abrirModalCadastro);
  document.addEventListener("click", e => { if (e.target.closest("[data-editar-cadastro]")) abrirModalCadastro(); });
  document.getElementById("m-cancelar")?.addEventListener("click", fecharModalCadastro);
  document.getElementById("form-cadastro")?.addEventListener("submit", salvarCadastro);
  document.getElementById("modal-cadastro")?.addEventListener("click", e => { if (e.target.id === "modal-cadastro") fecharModalCadastro(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") fecharModalCadastro(); });
});

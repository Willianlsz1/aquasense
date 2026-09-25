// ── INTERFACE ─────────────────────────────────────────────────────────────────
// Resumo da rede (frase e indicadores do topo), balão do gráfico de nível e
// destaque do menu lateral. Só lê o estado existente; não altera dados nem alarmes.

function saudacao(data = new Date()) {
  const h = data.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

// Botões de troca rápida de instrumento, com a condição de cada um.
function atualizarSeletorPz(mapa, confirmado) {
  const seletor = document.getElementById("pz-seletor");
  if (!seletor) return;
  seletor.innerHTML = PIEZOMETROS.map(pz => {
    const leitura = mapa[pz.id];
    let st = "", txt = "condição não confirmada";
    if (confirmado) {
      if (estadoComunicacao(leitura) === "stale" || !Number.isFinite(leitura?.nivel)) { st = "semsinal"; txt = "sem sinal"; }
      else { const c = classifyNivel(leitura.nivel); st = c.lv; txt = c.lbl.toLowerCase(); }
    }
    return `<button type="button" data-pz="${textoHtml(pz.id)}" aria-pressed="${pz.id === pzSelecionado}" title="${textoHtml(pz.nome)} · ${txt}"><i class="st-${st}"></i>${textoHtml(pz.id)}</button>`;
  }).join("");
  seletor.querySelectorAll("button").forEach(b => b.addEventListener("click", () => selectPiezometro(b.dataset.pz)));
}

// Frase e indicadores calculados das últimas leituras. Leitura antiga conta como
// SEM SINAL e nunca como normal; falha da API não é apresentada como situação da rede.
function atualizarResumoRede(mapa) {
  const frase = document.getElementById("resumo-rede");
  const titulo = document.getElementById("saudacao");
  if (titulo) titulo.textContent = `${saudacao()}. Esta é a situação da rede.`;
  if (!frase) return;
  const definir = (id, valor, sub, classe = "") => {
    const v = document.getElementById(id), s = document.getElementById(id + "-sub");
    if (v) v.textContent = valor;
    if (s) { s.textContent = sub; s.className = "kpi-sub " + classe; }
  };

  const semResposta = typeof failCount !== "undefined" && failCount > 0 && !Object.keys(mapa || {}).length;
  atualizarSeletorPz(mapa || {}, !semResposta);
  if (semResposta) {
    frase.textContent = "Não foi possível consultar a API. A situação atual dos instrumentos não está confirmada.";
    ["kpi-alerta", "kpi-semsinal", "kpi-recepcao"].forEach(id => definir(id, "–", "não confirmado", "of"));
    return;
  }

  const total = PIEZOMETROS.length;
  const semSinal = [], atencao = [], critico = [];
  let ultima = null;
  PIEZOMETROS.forEach(pz => {
    const leitura = mapa[pz.id];
    const ts = timestampUltimaRecepcao(leitura);
    if (Number.isFinite(ts) && (!ultima || ts > ultima.ts)) ultima = { id: pz.id, ts };
    if (estadoComunicacao(leitura) === "stale" || !Number.isFinite(leitura?.nivel)) { semSinal.push(pz.id); return; }
    const { lv } = classifyNivel(leitura.nivel);
    if (lv === "atencao") atencao.push(pz.id);
    if (lv === "critico") critico.push(pz.id);
  });

  const emAlerta = critico.length + atencao.length;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  let alerta;
  if (critico.length) alerta = `<b>${plural(critico.length, "instrumento", "instrumentos")}</b> em <b>crítico</b>` +
    (atencao.length ? ` e <b>${atencao.length}</b> em <b>atenção</b>` : "");
  else if (atencao.length) alerta = `<b>${plural(atencao.length, "instrumento", "instrumentos")}</b> em <b>atenção</b>`;
  else alerta = "<b>Nenhum instrumento</b> em alerta";
  const sinal = semSinal.length
    ? `<b>${semSinal.length} de ${total}</b> ${semSinal.length === 1 ? "está" : "estão"} <b>sem sinal</b>`
    : "<b>todos</b> estão comunicando";
  const recepcao = ultima
    ? ` <span class="n">2</span>A última recepção foi do <b>${textoHtml(ultima.id)}</b>, <b>${formatUltimaLeitura(ultima.ts)}</b>.`
    : ` <span class="n">2</span>Nenhuma leitura recebida até agora.`;
  const prefixo = typeof fonte !== "undefined" && fonte.simulada ? "<b>Simulação:</b> " : "";
  frase.innerHTML = `${prefixo}<span class="n">1</span>${alerta}; ${sinal}.${recepcao}`;

  definir("kpi-alerta", String(emAlerta), emAlerta ? [...critico, ...atencao].join(", ") : "nenhum", critico.length ? "cr" : emAlerta ? "wr" : "");
  definir("kpi-semsinal", String(semSinal.length), `de ${plural(total, "instrumento", "instrumentos")}`, semSinal.length ? "of" : "ok");
  definir("kpi-recepcao", ultima ? formatUltimaLeitura(ultima.ts) : "–",
    ultima ? `${ultima.id} · ${new Date(ultima.ts * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "sem leituras");
}

// Balão com o valor do ponto mais próximo do cursor no gráfico de nível.
function iniciarBalaoGrafico() {
  const area = document.getElementById("chart-area-n");
  const canvas = document.getElementById("chart-n");
  const balao = document.getElementById("chart-tip");
  if (!area || !canvas || !balao) return;
  const esconder = () => { balao.style.opacity = "0"; };
  area.addEventListener("mouseleave", esconder);
  area.addEventListener("mousemove", evento => {
    const pontos = canvas._pontos || [];
    if (!pontos.length) return esconder();
    const x = evento.clientX - area.getBoundingClientRect().left;
    const p = pontos.reduce((a, b) => Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a);
    const pico = Number.isFinite(p.max) ? p.max : p.valor;
    const linhas = [["Nível", `${p.valor.toFixed(2)} m`]];
    if (pico !== p.valor) linhas.push(["Máx. do intervalo", `${pico.toFixed(2)} m`]);
    linhas.push(["Faixa", classifyNivel(pico).lbl]);
    balao.innerHTML = `<b>${textoHtml(p.rotulo)}</b>` +
      linhas.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join("");
    balao.style.left = clamp(p.x, 90, area.offsetWidth - 90) + "px";
    balao.style.top = p.y + "px";
    balao.style.opacity = "1";
  });
}

// Destaca no menu lateral a última seção cujo topo já passou do terço da tela.
function iniciarMenuLateral() {
  const links = [...document.querySelectorAll(".nav a[href^='#']")];
  const secoes = links.map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  if (!secoes.length) return;
  const marcar = () => {
    const limite = window.innerHeight / 3;
    let atual = secoes[0];
    secoes.forEach(sec => { if (sec.getBoundingClientRect().top <= limite) atual = sec; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) atual = secoes[secoes.length - 1];
    links.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + atual.id));
  };
  window.addEventListener("scroll", marcar, { passive: true });
  marcar();
}

iniciarBalaoGrafico();
iniciarMenuLateral();

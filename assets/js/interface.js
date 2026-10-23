// ── INTERFACE ─────────────────────────────────────────────────────────────────
// Resumo da rede (frase e indicadores do topo), balão do gráfico de nível e
// destaque do menu lateral. Só lê o estado existente; não altera dados nem alarmes.

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
  if (!frase) return;
  const definir = (id, valor, sub, classe = "") => {
    const v = document.getElementById(id), s = document.getElementById(id + "-sub");
    if (v) v.textContent = valor;
    if (s) { s.textContent = sub; s.className = "kpi-sub " + classe; }
  };

  const semResposta = typeof failCount !== "undefined" && failCount > 0 && !Object.keys(mapa || {}).length;
  atualizarSeletorPz(mapa || {}, !semResposta);
  if (semResposta) {
    if (titulo) titulo.textContent = "Situação não confirmada";
    frase.textContent = "Não foi possível consultar a API. A situação atual dos instrumentos não está confirmada.";
    ["kpi-comunicando", "kpi-alerta", "kpi-semsinal", "kpi-recepcao"].forEach(id => definir(id, "–", "não confirmado", "of"));
    if (typeof definirIconeResumo === "function") definirIconeResumo("of");
    if (typeof atualizarContadorNav === "function") atualizarContadorNav(0, false);
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
    ? ` A última recepção foi do <b>${textoHtml(ultima.id)}</b>, <b>${formatUltimaLeitura(ultima.ts)}</b>.`
    : ` Nenhuma leitura recebida até agora.`;
  const prefixo = typeof fonte !== "undefined" && fonte.simulada ? "<b>Simulação:</b> " : "";
  frase.innerHTML = `${prefixo}${alerta}; ${sinal}.${recepcao}`;

  // Título curto que responde "está tudo bem?" antes da frase detalhada.
  let tituloTxt, tipo;
  if (critico.length) { tituloTxt = critico.length === 1 ? `${critico[0]} em nível crítico` : `${critico.length} instrumentos em nível crítico`; tipo = "cr"; }
  else if (atencao.length || semSinal.length) { tituloTxt = semSinal.length === total ? "Nenhum instrumento comunicando" : "A rede pede atenção"; tipo = semSinal.length === total ? "of" : "wr"; }
  else { tituloTxt = "Rede sob controle"; tipo = "ok"; }
  if (titulo) titulo.textContent = tituloTxt;
  if (typeof definirIconeResumo === "function") definirIconeResumo(tipo);
  if (typeof atualizarContadorNav === "function") atualizarContadorNav(emAlerta + semSinal.length, critico.length > 0);

  definir("kpi-comunicando", String(total - semSinal.length), `de ${plural(total, "instrumento", "instrumentos")}`, semSinal.length ? "of" : "ok");
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

iniciarBalaoGrafico();

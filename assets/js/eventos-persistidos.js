// ── HISTÓRICO PERSISTIDO DE ALERTAS ─────────────────────────────────────────
// O Worker mantém um registro curto de transições. Ele é diferente das tabelas
// de alarmes e eventos desta sessão: estas últimas explicam o que ocorreu desde
// que a página abriu; esta tabela consulta os registros que já existiam no Worker.

const EVENTOS_PERSISTIDOS_TTL_MS = 60 * 1000;
const EVENTOS_PERSISTIDOS_LIMITE_API = 50; // limite atual de GET /alerts

let eventosPersistidosCache = [];
let eventosPersistidosAtualizadosEm = null;
let eventosPersistidosErro = null;
let eventosPersistidosReqId = 0;
let eventosPersistidosPendente = null;

function textoSeguro(valor, fallback = "—") {
  if (typeof valor !== "string" && typeof valor !== "number") return fallback;
  const texto = String(valor).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return texto || fallback;
}

function dataEventoValida(valor) {
  if (typeof valor !== "string") return null;
  const data = new Date(valor);
  return Number.isFinite(data.getTime()) ? data : null;
}

function normalizarEventoPersistido(registro) {
  if (!registro || typeof registro !== "object") return null;
  const data = dataEventoValida(registro.ts);
  if (!data) return null;
  const instrumento = textoSeguro(registro.piezometro, "Instrumento não informado");
  const tipo = textoSeguro(registro.tipo, "evento").toUpperCase();
  const estado = textoSeguro(registro.nivel || registro.status, "");
  const mensagem = textoSeguro(registro.mensagem, estado || "Evento registrado");
  return {
    ts: data.toISOString(),
    dataLocal: data.toLocaleString("pt-BR"),
    instrumento,
    tipo,
    evento: mensagem,
    acao: textoSeguro(registro.acao, "Sem ação registrada"),
  };
}

function eventosPersistidosDoSelecionado() {
  const selecionado = typeof pzSelecionado === "string" ? pzSelecionado : "";
  return eventosPersistidosCache.filter(evento => evento.instrumento === selecionado);
}

function criarCelula(linha, texto) {
  const celula = document.createElement("td");
  celula.textContent = texto;
  linha.appendChild(celula);
}

function limparElemento(elemento) {
  while (elemento.firstChild) elemento.removeChild(elemento.firstChild);
}

function renderEventosPersistidos() {
  const corpo = document.getElementById("servidor-eventos-tbody");
  const status = document.getElementById("servidor-eventos-status");
  const botao = document.getElementById("btn-export-alertas");
  if (!corpo || !status) return;

  const emSimulacao = Boolean(typeof fonte !== "undefined" && fonte.simulada);
  const eventos = eventosPersistidosDoSelecionado();
  limparElemento(corpo);

  if (emSimulacao) {
    const linha = document.createElement("tr");
    const celula = document.createElement("td");
    celula.colSpan = 5;
    celula.textContent = "Indisponível no modo simulação";
    linha.appendChild(celula);
    corpo.appendChild(linha);
    status.textContent = "Indisponível no modo simulação";
    if (botao) botao.disabled = true;
    return;
  }

  if (!eventos.length) {
    const linha = document.createElement("tr");
    const celula = document.createElement("td");
    celula.colSpan = 5;
    celula.textContent = eventosPersistidosErro
      ? "Não foi possível atualizar os registros do servidor."
      : "Nenhum registro disponível para este instrumento.";
    linha.appendChild(celula);
    corpo.appendChild(linha);
  } else {
    eventos.forEach(evento => {
      const linha = document.createElement("tr");
      criarCelula(linha, evento.dataLocal);
      criarCelula(linha, evento.instrumento);
      criarCelula(linha, evento.tipo);
      criarCelula(linha, evento.evento);
      criarCelula(linha, evento.acao);
      corpo.appendChild(linha);
    });
  }

  const atualizacao = eventosPersistidosAtualizadosEm
    ? new Date(eventosPersistidosAtualizadosEm).toLocaleTimeString("pt-BR")
    : null;
  const complementoErro = eventosPersistidosErro && eventosPersistidosAtualizadosEm
    ? " · atualização falhou; exibindo cache"
    : eventosPersistidosErro ? " · consulta indisponível" : "";
  status.textContent = `${eventos.length} registro${eventos.length !== 1 ? "s" : ""} ${eventos.length !== 1 ? "disponíveis" : "disponível"} para ${pzSelecionado}. ` +
    `A API retorna até ${EVENTOS_PERSISTIDOS_LIMITE_API} registros; não representa o histórico completo.` +
    (atualizacao ? ` Atualizado às ${atualizacao}.` : "") + complementoErro;
  if (botao) botao.disabled = !eventos.length;
}

// Busca o histórico persistido. O token e a fonte capturada impedem que uma
// resposta iniciada antes de trocar instrumento/fonte sobrescreva a tela atual.
async function carregarEventosPersistidos({ forcar = false } = {}) {
  if (typeof fonte !== "undefined" && fonte.simulada) {
    eventosPersistidosReqId++;
    renderEventosPersistidos();
    return [];
  }

  const agora = Date.now();
  if (eventosPersistidosPendente?.reqId === eventosPersistidosReqId && eventosPersistidosPendente.fonte === fonte) {
    return eventosPersistidosDoSelecionado();
  }
  if (!forcar && eventosPersistidosAtualizadosEm && agora - eventosPersistidosAtualizadosEm < EVENTOS_PERSISTIDOS_TTL_MS) {
    renderEventosPersistidos();
    return eventosPersistidosDoSelecionado();
  }

  const reqId = ++eventosPersistidosReqId;
  const fonteDaConsulta = fonte;
  const pendente = { reqId, fonte: fonteDaConsulta };
  eventosPersistidosPendente = pendente;
  const statusConsulta = document.getElementById("servidor-eventos-status");
  if (statusConsulta) statusConsulta.textContent = "Consultando registros do servidor…";
  try {
    const resposta = await apiGet("/alerts");
    if (reqId !== eventosPersistidosReqId || fonte !== fonteDaConsulta || fonteDaConsulta?.simulada) return eventosPersistidosDoSelecionado();
    eventosPersistidosCache = (Array.isArray(resposta?.notificacoes) ? resposta.notificacoes : [])
      .map(normalizarEventoPersistido)
      .filter(Boolean);
    eventosPersistidosAtualizadosEm = Date.now();
    eventosPersistidosErro = null;
  } catch (erro) {
    if (reqId !== eventosPersistidosReqId || fonte !== fonteDaConsulta) return eventosPersistidosDoSelecionado();
    eventosPersistidosErro = erro instanceof Error ? erro.message : "Falha na consulta";
  } finally {
    if (eventosPersistidosPendente === pendente) eventosPersistidosPendente = null;
  }
  renderEventosPersistidos();
  return eventosPersistidosDoSelecionado();
}

function campoCsvSeguro(valor) {
  let texto = String(valor ?? "").replace(/\r?\n/g, " ");
  // Evita que planilhas interpretem conteúdo do servidor como fórmula.
  if (/^[=+\-@\t\r]/.test(texto)) texto = "'" + texto;
  return `"${texto.replace(/"/g, '""')}"`;
}

function baixarCsvEventos(conteudo, nome) {
  const blob = new Blob(["\uFEFF" + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarEventosPersistidos() {
  if (typeof fonte !== "undefined" && fonte.simulada) {
    renderEventosPersistidos();
    return false;
  }
  const eventos = eventosPersistidosDoSelecionado();
  if (!eventos.length) {
    renderEventosPersistidos();
    return false;
  }
  const gerado = new Date();
  const estadoConsulta = eventosPersistidosErro ? "cache; última atualização falhou" : "consulta atualizada";
  const meta = [
    ["Relatório", "Histórico de alertas AquaSense"],
    ["Origem", "API do sistema (/alerts)"],
    ["Escopo", `Registros retornados pela API; máximo de ${EVENTOS_PERSISTIDOS_LIMITE_API}, não é histórico completo`],
    ["Filtro de instrumento", pzSelecionado],
    ["Estado da consulta", estadoConsulta],
    ["Gerado em (local)", gerado.toLocaleString("pt-BR")],
    ["Gerado em (UTC)", gerado.toISOString()],
    ["Registros exportados", eventos.length],
  ];
  const linhas = [
    ...meta.map(linha => linha.map(campoCsvSeguro).join(";")),
    "",
    ["Data/hora local", "Data/hora UTC", "Instrumento", "Tipo", "Evento", "Ação"].map(campoCsvSeguro).join(";"),
    ...eventos.map(evento => [evento.dataLocal, evento.ts, evento.instrumento, evento.tipo, evento.evento, evento.acao].map(campoCsvSeguro).join(";")),
  ];
  baixarCsvEventos(linhas.join("\r\n"), `alertas_${pzSelecionado}_${gerado.toISOString().slice(0, 10)}.csv`);
  return true;
}

function iniciarEventosPersistidos() {
  const botao = document.getElementById("btn-export-alertas");
  if (botao) botao.addEventListener("click", exportarEventosPersistidos);
  renderEventosPersistidos();
}

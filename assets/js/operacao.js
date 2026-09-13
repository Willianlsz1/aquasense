// Contexto de origem e frescor, independente das faixas de nível.
function atualizarResumoOperacional(pzId, { apiIndisponivel = false } = {}) {
  const el = document.getElementById("reading-context");
  if (!el) return;
  const leitura = pzLatest[pzId];
  const ts = timestampUltimaRecepcao(leitura);
  const recebido = Number.isFinite(ts)
    ? new Date(ts * 1000).toLocaleString("pt-BR") : "nenhuma recepção registrada";
  const origem = fonte.simulada ? "SIMULAÇÃO · valores fictícios" : "Monitoramento real";
  const estado = apiIndisponivel ? "API indisponível · valores anteriores são referência"
    : estadoComunicacao(leitura) === "stale" ? "Sem leitura recente" : "Leitura recente";
  el.textContent = `${origem} · ${estado} · Recepção: ${recebido}`;
  if (apiIndisponivel) {
    setAlertSemSinal(ts);
    document.getElementById("adesc").textContent = "Não foi possível consultar a API. A condição atual do instrumento não está confirmada.";
    document.getElementById("badge-n").textContent = "Não confirmado";
    document.getElementById("badge-n").className = "mbadge";
    document.getElementById("val-n").className = "cv-neutral";
  }
}

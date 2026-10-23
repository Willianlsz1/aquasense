// Contexto de origem e frescor, independente das faixas de nível.
function atualizarResumoOperacional(pzId, { apiIndisponivel = false } = {}) {
  const el = document.getElementById("reading-context");
  if (!el) return;
  const leitura = pzLatest[pzId];
  const ts = timestampUltimaRecepcao(leitura);
  const recebido = Number.isFinite(ts)
    ? new Date(ts * 1000).toLocaleString("pt-BR") : "nenhuma recepção registrada";
  const origem = fonte.simulada ? "DEMONSTRAÇÃO · valores fictícios" : "Monitoramento real";
  const estado = apiIndisponivel ? "API indisponível · valores anteriores são referência"
    : estadoComunicacao(leitura) === "stale" ? "Sem leitura recente" : "Leitura recente";
  el.textContent = `${origem} · ${estado} · Recepção: ${recebido}`;
  if (apiIndisponivel) {
    setAlertSemSinal(ts);
    const selo = document.getElementById("badge-n");
    if (selo) { selo.textContent = "Não confirmado"; selo.className = "tbadge tb-semsinal"; }
    const det = document.getElementById("val-n-det");
    if (det) det.textContent = "API indisponível · condição atual não confirmada";
    const valor = document.getElementById("val-n");
    if (valor) valor.className = "cv-neutral";
  }
}

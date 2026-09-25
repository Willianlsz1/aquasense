// Aplicado no head para evitar um clarão antes de carregar o tema salvo.
(() => {
  const chave = "aquasense-tema";
  let tema = "claro";
  try {
    const salvo = localStorage.getItem(chave);
    tema = salvo === "escuro" || salvo === "claro" ? salvo
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
  } catch { /* O painel funciona mesmo com armazenamento bloqueado. */ }
  document.documentElement.dataset.tema = tema;
  document.addEventListener("DOMContentLoaded", () => {
    const botoes = document.querySelectorAll("[data-tema-opcao]");
    if (!botoes.length) return;
    function atualizar() {
      botoes.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.temaOpcao === tema)));
    }
    atualizar();
    botoes.forEach(botao => botao.addEventListener("click", () => {
      if (botao.dataset.temaOpcao === tema) return;
      tema = botao.dataset.temaOpcao;
      document.documentElement.dataset.tema = tema;
      try { localStorage.setItem(chave, tema); } catch { /* Preferência só nesta aba. */ }
      atualizar();
      if (typeof redrawCharts === "function") redrawCharts();
    }));
  });
})();

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
    const botao = document.getElementById("btn-tema");
    if (!botao) return;
    function atualizar() {
      botao.textContent = tema === "escuro" ? "Modo claro" : "Modo escuro";
      botao.setAttribute("aria-pressed", String(tema === "escuro"));
    }
    atualizar();
    botao.addEventListener("click", () => {
      tema = tema === "escuro" ? "claro" : "escuro";
      document.documentElement.dataset.tema = tema;
      try { localStorage.setItem(chave, tema); } catch { /* Preferência só nesta aba. */ }
      atualizar();
      if (typeof redrawCharts === "function") redrawCharts();
    });
  });
})();

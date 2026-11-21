// ── SOM DO ALARME CRÍTICO ─────────────────────────────────────────────────────
// Três bipes a cada 20 s enquanto houver instrumento em crítico. O navegador só
// libera áudio depois de um clique na página.
let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function contexto() {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ctx && AC) ctx = new AC();
  return ctx;
}

function bipe() {
  const c = contexto();
  if (!c || c.state !== "running") return;
  [0, 0.32, 0.64].forEach((atraso, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "square"; o.frequency.value = i % 2 ? 660 : 880;
    g.gain.setValueAtTime(0.0001, c.currentTime + atraso);
    g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + atraso + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + atraso + 0.22);
    o.connect(g).connect(c.destination); o.start(c.currentTime + atraso); o.stop(c.currentTime + atraso + 0.25);
  });
}

export function tocarAlarme(tocar: boolean) {
  if (tocar && !timer) { bipe(); timer = setInterval(bipe, 20000); }
  if (!tocar && timer) { clearInterval(timer); timer = null; }
}

if (typeof document !== "undefined") {
  document.addEventListener("click", () => { const c = contexto(); if (c && c.state === "suspended") void c.resume(); }, { capture: true });
}

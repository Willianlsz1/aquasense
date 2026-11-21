// ── CADASTRO DOS INSTRUMENTOS ─────────────────────────────────────────────────
// Nome, local e dados de instalação. O código (PZ-01) nunca muda: é o que a UCT
// envia. Por enquanto o cadastro fica salvo neste navegador.
export type Cadastro = { nome: string; local: string; sensor: string; prof: number | null; instalado: string; resp: string; obs: string };

const CHAVE = "aquasense-cadastro";
export const CADASTRO_PADRAO: Cadastro = { nome: "", local: "", sensor: "Ultrassônico (protótipo V1)", prof: null, instalado: "", resp: "", obs: "" };

export function lerCadastros(): Record<string, Partial<Cadastro>> {
  try { return JSON.parse(localStorage.getItem(CHAVE) || "{}") || {}; } catch { return {}; }
}

export function gravarCadastros(c: Record<string, Partial<Cadastro>>) {
  try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch { /* bloqueado: vale só nesta aba */ }
}

export const cadastroDe = (todos: Record<string, Partial<Cadastro>>, id: string): Cadastro => ({ ...CADASTRO_PADRAO, ...(todos[id] || {}) });

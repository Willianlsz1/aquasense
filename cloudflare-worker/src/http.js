// ── HELPERS HTTP ──────────────────────────────────────────────────────────────
// Cabeçalhos CORS, resposta JSON padronizada, leitura de corpo com limite de
// bytes.

// ── HELPERS DE RESPOSTA ───────────────────────────────────────────────────────
export function corsHeaders(cfg, extra) {
  return {
    "Access-Control-Allow-Origin": cfg.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    ...extra,
  };
}

export function json(cfg, status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: corsHeaders(cfg, { "Content-Type": "application/json; charset=utf-8" }),
  });
}

// Lê o corpo da requisição como texto, respeitando um limite de bytes — tanto
// via Content-Length (checagem antecipada) quanto pelo tamanho real lido
// (Content-Length pode ser omitido ou mentiroso).
export async function readBodyLimited(request, maxBytes) {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) {
    return { tooLarge: true };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { tooLarge: true };
  }
  return { text };
}

// Copia o build (painel/dist) para a raiz do repositório, que é o que o GitHub
// Pages publica. Apaga a pasta app/ anterior para não acumular arquivos antigos.
import { cpSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve(import.meta.dirname, "../dist");
const raiz = resolve(import.meta.dirname, "../..");
if (!existsSync(resolve(dist, "index.html"))) throw new Error("Build não encontrado em painel/dist");
rmSync(resolve(raiz, "app"), { recursive: true, force: true });
cpSync(resolve(dist, "app"), resolve(raiz, "app"), { recursive: true });
for (const f of ["index.html", "relatorio.html"]) cpSync(resolve(dist, f), resolve(raiz, f));
console.log("Painel publicado na raiz do repositório (index.html, relatorio.html, app/).");

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { painel } from "./nucleo/painel";
import { instalarApiGravacao } from "./nucleo/api-gravacao";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
instalarApiGravacao();
void painel.iniciar();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { painel } from "./nucleo/painel";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
void painel.iniciar();

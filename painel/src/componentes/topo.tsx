import { Volume2, VolumeX } from "lucide-react";
import { painel, type EstadoPainel } from "../nucleo/painel";

// Origem dos dados: ciano = real, lilás = simulação, cinza = sem resposta.
export function FonteDados({ e, curto = false }: { e: EstadoPainel; curto?: boolean }) {
  const pt = e.status.tipo === "live" ? "real" : e.status.tipo === "sim" ? "sim" : "off";
  const txt = curto && pt === "real" ? "Dados reais" : curto && pt === "sim" ? "Simulação" : e.status.msg;
  return (
    <span role="status" className="flex items-center gap-2 text-[12px] text-texto-2" title={e.status.msg}>
      <span className={`fonte-pt ${pt} ${pt === "real" ? "pulsar" : ""}`} /><span className="num">{txt}</span>
    </span>
  );
}

// Som do alarme crítico (toca a cada 20 s). Ponto vermelho = tocando agora.
export function BotaoSom({ e }: { e: EstadoPainel }) {
  return (
    <button type="button" onClick={() => painel.alternarSom()} aria-pressed={e.som.ligado}
      title={e.som.ligado ? "Som do alarme crítico ligado: clique para desligar" : "Som do alarme crítico desligado: clique para ligar"}
      className="btn relative">
      {e.som.ligado ? <Volume2 size={16} strokeWidth={1.75} /> : <VolumeX size={16} strokeWidth={1.75} />}
      {e.som.ligado ? "Som ligado" : "Som desligado"}
      {e.som.ativo && !e.som.silenciado && e.som.ligado && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-cr ring-2 ring-fundo" />}
    </button>
  );
}

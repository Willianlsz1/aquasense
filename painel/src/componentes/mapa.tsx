import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap, ZoomControl } from "react-leaflet";
import type { Pz } from "../nucleo/config";
import { painel } from "../nucleo/painel";
import { fmtBR, formatUltima, ROTULO, type Estado } from "../nucleo/util";
import { corpoForma } from "./base";

const SATELITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const RUAS = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export type ItemMapa = { pz: Pz; s: Estado };

function Enquadrar({ itens, modo, sel, lista }: { itens: ItemMapa[]; modo: "visao" | "completo" | "ins"; sel?: string; lista?: boolean }) {
  const map = useMap();
  const chave = itens.map(i => i.pz.id).join(",") + (modo === "ins" ? sel : "");
  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize();
      if (modo === "ins") {
        const pz = itens.find(i => i.pz.id === sel)?.pz;
        if (pz) map.setView([pz.lat, pz.lng], 16, { animate: false });
        return;
      }
      if (!itens.length) return;
      const largo = window.innerWidth > 900;
      map.fitBounds(L.latLngBounds(itens.map(i => [i.pz.lat, i.pz.lng])), modo === "completo"
        ? { paddingTopLeft: [lista && largo ? 360 : 30, 70], paddingBottomRight: [largo ? 140 : 90, 60], maxZoom: 17 }
        : { paddingTopLeft: [40, 40], paddingBottomRight: [largo ? 120 : 90, 40], maxZoom: 16 });
    }, 60);
    return () => clearTimeout(t);
    // Enquadra só quando a lista de instrumentos (ou o selecionado, no modo ins) muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, chave]);
  return null;
}

// A altura do mapa muda quando a faixa de alarmes cresce: o Leaflet precisa recalcular.
function AjustarTamanho({ altura }: { altura: number | string }) {
  const map = useMap();
  useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 60); return () => clearTimeout(t); }, [map, altura]);
  return null;
}

// Voa até o instrumento escolhido na lista lateral (aba Mapa).
function VoarPara({ alvo }: { alvo: { pz: Pz; n: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!alvo) return;
    const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.flyTo([alvo.pz.lat, alvo.pz.lng], 17, { duration: reduz ? 0 : 0.9 });
  }, [map, alvo]);
  return null;
}

function Marcador({ item, comValor, destaque, apagado, comPopup, agora }:
  { item: ItemMapa; comValor: boolean; destaque: boolean; apagado: boolean; comPopup: boolean; agora: number }) {
  const { pz, s } = item;
  const valor = comValor ? (s.lv === "semsinal" ? "sem sinal" : s.nivel !== null ? `${fmtBR(s.nivel)} m` : "") : "";
  const html = `<div class="mkr k-${s.lv}${destaque ? " sel" : ""}${apagado ? " apagado" : ""}"><svg width="16" height="16" viewBox="0 0 16 16">${corpoForma(s.lv)}</svg>${pz.id}${valor ? `<span>${valor}</span>` : ""}</div>`;
  const icon = useMemo(() => L.divIcon({ className: "", iconSize: [0, 0], html }), [html]);
  const prio = { critico: 3, atencao: 2, semsinal: 1, normal: 0 }[s.lv];
  const ref = useRef<L.Marker>(null);
  return (
    <Marker ref={ref} position={[pz.lat, pz.lng]} icon={icon} zIndexOffset={prio * 100 + (destaque ? 500 : 0)}
      eventHandlers={comPopup ? {} : { click: () => painel.abrirInstrumento(pz.id) }}>
      {comPopup && (
        <Popup closeButton={false} offset={[0, -8]} autoPan={false}>
          <div className="min-w-[180px] space-y-1 font-sans">
            <div className="text-[12px] font-semibold" style={{ color: s.lv === "normal" ? "var(--texto-2)" : `var(--${s.lv === "critico" ? "cr" : s.lv === "atencao" ? "wr" : "of"})` }}>{ROTULO[s.lv]}</div>
            <div className="text-[14px] font-semibold text-texto">{pz.id} · {pz.nome}</div>
            <div className="num text-[22px] font-semibold" style={{ color: s.lv === "semsinal" ? "var(--texto-3)" : "var(--texto)" }}>{s.nivel !== null ? `${fmtBR(s.nivel)} m` : "···"}</div>
            <div className="text-[12px] text-texto-3">{s.recepcao ? `${s.lv === "semsinal" ? "Última leitura" : "Recebido"} ${formatUltima(s.recepcao, agora)}` : "Nenhuma leitura recebida"}{s.lv === "semsinal" && s.nivel !== null ? " · não confirmada" : ""}</div>
            <button type="button" className="mt-1 w-full rounded-lg bg-texto px-3 py-1.5 text-[12.5px] font-semibold text-card" onClick={() => painel.abrirInstrumento(pz.id)}>Abrir instrumento</button>
          </div>
        </Popup>
      )}
    </Marker>
  );
}

export function MapaInstrumentos({ itens, modo, sel, camada = "satelite", altura = "100%", voar = null, lista = false, agora, realce }:
  { itens: ItemMapa[]; modo: "visao" | "completo" | "ins"; sel?: string; camada?: "satelite" | "ruas"; altura?: number | string;
    voar?: { pz: Pz; n: number } | null; lista?: boolean; agora: number; realce?: string | null }) {
  const centro: [number, number] = itens.length
    ? [itens.reduce((a, i) => a + i.pz.lat, 0) / itens.length, itens.reduce((a, i) => a + i.pz.lng, 0) / itens.length] : [-20.2, -43.46];
  return (
    <div style={{ height: altura }} className="relative">
      <MapContainer center={centro} zoom={15} scrollWheelZoom={modo === "completo"} zoomControl={false} attributionControl={modo === "completo"}
        style={{ height: "100%", width: "100%" }}>
        {camada === "satelite"
          ? <TileLayer key="sat" url={SATELITE} maxZoom={19} maxNativeZoom={17} attribution="Imagens &copy; Esri, Maxar, Earthstar Geographics" />
          : <TileLayer key="ruas" url={RUAS} maxZoom={19} attribution="&copy; OpenStreetMap contributors" />}
        {modo !== "ins" && <ZoomControl position={modo === "completo" ? "bottomright" : "topright"} />}
        <Enquadrar itens={itens} modo={modo} sel={sel} lista={lista} />
        <VoarPara alvo={voar} />
        <AjustarTamanho altura={altura} />
        {itens.map(it => (
          <Marcador key={it.pz.id} item={it} agora={agora} comValor={modo !== "ins" && itens.length <= 6}
            destaque={modo === "ins" ? it.pz.id === sel : modo === "completo" ? it.pz.id === sel : it.pz.id === realce}
            apagado={modo === "ins" && it.pz.id !== sel} comPopup={modo === "completo"} />
        ))}
      </MapContainer>
    </div>
  );
}

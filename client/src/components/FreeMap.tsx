import { useEffect, useRef, useState } from "react";
import * as L from "@/vendor/leaflet/src/Leaflet";
import "@/vendor/leaflet/leaflet.css";

export type Pin = { id: number; lat: number; lng: number; name: string; address?: string | null };
export function FreeMap({ pins, route, onPick }: { pins: Pin[]; route?: [number, number][]; onPick: (lat: number, lng: number) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const pick = useRef(onPick); pick.current = onPick;
  const fitted = useRef("");
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const m = L.map(container.current, { zoomControl: true }).setView([35.6762, 139.6503], 12);
    map.current = m;
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
    tiles.on("tileerror", () => setError(true));
    tiles.on("tileload", () => setError(false));
    tiles.addTo(m);
    layers.current = L.layerGroup(); layers.current.addTo(m);
    m.on("click", event => pick.current(event.latlng.lat, event.latlng.lng));
    const observer = new ResizeObserver(() => m.invalidateSize()); observer.observe(container.current);
    return () => { observer.disconnect(); m.remove(); map.current = null; layers.current = null; };
  }, []);
  useEffect(() => {
    const group = layers.current; if (!group) return;
    group.clearLayers();
    const key = pins.map(pin => `${pin.id}:${pin.lat}:${pin.lng}`).sort().join(";");
    if (pins.length && key !== fitted.current) {
      fitted.current = key;
      if (pins.length === 1) map.current?.setView([pins[0].lat, pins[0].lng], 15);
      else map.current?.fitBounds(pins.map(pin => [pin.lat, pin.lng]), { padding: [30,30], maxZoom: 15 });
    }
    pins.forEach((pin, index) => {
      const content = document.createElement("div");
      const name = document.createElement("strong"); name.textContent = `${index + 1}. ${pin.name}`; content.append(name);
      if (pin.address) { const address = document.createElement("p"); address.textContent = pin.address; content.append(address); }
      L.circleMarker([pin.lat, pin.lng], { radius: 13, color: "white", weight: 2, fillColor: "#4f46e5", fillOpacity: 1 }).bindTooltip(String(index + 1), { permanent: true, direction: "center", className: "plan-pin-label" }).bindPopup(content).addTo(group);
    });
    if (route?.length) L.polyline(route, { color: "#4f46e5", weight: 4 }).addTo(group);
  }, [pins, route]);
  return <div className="relative">
    <div ref={container} aria-label="지도를 눌러 방문 장소 추가" className="h-[420px] w-full rounded-xl border" style={{ zIndex: 0 }} />
    {error && <p role="alert" className="text-sm text-destructive">지도 이미지를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.</p>}
  </div>;
}

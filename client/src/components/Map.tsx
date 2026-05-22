/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map; // Store to control map from parent anytime, google map itself is in charge of the re-rendering, not react state.
 * </MapView>
 *
 * ======
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export function loadMapScript() {
  return new Promise(resolve => {
    if (window.google?.maps) {
      resolve(null);
      return;
    }

    if (!API_KEY) {
      console.error("VITE_GOOGLE_MAPS_API_KEY is not configured");
      resolve(null);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps="true"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(null), { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.dataset.googleMaps = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geometry`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      resolve(null);
      script.remove();
    };
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      resolve(null);
    };
    document.head.appendChild(script);
  });
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);

  const init = usePersistFn(async () => {
    await loadMapScript();
    if (!mapContainer.current) {
      console.error("Map container not found");
      return;
    }
    if (!window.google?.maps) {
      console.error("Google Maps is unavailable. Check API key and billing settings.");
      return;
    }

    map.current = new window.google.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      mapTypeControl: false,
      fullscreenControl: true,
      zoomControl: true,
      streetViewControl: false,
      mapId: "DEMO_MAP_ID",
    });

    const controlWrap = document.createElement('div');
    controlWrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin:10px;';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" stroke="#111827" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 12.5 12 16l8-3.5" stroke="#111827" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17.5 12 21l8-3.5" stroke="#111827" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    toggleBtn.setAttribute('aria-label', '지도 타입');
    toggleBtn.style.cssText = `
      width:34px;
      height:34px;
      border:none;
      border-radius:999px;
      background:rgba(255,255,255,.96);
      box-shadow:0 4px 14px rgba(20,32,51,.14);
      cursor:pointer;
      display:grid;
      place-items:center;
      backdrop-filter:blur(10px);
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      display:flex;
      align-items:center;
      gap:4px;
      padding:4px;
      border-radius:999px;
      background:rgba(255,255,255,.96);
      box-shadow:0 4px 14px rgba(20,32,51,.14);
      opacity:0;
      transform:translateX(-6px);
      pointer-events:none;
      transition:all .18s ease;
    `;

    const createTypeBtn = (label: string, type: google.maps.MapTypeId) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.cssText = `
        border:none;
        border-radius:999px;
        background:transparent;
        padding:6px 10px;
        font-size:12px;
        font-weight:600;
        color:#334155;
        cursor:pointer;
      `;

      btn.onclick = () => {
        map.current?.setMapTypeId(type);
        [...panel.querySelectorAll('button')].forEach(el => {
          el.style.background = 'transparent';
          el.style.color = '#334155';
        });
        btn.style.background = '#111827';
        btn.style.color = '#fff';
      };

      return btn;
    };

    const roadmapBtn = createTypeBtn('지도', google.maps.MapTypeId.ROADMAP);
    const satelliteBtn = createTypeBtn('위성', google.maps.MapTypeId.SATELLITE);

    roadmapBtn.style.background = '#111827';
    roadmapBtn.style.color = '#fff';

    panel.appendChild(roadmapBtn);
    panel.appendChild(satelliteBtn);

    let opened = false;
    toggleBtn.onclick = () => {
      opened = !opened;
      panel.style.opacity = opened ? '1' : '0';
      panel.style.transform = opened ? 'translateX(0)' : 'translateX(-6px)';
      panel.style.pointerEvents = opened ? 'auto' : 'none';
    };

    controlWrap.appendChild(toggleBtn);
    controlWrap.appendChild(panel);

    map.current.controls[window.google.maps.ControlPosition.TOP_LEFT].push(controlWrap);

    if (onMapReady) {
      onMapReady(map.current);
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div ref={mapContainer} className={cn("w-full h-[500px]", className)} />
  );
}

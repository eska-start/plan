import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect, useCallback } from "react";
import { MapView } from "@/components/Map";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { MapPin, Navigation, Loader2, CheckCircle2 } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  place: "#3b82f6",
  food: "#f97316",
  activity: "#22c55e",
  shopping: "#a855f7",
};

export default function MapTab({ tripId, tripDays }: { tripId: number; tripDays: Date[] }) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (tripDays.length > 0) return format(tripDays[0], "yyyy-MM-dd");
    return format(new Date(), "yyyy-MM-dd");
  });
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const routeRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const { data: items, isLoading } = trpc.itinerary.listByDate.useQuery({ tripId, date: selectedDate });

  // Clear previous markers and routes
  const clearMap = useCallback(() => {
    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];
    if (routeRendererRef.current) {
      routeRendererRef.current.setMap(null);
      routeRendererRef.current = null;
    }
    setRouteError(null);
  }, []);

  // Geocode address and return LatLng
  const geocodeAddress = useCallback((address: string): Promise<google.maps.LatLng | null> => {
    return new Promise(resolve => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          resolve(results[0].geometry.location);
        } else {
          resolve(null);
        }
      });
    });
  }, []);

  // Render markers and route on map
  const renderOnMap = useCallback(async () => {
    if (!mapRef.current || !items || items.length === 0) return;
    clearMap();
    setGeocoding(true);

    const positions: { item: typeof items[number]; latlng: google.maps.LatLng }[] = [];

    for (const item of items) {
      let latlng: google.maps.LatLng | null = null;

      // Use stored lat/lng if available
      if (item.lat && item.lng) {
        latlng = new window.google.maps.LatLng(Number(item.lat), Number(item.lng));
      } else if (item.address) {
        latlng = await geocodeAddress(item.address);
      } else if (item.placeName) {
        latlng = await geocodeAddress(item.placeName);
      }

      if (latlng) positions.push({ item, latlng });
    }

    setGeocoding(false);

    if (positions.length === 0) return;

    // Create markers
    const bounds = new window.google.maps.LatLngBounds();
    positions.forEach(({ item, latlng }, idx) => {
      bounds.extend(latlng);
      const color = CATEGORY_COLORS[item.category ?? "place"] ?? "#3b82f6";

      // Custom marker element
      const el = document.createElement("div");
      el.style.cssText = `
        width: 32px; height: 32px; border-radius: 50% 50% 50% 0;
        background: ${item.visited ? "#9ca3af" : color};
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
        transform: rotate(-45deg);
        cursor: pointer;
      `;
      const inner = document.createElement("div");
      inner.style.cssText = "transform: rotate(45deg); color: white; font-size: 11px; font-weight: bold;";
      inner.textContent = String(idx + 1);
      el.appendChild(inner);

      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current!,
        position: latlng,
        title: item.placeName,
        content: el,
      });

      // Info window
      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="font-family: Inter, sans-serif; padding: 4px 2px; min-width: 140px;">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">${idx + 1}. ${item.placeName}</div>
            ${item.visitTime ? `<div style="font-size: 11px; color: #6b7280;">⏰ ${item.visitTime}</div>` : ""}
            ${item.address ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">📍 ${item.address}</div>` : ""}
            ${item.visited ? `<div style="font-size: 11px; color: #22c55e; margin-top: 4px;">✓ 방문 완료</div>` : ""}
          </div>
        `,
      });

      marker.addListener("click", () => {
        infoWindow.open({ anchor: marker, map: mapRef.current! });
      });

      markersRef.current.push(marker);
    });

    mapRef.current.fitBounds(bounds, { top: 60, right: 40, bottom: 40, left: 40 });

    // Draw route if 2+ positions
    if (positions.length >= 2) {
      const directionsService = new window.google.maps.DirectionsService();
      const renderer = new window.google.maps.DirectionsRenderer({
        map: mapRef.current,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: "#6366f1",
          strokeWeight: 3,
          strokeOpacity: 0.7,
        },
      });
      routeRendererRef.current = renderer;

      const waypoints = positions.slice(1, -1).map(p => ({
        location: p.latlng,
        stopover: false,
      }));

      directionsService.route(
        {
          origin: positions[0].latlng,
          destination: positions[positions.length - 1].latlng,
          waypoints,
          travelMode: window.google.maps.TravelMode.WALKING,
          optimizeWaypoints: false,
        },
        (result, status) => {
          if (status === "OK" && result) {
            renderer.setDirections(result);
          } else {
            setRouteError("경로를 불러올 수 없습니다.");
          }
        }
      );
    }
  }, [items, clearMap, geocodeAddress]);

  useEffect(() => {
    if (mapReady && items) {
      renderOnMap();
    }
  }, [mapReady, items, renderOnMap]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">동선 지도</h2>
        <p className="text-sm text-muted-foreground mt-0.5">날짜별 방문 장소와 이동 경로를 확인하세요.</p>
      </div>

      {/* Date Selector */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {tripDays.map((day, idx) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isSelected = selectedDate === dateStr;
          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl border transition-all shrink-0 ${
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-foreground border-border hover:border-primary/30 hover:bg-muted/50"
              }`}
            >
              <span className="text-xs font-medium">{format(day, "EEE", { locale: ko })}</span>
              <span className="text-lg font-bold leading-none">{format(day, "d")}</span>
              <span className="text-xs opacity-70">{format(day, "M.d")}</span>
              <span className={`text-xs mt-0.5 ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                Day {idx + 1}
              </span>
            </button>
          );
        })}
      </div>

      {/* Map */}
      <div className="rounded-2xl overflow-hidden border border-border shadow-sm relative">
        {(geocoding || isLoading) && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5 shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">지도 로딩 중...</span>
            </div>
          </div>
        )}
        <MapView
          className="w-full h-[480px]"
          initialCenter={{ lat: 35.6762, lng: 139.6503 }}
          initialZoom={13}
          onMapReady={(map) => {
            mapRef.current = map;
            setMapReady(true);
          }}
        />
      </div>

      {routeError && (
        <p className="text-xs text-muted-foreground text-center">{routeError}</p>
      )}

      {/* Place List */}
      {items && items.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            {format(new Date(selectedDate + "T00:00:00"), "M월 d일", { locale: ko })} 방문 장소
          </h3>
          <div className="space-y-1.5">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 bg-card border rounded-xl px-4 py-3 ${
                  item.visited ? "opacity-60" : ""
                }`}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: CATEGORY_COLORS[item.category ?? "place"] ?? "#3b82f6" }}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${item.visited ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {item.placeName}
                  </p>
                  {item.address && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0" />{item.address}
                    </p>
                  )}
                </div>
                {item.visitTime && (
                  <span className="text-xs text-muted-foreground shrink-0">{item.visitTime}</span>
                )}
                {item.visited && <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />}
                {idx < items.length - 1 && (
                  <Navigation className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(!items || items.length === 0) && !isLoading && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-2xl border border-dashed border-border bg-muted/30">
          <MapPin className="w-8 h-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">이 날의 방문 장소가 없습니다</p>
            <p className="text-xs text-muted-foreground mt-1">일정 탭에서 방문 장소를 추가하면 지도에 표시됩니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}

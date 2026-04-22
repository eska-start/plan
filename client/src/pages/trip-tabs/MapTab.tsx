import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MapView } from "@/components/Map";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { MapPin, Navigation, Loader2, CheckCircle2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

declare global {
  interface Window {
    L?: any;
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  place: "#6366f1",
  food: "#f97316",
  activity: "#22c55e",
  shopping: "#a855f7",
};

const CATEGORY_LABELS: Record<string, string> = {
  place: "장소",
  food: "음식",
  activity: "활동",
  shopping: "쇼핑",
};

type ItemType = {
  id: number;
  placeName: string;
  address?: string | null;
  visitTime?: string | null;
  visited?: boolean | null;
  category?: string | null;
  lat?: string | null;
  lng?: string | null;
  order?: number | null;
  sourceType?: string | null;
};

function SortableVisitItem({
  item,
  index,
  total,
}: {
  item: ItemType;
  index: number;
  total: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const color = CATEGORY_COLORS[item.category ?? "place"] ?? "#6366f1";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 bg-card border rounded-xl px-3 py-3 transition-shadow ${
        isDragging ? "shadow-lg ring-2 ring-primary/30" : ""
      } ${item.visited ? "opacity-60" : ""}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none p-0.5 shrink-0"
        aria-label="순서 변경"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
        style={{ backgroundColor: color }}
      >
        {index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${item.visited ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {item.placeName}
        </p>
        {item.address && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{item.address}</span>
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {item.visitTime && (
          <span className="text-xs text-muted-foreground">{item.visitTime}</span>
        )}
        {item.visited && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        {index < total - 1 && (
          <Navigation className="w-3.5 h-3.5 text-muted-foreground/30" />
        )}
      </div>
    </div>
  );
}

export default function MapTab({ tripId, tripDays }: { tripId: number; tripDays: Date[] }) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (tripDays.length > 0) return format(tripDays[0], "yyyy-MM-dd");
    return format(new Date(), "yyyy-MM-dd");
  });

  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any | null>(null);
  const geocacheRef = useRef<Map<string, { lat: number; lng: number }>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);

  const utils = trpc.useUtils();

  const { data: serverItems, isLoading } = trpc.itinerary.listByDate.useQuery(
    { tripId, date: selectedDate },
    { refetchInterval: 3000 }
  );

  useEffect(() => {
    setLocalOrder(null);
  }, [selectedDate, serverItems]);

  const items: ItemType[] = useMemo(() => {
    if (!serverItems) return [];
    if (!localOrder) return serverItems as ItemType[];
    const map = new Map((serverItems as ItemType[]).map(i => [i.id, i]));
    return localOrder.map(id => map.get(id)).filter((x): x is ItemType => x !== undefined);
  }, [serverItems, localOrder]);

  const reorderMutation = trpc.itinerary.reorder.useMutation({
    onSuccess: () => {
      utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
    },
    onError: () => {
      toast.error("순서 저장에 실패했습니다.");
      setLocalOrder(null);
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentIds = items.map(i => i.id);
    const oldIndex = currentIds.indexOf(active.id as number);
    const newIndex = currentIds.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(currentIds, oldIndex, newIndex);
    setLocalOrder(newOrder);

    reorderMutation.mutate(
      { tripId, orderedIds: newOrder },
      {
        onSuccess: () => {
          utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
          toast.success("방문 순서가 저장되었습니다.");
        },
      }
    );
  }, [items, reorderMutation, tripId, selectedDate, utils]);

  const clearMap = useCallback(() => {
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
  }, []);

  const geocodeAddress = useCallback(async (key: string, address: string): Promise<{ lat: number; lng: number } | null> => {
    if (geocacheRef.current.has(key)) return geocacheRef.current.get(key)!;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;
    const resp = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!resp.ok) return null;
    const rows = (await resp.json()) as Array<{ lat: string; lon: string }>;
    if (!rows?.length) return null;
    const latlng = { lat: Number(rows[0].lat), lng: Number(rows[0].lon) };
    geocacheRef.current.set(key, latlng);
    return latlng;
  }, []);

  const drawRoute = useCallback(async (positions: Array<{ lat: number; lng: number }>) => {
    if (!mapRef.current || !window.L || positions.length < 2) return;

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    try {
      const coords = positions.map(p => `${p.lng},${p.lat}`).join(";");
      const routeResp = await fetch(
        `https://router.project-osrm.org/route/v1/walking/${coords}?overview=full&geometries=geojson`
      );
      if (!routeResp.ok) throw new Error("route failed");
      const routeData = await routeResp.json() as {
        routes?: Array<{ geometry?: { coordinates: number[][] } }>;
      };
      const geometry = routeData.routes?.[0]?.geometry?.coordinates;
      if (!geometry?.length) throw new Error("empty route");

      const latLngs = geometry.map(([lng, lat]) => [lat, lng]);
      polylineRef.current = window.L.polyline(latLngs, {
        color: "#6366f1",
        weight: 4,
        opacity: 0.75,
      }).addTo(mapRef.current);
      return;
    } catch {
      const fallback = positions.map(p => [p.lat, p.lng]);
      polylineRef.current = window.L.polyline(fallback, {
        color: "#6366f1",
        weight: 3,
        opacity: 0.55,
        dashArray: "6 6",
      }).addTo(mapRef.current);
    }
  }, []);

  const renderOnMap = useCallback(async () => {
    if (!mapRef.current || !window.L || !items || items.length === 0) return;
    clearMap();
    setGeocoding(true);

    const positions: { item: ItemType; latlng: { lat: number; lng: number } }[] = [];

    for (const item of items) {
      let latlng: { lat: number; lng: number } | null = null;
      if (item.lat && item.lng) {
        latlng = { lat: Number(item.lat), lng: Number(item.lng) };
      } else if (item.address) {
        latlng = await geocodeAddress(`addr:${item.id}`, item.address);
      } else if (item.placeName) {
        latlng = await geocodeAddress(`name:${item.id}:${item.placeName}`, item.placeName);
      }
      if (latlng) positions.push({ item, latlng });
    }

    setGeocoding(false);
    if (positions.length === 0) return;

    positions.forEach(({ item, latlng }, idx) => {
      const color = CATEGORY_COLORS[item.category ?? "place"] ?? "#6366f1";

      const icon = window.L.divIcon({
        className: "custom-itinerary-marker",
        html: `<div style="
          width:28px;height:28px;border-radius:9999px;background:${item.visited ? "#9ca3af" : color};
          color:white;display:flex;align-items:center;justify-content:center;
          font-size:12px;font-weight:700;border:2px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.22)">
          ${idx + 1}
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = window.L.marker([latlng.lat, latlng.lng], { icon }).addTo(mapRef.current);
      marker.bindPopup(`
        <div style="font-family: Inter, sans-serif; padding: 4px; min-width: 150px;">
          <div style="font-weight: 700; font-size: 13px; margin-bottom: 4px; color: #1e293b;">${idx + 1}. ${item.placeName}</div>
          <div style="font-size: 11px; color: #64748b; background: ${color}20; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">${CATEGORY_LABELS[item.category ?? "place"] ?? "장소"}</div>
          ${item.visitTime ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">⏰ ${item.visitTime}</div>` : ""}
          ${item.address ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">📍 ${item.address}</div>` : ""}
        </div>
      `);
      markersRef.current.push(marker);
    });

    const bounds = window.L.latLngBounds(positions.map(p => [p.latlng.lat, p.latlng.lng]));
    mapRef.current.fitBounds(bounds.pad(0.25));
    drawRoute(positions.map(p => p.latlng));
  }, [items, clearMap, geocodeAddress, drawRoute]);

  useEffect(() => {
    geocacheRef.current.clear();
    setLocalOrder(null);
  }, [selectedDate]);

  useEffect(() => {
    if (mapReady) {
      if (items && items.length > 0) {
        renderOnMap();
      } else if (items && items.length === 0) {
        clearMap();
      }
    }
  }, [mapReady, items, renderOnMap, clearMap]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">동선 지도</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          OpenStreetMap 기반 무료 지도로 방문 순서와 동선을 확인할 수 있습니다.
        </p>
      </div>

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
          className="w-full h-[400px] sm:h-[480px]"
          initialCenter={{ lat: 35.6762, lng: 139.6503 }}
          initialZoom={13}
          onMapReady={(map) => {
            mapRef.current = map;
            setMapReady(true);
          }}
        />
      </div>

      {items && items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {format(new Date(selectedDate + "T00:00:00"), "M월 d일", { locale: ko })} 방문 순서
            </h3>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <GripVertical className="w-3.5 h-3.5" />
              드래그해서 순서 변경
            </span>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map(i => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {items.map((item, idx) => (
                  <SortableVisitItem
                    key={item.id}
                    item={item}
                    index={idx}
                    total={items.length}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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

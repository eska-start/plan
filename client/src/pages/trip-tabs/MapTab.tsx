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

// 드래그 가능한 방문 순서 아이템
function SortableVisitItem({
  item,
  index,
  total,
  onToggleVisited,
}: {
  item: ItemType;
  index: number;
  total: number;
  onToggleVisited: (item: ItemType) => void;
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
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none p-0.5 shrink-0"
        aria-label="순서 변경"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* 번호 뱃지 */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
        style={{ backgroundColor: color }}
      >
        {index + 1}
      </div>

      <input
        type="checkbox"
        checked={!!item.visited}
        onChange={() => onToggleVisited(item)}
        className="h-4 w-4 rounded border-border accent-primary shrink-0"
        aria-label="방문 완료 체크"
      />

      {/* 장소 정보 */}
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

      {/* 우측 정보 */}
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

  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const routeRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const geocacheRef = useRef<Map<string, google.maps.LatLng>>(new Map());
  const autoFittedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // 로컬 순서 상태 (드래그 즉시 반영)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);

  const utils = trpc.useUtils();

  const { data: serverItems, isLoading } = trpc.itinerary.listByDate.useQuery({ tripId, date: selectedDate });

  // 서버 데이터 수신 시 로컬 순서 초기화 (드래그 중이 아닐 때만)
  useEffect(() => {
    setLocalOrder(null);
  }, [selectedDate, serverItems]);

  // 표시할 아이템 (로컬 순서 우선)
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
  const updateItemMutation = trpc.itinerary.update.useMutation({
    onError: () => {
      toast.error("방문 상태 저장에 실패했습니다.");
      utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
    },
  });

  // dnd-kit 센서
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 드래그 종료 핸들러
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentIds = items.map(i => i.id);
    const oldIndex = currentIds.indexOf(active.id as number);
    const newIndex = currentIds.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(currentIds, oldIndex, newIndex);

    // 로컬 즉시 반영
    setLocalOrder(newOrder);

    // 서버 저장 + 일정 탭 캐시 무효화
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

  const handleToggleVisited = useCallback((item: ItemType) => {
    updateItemMutation.mutate(
      { id: item.id, visited: !item.visited },
      {
        onSuccess: () => {
          utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
        },
      }
    );
  }, [selectedDate, tripId, updateItemMutation, utils]);

  // 지도 초기화
  const clearMap = useCallback(() => {
    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];
    if (routeRendererRef.current) {
      routeRendererRef.current.setMap(null);
      routeRendererRef.current = null;
    }
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
  }, []);

  // 지오코딩 (캐시 활용)
  const geocodeAddress = useCallback(async (key: string, address: string): Promise<google.maps.LatLng | null> => {
    if (geocacheRef.current.has(key)) return geocacheRef.current.get(key)!;
    return new Promise(resolve => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          const latlng = results[0].geometry.location;
          geocacheRef.current.set(key, latlng);
          resolve(latlng);
        } else {
          resolve(null);
        }
      });
    });
  }, []);

  // 경로 그리기
  const drawRoute = useCallback((positions: google.maps.LatLng[]) => {
    if (routeRendererRef.current) {
      routeRendererRef.current.setMap(null);
      routeRendererRef.current = null;
    }
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    if (positions.length < 2 || !mapRef.current) return;

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

    const waypoints = positions.slice(1, -1).map(latlng => ({ location: latlng, stopover: false }));

    directionsService.route(
      {
        origin: positions[0],
        destination: positions[positions.length - 1],
        waypoints,
        travelMode: window.google.maps.TravelMode.WALKING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === "OK" && result) {
          renderer.setDirections(result);
        } else {
          renderer.setMap(null);
          routeRendererRef.current = null;
          // 직선 폴리라인 대체
          const polyline = new window.google.maps.Polyline({
            path: positions,
            map: mapRef.current!,
            strokeColor: "#6366f1",
            strokeWeight: 2,
            strokeOpacity: 0.6,
            icons: [{
              icon: { path: window.google.maps.SymbolPath.FORWARD_OPEN_ARROW, scale: 3 },
              offset: "50%",
            }],
          });
          polylineRef.current = polyline;
        }
      }
    );
  }, []);

  // 지도 렌더링 (items 순서 기준으로 마커 번호 부여)
  const renderOnMap = useCallback(async () => {
    if (!mapRef.current || !items || items.length === 0) return;
    clearMap();
    setGeocoding(true);

    const positions: { item: ItemType; latlng: google.maps.LatLng }[] = [];

    for (const item of items) {
      let latlng: google.maps.LatLng | null = null;
      if (item.lat && item.lng) {
        latlng = new window.google.maps.LatLng(Number(item.lat), Number(item.lng));
      } else if (item.address) {
        // 같은 주소는 캐시 공유 (item.id 대신 address 기준)
        latlng = await geocodeAddress(`addr:${item.address}`, item.address);
      } else if (item.placeName) {
        // 숙박 자동 생성 항목은 "🏨 체크인 — 호텔명" 형식이므로 호텔명만 추출해 지오코딩
        const geocodeName = item.placeName.replace(/^🏨\s*(체크인|체크아웃|숙박)\s*[—\-]\s*/, "").trim() || item.placeName;
        latlng = await geocodeAddress(`name:${geocodeName}`, geocodeName);
      }
      if (latlng) positions.push({ item, latlng });
    }

    setGeocoding(false);
    if (positions.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    positions.forEach(({ item, latlng }, idx) => {
      bounds.extend(latlng);
      const color = CATEGORY_COLORS[item.category ?? "place"] ?? "#6366f1";

      // 고정 마커 (draggable 없음)
      const el = document.createElement("div");
      el.style.cssText = `
        width: 36px; height: 36px; border-radius: 50% 50% 50% 0;
        background: ${item.visited ? "#9ca3af" : color};
        border: 2.5px solid white;
        box-shadow: 0 3px 10px rgba(0,0,0,0.25);
        display: flex; align-items: center; justify-content: center;
        transform: rotate(-45deg);
        cursor: pointer;
      `;
      const inner = document.createElement("div");
      inner.style.cssText = "transform: rotate(45deg); color: white; font-size: 12px; font-weight: 700; user-select: none;";
      inner.textContent = String(idx + 1);
      el.appendChild(inner);

      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current!,
        position: latlng,
        title: item.placeName,
        content: el,
        // gmpDraggable 없음 - 마커 고정
      });

      // 클릭 정보창
      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="font-family: Inter, sans-serif; padding: 6px 4px; min-width: 160px;">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 4px; color: #1e293b;">${idx + 1}. ${item.placeName}</div>
            <div style="font-size: 11px; color: #64748b; background: ${color}20; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">${CATEGORY_LABELS[item.category ?? "place"] ?? "장소"}</div>
            ${item.visitTime ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">⏰ ${item.visitTime}</div>` : ""}
            ${item.address ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">📍 ${item.address}</div>` : ""}
            ${item.visited ? `<div style="font-size: 11px; color: #22c55e; margin-top: 4px; font-weight: 600;">✓ 방문 완료</div>` : ""}
          </div>
        `,
      });
      marker.addListener("click", () => {
        infoWindow.open({ anchor: marker, map: mapRef.current! });
      });

      markersRef.current.push(marker);
    });

    if (!autoFittedRef.current) {
      mapRef.current.fitBounds(bounds, { top: 60, right: 40, bottom: 60, left: 40 });
      autoFittedRef.current = true;
    }
    drawRoute(positions.filter(p => !p.item.visited).map(p => p.latlng));
  }, [items, clearMap, geocodeAddress, drawRoute]);

  // 날짜 변경 시 캐시 초기화
  useEffect(() => {
    geocacheRef.current.clear();
    setLocalOrder(null);
    autoFittedRef.current = false;
  }, [selectedDate]);

  useEffect(() => {
    if (mapReady) {
      if (items && items.length > 0) {
        renderOnMap();
      } else if (items && items.length === 0) {
        clearMap();
        autoFittedRef.current = false;
      }
    }
  }, [mapReady, items, renderOnMap, clearMap]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">동선 지도</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          아래 목록에서 드래그해 방문 순서를 변경하면 지도와 일정 탭에 즉시 반영됩니다.
        </p>
      </div>

      {/* 날짜 선택 */}
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

      {/* 지도 */}
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

      {/* 방문 순서 목록 (드래그 앤 드롭) */}
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
                    onToggleVisited={handleToggleVisited}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <p className="text-xs text-muted-foreground text-center pt-1">
            순서를 변경하면 지도 마커 번호, 경로, 일정 탭이 자동으로 업데이트됩니다
          </p>
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

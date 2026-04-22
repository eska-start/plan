import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MapView } from "@/components/Map";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { MapPin, Navigation, Loader2, CheckCircle2, GripVertical, RotateCcw } from "lucide-react";
import { toast } from "sonner";

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

export default function MapTab({ tripId, tripDays }: { tripId: number; tripDays: Date[] }) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (tripDays.length > 0) return format(tripDays[0], "yyyy-MM-dd");
    return format(new Date(), "yyyy-MM-dd");
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<{ marker: google.maps.marker.AdvancedMarkerElement; itemId: number }[]>([]);
  const routeRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 로컬 순서 상태 (마커 드래그 시 즉시 반영)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);
  // 지오코딩 캐시 (재방문 시 재요청 방지)
  const geocacheRef = useRef<Map<string, google.maps.LatLng>>(new Map());
  // 현재 포지션 캐시 (마커 드래그 후 재사용)
  const positionsCacheRef = useRef<Map<number, google.maps.LatLng>>(new Map());

  const utils = trpc.useUtils();

  const { data: serverItems, isLoading } = trpc.itinerary.listByDate.useQuery(
    { tripId, date: selectedDate },
    { refetchInterval: 3000 } // 3초마다 갱신
  );

  // 서버 데이터 수신 시 로컬 순서 초기화
  useEffect(() => {
    if (serverItems) {
      setLocalOrder(null);
    }
  }, [serverItems]);

  // 표시할 아이템 (로컬 순서 우선)
  const items: ItemType[] = useMemo(() => {
    if (!serverItems) return [];
    if (!localOrder) return serverItems as ItemType[];
    const map = new Map((serverItems as ItemType[]).map(i => [i.id, i]));
    return localOrder.map(id => map.get(id)).filter((x): x is ItemType => x !== undefined);
  }, [serverItems, localOrder]);

  const reorderMutation = trpc.itinerary.reorder.useMutation({
    onSuccess: () => {
      utils.itinerary.listByDate.invalidate();
    },
    onError: () => {
      toast.error("순서 저장에 실패했습니다.");
      setLocalOrder(null);
    },
  });

  // 경로 지우기
  const clearRoute = useCallback(() => {
    if (routeRendererRef.current) {
      routeRendererRef.current.setMap(null);
      routeRendererRef.current = null;
    }
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    setRouteError(null);
  }, []);

  // 마커 지우기
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(({ marker }) => { marker.map = null; });
    markersRef.current = [];
  }, []);

  // 전체 지우기
  const clearMap = useCallback(() => {
    clearMarkers();
    clearRoute();
  }, [clearMarkers, clearRoute]);

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

  // 경로 그리기 (Directions API 또는 직선 Polyline)
  const drawRoute = useCallback((positions: { latlng: google.maps.LatLng }[]) => {
    clearRoute();
    if (positions.length < 2 || !mapRef.current) return;

    const directionsService = new window.google.maps.DirectionsService();
    const renderer = new window.google.maps.DirectionsRenderer({
      map: mapRef.current,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: "#6366f1",
        strokeWeight: 3,
        strokeOpacity: 0.75,
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
          // Directions 실패 시 직선 Polyline으로 대체
          renderer.setMap(null);
          routeRendererRef.current = null;
          const polyline = new window.google.maps.Polyline({
            path: positions.map(p => p.latlng),
            map: mapRef.current!,
            strokeColor: "#6366f1",
            strokeWeight: 2,
            strokeOpacity: 0.6,
            icons: [{ icon: { path: window.google.maps.SymbolPath.FORWARD_OPEN_ARROW, scale: 3 }, offset: "50%" }],
          });
          polylineRef.current = polyline;
        }
      }
    );
  }, [clearRoute]);

  // 마커 번호 엘리먼트 업데이트 (드래그 후 번호 갱신)
  const updateMarkerNumbers = useCallback((orderedIds: number[]) => {
    orderedIds.forEach((id, idx) => {
      const entry = markersRef.current.find(m => m.itemId === id);
      if (entry) {
        const contentEl = entry.marker.content as Element | null;
        const inner = contentEl?.querySelector?.("div") as HTMLElement | null;
        if (inner) inner.textContent = String(idx + 1);
      }
    });
  }, []);

  // 마커 생성 및 드래그 이벤트 연결
  const createMarker = useCallback((
    item: ItemType,
    latlng: google.maps.LatLng,
    idx: number,
    totalItems: number,
    onDragEnd: (itemId: number, newLatlng: google.maps.LatLng) => void
  ) => {
    const color = CATEGORY_COLORS[item.category ?? "place"] ?? "#6366f1";

    const el = document.createElement("div");
    el.style.cssText = `
      width: 36px; height: 36px; border-radius: 50% 50% 50% 0;
      background: ${item.visited ? "#9ca3af" : color};
      border: 2.5px solid white;
      box-shadow: 0 3px 10px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      transform: rotate(-45deg);
      cursor: grab;
      transition: transform 0.15s, box-shadow 0.15s;
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
      gmpDraggable: true, // 드래그 활성화
    });

    // 드래그 시작 - 마커 강조
    marker.addListener("dragstart", () => {
      setIsDragging(true);
      el.style.transform = "rotate(-45deg) scale(1.2)";
      el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)";
      el.style.zIndex = "1000";
    });

    // 드래그 중 - 실시간 경로 업데이트 (throttle)
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    marker.addListener("drag", () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        // 현재 마커들의 위치로 실시간 경로 재계산
        const currentPositions = markersRef.current.map(({ marker: m }) => ({
          latlng: m.position as google.maps.LatLng,
        }));
        if (currentPositions.length >= 2) {
          drawRoute(currentPositions);
        }
      }, 200);
    });

    // 드래그 종료 - 순서 재계산 및 저장
    marker.addListener("dragend", () => {
      el.style.transform = "rotate(-45deg) scale(1)";
      el.style.boxShadow = "0 3px 10px rgba(0,0,0,0.3)";
      setIsDragging(false);
      const newPos = marker.position as google.maps.LatLng;
      onDragEnd(item.id, newPos);
    });

    // 클릭 - 정보창
    const infoWindow = new window.google.maps.InfoWindow({
      content: `
        <div style="font-family: Inter, sans-serif; padding: 6px 4px; min-width: 160px;">
          <div style="font-weight: 700; font-size: 13px; margin-bottom: 4px; color: #1e293b;">${idx + 1}. ${item.placeName}</div>
          <div style="font-size: 11px; color: #64748b; background: ${color}20; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">${CATEGORY_LABELS[item.category ?? "place"] ?? "장소"}</div>
          ${item.visitTime ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">⏰ ${item.visitTime}</div>` : ""}
          ${item.address ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">📍 ${item.address}</div>` : ""}
          ${item.visited ? `<div style="font-size: 11px; color: #22c55e; margin-top: 4px; font-weight: 600;">✓ 방문 완료</div>` : ""}
          <div style="font-size: 10px; color: #94a3b8; margin-top: 6px; border-top: 1px solid #f1f5f9; padding-top: 4px;">마커를 드래그해서 순서를 변경하세요</div>
        </div>
      `,
    });

    marker.addListener("click", () => {
      infoWindow.open({ anchor: marker, map: mapRef.current! });
    });

    return marker;
  }, [drawRoute]);

  // 지도에 전체 렌더링
  const renderOnMap = useCallback(async () => {
    if (!mapRef.current || !items || items.length === 0) return;
    clearMap();
    setGeocoding(true);

    const positions: { item: ItemType; latlng: google.maps.LatLng }[] = [];

    for (const item of items) {
      let latlng: google.maps.LatLng | null = null;

      // 캐시된 위치 우선 사용
      if (positionsCacheRef.current.has(item.id)) {
        latlng = positionsCacheRef.current.get(item.id)!;
      } else if (item.lat && item.lng) {
        latlng = new window.google.maps.LatLng(Number(item.lat), Number(item.lng));
        positionsCacheRef.current.set(item.id, latlng);
      } else if (item.address) {
        latlng = await geocodeAddress(`addr:${item.id}`, item.address);
        if (latlng) positionsCacheRef.current.set(item.id, latlng);
      } else if (item.placeName) {
        latlng = await geocodeAddress(`name:${item.id}:${item.placeName}`, item.placeName);
        if (latlng) positionsCacheRef.current.set(item.id, latlng);
      }

      if (latlng) positions.push({ item, latlng });
    }

    setGeocoding(false);
    if (positions.length === 0) return;

    // 드래그 종료 핸들러
    const handleDragEnd = (draggedItemId: number, newLatlng: google.maps.LatLng) => {
      // 드래그된 마커의 새 위치를 캐시에 저장
      positionsCacheRef.current.set(draggedItemId, newLatlng);

      // 현재 localOrder 또는 items 기준으로 현재 순서 파악
      const currentOrderedIds = (localOrder ?? items.map(i => i.id));
      const currentIdx = currentOrderedIds.indexOf(draggedItemId);

      // 드래그된 마커를 제외한 나머지 마커들의 위치 (현재 순서 유지)
      const othersInOrder = currentOrderedIds
        .filter(id => id !== draggedItemId)
        .map(id => ({
          itemId: id,
          pos: positionsCacheRef.current.get(id),
        }))
        .filter((m): m is { itemId: number; pos: google.maps.LatLng } => m.pos !== undefined);

      // 드래그된 마커의 새 위치와 나머지 마커들의 위치를 비교해 삽입 위치 결정
      // 지도 projection을 이용해 픽셀 좌표로 변환 후 x 기준 정렬
      let insertIdx = othersInOrder.length; // 기본: 마지막
      if (mapRef.current) {
        const projection = mapRef.current.getProjection();
        if (projection) {
          const draggedPoint = projection.fromLatLngToPoint(newLatlng);
          if (draggedPoint) {
            // 나머지 마커들을 x 좌표 기준으로 정렬된 상태에서 삽입 위치 찾기
            const othersWithPixel = othersInOrder
              .map(m => ({ ...m, point: projection.fromLatLngToPoint(m.pos) }))
              .filter(m => m.point !== null);

            // 드래그 마커보다 x가 작은 마커 수 = 삽입 인덱스
            insertIdx = othersWithPixel.filter(m => m.point!.x < draggedPoint.x).length;
          }
        }
      }

      // 새 순서 배열 생성
      const newOrder = [...othersInOrder.map(m => m.itemId)];
      newOrder.splice(insertIdx, 0, draggedItemId);

      // 로컬 순서 즉시 업데이트
      setLocalOrder(newOrder);

      // 마커 번호 업데이트
      updateMarkerNumbers(newOrder);

      // 경로 재계산
      const newPositions = newOrder.map(id => {
        const pos = positionsCacheRef.current.get(id);
        return pos ? { latlng: pos } : null;
      }).filter((p): p is { latlng: google.maps.LatLng } => p !== null);
      if (newPositions.length >= 2) drawRoute(newPositions);

      // 서버에 저장 + 일정 탭 캐시 즉시 무효화
      reorderMutation.mutate(
        { tripId, orderedIds: newOrder },
        {
          onSuccess: () => {
            // 일정 탭 쿼리 캐시 즉시 무효화 → 3초 폴링 전에도 즉시 반영
            utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
          },
        }
      );
      toast.success("순서가 저장되었습니다.");
    };

    // 마커 생성
    const bounds = new window.google.maps.LatLngBounds();
    positions.forEach(({ item, latlng }, idx) => {
      bounds.extend(latlng);
      const marker = createMarker(item, latlng, idx, positions.length, handleDragEnd);
      markersRef.current.push({ marker, itemId: item.id });
    });

    mapRef.current.fitBounds(bounds, { top: 60, right: 40, bottom: 60, left: 40 });

    // 경로 그리기
    drawRoute(positions.map(p => ({ latlng: p.latlng })));
  }, [items, clearMap, geocodeAddress, createMarker, drawRoute, updateMarkerNumbers, reorderMutation, tripId]);

  // 날짜 변경 시 캐시 초기화
  useEffect(() => {
    positionsCacheRef.current.clear();
    setLocalOrder(null);
  }, [selectedDate]);

  useEffect(() => {
    if (mapReady && items && items.length > 0) {
      renderOnMap();
    } else if (mapReady && items && items.length === 0) {
      clearMap();
    }
  }, [mapReady, items, renderOnMap, clearMap]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">동선 지도</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            마커를 드래그해서 방문 순서를 변경하세요. 동선과 일정이 실시간으로 반영됩니다.
          </p>
        </div>
        {isDragging && (
          <div className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-lg px-3 py-1.5 text-xs font-medium shrink-0">
            <GripVertical className="w-3.5 h-3.5" />
            드래그 중...
          </div>
        )}
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
        {/* 드래그 힌트 오버레이 */}
        {items && items.length > 0 && !geocoding && !isLoading && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm flex items-center gap-1.5">
              <GripVertical className="w-3 h-3" />
              마커를 드래그해서 순서 변경
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

      {/* Place List - 현재 순서 표시 */}
      {items && items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {format(new Date(selectedDate + "T00:00:00"), "M월 d일", { locale: ko })} 방문 순서
            </h3>
            {localOrder && (
              <button
                onClick={() => {
                  setLocalOrder(null);
                  positionsCacheRef.current.clear();
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                초기화
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 bg-card border rounded-xl px-4 py-3 transition-all ${
                  item.visited ? "opacity-60" : ""
                } ${isDragging ? "pointer-events-none" : ""}`}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
                  style={{ backgroundColor: CATEGORY_COLORS[item.category ?? "place"] ?? "#6366f1" }}
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
                <div className="flex items-center gap-2 shrink-0">
                  {item.visitTime && (
                    <span className="text-xs text-muted-foreground">{item.visitTime}</span>
                  )}
                  {item.visited && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {idx < items.length - 1 && (
                    <Navigation className="w-3.5 h-3.5 text-muted-foreground/40" />
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center pt-1">
            지도의 마커를 드래그하면 위 목록과 일정 탭 순서가 자동으로 변경됩니다
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

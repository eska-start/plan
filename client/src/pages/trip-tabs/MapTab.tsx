import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MapView, loadMapScript } from "@/components/Map";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  MapPin, Navigation, Loader2, CheckCircle2, GripVertical,
  Plus, Sparkles, FileText, Camera, FolderOpen, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

const CATEGORIES = [
  { value: "place", label: "장소" },
  { value: "food", label: "식사" },
  { value: "activity", label: "액티비티" },
  { value: "shopping", label: "쇼핑" },
];

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

type FormData = {
  date: string; placeName: string; address: string; visitTime: string;
  duration: string; memo: string; category: string; lat: string; lng: string;
};

type AiItem = {
  date: string | null; placeName: string; visitTime: string | null;
  category: string; memo: string | null; address: string | null; selected: boolean;
};

// 이미지 리사이즈
async function resizeImageToBase64(file: File): Promise<string> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  return new Promise<string>((resolve, reject) => {
    img.onload = () => {
      const MAX = 1400; let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const c = document.createElement("canvas"); c.width = width; c.height = height;
      c.getContext("2d")!.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = reject; img.src = url;
  });
}

// 드래그 가능한 방문 순서 아이템
function SortableVisitItem({ item, index, total }: { item: ItemType; index: number; total: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : undefined };
  const color = CATEGORY_COLORS[item.category ?? "place"] ?? "#6366f1";

  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-center gap-3 bg-card border rounded-xl px-3 py-3 transition-shadow ${isDragging ? "shadow-lg ring-2 ring-primary/30" : ""} ${item.visited ? "opacity-60" : ""}`}
    >
      <button {...attributes} {...listeners}
        className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none p-0.5 shrink-0"
        aria-label="순서 변경"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm" style={{ backgroundColor: color }}>
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${item.visited ? "line-through text-muted-foreground" : "text-foreground"}`}>{item.placeName}</p>
        {item.address && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{item.address}</span>
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.visitTime && <span className="text-xs text-muted-foreground">{item.visitTime}</span>}
        {item.visited && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        {index < total - 1 && <Navigation className="w-3.5 h-3.5 text-muted-foreground/30" />}
      </div>
    </div>
  );
}

export default function MapTab({ tripId, tripDays }: { tripId: number; tripDays: Date[] }) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (tripDays.length > 0) return format(tripDays[0], "yyyy-MM-dd");
    return format(new Date(), "yyyy-MM-dd");
  });

  const tripStartDate = tripDays[0] ? format(tripDays[0], "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const routeRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const geocacheRef = useRef<Map<string, google.maps.LatLng>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // 로컬 순서 상태 (드래그 즉시 반영)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);

  // ── 일정 추가 다이얼로그 ──
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormData>({
    date: tripStartDate, placeName: "", address: "", visitTime: "",
    duration: "", memo: "", category: "place", lat: "", lng: "",
  });
  const placeInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // ── AI 패널 (버튼 클릭으로 열리는 큰 패널) ──
  const [aiMode, setAiMode] = useState<"text" | "image" | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiItems, setAiItems] = useState<AiItem[]>([]);
  const aiCameraRef = useRef<HTMLInputElement>(null);
  const aiPhotoRef = useRef<HTMLInputElement>(null);

  // ── 다이얼로그 내부 AI ──
  const [dialogAiMode, setDialogAiMode] = useState<"text" | "image" | null>(null);
  const [dialogAiText, setDialogAiText] = useState("");
  const [dialogAiLoading, setDialogAiLoading] = useState(false);
  const dialogAiCameraRef = useRef<HTMLInputElement>(null);
  const dialogAiPhotoRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: serverItems, isLoading } = trpc.itinerary.listByDate.useQuery(
    { tripId, date: selectedDate },
    { refetchInterval: 3000 }
  );

  const createMutation = trpc.itinerary.create.useMutation({
    onSuccess: () => {
      utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
      utils.itinerary.listByTrip.invalidate({ tripId });
      setDialogOpen(false);
      setForm(f => ({ ...f, placeName: "", address: "", visitTime: "", duration: "", memo: "", lat: "", lng: "" }));
      toast.success("장소가 추가됐습니다.");
    },
    onError: () => toast.error("장소 추가에 실패했습니다."),
  });

  const aiExtractMutation = trpc.itinerary.aiExtract.useMutation();
  const aiExtractImageMutation = trpc.itinerary.aiExtractFromImage.useMutation();

  // 서버 데이터 수신 시 로컬 순서 초기화
  useEffect(() => { setLocalOrder(null); }, [selectedDate, serverItems]);

  const items: ItemType[] = useMemo(() => {
    if (!serverItems) return [];
    if (!localOrder) return serverItems as ItemType[];
    const map = new Map((serverItems as ItemType[]).map(i => [i.id, i]));
    return localOrder.map(id => map.get(id)).filter((x): x is ItemType => x !== undefined);
  }, [serverItems, localOrder]);

  const reorderMutation = trpc.itinerary.reorder.useMutation({
    onSuccess: () => { utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate }); },
    onError: () => { toast.error("순서 저장에 실패했습니다."); setLocalOrder(null); },
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
    reorderMutation.mutate({ tripId, orderedIds: newOrder }, {
      onSuccess: () => {
        utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
        toast.success("방문 순서가 저장되었습니다.");
      },
    });
  }, [items, reorderMutation, tripId, selectedDate, utils]);

  // Google Places Autocomplete
  useEffect(() => {
    if (!dialogOpen) return;
    let destroyed = false;
    async function init() {
      if (!window.google?.maps?.places) await loadMapScript();
      if (destroyed || !placeInputRef.current || !window.google?.maps?.places) return;
      if (autocompleteRef.current) window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      const ac = new window.google.maps.places.Autocomplete(placeInputRef.current, { fields: ["name", "formatted_address", "geometry"] });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place) return;
        setForm(f => ({
          ...f,
          placeName: place.name ?? f.placeName,
          address: place.formatted_address ?? f.address,
          lat: place.geometry?.location?.lat().toString() ?? f.lat,
          lng: place.geometry?.location?.lng().toString() ?? f.lng,
        }));
      });
      autocompleteRef.current = ac;
    }
    init();
    return () => {
      destroyed = true;
      if (autocompleteRef.current && window.google?.maps) window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
    };
  }, [dialogOpen]);

  // ── 지도 렌더링 ──
  const clearMap = useCallback(() => {
    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];
    if (routeRendererRef.current) { routeRendererRef.current.setMap(null); routeRendererRef.current = null; }
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
  }, []);

  const geocodeAddress = useCallback(async (key: string, address: string): Promise<google.maps.LatLng | null> => {
    if (geocacheRef.current.has(key)) return geocacheRef.current.get(key)!;
    return new Promise(resolve => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          const latlng = results[0].geometry.location;
          geocacheRef.current.set(key, latlng);
          resolve(latlng);
        } else { resolve(null); }
      });
    });
  }, []);

  const drawRoute = useCallback((positions: google.maps.LatLng[]) => {
    if (routeRendererRef.current) { routeRendererRef.current.setMap(null); routeRendererRef.current = null; }
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
    if (positions.length < 2 || !mapRef.current) return;

    const directionsService = new window.google.maps.DirectionsService();
    const renderer = new window.google.maps.DirectionsRenderer({
      map: mapRef.current,
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#6366f1", strokeWeight: 3, strokeOpacity: 0.7 },
    });
    routeRendererRef.current = renderer;

    const waypoints = positions.slice(1, -1).map(latlng => ({ location: latlng, stopover: false }));
    directionsService.route(
      { origin: positions[0], destination: positions[positions.length - 1], waypoints, travelMode: window.google.maps.TravelMode.WALKING, optimizeWaypoints: false },
      (result, status) => {
        if (status === "OK" && result) {
          renderer.setDirections(result);
        } else {
          renderer.setMap(null); routeRendererRef.current = null;
          const polyline = new window.google.maps.Polyline({
            path: positions, map: mapRef.current!, strokeColor: "#6366f1", strokeWeight: 2, strokeOpacity: 0.6,
            icons: [{ icon: { path: window.google.maps.SymbolPath.FORWARD_OPEN_ARROW, scale: 3 }, offset: "50%" }],
          });
          polylineRef.current = polyline;
        }
      }
    );
  }, []);

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
        // 같은 주소는 캐시 공유
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
      const el = document.createElement("div");
      el.style.cssText = `width:36px;height:36px;border-radius:50% 50% 50% 0;background:${item.visited ? "#9ca3af" : color};border:2.5px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;transform:rotate(-45deg);cursor:pointer;`;
      const inner = document.createElement("div");
      inner.style.cssText = "transform:rotate(45deg);color:white;font-size:12px;font-weight:700;user-select:none;";
      inner.textContent = String(idx + 1);
      el.appendChild(inner);

      const marker = new window.google.maps.marker.AdvancedMarkerElement({ map: mapRef.current!, position: latlng, title: item.placeName, content: el });
      const infoWindow = new window.google.maps.InfoWindow({
        content: `<div style="font-family:Inter,sans-serif;padding:6px 4px;min-width:160px;"><div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#1e293b;">${idx + 1}. ${item.placeName}</div><div style="font-size:11px;color:#64748b;background:${color}20;padding:2px 6px;border-radius:4px;display:inline-block;margin-bottom:4px;">${CATEGORY_LABELS[item.category ?? "place"] ?? "장소"}</div>${item.visitTime ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">⏰ ${item.visitTime}</div>` : ""}${item.address ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">📍 ${item.address}</div>` : ""}${item.visited ? `<div style="font-size:11px;color:#22c55e;margin-top:4px;font-weight:600;">✓ 방문 완료</div>` : ""}</div>`,
      });
      marker.addListener("click", () => infoWindow.open({ anchor: marker, map: mapRef.current! }));
      markersRef.current.push(marker);
    });

    mapRef.current.fitBounds(bounds, { top: 60, right: 40, bottom: 60, left: 40 });
    drawRoute(positions.map(p => p.latlng));
  }, [items, clearMap, geocodeAddress, drawRoute]);

  useEffect(() => { geocacheRef.current.clear(); setLocalOrder(null); }, [selectedDate]);

  useEffect(() => {
    if (mapReady) {
      if (items && items.length > 0) renderOnMap();
      else if (items && items.length === 0) clearMap();
    }
  }, [mapReady, items, renderOnMap, clearMap]);

  // ── 다이얼로그 열기 ──
  function openDialog() {
    setForm({ date: selectedDate, placeName: "", address: "", visitTime: "", duration: "", memo: "", category: "place", lat: "", lng: "" });
    setDialogAiMode(null);
    setDialogAiText("");
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.placeName.trim()) { toast.error("장소명을 입력하세요."); return; }
    createMutation.mutate({
      tripId, date: form.date,
      placeName: form.placeName,
      address: form.address || undefined,
      visitTime: form.visitTime || undefined,
      duration: form.duration ? parseInt(form.duration) : undefined,
      memo: form.memo || undefined,
      category: form.category,
      lat: form.lat || undefined,
      lng: form.lng || undefined,
      order: (serverItems?.length ?? 0),
    });
  }

  // ── 다이얼로그 내부 AI ──
  async function handleDialogAiText() {
    if (!dialogAiText.trim()) return;
    setDialogAiLoading(true);
    try {
      const res = await aiExtractMutation.mutateAsync({ tripId, text: dialogAiText, tripStartDate });
      const first = (res.items as Array<Record<string, unknown>>)[0];
      if (!first) { toast.error("정보를 찾지 못했습니다."); return; }
      setForm(f => ({
        ...f,
        placeName: (first.placeName as string) || f.placeName,
        address: (first.address as string) || f.address,
        visitTime: (first.visitTime as string) || f.visitTime,
        category: (first.category as string) || f.category,
        memo: (first.memo as string) || f.memo,
      }));
      setDialogAiMode(null); setDialogAiText("");
      toast.success("정보가 자동으로 입력됐습니다. 확인 후 수정해주세요.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg.includes("LLM_API_KEY") ? "LLM_API_KEY가 필요합니다." : "AI 분석 실패");
    } finally { setDialogAiLoading(false); }
  }

  async function handleDialogAiImage(file: File) {
    setDialogAiLoading(true);
    try {
      const b64 = await resizeImageToBase64(file);
      const res = await aiExtractImageMutation.mutateAsync({ tripId, imageBase64: b64, tripStartDate });
      const first = (res.items as Array<Record<string, unknown>>)[0];
      if (!first) { toast.error("정보를 찾지 못했습니다."); return; }
      setForm(f => ({
        ...f,
        placeName: (first.placeName as string) || f.placeName,
        address: (first.address as string) || f.address,
        visitTime: (first.visitTime as string) || f.visitTime,
        category: (first.category as string) || f.category,
        memo: (first.memo as string) || f.memo,
      }));
      setDialogAiMode(null);
      toast.success("정보가 자동으로 입력됐습니다. 확인 후 수정해주세요.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg.includes("LLM_API_KEY") ? "LLM_API_KEY가 필요합니다." : "이미지 분석 실패");
    } finally { setDialogAiLoading(false); }
  }

  // ── 헤더 AI 패널 ──
  async function handleAiText() {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const res = await aiExtractMutation.mutateAsync({ tripId, text: aiText, tripStartDate });
      const items = (res.items as Array<Record<string, unknown>>).map(i => ({
        date: (i.date as string | null) ?? null, placeName: (i.placeName as string) ?? "",
        visitTime: (i.visitTime as string | null) ?? null, category: (i.category as string) ?? "place",
        memo: (i.memo as string | null) ?? null, address: (i.address as string | null) ?? null, selected: true,
      }));
      if (!items.length) { toast.error("일정 정보를 찾지 못했습니다."); return; }
      setAiItems(items);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg.includes("LLM_API_KEY") ? "LLM_API_KEY가 필요합니다." : "AI 분석 실패");
    } finally { setAiLoading(false); }
  }

  async function handleAiImage(file: File) {
    setAiLoading(true);
    try {
      const b64 = await resizeImageToBase64(file);
      const res = await aiExtractImageMutation.mutateAsync({ tripId, imageBase64: b64, tripStartDate });
      const items = (res.items as Array<Record<string, unknown>>).map(i => ({
        date: (i.date as string | null) ?? null, placeName: (i.placeName as string) ?? "",
        visitTime: (i.visitTime as string | null) ?? null, category: (i.category as string) ?? "place",
        memo: (i.memo as string | null) ?? null, address: (i.address as string | null) ?? null, selected: true,
      }));
      if (!items.length) { toast.error("일정 정보를 찾지 못했습니다."); return; }
      setAiItems(items);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg.includes("LLM_API_KEY") ? "LLM_API_KEY가 필요합니다." : "이미지 분석 실패");
    } finally { setAiLoading(false); }
  }

  async function handleAiSave() {
    const toSave = aiItems.filter(i => i.selected && i.placeName);
    for (const item of toSave) {
      await createMutation.mutateAsync({
        tripId, date: item.date ?? selectedDate,
        placeName: item.placeName, visitTime: item.visitTime ?? undefined,
        category: item.category, memo: item.memo ?? undefined,
        address: item.address ?? undefined, order: 0,
      });
    }
    toast.success(`${toSave.length}개 일정이 추가됐습니다.`);
    setAiItems([]); setAiMode(null); setAiText("");
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">동선 지도</h2>
          <p className="text-sm text-muted-foreground mt-0.5">드래그해서 방문 순서를 변경하면 지도와 일정 탭에 즉시 반영됩니다.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm" variant="outline"
            className="gap-1.5"
            onClick={() => { setAiMode(aiMode ? null : "text"); setAiItems([]); }}
          >
            <Sparkles className="w-3.5 h-3.5" />AI 입력
          </Button>
          <Button size="sm" className="gap-1.5" onClick={openDialog}>
            <Plus className="w-3.5 h-3.5" />일정 추가
          </Button>
        </div>
      </div>

      {/* AI 패널 */}
      {aiMode && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button onClick={() => setAiMode("text")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${aiMode === "text" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                <FileText className="w-3.5 h-3.5" />텍스트
              </button>
              <button onClick={() => setAiMode("image")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${aiMode === "image" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                <Camera className="w-3.5 h-3.5" />이미지
              </button>
            </div>
            <button onClick={() => { setAiMode(null); setAiItems([]); setAiText(""); }}>
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {aiLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> AI 분석 중…
            </div>
          ) : aiItems.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">저장할 항목을 선택하세요.</p>
              {aiItems.map((item, i) => (
                <div key={i}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${item.selected ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}
                  onClick={() => setAiItems(prev => prev.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                >
                  <input type="checkbox" checked={item.selected} readOnly className="mt-0.5 accent-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.placeName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{[item.date, item.visitTime].filter(Boolean).join(" · ")}</p>
                    {item.address && <p className="text-xs text-muted-foreground truncate">{item.address}</p>}
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setAiItems([])} className="flex-1">다시 입력</Button>
                <Button size="sm" onClick={handleAiSave} disabled={!aiItems.some(i => i.selected) || createMutation.isPending} className="flex-1">저장</Button>
              </div>
            </div>
          ) : aiMode === "text" ? (
            <>
              <textarea
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none h-28 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="일정을 입력하세요. 예: '5월 24일 오후 2시 닛폰다이라 로프웨이, 5월 25일 오전 마키노하라 차밭'"
                value={aiText} onChange={e => setAiText(e.target.value)}
              />
              <Button size="sm" onClick={handleAiText} disabled={!aiText.trim()} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />분석하기
              </Button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => aiCameraRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors flex-col">
                  <Camera className="w-5 h-5" />카메라 촬영
                </button>
                <button onClick={() => aiPhotoRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-colors flex-col">
                  <FolderOpen className="w-5 h-5" />사진 선택
                </button>
              </div>
              <p className="text-xs text-muted-foreground text-center">예약 확인서·티켓 사진을 올리면 AI가 자동으로 정보를 입력합니다</p>
              <input ref={aiCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAiImage(f); e.target.value = ""; }} />
              <input ref={aiPhotoRef} type="file" accept="image/*,image/heic,image/heif" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAiImage(f); e.target.value = ""; }} />
            </>
          )}
        </div>
      )}

      {/* 날짜 선택 */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {tripDays.map((day, idx) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isSelected = selectedDate === dateStr;
          return (
            <button key={dateStr} onClick={() => setSelectedDate(dateStr)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl border transition-all shrink-0 ${isSelected ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/30 hover:bg-muted/50"}`}
            >
              <span className="text-xs font-medium">{format(day, "EEE", { locale: ko })}</span>
              <span className="text-lg font-bold leading-none">{format(day, "d")}</span>
              <span className="text-xs opacity-70">{format(day, "M.d")}</span>
              <span className={`text-xs mt-0.5 ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>Day {idx + 1}</span>
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
        <MapView className="w-full h-[400px] sm:h-[480px]" initialCenter={{ lat: 35.6762, lng: 139.6503 }} initialZoom={13}
          onMapReady={(map) => { mapRef.current = map; setMapReady(true); }} />
      </div>

      {/* 방문 순서 목록 */}
      {items && items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {format(new Date(selectedDate + "T00:00:00"), "M월 d일", { locale: ko })} 방문 순서
            </h3>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <GripVertical className="w-3.5 h-3.5" />드래그해서 순서 변경
            </span>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {items.map((item, idx) => (
                  <SortableVisitItem key={item.id} item={item} index={idx} total={items.length} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <p className="text-xs text-muted-foreground text-center pt-1">순서를 변경하면 지도 마커 번호, 경로, 일정 탭이 자동으로 업데이트됩니다</p>
        </div>
      )}

      {(!items || items.length === 0) && !isLoading && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-2xl border border-dashed border-border bg-muted/30">
          <MapPin className="w-8 h-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">이 날의 방문 장소가 없습니다</p>
            <p className="text-xs text-muted-foreground mt-1">아래 버튼이나 위 버튼으로 장소를 추가하세요.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setAiMode("text"); setAiItems([]); }}>
              <Sparkles className="w-3.5 h-3.5" />AI 입력
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openDialog}>
              <Plus className="w-3.5 h-3.5" />직접 추가
            </Button>
          </div>
        </div>
      )}

      {/* 일정 추가 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-5 sm:p-6">
          <DialogHeader className="mb-1">
            <DialogTitle className="text-lg font-semibold">장소 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 max-h-[70vh] overflow-y-auto">
            {/* 다이얼로그 내 AI 자동 입력 */}
            <div>
              {dialogAiMode === null ? (
                <button type="button" onClick={() => setDialogAiMode("text")}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                  <Sparkles className="w-3.5 h-3.5" /> AI 자동 입력
                </button>
              ) : (
                <div className="rounded-xl border bg-muted/30 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-0.5 p-0.5 bg-muted rounded-lg">
                      <button onClick={() => setDialogAiMode("text")} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${dialogAiMode === "text" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                        <FileText className="w-3 h-3" />텍스트
                      </button>
                      <button onClick={() => setDialogAiMode("image")} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${dialogAiMode === "image" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                        <Camera className="w-3 h-3" />이미지
                      </button>
                    </div>
                    <button type="button" onClick={() => { setDialogAiMode(null); setDialogAiText(""); }}>
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  {dialogAiLoading ? (
                    <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI 분석 중…
                    </div>
                  ) : dialogAiMode === "text" ? (
                    <div className="space-y-2">
                      <textarea
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="예: 5월 24일 오후 2시 아사쿠사 센소지 방문"
                        value={dialogAiText} onChange={e => setDialogAiText(e.target.value)}
                      />
                      <Button size="sm" onClick={handleDialogAiText} disabled={!dialogAiText.trim()} className="gap-1.5 w-full">
                        <Sparkles className="w-3.5 h-3.5" />분석하기
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => dialogAiCameraRef.current?.click()}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                        <Camera className="w-3.5 h-3.5" />카메라
                      </button>
                      <button type="button" onClick={() => dialogAiPhotoRef.current?.click()}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-colors">
                        <FolderOpen className="w-3.5 h-3.5" />사진 선택
                      </button>
                      <input ref={dialogAiCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleDialogAiImage(f); e.target.value = ""; }} />
                      <input ref={dialogAiPhotoRef} type="file" accept="image/*,image/heic,image/heif" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleDialogAiImage(f); e.target.value = ""; }} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 날짜 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">날짜</Label>
              <Select value={form.date} onValueChange={v => setForm(f => ({ ...f, date: v }))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tripDays.map((day, idx) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    return (
                      <SelectItem key={dateStr} value={dateStr}>
                        {format(day, "M월 d일 (EEE)", { locale: ko })} · Day {idx + 1}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* 카테고리 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">카테고리</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* 장소명 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">장소명 <span className="text-destructive">*</span></Label>
              <Input ref={placeInputRef} className="h-10" placeholder="장소를 검색하세요" value={form.placeName}
                onChange={e => setForm(f => ({ ...f, placeName: e.target.value, lat: "", lng: "" }))} />
              {form.lat && form.lng && <p className="text-xs text-green-600 flex items-center gap-1"><MapPin className="w-3 h-3" />위치 좌표 저장됨</p>}
            </div>

            {/* 주소 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">주소</Label>
              <Input className="h-10" placeholder="자동 입력되거나 직접 입력" value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>

            {/* 방문 시간 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">방문 시간</Label>
              <Input className="h-10 w-full" type="time" value={form.visitTime}
                onChange={e => setForm(f => ({ ...f, visitTime: e.target.value }))} />
            </div>

            {/* 소요 시간 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">소요 (분)</Label>
              <Input className="h-10 w-full" type="number" placeholder="60" value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} />
            </div>

            {/* 메모 */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">메모</Label>
              <Textarea className="resize-none" placeholder="방문 메모..." value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={2} />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              추가
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

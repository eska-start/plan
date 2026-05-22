import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MapView, loadMapScript } from "@/components/Map";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  MapPin, Navigation, Loader2, CheckCircle2, GripVertical,
  Plus, Sparkles, FileText, Camera, FolderOpen, X, Pencil, Trash2, Circle, Map as MapIcon,
  EyeOff, RotateCcw, Clock, StickyNote, Car, PersonStanding, Hotel, Archive, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

function makeSvg(paths: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "12"); svg.setAttribute("height", "12");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "#6b7280"); svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
  svg.style.flexShrink = "0";
  svg.innerHTML = paths;
  return svg;
}
function buildInfoWindowEl(item: { placeName: string; category?: string | null; visitTime?: string | null; address?: string | null; visited?: boolean | null }, idx: number, color: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "font-family:Inter,sans-serif;padding:6px 4px;min-width:160px;";

  const title = document.createElement("div");
  title.style.cssText = "font-weight:700;font-size:13px;margin-bottom:4px;color:#1e293b;";
  title.textContent = `${idx + 1}. ${item.placeName.replace(/^🏨\s*/, "")}`;
  wrap.appendChild(title);

  const cat = document.createElement("div");
  cat.style.cssText = `font-size:11px;color:#64748b;background:${color}20;padding:2px 6px;border-radius:4px;display:inline-block;margin-bottom:4px;`;
  cat.textContent = CATEGORY_LABELS[item.category ?? "place"] ?? "장소";
  wrap.appendChild(cat);

  if (item.visitTime) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px;color:#6b7280;margin-top:2px;";
    row.appendChild(makeSvg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 12"/>'));
    row.appendChild(document.createTextNode(item.visitTime));
    wrap.appendChild(row);
  }

  if (item.address) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px;color:#6b7280;margin-top:2px;";
    row.appendChild(makeSvg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'));
    row.appendChild(document.createTextNode(item.address));
    wrap.appendChild(row);
  }

  if (item.visited) {
    const v = document.createElement("div");
    v.style.cssText = "font-size:11px;color:#22c55e;margin-top:4px;font-weight:600;";
    v.textContent = "✓ 방문 완료";
    wrap.appendChild(v);
  }

  return wrap;
}

type ItemType = {
  id: number;
  date?: string | null;
  placeName: string;
  address?: string | null;
  visitTime?: string | null;
  visited?: boolean | null;
  category?: string | null;
  lat?: string | null;
  lng?: string | null;
  order?: number | null;
  sourceType?: string | null;
  memo?: string | null;
};

type FormData = {
  date: string; placeName: string; address: string; visitTime: string;
  duration: string; memo: string; category: string; lat: string; lng: string; sourceType: "manual" | "pool";
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
function SortableVisitItem({
  item, index, total, onEdit, onDelete, onToggleVisited, onFocusMap, isExcluded, onToggleExclude, onMoveToPool,
}: {
  item: ItemType; index: number; total: number;
  onEdit: (item: ItemType) => void;
  onDelete: (item: ItemType) => void;
  onToggleVisited: (item: ItemType) => void;
  onFocusMap: (item: ItemType) => void;
  isExcluded: boolean;
  onToggleExclude: (id: number) => void;
  onMoveToPool: (item: ItemType) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const dndStyle = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined };
  const color = CATEGORY_COLORS[item.category ?? "place"] ?? "#6366f1";
  const isAccommodation = item.sourceType === "accommodation";

  // 낙관적 방문 상태 — 버튼 누를 때 즉시 반영
  const [optimisticVisited, setOptimisticVisited] = useState(!!item.visited);
  useEffect(() => { setOptimisticVisited(!!item.visited); }, [item.visited]);

  function handleToggle() {
    setOptimisticVisited(v => !v);
    onToggleVisited(item);
  }

  // 스와이프 — 경로 임시 제외/복원 토글 (터치 + 마우스 포인터 공통)
  const swipeXRef = useRef(0); // 실제 값 (클로저 트랩 방지)
  const [swipeX, setSwipeX] = useState(0); // 시각적 애니메이션용
  const touchRef = useRef<{ x: number; y: number; horiz: boolean } | null>(null);
  const pointerRef = useRef<{ x: number; y: number; horiz: boolean; id: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]!;
    touchRef.current = { x: t.clientX, y: t.clientY, horiz: false };
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!touchRef.current) return;
    const t = e.touches[0]!;
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (!touchRef.current.horiz) {
      if (Math.abs(dy) > 12) { touchRef.current = null; swipeXRef.current = 0; setSwipeX(0); return; }
      if (Math.abs(dx) > 8) touchRef.current.horiz = true;
      else return;
    }
    const newX = dx < 0 ? Math.max(dx, -100) : 0;
    swipeXRef.current = newX;
    setSwipeX(newX);
  }
  function onTouchEnd() {
    if (swipeXRef.current < -60) onToggleExclude(item.id);
    swipeXRef.current = 0;
    setSwipeX(0);
    touchRef.current = null;
  }

  // 마우스/포인터 이벤트 (PC 스와이프)
  // setPointerCapture 미사용 — 버튼 클릭 이벤트와 충돌 방지
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-dnd-handle]')) return;
    pointerRef.current = { x: e.clientX, y: e.clientY, horiz: false, id: e.pointerId };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current || pointerRef.current.id !== e.pointerId) return;
    const dx = e.clientX - pointerRef.current.x;
    const dy = e.clientY - pointerRef.current.y;
    if (!pointerRef.current.horiz) {
      if (Math.abs(dy) > 12) { pointerRef.current = null; swipeXRef.current = 0; setSwipeX(0); return; }
      if (Math.abs(dx) > 8) pointerRef.current.horiz = true;
      else return;
    }
    const newX = dx < 0 ? Math.max(dx, -100) : 0;
    swipeXRef.current = newX;
    setSwipeX(newX);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current || pointerRef.current.id !== e.pointerId) return;
    if (swipeXRef.current < -60) onToggleExclude(item.id);
    swipeXRef.current = 0;
    setSwipeX(0);
    pointerRef.current = null;
  }

  return (
    <div ref={setNodeRef} style={dndStyle}
      className={`relative overflow-hidden rounded-xl ${isDragging ? "opacity-50" : ""}`}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
    >
      {/* 스와이프 시 드러나는 제외/복원 배경 */}
      <div
        className={`absolute inset-y-0 right-0 flex items-center justify-center rounded-r-xl ${isExcluded ? "bg-emerald-500" : "bg-orange-400"}`}
        style={{ width: Math.max(-swipeX, 0) }}
      >
        {-swipeX > 24 && (isExcluded
          ? <RotateCcw className="w-5 h-5 text-white shrink-0" />
          : <EyeOff className="w-5 h-5 text-white shrink-0" />
        )}
      </div>

      {/* 카드 본체 */}
      <div
        className={`flex items-center gap-2 bg-card border rounded-xl px-3 py-3 transition-shadow group ${isDragging ? "shadow-lg ring-2 ring-primary/30" : ""} ${optimisticVisited || isExcluded ? "opacity-50" : ""}`}
        style={{ transform: `translateX(${swipeX}px)`, transition: swipeX === 0 ? "transform 0.2s ease" : "none" }}
      >
        {/* 드래그 핸들 */}
        <button {...attributes} {...listeners}
          data-dnd-handle="true"
          className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none p-0.5 shrink-0"
          aria-label="순서 변경"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* 방문 완료 토글 — 즉시 피드백 */}
        <button
          onClick={handleToggle}
          className="shrink-0 transition-transform active:scale-125"
        >
          {optimisticVisited
            ? <CheckCircle2 className="w-4 h-4 text-green-500" />
            : <Circle className="w-4 h-4 text-muted-foreground hover:text-green-500" />}
        </button>

        {/* 번호 뱃지 — 숨김 상태(index -1)면 빈 원 */}
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
          style={{ backgroundColor: (optimisticVisited || isExcluded) ? "#9ca3af" : color }}>
          {index >= 0 ? index + 1 : ""}
        </div>

        {/* 장소 정보 — 클릭하면 지도에서 해당 핀으로 이동 */}
        <button
          type="button"
          className="flex-1 min-w-0 text-left hover:text-primary transition-colors"
          onClick={() => onFocusMap(item)}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <p className={`inline-flex items-center gap-1 text-sm font-medium truncate ${optimisticVisited ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {isAccommodation && <Hotel className="w-3.5 h-3.5 shrink-0" />}
              {item.placeName.replace(/^🏨\s*/, "")}
            </p>
            {isExcluded && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200 shrink-0">제외</span>}
          </div>
          {item.address && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
              <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{item.address}</span>
            </p>
          )}
          {item.visitTime && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" />{item.visitTime}</p>}
          {item.memo && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate"><StickyNote className="w-3 h-3 shrink-0" />{item.memo}</p>}
        </button>

        {/* 우측 액션 */}
        <div className="flex items-center gap-1 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
          {index >= 0 && index < total - 1 && <Navigation className="w-3.5 h-3.5 text-muted-foreground/30 mr-1" />}
          <a
            href={item.lat && item.lng
              ? `https://maps.google.com/?q=${item.lat},${item.lng}`
              : `https://maps.google.com/?q=${encodeURIComponent([item.placeName, item.address].filter(Boolean).join(" "))}`}
            target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-blue-500 transition-colors"
            title="구글 지도에서 보기"
            onClick={e => e.stopPropagation()}
          >
            <MapIcon className="w-3.5 h-3.5" />
          </a>
          {!isAccommodation && (
            <>
              <button onClick={() => onEdit(item)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(item)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onMoveToPool(item)}
                className="p-1.5 rounded-lg hover:bg-amber-50 text-muted-foreground hover:text-amber-700 transition-colors"
                title="보관함으로 이동">
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {isAccommodation && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-medium"><Hotel className="w-3 h-3" />숙박</span>
          )}
        </div>
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
  const markersByIdRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const infoWindowsByIdRef = useRef<Map<number, google.maps.InfoWindow>>(new Map());
  const positionsByIdRef = useRef<Map<number, google.maps.LatLng>>(new Map());
  const pinInnerRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const badgeMarkersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const routeRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const geocacheRef = useRef<Map<string, google.maps.LatLng>>(new Map());
  const hasInitialFitRef = useRef(false);
  const renderVersionRef = useRef(0); // 동시 renderOnMap 실행 방지
  const itemsHashRef = useRef('');    // 내용 변경 시에만 renderOnMap 실행
  const [mapReady, setMapReady] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // 로컬 순서 상태 (드래그 즉시 반영)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);

  // 경로에서 임시 제외된 아이템 ID 세트 — localStorage로 탭 이동 시에도 유지
  const excludedStorageKeyRef = useRef(`map-excluded-${tripId}-${selectedDate}`);
  excludedStorageKeyRef.current = `map-excluded-${tripId}-${selectedDate}`;
  const [excludedIds, setExcludedIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(excludedStorageKeyRef.current);
      return saved ? new Set(JSON.parse(saved) as number[]) : new Set();
    } catch { return new Set(); }
  });

  const setExcludedIdsPersist = (updater: (prev: Set<number>) => Set<number>) => {
    setExcludedIds(prev => {
      const next = updater(prev);
      try { localStorage.setItem(excludedStorageKeyRef.current, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  // 체크버튼으로 방문 완료 처리 → 지도에서 즉시 숨김 (낙관적 상태)
  const [optimisticVisitedIds, setOptimisticVisitedIds] = useState<Set<number>>(new Set());
  const optimisticVisitedIdsRef = useRef<Set<number>>(new Set());
  optimisticVisitedIdsRef.current = optimisticVisitedIds;

  function toggleExclude(id: number) {
    setExcludedIdsPersist(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // 핀 간 이동 시간 { "id1:id2" → { walk, drive } }
  const [travelTimesMap, setTravelTimesMap] = useState<Record<string, { walk: string | null; drive: string | null }>>({});
  const travelTimesMapRef = useRef<Record<string, { walk: string | null; drive: string | null }>>({});
  travelTimesMapRef.current = travelTimesMap;

  // ── 일정 추가/수정 다이얼로그 ──
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ItemType | null>(null);
  const [form, setForm] = useState<FormData>({
    date: tripStartDate, placeName: "", address: "", visitTime: "",
    duration: "", memo: "", category: "place", lat: "", lng: "", sourceType: "manual",
  });
  const placeInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // ── AI 패널 (버튼 클릭으로 열리는 큰 패널) ──
  const [aiMode, setAiMode] = useState<"text" | "image" | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiItems, setAiItems] = useState<AiItem[]>([]);
  const [optimizingRoute, setOptimizingRoute] = useState(false);
  const [compactDateSelector, setCompactDateSelector] = useState(false);
  const aiCameraRef = useRef<HTMLInputElement>(null);
  const aiPhotoRef = useRef<HTMLInputElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      if (window.innerWidth >= 1024) {
        setCompactDateSelector(false);
        return;
      }

      const stickyTop = stickyHeaderRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      setCompactDateSelector(stickyTop <= 0);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // ── 다이얼로그 내부 AI ──
  const [dialogAiMode, setDialogAiMode] = useState<"text" | "image" | null>(null);
  const [dialogAiText, setDialogAiText] = useState("");
  const [dialogAiLoading, setDialogAiLoading] = useState(false);
  const dialogAiCameraRef = useRef<HTMLInputElement>(null);
  const dialogAiPhotoRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  async function handleOptimizeRoute() {
    if (optimizingRoute) return;
    if (!window.google?.maps) return toast.error("지도가 아직 준비되지 않았어요.");
    if (items.length < 3) return toast.info("최적화하려면 장소가 3개 이상 필요해요.");

    const getDurationSec = (origin: google.maps.LatLng, destination: google.maps.LatLng) =>
      new Promise<number>((resolve) => {
        const svc = new window.google.maps.DirectionsService();
        svc.route(
          { origin, destination, travelMode: window.google.maps.TravelMode.DRIVING },
          (result, status) => {
            const sec = result?.routes?.[0]?.legs?.[0]?.duration?.value;
            resolve(status === "OK" && typeof sec === "number" ? sec : Number.POSITIVE_INFINITY);
          },
        );
      });

    setOptimizingRoute(true);
    try {
      const withPos = items
        .map(item => ({ item, pos: positionsByIdRef.current.get(item.id) }))
        .filter((x): x is { item: ItemType; pos: google.maps.LatLng } => !!x.pos);
      if (withPos.length < 3) return toast.info("좌표가 있는 장소가 3개 이상 필요해요.");

      // 현재 순서의 첫 장소/마지막 장소를 각각 출발지/도착지로 고정
      const start = withPos[0];
      const end = withPos[withPos.length - 1];
      const remain = [...withPos.slice(1, -1)];
      const orderedMiddle: typeof remain = [];
      let current = start;

      // 중간 지점만 이동시간(초) 기준으로 탐욕 최적화
      while (remain.length > 0) {
        const scores = await Promise.all(
          remain.map(async cand => ({
            cand,
            cost: await getDurationSec(current.pos, cand.pos),
          })),
        );
        scores.sort((a, b) => a.cost - b.cost);
        const next = scores[0]?.cand;
        if (!next) break;
        orderedMiddle.push(next);
        current = next;
        const idx = remain.findIndex(r => r.item.id === next.item.id);
        if (idx >= 0) remain.splice(idx, 1);
      }

      const orderedIds = [start, ...orderedMiddle, end].map(x => x.item.id);
      setLocalOrder(orderedIds);
      reorderMutation.mutate(
        { tripId, orderedIds },
        { onSuccess: () => toast.success("출발지/도착지 고정 기준으로 이동시간 최적화 완료") },
      );
    } catch {
      toast.error("동선 최적화에 실패했습니다.");
    } finally {
      setOptimizingRoute(false);
    }
  }

  const { data: serverItems, isLoading } = trpc.itinerary.listByDate.useQuery(
    { tripId, date: selectedDate },
    { refetchInterval: 3000 }
  );
  const { data: poolItems } = trpc.itinerary.listPoolByTrip.useQuery({ tripId }, { refetchInterval: 3000 });

  const createMutation = trpc.itinerary.create.useMutation({
    onSuccess: () => {
      utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
      utils.itinerary.listByTrip.invalidate({ tripId });
      setDialogOpen(false);
      setForm(f => ({ ...f, placeName: "", address: "", visitTime: "", duration: "", memo: "", lat: "", lng: "", sourceType: "manual" }));
      toast.success("장소가 추가됐습니다.");
    },
    onError: () => toast.error("장소 추가에 실패했습니다."),
  });

  const updateMutation = trpc.itinerary.update.useMutation({
    onSuccess: () => {
      utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
      utils.itinerary.listByTrip.invalidate({ tripId });
      setDialogOpen(false);
      setEditId(null);
      toast.success("수정됐습니다.");
    },
    onError: () => toast.error("수정에 실패했습니다."),
  });

  const deleteMutation = trpc.itinerary.delete.useMutation({
    onSuccess: () => {
      utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
      utils.itinerary.listByTrip.invalidate({ tripId });
      setDeleteTarget(null);
      toast.success("일정이 삭제됐습니다.");
    },
    onError: () => toast.error("삭제에 실패했습니다."),
  });

  const toggleVisitedMutation = trpc.itinerary.update.useMutation({
    onSuccess: () => {
      utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
      utils.itinerary.listByTrip.invalidate({ tripId });
    },
  });

  const aiExtractMutation = trpc.itinerary.aiExtract.useMutation();
  const aiExtractImageMutation = trpc.itinerary.aiExtractFromImage.useMutation();
  // 시간 재배분용 — 토스트/다이얼로그 없이 조용히 업데이트
  const silentUpdateMutation = trpc.itinerary.update.useMutation();

  // 서버 데이터 수신 시 로컬 순서 초기화
  useEffect(() => { setLocalOrder(null); }, [selectedDate, serverItems]);

  const items: ItemType[] = useMemo(() => {
    if (!serverItems) return [];
    if (!localOrder) return serverItems as ItemType[];
    const map = new Map((serverItems as ItemType[]).map(i => [i.id, i]));
    return localOrder.map(id => map.get(id)).filter((x): x is ItemType => x !== undefined);
  }, [serverItems, localOrder]);

  const reorderMutation = trpc.itinerary.reorder.useMutation({
    onSuccess: () => {
      utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
      utils.itinerary.listByTrip.invalidate({ tripId });
    },
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

    // 기존 방문 시간을 시간순 정렬해 새 순서에 배분
    const sortedTimes = items
      .map(i => i.visitTime)
      .filter((t): t is string => Boolean(t))
      .sort();
    const newOrderItems = newOrder.map(id => items.find(i => i.id === id)!);
    const timeUpdates = newOrderItems
      .map((item, idx) => ({
        id: item.id,
        newTime: idx < sortedTimes.length ? sortedTimes[idx] : null,
        oldTime: item.visitTime ?? null,
      }))
      .filter(u => u.newTime !== u.oldTime);

    reorderMutation.mutate({ tripId, orderedIds: newOrder }, {
      onSuccess: () => {
        if (timeUpdates.length === 0) {
          utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
          utils.itinerary.listByTrip.invalidate({ tripId });
          toast.success("방문 순서가 저장됐습니다.");
          return;
        }
        Promise.all(
          timeUpdates.map(u =>
            silentUpdateMutation.mutateAsync({ id: u.id, visitTime: u.newTime ?? undefined })
          )
        ).then(() => {
          utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
          utils.itinerary.listByTrip.invalidate({ tripId });
          toast.success("방문 순서와 시간이 업데이트됐습니다.");
        }).catch(() => toast.error("시간 업데이트에 실패했습니다."));
      },
    });
  }, [items, reorderMutation, silentUpdateMutation, tripId, selectedDate, utils]);

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
    markersByIdRef.current.clear();
    infoWindowsByIdRef.current.forEach(w => w.close());
    infoWindowsByIdRef.current.clear();
    positionsByIdRef.current.clear();
    pinInnerRef.current.clear();
    badgeMarkersRef.current.forEach(m => { m.map = null; });
    badgeMarkersRef.current.clear();
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
      preserveViewport: true,
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

  // 두 지점 간 이동 시간 (Directions API)
  const getRouteDuration = useCallback((
    origin: google.maps.LatLng,
    dest: google.maps.LatLng,
    mode: google.maps.TravelMode,
  ): Promise<string | null> => {
    return new Promise(resolve => {
      const svc = new window.google.maps.DirectionsService();
      svc.route(
        { origin, destination: dest, travelMode: mode },
        (result, status) => {
          const duration = result?.routes?.[0]?.legs?.[0]?.duration?.text ?? null;
          resolve(status === "OK" && duration ? duration : null);
        },
      );
    });
  }, []);

  // 제외 상태에 따라 핀 표시/번호·경로·이동시간 뱃지를 동기적으로 재적용
  const applyExclusionSync = useCallback((timesMap: Record<string, { walk: string | null; drive: string | null }>) => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const allItems = itemsRef.current;
    const excluded = excludedIdsRef.current;
    const optVisited = optimisticVisitedIdsRef.current;
    // 숨길 조건: 스와이프 제외 OR 서버 방문완료 OR 낙관적 방문완료
    const isHidden = (item: ItemType) => excluded.has(item.id) || !!item.visited || optVisited.has(item.id);
    const visibleItems = allItems.filter(i => !isHidden(i));

    // 핀 표시/숨김 + 보이는 순서로 번호 재부여
    allItems.forEach(item => {
      const marker = markersByIdRef.current.get(item.id);
      if (!marker) return;
      if (isHidden(item)) {
        marker.map = null;
      } else {
        marker.map = map;
        const inner = pinInnerRef.current.get(item.id);
        if (inner) inner.textContent = String(visibleItems.findIndex(v => v.id === item.id) + 1);
      }
    });

    // 경로 재설정
    if (routeRendererRef.current) { routeRendererRef.current.setMap(null); routeRendererRef.current = null; }
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
    const visiblePositions = visibleItems
      .map(i => positionsByIdRef.current.get(i.id))
      .filter((p): p is google.maps.LatLng => !!p);
    if (visiblePositions.length >= 2) drawRoute(visiblePositions);

    // 이동시간 뱃지: 기존 제거 후 보이는 인접 쌍만 재생성
    badgeMarkersRef.current.forEach(m => { m.map = null; });
    badgeMarkersRef.current.clear();
    for (let i = 0; i < visibleItems.length - 1; i++) {
      const a = visibleItems[i];
      const b = visibleItems[i + 1];
      const key = `${a.id}:${b.id}`;
      const times = timesMap[key];
      const posA = positionsByIdRef.current.get(a.id);
      const posB = positionsByIdRef.current.get(b.id);
      if (!posA || !posB || !times || !mapRef.current) continue;
      const badge = document.createElement("div");
      badge.style.cssText = "background:rgba(255,255,255,0.72);border:1px solid rgba(226,232,240,0.7);border-radius:8px;padding:2px 6px;font-size:9px;font-family:Inter,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,0.08);white-space:nowrap;display:flex;gap:4px;align-items:center;pointer-events:none;backdrop-filter:blur(4px);";
      badge.innerHTML = `<span style="color:#94a3b8;font-weight:500;">도보 ${times.walk ?? "—"}</span><span style="color:#e2e8f0">|</span><span style="color:#94a3b8;font-weight:500;">차 ${times.drive ?? "—"}</span>`;
      badgeMarkersRef.current.set(key, new window.google.maps.marker.AdvancedMarkerElement({
        map, content: badge, zIndex: 0,
        position: new window.google.maps.LatLng((posA.lat() + posB.lat()) / 2, (posA.lng() + posB.lng()) / 2),
      }));
    }
  }, [drawRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderOnMap = useCallback(async () => {
    const currentItems = itemsRef.current;
    if (!mapRef.current || !currentItems || currentItems.length === 0) return;
    const myVersion = ++renderVersionRef.current;
    clearMap();
    setGeocoding(true);

    const positions: { item: ItemType; latlng: google.maps.LatLng }[] = [];

    for (const item of currentItems) {
      let latlng: google.maps.LatLng | null = null;
      if (item.lat && item.lng) {
        latlng = new window.google.maps.LatLng(Number(item.lat), Number(item.lng));
      } else if (item.address) {
        latlng = await geocodeAddress(`addr:${item.address}`, item.address);
      } else if (item.placeName) {
        const geocodeName = item.placeName.replace(/^(체크인|체크아웃|숙박)\s*[—\-]\s*/, "").trim() || item.placeName;
        latlng = await geocodeAddress(`name:${geocodeName}`, geocodeName);
      }
      if (latlng) positions.push({ item, latlng });
    }

    setGeocoding(false);
    if (renderVersionRef.current !== myVersion) return; // 더 새로운 renderOnMap이 시작됨
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
      pinInnerRef.current.set(item.id, inner);

      const marker = new window.google.maps.marker.AdvancedMarkerElement({ map: mapRef.current!, position: latlng, title: item.placeName, content: el });
      const infoWindow = new window.google.maps.InfoWindow({
        content: buildInfoWindowEl(item, idx, color),
      });
      marker.addListener("click", () => infoWindow.open({ anchor: marker, map: mapRef.current! }));
      markersRef.current.push(marker);
      markersByIdRef.current.set(item.id, marker);
      infoWindowsByIdRef.current.set(item.id, infoWindow);
      positionsByIdRef.current.set(item.id, latlng);
    });

    if (!hasInitialFitRef.current) {
      hasInitialFitRef.current = true;
      mapRef.current.fitBounds(bounds, { top: 60, right: 40, bottom: 60, left: 40 });
    }

    // 인접 핀 이동 시간 계산 (뱃지 생성은 applyExclusionSync에서)
    const newTimesMap: Record<string, { walk: string | null; drive: string | null }> = {};
    if (positions.length >= 2) {
      for (let i = 0; i < positions.length - 1; i++) {
        if (renderVersionRef.current !== myVersion) return; // stale, 중단
        const { item: a, latlng: la } = positions[i];
        const { item: b, latlng: lb } = positions[i + 1];
        const [walk, drive] = await Promise.all([
          getRouteDuration(la, lb, window.google.maps.TravelMode.WALKING),
          getRouteDuration(la, lb, window.google.maps.TravelMode.DRIVING),
        ]);
        newTimesMap[`${a.id}:${b.id}`] = { walk, drive };
      }
    }
    if (renderVersionRef.current !== myVersion) return; // stale, 중단
    if (positions.length >= 2) {
      // 기존에 계산된 skip-pair 시간도 보존
      const mergedTimesMap = { ...travelTimesMapRef.current, ...newTimesMap };
      setTravelTimesMap(mergedTimesMap);
      applyExclusionSync(mergedTimesMap);
    } else {
      applyExclusionSync({});
    }
  }, [clearMap, geocodeAddress, drawRoute, getRouteDuration, applyExclusionSync]);

  useEffect(() => {
    geocacheRef.current.clear();
    setLocalOrder(null);
    hasInitialFitRef.current = false;
    renderVersionRef.current = 0;
    itemsHashRef.current = '';
    try {
      const saved = localStorage.getItem(`map-excluded-${tripId}-${selectedDate}`);
      setExcludedIds(saved ? new Set(JSON.parse(saved) as number[]) : new Set());
    } catch { setExcludedIds(new Set()); }
    setOptimisticVisitedIds(new Set());
  }, [selectedDate, tripId]);

  useEffect(() => {
    if (!mapReady) return;
    if (!items || items.length === 0) { clearMap(); itemsHashRef.current = ''; return; }
    // 내용이 실제로 바뀐 경우에만 renderOnMap 실행 (3초 refetch 무시)
    const hash = items.map(i => `${i.id}:${i.visited}:${i.order ?? 0}:${i.lat ?? ''}:${i.lng ?? ''}:${i.visitTime ?? ''}`).join('|');
    if (hash === itemsHashRef.current) return;
    itemsHashRef.current = hash;
    renderOnMap();
  }, [mapReady, items, renderOnMap, clearMap]);

  // 렌더 시마다 ref 동기화
  const itemsRef = useRef<ItemType[]>([]);
  itemsRef.current = items;
  const excludedIdsRef = useRef<Set<number>>(new Set());
  excludedIdsRef.current = excludedIds;

  // 제외·방문완료 상태 변경 시: 핀 번호·뱃지·경로 즉시 재적용 + 새 쌍 이동 시간 비동기 계산
  useEffect(() => {
    if (!mapReady) return;
    applyExclusionSync(travelTimesMapRef.current);

    // 새로 생긴 인접 쌍(건너뛴 쌍)의 이동 시간이 없으면 비동기로 계산 후 재적용
    const allItems = itemsRef.current;
    const optV = optimisticVisitedIdsRef.current;
    const visibleItems = allItems.filter(i => !excludedIds.has(i.id) && !i.visited && !optV.has(i.id));
    const capturedExcluded = excludedIds;
    const capturedOptV = optimisticVisitedIds;
    (async () => {
      for (let i = 0; i < visibleItems.length - 1; i++) {
        if (excludedIdsRef.current !== capturedExcluded || optimisticVisitedIdsRef.current !== capturedOptV) return;
        const a = visibleItems[i];
        const b = visibleItems[i + 1];
        const key = `${a.id}:${b.id}`;
        if (travelTimesMapRef.current[key]) continue;
        const posA = positionsByIdRef.current.get(a.id);
        const posB = positionsByIdRef.current.get(b.id);
        if (!posA || !posB) continue;
        const [walk, drive] = await Promise.all([
          getRouteDuration(posA, posB, window.google.maps.TravelMode.WALKING),
          getRouteDuration(posA, posB, window.google.maps.TravelMode.DRIVING),
        ]);
        if (excludedIdsRef.current !== capturedExcluded || optimisticVisitedIdsRef.current !== capturedOptV || !mapRef.current) return;
        const times = { walk, drive };
        travelTimesMapRef.current[key] = times;
        setTravelTimesMap(prev => ({ ...prev, [key]: times }));
        applyExclusionSync({ ...travelTimesMapRef.current });
      }
    })();
  }, [excludedIds, optimisticVisitedIds, mapReady, applyExclusionSync, getRouteDuration]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 지도에서 특정 핀으로 이동 ──
  const focusOnItem = useCallback((item: ItemType) => {
    const latlng = positionsByIdRef.current.get(item.id);
    if (!latlng || !mapRef.current) return;
    // 열려있는 인포윈도우 모두 닫기
    infoWindowsByIdRef.current.forEach(w => w.close());
    mapRef.current.panTo(latlng);
    mapRef.current.setZoom(16);
    // 해당 마커의 인포윈도우 열기
    const marker = markersByIdRef.current.get(item.id);
    const infoWindow = infoWindowsByIdRef.current.get(item.id);
    if (marker && infoWindow) {
      infoWindow.open({ anchor: marker, map: mapRef.current });
    }
  }, []);

  // ── 다이얼로그 열기 ──
  function openDialog() {
    setEditId(null);
    setForm({ date: selectedDate, placeName: "", address: "", visitTime: "", duration: "", memo: "", category: "place", lat: "", lng: "", sourceType: "manual" });
    setDialogAiMode(null);
    setDialogAiText("");
    setDialogOpen(true);
  }

  function openEdit(item: ItemType) {
    setEditId(item.id);
    setForm({
      date: item.date ?? selectedDate,
      placeName: item.placeName,
      address: item.address ?? "",
      visitTime: item.visitTime ?? "",
      duration: "",
      memo: item.memo ?? "",
      category: item.category ?? "place",
      lat: item.lat ?? "",
      lng: item.lng ?? "",
      sourceType: item.sourceType === "pool" ? "pool" : "manual",
    });
    setDialogAiMode(null);
    setDialogAiText("");
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.placeName.trim()) { toast.error("장소명을 입력하세요."); return; }
    const data = {
      placeName: form.placeName,
      address: form.address || undefined,
      visitTime: form.visitTime || undefined,
      duration: form.duration ? parseInt(form.duration) : undefined,
      memo: form.memo || undefined,
      category: form.category,
      lat: form.lat || undefined,
      lng: form.lng || undefined,
      sourceType: form.sourceType,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, date: form.date, ...data });
    } else {
      createMutation.mutate({ tripId, date: form.date, order: (serverItems?.length ?? 0), ...data });
    }
  }

  function moveToPool(item: ItemType) {
    updateMutation.mutate({ id: item.id, sourceType: "pool", date: selectedDate });
  }

  function moveFromPool(item: ItemType) {
    updateMutation.mutate({ id: item.id, sourceType: "manual", date: selectedDate, order: items.length });
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

  async function handleAiSave(sourceType: "manual" | "pool" = "manual") {
    const toSave = aiItems.filter(i => i.selected && i.placeName);
    for (const item of toSave) {
      await createMutation.mutateAsync({
        tripId, date: item.date ?? selectedDate,
        placeName: item.placeName, visitTime: item.visitTime ?? undefined,
        category: item.category, memo: item.memo ?? undefined,
        address: item.address ?? undefined, order: 0, sourceType,
      });
    }
    toast.success(`${toSave.length}개 일정이 추가됐습니다.`);
    setAiItems([]); setAiMode(null); setAiText("");
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">동선 지도</h2>
          <p className="text-sm text-muted-foreground mt-0.5 break-keep">드래그해서 방문 순서를 변경하면 지도와 일정 탭에 즉시 반영됩니다.</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">보관함</Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[360px] sm:w-[420px]">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700">
                    <Archive className="w-3.5 h-3.5" />
                  </span>
                  보관함 (날짜 미정)
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-2 pr-1">
                {(poolItems as ItemType[] | undefined)?.length ? (
                  (poolItems as ItemType[]).map((item) => (
                    <div key={item.id} className="rounded-xl border bg-card px-3 py-2.5 shadow-sm">
                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                          <Archive className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.placeName}</p>
                          {item.address && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{item.address}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center gap-2 pl-9">
                        <a
                          href={item.lat && item.lng
                            ? `https://maps.google.com/?q=${item.lat},${item.lng}`
                            : `https://maps.google.com/?q=${encodeURIComponent([item.placeName, item.address].filter(Boolean).join(" "))}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-blue-500 hover:bg-muted transition-colors"
                          title="구글 지도에서 보기"
                        >
                          <MapIcon className="w-3.5 h-3.5" />구글지도
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <Button size="sm" variant="outline" onClick={() => moveFromPool(item)} className="h-7 px-2.5 text-xs">오늘로 배치</Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-2 py-4">
                    <p className="text-sm text-muted-foreground">보관함에 저장된 장소가 없어요.</p>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
          <Button
            size="sm"
            variant="outline"
            className="relative whitespace-nowrap overflow-hidden"
            onClick={handleOptimizeRoute}
            disabled={optimizingRoute}
          >
            <span className={optimizingRoute ? "opacity-60" : "opacity-100"}>동선 최적화</span>
            {optimizingRoute && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/30">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </span>
            )}
          </Button>
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
                <Button size="sm" onClick={() => handleAiSave("manual")} disabled={!aiItems.some(i => i.selected) || createMutation.isPending} className="flex-1">일정 저장</Button>
                <Button size="sm" variant="secondary" onClick={() => handleAiSave("pool")} disabled={!aiItems.some(i => i.selected) || createMutation.isPending} className="flex-1">보관함 저장</Button>
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
      

      {/* ── 세로 모드: 날짜 + 지도 상단 고정, 목록은 아래에서 스크롤
           ── 가로/데스크탑: static 복귀 후 map+list flex 배치 ── */}
      <div ref={stickyHeaderRef} className={`sticky top-0 z-10 bg-background -mx-4 sm:-mx-6 px-4 sm:px-6 lg:static lg:mx-0 lg:px-0 lg:pb-0 lg:bg-transparent space-y-3 transition-all ${compactDateSelector ? "pb-1" : "pb-3"}`}>

        {/* 날짜 선택 */}
        <div className={`flex gap-2 overflow-x-auto scrollbar-thin transition-all ${compactDateSelector ? "pt-1 pb-0.5" : "pt-2 pb-1"}`}>
          {tripDays.map((day, idx) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const isSelected = selectedDate === dateStr;
            return (
              <button key={dateStr} onClick={() => setSelectedDate(dateStr)}
                className={`flex items-center justify-center rounded-xl border transition-all shrink-0 ${compactDateSelector ? "flex-col gap-0.5 px-2.5 py-1 min-w-[58px]" : "flex-col gap-0.5 px-3 py-2.5"} ${isSelected ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-foreground border-border hover:border-primary/30 hover:bg-muted/50"}`}
              >
                {compactDateSelector ? (
                  <>
                    <span className="text-[11px] font-medium leading-none">{format(day, "EEE", { locale: ko })}</span>
                    <span className="text-sm font-semibold leading-none">{format(day, "M.d")}</span>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-medium">{format(day, "EEE", { locale: ko })}</span>
                    <span className="text-lg font-bold leading-none">{format(day, "d")}</span>
                    <span className="text-xs opacity-70">{format(day, "M.d")}</span>
                    <span className={`text-xs mt-0.5 ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>Day {idx + 1}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* 지도 + 데스크탑 사이드바 */}
        <div className="lg:flex lg:gap-4 lg:items-start">

          {/* 지도 */}
          <div className="lg:flex-1 min-w-0">
            <div className="rounded-2xl overflow-hidden border border-border shadow-sm relative">
              {(geocoding || isLoading) && (
                <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-10 flex items-center justify-center">
                  <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5 shadow-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">지도 로딩 중...</span>
                  </div>
                </div>
              )}
              <MapView className="w-full h-[250px] sm:h-[420px] lg:h-[600px]" initialCenter={{ lat: 35.6762, lng: 139.6503 }} initialZoom={13}
                onMapReady={(map) => { mapRef.current = map; setMapReady(true); }} />
            </div>
          </div>

          {/* 데스크탑 사이드바 목록 (lg 이상에서만 표시) */}
          {items && items.length > 0 && (
            <div className="hidden lg:block lg:w-96 xl:w-[26rem] lg:shrink-0">
              <div className="border border-border rounded-2xl bg-card p-3 lg:max-h-[600px] lg:overflow-y-auto space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    {format(new Date(selectedDate + "T00:00:00"), "M월 d일", { locale: ko })} 방문 순서
                  </h3>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <GripVertical className="w-3.5 h-3.5" />드래그
                  </span>
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                      {(() => {
                        const isItemHidden = (i: ItemType) => i.visited || optimisticVisitedIds.has(i.id) || excludedIds.has(i.id);
                        const visibleItems = items.filter(i => !isItemHidden(i));
                        return items.map((item, idx) => {
                        const hidden = isItemHidden(item);
                        const visibleIdx = hidden ? -1 : visibleItems.findIndex(v => v.id === item.id);
                        const nextVisible = !hidden ? items.slice(idx + 1).find(i => !isItemHidden(i)) : undefined;
                        const times = nextVisible ? travelTimesMap[`${item.id}:${nextVisible.id}`] : undefined;
                        return (
                          <div key={item.id}>
                            <SortableVisitItem
                              item={item} index={visibleIdx} total={visibleItems.length}
                              onEdit={openEdit} onDelete={setDeleteTarget}
                              onToggleVisited={i => {
                                const newVisited = !i.visited;
                                setOptimisticVisitedIds(prev => { const next = new Set(prev); if (newVisited) next.add(i.id); else next.delete(i.id); return next; });
                                toggleVisitedMutation.mutate({ id: i.id, visited: newVisited });
                              }}
                              onFocusMap={focusOnItem}
                            isExcluded={excludedIds.has(item.id)}
                            onToggleExclude={toggleExclude}
                            onMoveToPool={moveToPool}
                            />
                            {times && (
                              <div className="flex items-center gap-2 px-2 py-1">
                                <div className="h-px flex-1 bg-border" />
                                <span className="text-[11px] text-muted-foreground whitespace-nowrap flex items-center gap-1.5">
                                  <PersonStanding className="w-3 h-3" /><span>{times.walk ?? "—"}</span><span className="text-border">|</span><Car className="w-3 h-3" /><span>{times.drive ?? "—"}</span>
                                </span>
                                <div className="h-px flex-1 bg-border" />
                              </div>
                            )}
                          </div>
                        );
                      });
                      })()}
                    </div>
                  </SortableContext>
                </DndContext>
                <p className="text-xs text-muted-foreground text-center pt-1">순서 변경 시 지도·일정 탭 자동 업데이트</p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 세로 모드 목록 — sticky 블록 아래에서 페이지와 함께 스크롤 */}
      {items && items.length > 0 && (
        <div className="lg:hidden mt-1 space-y-2">
          <div className="flex items-center justify-between px-1">
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
                {(() => {
                  const isItemHidden = (i: ItemType) => i.visited || optimisticVisitedIds.has(i.id) || excludedIds.has(i.id);
                  const visibleItems = items.filter(i => !isItemHidden(i));
                  return items.map((item, idx) => {
                  const hidden = isItemHidden(item);
                  const visibleIdx = hidden ? -1 : visibleItems.findIndex(v => v.id === item.id);
                  const nextVisible = !hidden ? items.slice(idx + 1).find(i => !isItemHidden(i)) : undefined;
                  const times = nextVisible ? travelTimesMap[`${item.id}:${nextVisible.id}`] : undefined;
                  return (
                    <div key={item.id}>
                      <SortableVisitItem
                        item={item} index={visibleIdx} total={visibleItems.length}
                        onEdit={openEdit} onDelete={setDeleteTarget}
                        onToggleVisited={i => {
                          const newVisited = !i.visited;
                          setOptimisticVisitedIds(prev => { const next = new Set(prev); if (newVisited) next.add(i.id); else next.delete(i.id); return next; });
                          toggleVisitedMutation.mutate({ id: i.id, visited: newVisited });
                        }}
                        onFocusMap={focusOnItem}
                        isExcluded={excludedIds.has(item.id)}
                        onToggleExclude={toggleExclude}
                        onMoveToPool={moveToPool}
                      />
                      {times && (
                        <div className="flex items-center gap-2 px-2 py-1">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex items-center gap-1.5">
                            <PersonStanding className="w-3 h-3" /><span>{times.walk ?? "—"}</span><span className="text-border">|</span><Car className="w-3 h-3" /><span>{times.drive ?? "—"}</span>
                          </span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}
                    </div>
                  );
                  });
                })()}
              </div>
            </SortableContext>
          </DndContext>
          <p className="text-xs text-muted-foreground text-center pt-1">순서 변경 시 지도·일정 탭 자동 업데이트</p>
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

      {/* 삭제 확인 AlertDialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>일정 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteTarget?.placeName}</span>을(를) 삭제할까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id }); }}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 일정 추가/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) setEditId(null); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-5 sm:p-6">
          <DialogHeader className="mb-1">
            <DialogTitle className="text-lg font-semibold">{editId ? "장소 수정" : "장소 추가"}</DialogTitle>
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

            {/* 날짜 — 여행 기간 내에서만 선택 가능 */}
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
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">저장 위치</Label>
              <Select value={form.sourceType} onValueChange={v => setForm(f => ({ ...f, sourceType: (v as "manual" | "pool") }))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">일정에 바로 배치</SelectItem>
                  <SelectItem value="pool">보관함(날짜 미정)</SelectItem>
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
            <Button variant="outline" className="flex-1" onClick={() => { setDialogOpen(false); setEditId(null); }}>취소</Button>
            <Button className="flex-1" onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editId ? "수정" : "추가"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

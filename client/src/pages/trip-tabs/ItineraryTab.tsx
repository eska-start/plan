import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { loadMapScript } from "@/components/Map";
import { toast } from "sonner";
import {
  CalendarDays, Loader2, MapPin, Clock, CheckCircle2, Circle,
  Plus, Utensils, Camera, ShoppingBag, Hotel, GripVertical,
  Sparkles, FileText, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// dnd-kit
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type ItineraryItem = {
  id: number;
  placeName: string;
  address?: string | null;
  visitTime?: string | null;
  duration?: number | null;
  visited?: boolean | null;
  memo?: string | null;
  category?: string | null;
  sourceType?: string | null;
  order?: number | null;
  lat?: string | null;
  lng?: string | null;
};

type FormData = {
  placeName: string;
  address: string;
  visitTime: string;
  duration: string;
  memo: string;
  category: string;
  lat: string;
  lng: string;
};

const defaultForm: FormData = {
  placeName: "", address: "", visitTime: "", duration: "", memo: "", category: "place",
  lat: "", lng: "",
};

const CATEGORIES = [
  { value: "place", label: "장소", icon: MapPin },
  { value: "food", label: "식당/카페", icon: Utensils },
  { value: "activity", label: "액티비티", icon: Camera },
  { value: "shopping", label: "쇼핑", icon: ShoppingBag },
];

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  place: MapPin, food: Utensils, activity: Camera, shopping: ShoppingBag, accommodation: Hotel,
};

const CATEGORY_COLORS: Record<string, string> = {
  place: "bg-blue-50 text-blue-600 border-blue-200",
  food: "bg-orange-50 text-orange-600 border-orange-200",
  activity: "bg-green-50 text-green-600 border-green-200",
  shopping: "bg-purple-50 text-purple-600 border-purple-200",
  accommodation: "bg-indigo-50 text-indigo-600 border-indigo-200",
};

// ─── 드래그 가능한 개별 아이템 컴포넌트 ──────────────────────────────────────
function SortableItem({
  item,
  idx,
  total,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ItineraryItem;
  idx: number;
  total: number;
  onToggle: (item: ItineraryItem) => void;
  onEdit: (item: ItineraryItem) => void;
  onDelete: (id: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const CategoryIcon = CATEGORY_ICONS[item.category ?? "place"] ?? MapPin;
  const isAccommodation = item.sourceType === "accommodation";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 bg-card border rounded-xl p-4 transition-all ${
        item.visited ? "opacity-60 border-border" : "border-border hover:shadow-sm"
      } ${isDragging ? "shadow-lg ring-2 ring-primary/20" : ""}`}
    >
      {/* 드래그 핸들 */}
      {!isAccommodation && (
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors touch-none"
          aria-label="순서 변경"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      {isAccommodation && <div className="w-4 shrink-0" />}

      {/* 체크 + 연결선 */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <button onClick={() => onToggle(item)} className="transition-colors">
          {item.visited
            ? <CheckCircle2 className="w-5 h-5 text-accent" />
            : <Circle className="w-5 h-5 text-muted-foreground hover:text-accent" />
          }
        </button>
        {idx < total - 1 && <div className="w-px h-4 bg-border" />}
      </div>

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[item.category ?? "place"] ?? CATEGORY_COLORS.place}`}>
                <CategoryIcon className="w-3 h-3 inline mr-1" />
                {CATEGORIES.find(c => c.value === item.category)?.label ?? "장소"}
              </span>
              {item.visitTime && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />{item.visitTime}
                </span>
              )}
            </div>
            <p className={`font-semibold text-sm ${item.visited ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {item.placeName}
            </p>
            {item.address && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                <MapPin className="w-3 h-3 shrink-0" />{item.address}
              </p>
            )}
            {item.memo && (
              <p className="text-xs text-muted-foreground mt-1 italic">{item.memo}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {isAccommodation ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-500 border border-indigo-200 font-medium">숙박 연동</span>
            ) : (
              <>
                <button onClick={() => onEdit(item)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">수정</button>
                <button onClick={() => onDelete(item.id)} className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded hover:bg-destructive/10 transition-colors">삭제</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function ItineraryTab({ tripId, tripDays }: { tripId: number; tripDays: Date[] }) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (tripDays.length > 0) return format(tripDays[0], "yyyy-MM-dd");
    return format(new Date(), "yyyy-MM-dd");
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  // 낙관적 순서 상태 (드래그 중 즉시 반영)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);
  const placeInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const utils = trpc.useUtils();

  const { data: items, isLoading } = trpc.itinerary.listByDate.useQuery(
    { tripId, date: selectedDate },
    { refetchInterval: 3000 } // 3초마다 갱신 - 지도 탭에서 순서 변경 시 일정 탭에도 즉시 반영
  );

  // 현재 표시할 순서 (로컬 드래그 반영 우선)
  const displayItems: ItineraryItem[] = (() => {
    if (!items || !Array.isArray(items)) return [];
    if (!localOrder) return items as ItineraryItem[];
    const map = new Map((items as ItineraryItem[]).map(i => [i.id, i]));
    return localOrder.map(id => map.get(id)).filter((x): x is ItineraryItem => x !== undefined);
  })();

  // Google Places Autocomplete 초기화 (다이얼로그 열릴 때마다)
  useEffect(() => {
    if (!dialogOpen) return;
    let destroyed = false;

    async function init() {
      if (!window.google?.maps?.places) await loadMapScript();
      if (destroyed || !placeInputRef.current || !window.google?.maps?.places) return;

      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }

      const ac = new window.google.maps.places.Autocomplete(placeInputRef.current, {
        fields: ["name", "formatted_address", "geometry"],
      });

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
      if (autocompleteRef.current && window.google?.maps) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [dialogOpen]);

  const createMutation = trpc.itinerary.create.useMutation({
    onSuccess: () => {
      utils.itinerary.listByDate.invalidate();
      setDialogOpen(false);
      setForm(defaultForm);
      toast.success("장소가 추가되었습니다.");
    },
    onError: () => toast.error("장소 추가에 실패했습니다."),
  });

  const updateMutation = trpc.itinerary.update.useMutation({
    onSuccess: () => {
      utils.itinerary.listByDate.invalidate();
      setDialogOpen(false);
      setEditId(null);
      setForm(defaultForm);
      toast.success("장소가 수정되었습니다.");
    },
    onError: () => toast.error("장소 수정에 실패했습니다."),
  });

  const deleteMutation = trpc.itinerary.delete.useMutation({
    onSuccess: () => {
      utils.itinerary.listByDate.invalidate();
      toast.success("장소가 삭제되었습니다.");
    },
    onError: () => toast.error("장소 삭제에 실패했습니다."),
  });

  const reorderMutation = trpc.itinerary.reorder.useMutation({
    onSuccess: () => utils.itinerary.listByDate.invalidate(),
    onError: () => {
      toast.error("순서 저장에 실패했습니다.");
      setLocalOrder(null);
    },
  });

  const aiExtractMutation = trpc.itinerary.aiExtract.useMutation();
  const aiExtractImageMutation = trpc.itinerary.aiExtractFromImage.useMutation();
  const [aiMode, setAiMode] = useState<"text" | "image" | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiItems, setAiItems] = useState<Array<{ date: string | null; placeName: string; visitTime: string | null; category: string; memo: string | null; address: string | null; selected: boolean }>>([]);
  const aiFileRef = useRef<HTMLInputElement>(null);

  async function handleAiText() {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const res = await aiExtractMutation.mutateAsync({ tripId, text: aiText });
      const items = (res.items as Array<Record<string, unknown>>).map(i => ({
        date: (i.date as string | null) ?? null,
        placeName: (i.placeName as string) ?? "",
        visitTime: (i.visitTime as string | null) ?? null,
        category: (i.category as string) ?? "place",
        memo: (i.memo as string | null) ?? null,
        address: (i.address as string | null) ?? null,
        selected: true,
      }));
      if (items.length === 0) { toast.error("일정 정보를 찾지 못했습니다."); return; }
      setAiItems(items);
    } catch (e: any) {
      toast.error(e?.message?.includes("LLM_API_KEY") ? "LLM_API_KEY가 필요합니다." : "AI 분석 실패");
    } finally { setAiLoading(false); }
  }

  async function handleAiImage(file: File) {
    setAiLoading(true);
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      const b64 = await new Promise<string>((resolve, reject) => {
        img.onload = () => {
          const MAX = 1400; let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
            else { width = Math.round(width * MAX / height); height = MAX; }
          }
          const c = document.createElement("canvas"); c.width = width; c.height = height;
          c.getContext("2d")!.drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
        };
        img.onerror = reject; img.src = url;
      });
      const res = await aiExtractImageMutation.mutateAsync({ tripId, imageBase64: b64 });
      const items = (res.items as Array<Record<string, unknown>>).map(i => ({
        date: (i.date as string | null) ?? null,
        placeName: (i.placeName as string) ?? "",
        visitTime: (i.visitTime as string | null) ?? null,
        category: (i.category as string) ?? "place",
        memo: (i.memo as string | null) ?? null,
        address: (i.address as string | null) ?? null,
        selected: true,
      }));
      if (items.length === 0) { toast.error("일정 정보를 찾지 못했습니다."); return; }
      setAiItems(items);
    } catch (e: any) {
      toast.error(e?.message?.includes("LLM_API_KEY") ? "LLM_API_KEY가 필요합니다." : "이미지 분석 실패");
    } finally { setAiLoading(false); }
  }

  async function handleAiSave() {
    const toSave = aiItems.filter(i => i.selected && i.placeName);
    for (const item of toSave) {
      await createMutation.mutateAsync({
        tripId,
        date: item.date ?? selectedDate,
        placeName: item.placeName,
        visitTime: item.visitTime ?? undefined,
        category: item.category,
        memo: item.memo ?? undefined,
        address: item.address ?? undefined,
        order: (items?.length ?? 0),
      });
    }
    toast.success(`${toSave.length}개 일정이 추가됐습니다.`);
    setAiItems([]);
    setAiMode(null);
    setAiText("");
  }

  // dnd-kit 센서 설정 (마우스 + 터치 모두 지원)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !items) return;

    const oldIds = displayItems.map(i => i.id);
    const oldIndex = oldIds.indexOf(active.id as number);
    const newIndex = oldIds.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(oldIds, oldIndex, newIndex);
    setLocalOrder(newOrder); // 즉시 UI 반영
    reorderMutation.mutate({ tripId, orderedIds: newOrder }); // 서버 저장
  };

  const toggleVisited = (item: ItineraryItem) => {
    updateMutation.mutate({ id: item.id, visited: !item.visited });
  };

  const openCreate = () => { setEditId(null); setForm(defaultForm); setDialogOpen(true); };
  const openEdit = (item: ItineraryItem) => {
    setEditId(item.id);
    setForm({
      placeName: item.placeName,
      address: item.address ?? "",
      visitTime: item.visitTime ?? "",
      duration: item.duration?.toString() ?? "",
      memo: item.memo ?? "",
      category: item.category ?? "place",
      lat: item.lat ?? "",
      lng: item.lng ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.placeName) { toast.error("장소명을 입력해주세요."); return; }
    const data = {
      placeName: form.placeName,
      address: form.address || undefined,
      visitTime: form.visitTime || undefined,
      duration: form.duration ? parseInt(form.duration) : undefined,
      memo: form.memo || undefined,
      category: form.category,
      lat: form.lat || undefined,
      lng: form.lng || undefined,
    };
    if (editId) updateMutation.mutate({ id: editId, ...data });
    else createMutation.mutate({ tripId, date: selectedDate, order: (items?.length ?? 0), ...data });
  };

  const visitedCount = displayItems.filter(i => i.visited).length;
  const totalCount = displayItems.length;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">하루별 일정</h2>
          <p className="text-sm text-muted-foreground mt-0.5">날짜를 선택하고 방문 장소를 관리하세요. 드래그로 순서를 변경할 수 있습니다.</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto shrink-0">
          <Button onClick={() => { setAiMode(aiMode ? null : "text"); setAiItems([]); }} size="sm" variant="outline" className="gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />AI 입력
          </Button>
          <Button onClick={openCreate} size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />장소 추가
          </Button>
        </div>
      </div>

      {/* AI 입력 패널 */}
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
            <button onClick={() => { setAiMode(null); setAiItems([]); setAiText(""); }}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>

          {aiLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> AI 분석 중…
            </div>
          ) : aiItems.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">저장할 항목을 선택하세요. 날짜가 없으면 선택한 날짜로 저장됩니다.</p>
              {aiItems.map((item, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${item.selected ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}
                  onClick={() => setAiItems(prev => prev.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}>
                  <input type="checkbox" checked={item.selected} readOnly className="mt-0.5 accent-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.placeName}</p>
                    <p className="text-xs text-muted-foreground">{[item.date ?? selectedDate, item.visitTime, item.category].filter(Boolean).join(" · ")}</p>
                    {item.memo && <p className="text-xs text-muted-foreground italic">{item.memo}</p>}
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setAiItems([])} className="flex-1">다시 입력</Button>
                <Button size="sm" onClick={handleAiSave} disabled={!aiItems.some(i => i.selected)} className="flex-1">저장</Button>
              </div>
            </div>
          ) : aiMode === "text" ? (
            <>
              <textarea className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none h-28 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="일정을 텍스트로 입력하세요. 예: '5월 24일 오후 2시 닛폰다이라 로프웨이, 5월 25일 오전 마키노하라 차밭'"
                value={aiText} onChange={e => setAiText(e.target.value)} />
              <Button size="sm" onClick={handleAiText} disabled={!aiText.trim()} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />분석하기
              </Button>
            </>
          ) : (
            <>
              <button onClick={() => aiFileRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <Camera className="w-6 h-6" />
                <span className="text-sm">사진 선택 또는 카메라 촬영</span>
              </button>
              <input ref={aiFileRef} type="file" accept="image/*" capture="environment" className="hidden"
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
            <button
              key={dateStr}
              onClick={() => { setSelectedDate(dateStr); setLocalOrder(null); }}
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

      {/* 진행률 */}
      {totalCount > 0 && (
        <div className="flex items-center gap-3 bg-muted/40 rounded-xl px-4 py-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-foreground">
                {format(new Date(selectedDate + "T00:00:00"), "M월 d일 (EEE)", { locale: ko })} 일정
              </span>
              <span className="text-sm text-muted-foreground">{visitedCount}/{totalCount} 완료</span>
            </div>
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${totalCount > 0 ? (visitedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 드래그 안내 */}
      {totalCount > 1 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GripVertical className="w-3.5 h-3.5" />
          왼쪽 핸들을 드래그해서 순서를 변경하면 지도에도 반영됩니다
        </p>
      )}

      {/* 아이템 목록 */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : displayItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 rounded-2xl border border-dashed border-border bg-muted/30">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <CalendarDays className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">이 날의 일정이 없습니다</p>
            <p className="text-xs text-muted-foreground mt-1">방문할 장소를 추가해보세요.</p>
          </div>
          <Button onClick={openCreate} size="sm" variant="outline" className="gap-1.5">
            <Plus className="w-4 h-4" />장소 추가
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayItems.map(i => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {displayItems.map((item, idx) => (
                <SortableItem
                  key={item.id}
                  item={item}
                  idx={idx}
                  total={displayItems.length}
                  onToggle={toggleVisited}
                  onEdit={openEdit}
                  onDelete={(id) => deleteMutation.mutate({ id })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-5 sm:p-6">
          <DialogHeader className="mb-1">
            <DialogTitle className="text-lg font-semibold">{editId ? "장소 수정" : "장소 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 max-h-[70vh] overflow-y-auto">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">카테고리</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">장소명 <span className="text-destructive">*</span></Label>
              <Input
                ref={placeInputRef}
                className="h-10"
                placeholder="장소를 검색하세요 (예: 센소지, 에펠탑…)"
                value={form.placeName}
                onChange={e => setForm(f => ({ ...f, placeName: e.target.value, lat: "", lng: "" }))}
              />
              {form.lat && form.lng && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />위치 좌표 저장됨
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">주소</Label>
              <Input className="h-10" placeholder="자동 입력되거나 직접 입력" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">방문 시간</Label>
              <Input className="h-10" type="time" value={form.visitTime} onChange={e => setForm(f => ({ ...f, visitTime: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">소요 시간 (분)</Label>
              <Input className="h-10" type="number" placeholder="60" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">메모</Label>
              <Textarea className="resize-none" placeholder="방문 메모..." value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={2} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editId ? "수정" : "추가"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

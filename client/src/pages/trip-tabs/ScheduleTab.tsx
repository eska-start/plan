import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect, memo } from "react";
import { loadMapScript } from "@/components/Map";
import { toast } from "sonner";
import {
  Loader2, MapPin, CheckCircle2, Circle, Plus,
  Utensils, Camera, ShoppingBag, Pencil, Trash2, CalendarDays,
  Sparkles, FileText, X, FolderOpen, Map as MapIcon, Hotel,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format, parseISO, isToday } from "date-fns";
import { ko } from "date-fns/locale";
import FadeIn from "@/components/FadeIn";

const CATEGORIES = [
  { value: "place", label: "장소", icon: MapPin },
  { value: "food", label: "식사", icon: Utensils },
  { value: "activity", label: "액티비티", icon: Camera },
  { value: "shopping", label: "쇼핑", icon: ShoppingBag },
];

const CAT_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  place:         { label: "장소",     bg: "#DEF1EA", color: "#2E6B58" },
  food:          { label: "식사",     bg: "#FDE2D7", color: "#A04A30" },
  activity:      { label: "액티비티", bg: "#DEF1EA", color: "#2E6B58" },
  shopping:      { label: "쇼핑",    bg: "#EDE9FE", color: "#7C3AED" },
  accommodation: { label: "숙박",    bg: "#FBEFCC", color: "#7A5A1E" },
};

type ItineraryItem = {
  id: number; date: string; placeName: string;
  address?: string | null; visitTime?: string | null; duration?: number | null;
  visited?: boolean | null; memo?: string | null; category?: string | null;
  sourceType?: string | null; order?: number | null; lat?: string | null; lng?: string | null;
};

type FormData = {
  placeName: string; address: string; visitTime: string;
  duration: string; memo: string; category: string; lat: string; lng: string;
};

const ScheduleItemRow = memo(function ScheduleItemRow({
  item, k, onVisitToggle, onEdit, onDelete,
}: {
  item: ItineraryItem; k: number;
  onVisitToggle: (id: number, visited: boolean) => void;
  onEdit: (item: ItineraryItem) => void;
  onDelete: (id: number) => void;
}) {
  const [localVisited, setLocalVisited] = useState<boolean | null>(null);
  const effectivelyVisited = localVisited !== null ? localVisited : !!item.visited;
  useEffect(() => { setLocalVisited(null); }, [item.visited]);

  const s = CAT_STYLE[item.sourceType === "accommodation" ? "accommodation" : (item.category ?? "place")] ?? CAT_STYLE.place;
  const mapsUrl = item.lat && item.lng
    ? `https://maps.google.com/?q=${item.lat},${item.lng}`
    : `https://maps.google.com/?q=${encodeURIComponent([item.placeName, item.address].filter(Boolean).join(" "))}`;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3.5 border-t first:border-t-0 border-border group hover:bg-muted/30 transition-colors ${effectivelyVisited ? "opacity-60" : ""}`}
      style={{ animation: `fadeSlideUp 0.35s ease ${k * 0.06}s both` }}
    >
      <button
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          const newVisited = !effectivelyVisited;
          setLocalVisited(newVisited);
          onVisitToggle(item.id, newVisited);
        }}
        className="mt-0.5 shrink-0"
      >
        {effectivelyVisited
          ? <CheckCircle2 className="w-4 h-4 text-accent" />
          : <Circle className="w-4 h-4 text-muted-foreground hover:text-accent" />}
      </button>

      {item.visitTime
        ? <div className="w-10 shrink-0 mt-0.5"><span className="text-xs font-medium text-muted-foreground tabular-nums">{item.visitTime}</span></div>
        : <div className="w-10 shrink-0" />}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-sm font-semibold ${effectivelyVisited ? "line-through text-muted-foreground" : "text-foreground hover:text-blue-500"}`}
          >
            {item.sourceType === "accommodation" && <Hotel className="w-3.5 h-3.5 shrink-0" />}
            {item.placeName.replace(/^🏨\s*/, "")}
          </a>
        </div>
        {item.address && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" />{item.address}</p>
        )}
        {item.memo && (
          <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{item.memo}</p>
        )}
      </div>

      <div className="flex gap-1 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-blue-500 transition-colors" title="구글 지도에서 보기"><MapIcon className="w-3.5 h-3.5" /></a>
        {item.sourceType !== "accommodation" ? (
          <>
            <button onClick={() => onEdit(item)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={() => onDelete(item.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-medium"><Hotel className="w-3 h-3" />숙박</span>
        )}
      </div>
    </div>
  );
});

export default function ScheduleTab({ tripId, tripDays }: { tripId: number; tripDays: Date[] }) {
  const utils = trpc.useUtils();
  const tripStartDate = tripDays[0] ? format(tripDays[0], "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

  const defaultIdx = (() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const idx = tripDays.findIndex(d => format(d, "yyyy-MM-dd") === todayStr);
    return idx >= 0 ? idx : 0;
  })();

  const [selectedIdx, setSelectedIdx] = useState(defaultIdx);
  const selectedDate = tripDays[selectedIdx] ? format(tripDays[selectedIdx], "yyyy-MM-dd") : "";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>({
    placeName: "", address: "", visitTime: "", duration: "", memo: "", category: "place", lat: "", lng: "",
  });

  // Dialog AI state
  const [dialogAiMode, setDialogAiMode] = useState<"text" | "image" | null>(null);
  const [dialogAiText, setDialogAiText] = useState("");
  const [dialogAiLoading, setDialogAiLoading] = useState(false);
  const dialogAiCameraRef = useRef<HTMLInputElement>(null);
  const dialogAiPhotoRef = useRef<HTMLInputElement>(null);

  const placeInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const { data: items, isLoading } = trpc.itinerary.listByDate.useQuery(
    { tripId, date: selectedDate },
    { enabled: !!selectedDate }
  );
  const createMutation = trpc.itinerary.create.useMutation({
    onSuccess: () => { utils.itinerary.listByDate.invalidate(); utils.itinerary.listByTrip.invalidate(); setDialogOpen(false); setForm({ placeName: "", address: "", visitTime: "", duration: "", memo: "", category: "place", lat: "", lng: "" }); toast.success("추가됐습니다."); },
    onError: () => toast.error("추가에 실패했습니다."),
  });
  const updateMutation = trpc.itinerary.update.useMutation({
    onSuccess: () => { utils.itinerary.listByDate.invalidate(); utils.itinerary.listByTrip.invalidate(); setDialogOpen(false); setEditId(null); toast.success("수정됐습니다."); },
    onError: () => toast.error("수정에 실패했습니다."),
  });
  const deleteMutation = trpc.itinerary.delete.useMutation({
    onSuccess: () => { utils.itinerary.listByDate.invalidate(); utils.itinerary.listByTrip.invalidate(); toast.success("일정이 삭제되었습니다."); },
    onError: () => toast.error("삭제에 실패했습니다."),
  });
  const aiExtractMutation = trpc.itinerary.aiExtract.useMutation();
  const aiExtractImageMutation = trpc.itinerary.aiExtractFromImage.useMutation();

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
        setForm(f => ({ ...f, placeName: place.name ?? f.placeName, address: place.formatted_address ?? f.address, lat: place.geometry?.location?.lat().toString() ?? f.lat, lng: place.geometry?.location?.lng().toString() ?? f.lng }));
      });
      autocompleteRef.current = ac;
    }
    init();
    return () => { destroyed = true; if (autocompleteRef.current && window.google?.maps) window.google.maps.event.clearInstanceListeners(autocompleteRef.current); };
  }, [dialogOpen]);

  const sortedItems = [...(items as ItineraryItem[] ?? [])].sort((a, b) => {
    if (a.visitTime && b.visitTime) return a.visitTime.localeCompare(b.visitTime);
    if (a.visitTime) return -1; if (b.visitTime) return 1;
    return (a.order ?? 0) - (b.order ?? 0);
  });

  function openCreate() {
    setEditId(null);
    setForm({ placeName: "", address: "", visitTime: "", duration: "", memo: "", category: "place", lat: "", lng: "" });
    setDialogAiMode(null);
    setDialogAiText("");
    setDialogOpen(true);
  }
  function openEdit(item: ItineraryItem) {
    setEditId(item.id);
    setForm({ placeName: item.placeName, address: item.address ?? "", visitTime: item.visitTime ?? "", duration: item.duration?.toString() ?? "", memo: item.memo ?? "", category: item.category ?? "place", lat: item.lat ?? "", lng: item.lng ?? "" });
    setDialogAiMode(null);
    setDialogAiText("");
    setDialogOpen(true);
  }
  function handleSubmit() {
    if (!form.placeName) { toast.error("장소명을 입력하세요."); return; }
    const data = { placeName: form.placeName, address: form.address || undefined, visitTime: form.visitTime || undefined, duration: form.duration ? parseInt(form.duration) : undefined, memo: form.memo || undefined, category: form.category, lat: form.lat || undefined, lng: form.lng || undefined };
    if (editId) updateMutation.mutate({ id: editId, ...data });
    else createMutation.mutate({ tripId, date: selectedDate, order: sortedItems.length, ...data });
  }

  async function resizeImageToBase64(file: File): Promise<string> {
    const img = new Image();
    const url = URL.createObjectURL(file);
    return new Promise<string>((resolve, reject) => {
      img.onload = () => {
        const MAX = 1400; let { width, height } = img;
        if (width > MAX || height > MAX) { if (width > height) { height = Math.round(height * MAX / width); width = MAX; } else { width = Math.round(width * MAX / height); height = MAX; } }
        const c = document.createElement("canvas"); c.width = width; c.height = height;
        c.getContext("2d")!.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      img.onerror = reject; img.src = url;
    });
  }

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
      setDialogAiMode(null);
      setDialogAiText("");
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

  const selectedDay = tripDays[selectedIdx];

  return (
    <div className="space-y-4">
      {/* Day selector */}
      <FadeIn>
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">날짜 선택</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {tripDays.map((day, i) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const isSelected = i === selectedIdx;
              const today = isToday(day);
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedIdx(i)}
                  className={`flex flex-col items-center shrink-0 w-12 py-2.5 rounded-xl transition-all ${isSelected ? "bg-primary text-white shadow-md scale-105" : today ? "bg-primary/10 text-primary border border-primary/30" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  <span className="text-[10px] font-medium">{format(day, "EEE", { locale: ko })}</span>
                  <span className="text-lg font-bold leading-tight">{format(day, "d")}</span>
                  <span className="text-[9px] opacity-70">Day{i + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      </FadeIn>

      {/* Selected day header */}
      {selectedDay && (
        <FadeIn delay={0.05}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">
                {format(selectedDay, "M월 d일 (EEE)", { locale: ko })}
                {isToday(selectedDay) && <span className="ml-2 text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-semibold">오늘</span>}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sortedItems.length}건의 일정 · {sortedItems.filter(i => i.visited).length}건 완료
              </p>
            </div>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />추가
            </Button>
          </div>
        </FadeIn>
      )}

      {/* Items */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : sortedItems.length === 0 ? (
        <FadeIn delay={0.1}>
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground rounded-2xl border border-dashed">
            <CalendarDays className="w-8 h-8 opacity-25" />
            <p className="text-sm">이 날 일정이 없어요</p>
            <Button size="sm" variant="outline" onClick={openCreate} className="gap-1.5 mt-1">
              <Plus className="w-3.5 h-3.5" />일정 추가
            </Button>
          </div>
        </FadeIn>
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden">
          {sortedItems.map((item, k) => (
              <ScheduleItemRow
                key={item.id}
                item={item}
                k={k}
                onVisitToggle={(id, visited) => updateMutation.mutate({ id, visited })}
                onEdit={openEdit}
                onDelete={setDeleteId}
              />
          ))}
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>일정 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 일정을 삭제할까요?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId == null) return;
                deleteMutation.mutate({ id: deleteId });
                setDeleteId(null);
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-5 sm:p-6">
          <DialogHeader className="mb-1">
            <DialogTitle className="text-lg font-semibold">
              {editId ? "장소 수정" : `${selectedDay ? format(selectedDay, "M월 d일", { locale: ko }) : ""} 장소 추가`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 max-h-[70vh] overflow-y-auto">
            {/* AI 자동 입력 */}
            <div>
              {dialogAiMode === null ? (
                <button
                  type="button"
                  onClick={() => setDialogAiMode("text")}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                >
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
                        placeholder="예: 오후 2시 아사쿠사 센소지 방문, 식사는 스시 레스토랑"
                        value={dialogAiText}
                        onChange={e => setDialogAiText(e.target.value)}
                      />
                      <Button size="sm" onClick={handleDialogAiText} disabled={!dialogAiText.trim()} className="gap-1.5 w-full">
                        <Sparkles className="w-3.5 h-3.5" />분석하기
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => dialogAiCameraRef.current?.click()}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Camera className="w-3.5 h-3.5" />카메라
                      </button>
                      <button
                        type="button"
                        onClick={() => dialogAiPhotoRef.current?.click()}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
                      >
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

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">카테고리</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">장소명 <span className="text-destructive">*</span></Label>
              <Input ref={placeInputRef} className="h-10" placeholder="장소를 검색하세요" value={form.placeName}
                onChange={e => setForm(f => ({ ...f, placeName: e.target.value, lat: "", lng: "" }))} />
              {form.lat && form.lng && <p className="text-xs text-green-600 flex items-center gap-1"><MapPin className="w-3 h-3" />위치 저장됨</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">주소</Label>
              <Input className="h-10" placeholder="자동 입력되거나 직접 입력" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">방문 시간</Label>
              <Input className="h-10 w-full" type="time" value={form.visitTime} onChange={e => setForm(f => ({ ...f, visitTime: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">소요 (분)</Label>
              <Input className="h-10 w-full" type="number" placeholder="60" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} />
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

      <style>{`@keyframes fadeSlideUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }`}</style>
    </div>
  );
}

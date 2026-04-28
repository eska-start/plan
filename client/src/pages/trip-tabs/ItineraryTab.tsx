import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { loadMapScript } from "@/components/Map";
import { toast } from "sonner";
import {
  CalendarDays, Loader2, MapPin, Clock, CheckCircle2, Circle,
  Plus, Utensils, Camera, ShoppingBag, Hotel,
  Sparkles, FileText, X, Pencil, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";

type ItineraryItem = {
  id: number; date: string; placeName: string;
  address?: string | null; visitTime?: string | null; duration?: number | null;
  visited?: boolean | null; memo?: string | null; category?: string | null;
  sourceType?: string | null; order?: number | null; lat?: string | null; lng?: string | null;
};

type FormData = {
  date: string; placeName: string; address: string; visitTime: string;
  duration: string; memo: string; category: string; lat: string; lng: string;
};

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

function CategoryPill({ category }: { category: string }) {
  const s = CAT_STYLE[category] ?? CAT_STYLE.place;
  return (
    <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}

export default function ItineraryTab({ tripId, tripDays }: { tripId: number; tripDays: Date[] }) {
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const tripStartDate = tripDays[0] ? format(tripDays[0], "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState<FormData>({
    date: tripStartDate, placeName: "", address: "", visitTime: "",
    duration: "", memo: "", category: "place", lat: "", lng: "",
  });

  const [aiMode, setAiMode] = useState<"text" | "image" | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiItems, setAiItems] = useState<Array<{
    date: string | null; placeName: string; visitTime: string | null;
    category: string; memo: string | null; address: string | null; selected: boolean;
  }>>([]);
  const aiFileRef = useRef<HTMLInputElement>(null);
  const placeInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // Animation state
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [visibleDays, setVisibleDays] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const { data: allItems, isLoading } = trpc.itinerary.listByTrip.useQuery({ tripId });

  const createMutation = trpc.itinerary.create.useMutation({
    onSuccess: () => {
      utils.itinerary.listByTrip.invalidate();
      utils.itinerary.listByDate.invalidate();
      setDialogOpen(false);
      setForm(f => ({ ...f, placeName: "", address: "", visitTime: "", duration: "", memo: "", lat: "", lng: "" }));
      toast.success("장소가 추가됐습니다.");
    },
    onError: () => toast.error("장소 추가에 실패했습니다."),
  });
  const updateMutation = trpc.itinerary.update.useMutation({
    onSuccess: () => { utils.itinerary.listByTrip.invalidate(); utils.itinerary.listByDate.invalidate(); setDialogOpen(false); setEditId(null); toast.success("수정됐습니다."); },
    onError: () => toast.error("수정에 실패했습니다."),
  });
  const deleteMutation = trpc.itinerary.delete.useMutation({
    onSuccess: () => { utils.itinerary.listByTrip.invalidate(); utils.itinerary.listByDate.invalidate(); toast.success("일정이 삭제되었습니다."); },
    onError: () => toast.error("삭제에 실패했습니다."),
  });
  const aiExtractMutation = trpc.itinerary.aiExtract.useMutation();
  const aiExtractImageMutation = trpc.itinerary.aiExtractFromImage.useMutation();

  // IntersectionObserver for timeline animations
  useEffect(() => {
    if (isLoading) return;
    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisibleDays(prev => {
          const next = new Set(prev);
          let changed = false;
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const d = (entry.target as HTMLElement).dataset.date;
              if (d && !next.has(d)) { next.add(d); changed = true; observerRef.current?.unobserve(entry.target); }
            }
          });
          return changed ? next : prev;
        });
      },
      { threshold: 0.04, rootMargin: "0px 0px -20px 0px" }
    );
    Object.values(dayRefs.current).forEach(el => { if (el) observerRef.current!.observe(el); });
    return () => observerRef.current?.disconnect();
  }, [isLoading, tripDays.length]);

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
        setForm(f => ({ ...f, placeName: place.name ?? f.placeName, address: place.formatted_address ?? f.address, lat: place.geometry?.location?.lat().toString() ?? f.lat, lng: place.geometry?.location?.lng().toString() ?? f.lng }));
      });
      autocompleteRef.current = ac;
    }
    init();
    return () => { destroyed = true; if (autocompleteRef.current && window.google?.maps) window.google.maps.event.clearInstanceListeners(autocompleteRef.current); };
  }, [dialogOpen]);

  // Group items by date
  const byDate: Record<string, ItineraryItem[]> = {};
  (allItems as ItineraryItem[] ?? []).forEach(item => {
    if (!byDate[item.date]) byDate[item.date] = [];
    byDate[item.date].push(item);
  });
  Object.values(byDate).forEach(arr => arr.sort((a, b) => {
    if (a.visitTime && b.visitTime) return a.visitTime.localeCompare(b.visitTime);
    if (a.visitTime) return -1; if (b.visitTime) return 1;
    return (a.order ?? 0) - (b.order ?? 0);
  }));

  const totalItems = (allItems as ItineraryItem[] ?? []).length;
  const visitedItems = (allItems as ItineraryItem[] ?? []).filter(i => i.visited).length;

  function openCreate(date?: string) {
    setEditId(null);
    setForm(f => ({ ...f, date: date ?? tripStartDate, placeName: "", address: "", visitTime: "", duration: "", memo: "", category: "place", lat: "", lng: "" }));
    setDialogOpen(true);
  }
  function openEdit(item: ItineraryItem) {
    setEditId(item.id);
    setForm({ date: item.date, placeName: item.placeName, address: item.address ?? "", visitTime: item.visitTime ?? "", duration: item.duration?.toString() ?? "", memo: item.memo ?? "", category: item.category ?? "place", lat: item.lat ?? "", lng: item.lng ?? "" });
    setDialogOpen(true);
  }
  function handleSubmit() {
    if (!form.placeName) { toast.error("장소명을 입력하세요."); return; }
    const data = { placeName: form.placeName, address: form.address || undefined, visitTime: form.visitTime || undefined, duration: form.duration ? parseInt(form.duration) : undefined, memo: form.memo || undefined, category: form.category, lat: form.lat || undefined, lng: form.lng || undefined };
    if (editId) updateMutation.mutate({ id: editId, ...data });
    else createMutation.mutate({ tripId, date: form.date, order: (byDate[form.date]?.length ?? 0), ...data });
  }

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
      const img = new Image(); const url = URL.createObjectURL(file);
      const b64 = await new Promise<string>((resolve, reject) => {
        img.onload = () => {
          const MAX = 1400; let { width, height } = img;
          if (width > MAX || height > MAX) { if (width > height) { height = Math.round(height * MAX / width); width = MAX; } else { width = Math.round(width * MAX / height); height = MAX; } }
          const c = document.createElement("canvas"); c.width = width; c.height = height;
          c.getContext("2d")!.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url);
          resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
        };
        img.onerror = reject; img.src = url;
      });
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
      await createMutation.mutateAsync({ tripId, date: item.date ?? tripStartDate, placeName: item.placeName, visitTime: item.visitTime ?? undefined, category: item.category, memo: item.memo ?? undefined, address: item.address ?? undefined, order: (byDate[item.date ?? tripStartDate]?.length ?? 0) });
    }
    toast.success(`${toSave.length}개 일정이 추가됐습니다.`);
    setAiItems([]); setAiMode(null); setAiText("");
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">여정 타임라인</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            날짜별로 펼쳐보는 {tripDays.length}일
            {totalItems > 0 && <span className="ml-2 text-primary font-medium">{visitedItems}/{totalItems} 완료</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setAiMode(aiMode ? null : "text"); setAiItems([]); }} size="sm" variant="outline" className="gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />AI 입력
          </Button>
          <Button onClick={() => openCreate()} size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />일정 추가
          </Button>
        </div>
      </div>

      {/* AI Panel */}
      {aiMode && (
        <div className="rounded-2xl border bg-card p-4 space-y-3 mb-5">
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> AI 분석 중…</div>
          ) : aiItems.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">저장할 항목을 선택하세요.</p>
              {aiItems.map((item, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${item.selected ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}
                  onClick={() => setAiItems(prev => prev.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}>
                  <input type="checkbox" checked={item.selected} readOnly className="mt-0.5 accent-primary" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <CategoryPill category={item.category} />
                      <p className="text-sm font-medium">{item.placeName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{[item.date, item.visitTime].filter(Boolean).join(" · ")}</p>
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
              <textarea className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none h-28 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="일정을 입력하세요. 예: '5월 24일 오후 2시 닛폰다이라 로프웨이, 5월 25일 오전 마키노하라 차밭'"
                value={aiText} onChange={e => setAiText(e.target.value)} />
              <Button size="sm" onClick={handleAiText} disabled={!aiText.trim()} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />분석하기
              </Button>
            </>
          ) : (
            <>
              <button onClick={() => aiFileRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <Camera className="w-6 h-6" /><span className="text-sm">사진 선택 또는 카메라 촬영</span>
              </button>
              <input ref={aiFileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAiImage(f); e.target.value = ""; }} />
            </>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      )}

      {/* Timeline */}
      {!isLoading && (
        <div>
          {tripDays.map((day, idx) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayItems = byDate[dateStr] ?? [];
            const dayDone = dayItems.filter(i => i.visited).length;
            const visible = visibleDays.has(dateStr);

            return (
              <div
                key={dateStr}
                ref={el => { dayRefs.current[dateStr] = el; }}
                data-date={dateStr}
                className="flex gap-0 mb-1"
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(20px)",
                  transition: "opacity 0.5s ease, transform 0.5s ease",
                }}
              >
                {/* Date column */}
                <div className="w-[70px] sm:w-[78px] md:w-[86px] shrink-0 pt-5 pr-2 sm:pr-3 md:pr-4 text-right">
                  <div
                    className="font-display text-[2.2rem] font-semibold leading-none text-foreground"
                    style={{
                      opacity: visible ? 1 : 0,
                      transform: visible ? "translateX(0)" : "translateX(-8px)",
                      transition: "opacity 0.4s ease 0.1s, transform 0.4s ease 0.1s",
                    }}
                  >
                    {format(day, "d")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 leading-tight">
                    {format(day, "M월", { locale: ko })}·{format(day, "EEE", { locale: ko })}
                  </div>
                  <div className="text-xs text-primary font-semibold mt-1">Day {idx + 1}</div>
                  {dayItems.length > 0 && (
                    <div className="text-[10px] text-muted-foreground mt-1">{dayDone}/{dayItems.length}</div>
                  )}
                </div>

                {/* Timeline right column */}
                <div className="relative flex-1 min-w-0 pl-4 sm:pl-5 pt-4 pb-2">
                  {/* Animated vertical line */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-px bg-border"
                    style={{
                      transformOrigin: "top",
                      transform: visible ? "scaleY(1)" : "scaleY(0)",
                      transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.05s",
                    }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {/* Animated dot */}
                        <div
                          className="w-2 h-2 rounded-full bg-primary -ml-[22px] ring-2 ring-background"
                          style={{
                            transform: visible ? "scale(1)" : "scale(0)",
                            transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s",
                          }}
                        />
                        {dayItems.length === 0 ? (
                          <span className="text-sm text-muted-foreground">일정 없음</span>
                        ) : (
                          <span className="text-sm font-semibold text-foreground">{dayItems.length}건</span>
                        )}
                      </div>
                      <button
                        onClick={() => openCreate(dateStr)}
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3 h-3" />추가
                      </button>
                    </div>

                    {dayItems.length === 0 ? (
                      <div className="mb-4" />
                    ) : (
                      <div className="rounded-2xl border bg-card overflow-hidden mb-4">
                        {dayItems.map((item, k) => (
                          <div
                            key={item.id}
                            className={`flex items-start gap-2.5 sm:gap-3 px-3 sm:px-4 py-3.5 border-t first:border-t-0 border-border group hover:bg-muted/30 ${item.visited ? "opacity-60" : ""}`}
                            style={{
                              opacity: visible ? (item.visited ? 0.6 : 1) : 0,
                              transform: visible ? "translateY(0)" : "translateY(8px)",
                              transition: `opacity 0.4s ease ${0.2 + k * 0.07}s, transform 0.4s ease ${0.2 + k * 0.07}s`,
                            }}
                          >
                            <button
                              onClick={() => updateMutation.mutate({ id: item.id, visited: !item.visited })}
                              className="mt-0.5 shrink-0 transition-colors"
                            >
                              {item.visited
                                ? <CheckCircle2 className="w-4 h-4 text-accent" />
                                : <Circle className="w-4 h-4 text-muted-foreground hover:text-accent" />}
                            </button>

                            <div className="w-9 sm:w-10 shrink-0 mt-0.5">
                              {item.visitTime && (
                                <span className="text-xs font-medium text-muted-foreground tabular-nums">{item.visitTime}</span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <CategoryPill category={item.sourceType === "accommodation" ? "accommodation" : (item.category ?? "place")} />
                                <span className={`text-sm font-semibold ${item.visited ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                  {item.placeName}
                                </span>
                              </div>
                              {item.address && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3 shrink-0" />{item.address}
                                </p>
                              )}
                              {item.memo && !item.address && (
                                <p className="text-xs text-muted-foreground italic">{item.memo}</p>
                              )}
                            </div>

                            {/* Actions — 기본 40% 불투명, hover 100% (모바일도 보임) */}
                            <div className="flex gap-1 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                              {item.sourceType !== "accommodation" ? (
                                <>
                                  <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (!window.confirm("이 일정을 삭제할까요?")) return;
                                      deleteMutation.mutate({ id: item.id });
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-medium">숙박 연동</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-5 sm:p-6">
          <DialogHeader className="mb-1">
            <DialogTitle className="text-lg font-semibold">{editId ? "장소 수정" : "장소 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 max-h-[70vh] overflow-y-auto">
            {!editId && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">날짜</Label>
                <Input className="h-10" type="date" value={form.date}
                  min={tripDays[0] ? format(tripDays[0], "yyyy-MM-dd") : undefined}
                  max={tripDays[tripDays.length - 1] ? format(tripDays[tripDays.length - 1], "yyyy-MM-dd") : undefined}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">카테고리</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">장소명 <span className="text-destructive">*</span></Label>
              <Input ref={placeInputRef} className="h-10" placeholder="장소를 검색하세요" value={form.placeName}
                onChange={e => setForm(f => ({ ...f, placeName: e.target.value, lat: "", lng: "" }))} />
              {form.lat && form.lng && <p className="text-xs text-green-600 flex items-center gap-1"><MapPin className="w-3 h-3" />위치 좌표 저장됨</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">주소</Label>
              <Input className="h-10" placeholder="자동 입력되거나 직접 입력" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">방문 시간</Label>
                <Input className="h-10" type="time" value={form.visitTime} onChange={e => setForm(f => ({ ...f, visitTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">소요 (분)</Label>
                <Input className="h-10" type="number" placeholder="60" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} />
              </div>
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

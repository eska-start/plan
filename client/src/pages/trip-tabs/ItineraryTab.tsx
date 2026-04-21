import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Loader2, MapPin, Clock, CheckCircle2, Circle, Plus, Utensils, Camera, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

type FormData = {
  placeName: string;
  address: string;
  visitTime: string;
  duration: string;
  memo: string;
  category: string;
};

const defaultForm: FormData = {
  placeName: "", address: "", visitTime: "", duration: "", memo: "", category: "place",
};

const CATEGORIES = [
  { value: "place", label: "장소", icon: MapPin },
  { value: "food", label: "식당/카페", icon: Utensils },
  { value: "activity", label: "액티비티", icon: Camera },
  { value: "shopping", label: "쇼핑", icon: ShoppingBag },
];

const CATEGORY_COLORS: Record<string, string> = {
  place: "bg-blue-50 text-blue-600 border-blue-200",
  food: "bg-orange-50 text-orange-600 border-orange-200",
  activity: "bg-green-50 text-green-600 border-green-200",
  shopping: "bg-purple-50 text-purple-600 border-purple-200",
};

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  place: MapPin, food: Utensils, activity: Camera, shopping: ShoppingBag,
};

export default function ItineraryTab({ tripId, tripDays }: { tripId: number; tripDays: Date[] }) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (tripDays.length > 0) return format(tripDays[0], "yyyy-MM-dd");
    return format(new Date(), "yyyy-MM-dd");
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  const utils = trpc.useUtils();

  const { data: items, isLoading } = trpc.itinerary.listByDate.useQuery({ tripId, date: selectedDate });

  const createMutation = trpc.itinerary.create.useMutation({
    onSuccess: () => { utils.itinerary.listByDate.invalidate(); setDialogOpen(false); setForm(defaultForm); toast.success("장소가 추가되었습니다."); },
    onError: () => toast.error("장소 추가에 실패했습니다."),
  });

  const updateMutation = trpc.itinerary.update.useMutation({
    onSuccess: () => { utils.itinerary.listByDate.invalidate(); setDialogOpen(false); setEditId(null); setForm(defaultForm); toast.success("장소가 수정되었습니다."); },
    onError: () => toast.error("장소 수정에 실패했습니다."),
  });

  const deleteMutation = trpc.itinerary.delete.useMutation({
    onSuccess: () => { utils.itinerary.listByDate.invalidate(); toast.success("장소가 삭제되었습니다."); },
    onError: () => toast.error("장소 삭제에 실패했습니다."),
  });

  const toggleVisited = (item: NonNullable<typeof items>[number]) => {
    updateMutation.mutate({ id: item.id, visited: !item.visited });
  };

  const openCreate = () => { setEditId(null); setForm(defaultForm); setDialogOpen(true); };
  const openEdit = (item: NonNullable<typeof items>[number]) => {
    setEditId(item.id);
    setForm({
      placeName: item.placeName, address: item.address ?? "",
      visitTime: item.visitTime ?? "", duration: item.duration?.toString() ?? "",
      memo: item.memo ?? "", category: item.category ?? "place",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.placeName) { toast.error("장소명을 입력해주세요."); return; }
    const data = { ...form, duration: form.duration ? parseInt(form.duration) : undefined };
    if (editId) updateMutation.mutate({ id: editId, ...data });
    else createMutation.mutate({ tripId, date: selectedDate, order: (items?.length ?? 0), ...data });
  };

  const visitedCount = items?.filter(i => i.visited).length ?? 0;
  const totalCount = items?.length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">하루별 일정</h2>
          <p className="text-sm text-muted-foreground mt-0.5">날짜를 선택하고 방문 장소를 관리하세요.</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5 self-start sm:self-auto shrink-0">
          <Plus className="w-3.5 h-3.5" />장소 추가
        </Button>
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

      {/* Progress */}
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

      {/* Items */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !items || items.length === 0 ? (
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
        <div className="space-y-2">
          {items.map((item, idx) => {
            const CategoryIcon = CATEGORY_ICONS[item.category ?? "place"] ?? MapPin;
            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 bg-card border rounded-xl p-4 transition-all ${
                  item.visited ? "opacity-60 border-border" : "border-border hover:shadow-sm"
                }`}
              >
                {/* Order & Check */}
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleVisited(item)}
                    className="transition-colors"
                  >
                    {item.visited
                      ? <CheckCircle2 className="w-5 h-5 text-accent" />
                      : <Circle className="w-5 h-5 text-muted-foreground hover:text-accent" />
                    }
                  </button>
                  {idx < items.length - 1 && (
                    <div className="w-px h-4 bg-border" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[item.category ?? "place"]}`}>
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
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />{item.address}
                        </p>
                      )}
                      {item.memo && (
                        <p className="text-xs text-muted-foreground mt-1 italic">{item.memo}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEdit(item)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">수정</button>
                      <button onClick={() => deleteMutation.mutate({ id: item.id })} className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded hover:bg-destructive/10 transition-colors">삭제</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
              <Input className="h-10" placeholder="아사쿠사 센소지" value={form.placeName} onChange={e => setForm(f => ({ ...f, placeName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">주소</Label>
              <Input className="h-10" placeholder="도쿄 다이토구 아사쿠사 2-3-1" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
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

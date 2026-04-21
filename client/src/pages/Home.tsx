import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Plane,
  Plus,
  MapPin,
  Calendar,
  Trash2,
  ArrowRight,
  Compass,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { format, differenceInDays, parseISO } from "date-fns";
import { ko } from "date-fns/locale";

const COVER_COLORS = [
  "#1e293b", "#312e81", "#164e63", "#14532d",
  "#7c2d12", "#4a1d96", "#0f172a", "#1c1917",
];

type TripFormData = {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  coverColor: string;
  description: string;
};

const defaultForm: TripFormData = {
  name: "",
  destination: "",
  startDate: "",
  endDate: "",
  coverColor: COVER_COLORS[0],
  description: "",
};

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTrip, setEditTrip] = useState<number | null>(null);
  const [form, setForm] = useState<TripFormData>(defaultForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: trips, isLoading } = trpc.trips.list.useQuery();

  const createMutation = trpc.trips.create.useMutation({
    onSuccess: () => {
      utils.trips.list.invalidate();
      setDialogOpen(false);
      setForm(defaultForm);
      toast.success("여행이 생성되었습니다!");
    },
    onError: () => toast.error("여행 생성에 실패했습니다."),
  });

  const updateMutation = trpc.trips.update.useMutation({
    onSuccess: () => {
      utils.trips.list.invalidate();
      setDialogOpen(false);
      setEditTrip(null);
      setForm(defaultForm);
      toast.success("여행이 수정되었습니다!");
    },
    onError: () => toast.error("여행 수정에 실패했습니다."),
  });

  const deleteMutation = trpc.trips.delete.useMutation({
    onSuccess: () => {
      utils.trips.list.invalidate();
      setDeleteConfirm(null);
      toast.success("여행이 삭제되었습니다.");
    },
    onError: () => toast.error("여행 삭제에 실패했습니다."),
  });

  const openCreate = () => {
    setEditTrip(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (trip: NonNullable<typeof trips>[number], e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTrip(trip.id);
    setForm({
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      coverColor: trip.coverColor ?? COVER_COLORS[0],
      description: trip.description ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.destination || !form.startDate || !form.endDate) {
      toast.error("필수 항목을 모두 입력해주세요.");
      return;
    }
    if (editTrip) {
      updateMutation.mutate({ id: editTrip, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const getDuration = (start: string, end: string) => {
    try {
      const days = differenceInDays(parseISO(end), parseISO(start)) + 1;
      return `${days}일`;
    } catch {
      return "-";
    }
  };

  const formatDate = (d: string) => {
    try { return format(parseISO(d), "yyyy.MM.dd", { locale: ko }); }
    catch { return d; }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif font-semibold text-foreground tracking-tight">
              내 여행
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {user?.name ? `${user.name}님의 여행 기록` : "나만의 여행을 기록하세요"}
            </p>
          </div>
          <Button
            onClick={openCreate}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            새 여행 만들기
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !trips || trips.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div className="w-20 h-20 rounded-3xl bg-accent/15 flex items-center justify-center">
              <Compass className="w-10 h-10 text-accent" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-serif font-semibold text-foreground mb-2">
                첫 여행을 기록해보세요
              </h2>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                항공편, 숙박, 일정, 일기까지 모든 여행 기록을 한 곳에서 관리하세요.
              </p>
            </div>
            <Button onClick={openCreate} size="lg" className="gap-2 mt-2">
              <Plus className="w-4 h-4" />
              첫 여행 만들기
            </Button>
          </div>
        ) : (
          /* Trip Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {trips.map(trip => (
              <div
                key={trip.id}
                onClick={() => setLocation(`/trips/${trip.id}`)}
                className="group cursor-pointer rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5"
              >
                {/* Cover */}
                <div
                  className="h-36 relative flex items-end p-4"
                  style={{ backgroundColor: trip.coverColor ?? "#1e293b" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                  <div className="relative z-10 flex items-end justify-between w-full">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <MapPin className="w-3.5 h-3.5 text-white/80" />
                        <span className="text-white/80 text-xs font-medium">{trip.destination}</span>
                      </div>
                      <h3 className="text-white font-serif font-semibold text-lg leading-tight">
                        {trip.name}
                      </h3>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(trip.startDate)} — {formatDate(trip.endDate)}</span>
                    <span className="ml-auto text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                      {getDuration(trip.startDate, trip.endDate)}
                    </span>
                  </div>
                  {trip.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {trip.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Plane className="w-3 h-3" />
                      <span>여행 기록 보기</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => openEdit(trip, e)}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
                      >
                        수정
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(trip.id); }}
                        className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded-md hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Add Card */}
            <button
              onClick={openCreate}
              className="rounded-2xl border-2 border-dashed border-border hover:border-accent/50 bg-transparent hover:bg-accent/5 transition-all duration-300 flex flex-col items-center justify-center gap-3 p-8 min-h-[220px] group"
            >
              <div className="w-12 h-12 rounded-2xl bg-muted group-hover:bg-accent/15 flex items-center justify-center transition-colors">
                <Plus className="w-6 h-6 text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors font-medium">
                새 여행 추가
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              {editTrip ? "여행 수정" : "새 여행 만들기"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">여행 이름 *</Label>
              <Input
                id="name"
                placeholder="예: 2024 도쿄 여행"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="destination">목적지 *</Label>
              <Input
                id="destination"
                placeholder="예: 일본 도쿄"
                value={form.destination}
                onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">출발일 *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate">귀국일 *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>커버 색상</Label>
              <div className="flex gap-2 flex-wrap">
                {COVER_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setForm(f => ({ ...f, coverColor: color }))}
                    className={`w-8 h-8 rounded-full transition-all ${form.coverColor === color ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">여행 메모</Label>
              <Textarea
                id="description"
                placeholder="여행에 대한 간단한 메모..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editTrip ? "수정하기" : "만들기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">여행 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            이 여행과 관련된 모든 기록(항공, 숙박, 일정, 일기 등)이 삭제됩니다. 계속하시겠습니까?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>취소</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate({ id: deleteConfirm })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

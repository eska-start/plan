import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Car, Loader2, MapPin, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import TabShell from "./TabShell";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

type FormData = {
  company: string;
  carModel: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupTime: string;
  dropoffTime: string;
  bookingRef: string;
  price: string;
  currency: string;
  memo: string;
};

const defaultForm: FormData = {
  company: "", carModel: "", pickupLocation: "", dropoffLocation: "",
  pickupTime: "", dropoffTime: "", bookingRef: "", price: "", currency: "KRW", memo: "",
};

function formatDT(dt?: string | null) {
  if (!dt) return "-";
  try { return format(new Date(dt), "MM.dd (EEE) HH:mm", { locale: ko }); }
  catch { return dt; }
}

export default function RentalsTab({ tripId }: { tripId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  const utils = trpc.useUtils();

  const { data: rentals, isLoading } = trpc.rentals.list.useQuery({ tripId });

  const createMutation = trpc.rentals.create.useMutation({
    onSuccess: () => { utils.rentals.list.invalidate(); setDialogOpen(false); setForm(defaultForm); toast.success("렌트카가 추가되었습니다."); },
    onError: () => toast.error("렌트카 추가에 실패했습니다."),
  });

  const updateMutation = trpc.rentals.update.useMutation({
    onSuccess: () => { utils.rentals.list.invalidate(); setDialogOpen(false); setEditId(null); setForm(defaultForm); toast.success("렌트카가 수정되었습니다."); },
    onError: () => toast.error("렌트카 수정에 실패했습니다."),
  });

  const deleteMutation = trpc.rentals.delete.useMutation({
    onSuccess: () => { utils.rentals.list.invalidate(); toast.success("렌트카가 삭제되었습니다."); },
    onError: () => toast.error("렌트카 삭제에 실패했습니다."),
  });

  const openCreate = () => { setEditId(null); setForm(defaultForm); setDialogOpen(true); };
  const openEdit = (r: NonNullable<typeof rentals>[number]) => {
    setEditId(r.id);
    setForm({
      company: r.company ?? "", carModel: r.carModel ?? "",
      pickupLocation: r.pickupLocation ?? "", dropoffLocation: r.dropoffLocation ?? "",
      pickupTime: r.pickupTime ?? "", dropoffTime: r.dropoffTime ?? "",
      bookingRef: r.bookingRef ?? "", price: r.price?.toString() ?? "",
      currency: r.currency ?? "KRW", memo: r.memo ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editId) updateMutation.mutate({ id: editId, ...form });
    else createMutation.mutate({ tripId, ...form });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <>
      <TabShell
        title="렌트카"
        description="렌트카 예약 정보를 기록하세요."
        onAdd={openCreate}
        addLabel="렌트카 추가"
        isEmpty={!rentals || rentals.length === 0}
        emptyIcon={<Car className="w-6 h-6 text-muted-foreground" />}
        emptyTitle="등록된 렌트카가 없습니다"
        emptyDescription="렌트카 예약 정보를 추가해보세요."
      >
        <div className="space-y-3">
          {rentals?.map(r => (
            <div key={r.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Car className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold text-foreground">{r.company || "렌트카"}</span>
                    {r.carModel && <span className="text-sm text-muted-foreground">· {r.carModel}</span>}
                  </div>
                  {r.price && (
                    <span className="text-xs text-muted-foreground">
                      {Number(r.price).toLocaleString()} {r.currency}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(r)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">수정</button>
                  <button onClick={() => deleteMutation.mutate({ id: r.id })} className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded hover:bg-destructive/10 transition-colors">삭제</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">픽업</p>
                  <p className="text-sm font-medium text-foreground">{formatDT(r.pickupTime)}</p>
                  {r.pickupLocation && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground truncate">{r.pickupLocation}</p>
                    </div>
                  )}
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">반납</p>
                  <p className="text-sm font-medium text-foreground">{formatDT(r.dropoffTime)}</p>
                  {r.dropoffLocation && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground truncate">{r.dropoffLocation}</p>
                    </div>
                  )}
                </div>
              </div>

              {r.bookingRef && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Hash className="w-3 h-3" /> 예약번호: <span className="font-mono font-medium text-foreground">{r.bookingRef}</span>
                </div>
              )}
              {r.memo && <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">{r.memo}</p>}
            </div>
          ))}
        </div>
      </TabShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editId ? "렌트카 수정" : "렌트카 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>렌트 업체</Label>
                <Input placeholder="예: 허츠" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>차종</Label>
                <Input placeholder="예: 토요타 캠리" value={form.carModel} onChange={e => setForm(f => ({ ...f, carModel: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>픽업 일시</Label>
                <Input type="datetime-local" value={form.pickupTime} onChange={e => setForm(f => ({ ...f, pickupTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>반납 일시</Label>
                <Input type="datetime-local" value={form.dropoffTime} onChange={e => setForm(f => ({ ...f, dropoffTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>픽업 장소</Label>
              <Input placeholder="예: 나리타 공항 터미널 1" value={form.pickupLocation} onChange={e => setForm(f => ({ ...f, pickupLocation: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>반납 장소</Label>
              <Input placeholder="예: 나리타 공항 터미널 1" value={form.dropoffLocation} onChange={e => setForm(f => ({ ...f, dropoffLocation: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>예약번호</Label>
                <Input placeholder="예: RNT12345" value={form.bookingRef} onChange={e => setForm(f => ({ ...f, bookingRef: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>금액</Label>
                <Input placeholder="예: 150000" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>메모</Label>
              <Textarea placeholder="추가 메모..." value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editId ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

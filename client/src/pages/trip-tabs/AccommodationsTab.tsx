import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Hotel, Loader2, MapPin, Hash, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import TabShell from "./TabShell";
import { format, parseISO, differenceInDays } from "date-fns";
import { ko } from "date-fns/locale";

type FormData = {
  name: string;
  address: string;
  checkIn: string;
  checkOut: string;
  bookingRef: string;
  price: string;
  currency: string;
  memo: string;
};

const defaultForm: FormData = {
  name: "", address: "", checkIn: "", checkOut: "",
  bookingRef: "", price: "", currency: "KRW", memo: "",
};

function formatDate(d?: string | null) {
  if (!d) return "-";
  try { return format(parseISO(d), "MM.dd (EEE)", { locale: ko }); }
  catch { return d; }
}

function getNights(checkIn?: string | null, checkOut?: string | null) {
  if (!checkIn || !checkOut) return null;
  try {
    const nights = differenceInDays(parseISO(checkOut), parseISO(checkIn));
    return nights > 0 ? `${nights}박` : null;
  } catch { return null; }
}

export default function AccommodationsTab({ tripId }: { tripId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  const utils = trpc.useUtils();

  const { data: accommodations, isLoading } = trpc.accommodations.list.useQuery({ tripId });

  const createMutation = trpc.accommodations.create.useMutation({
    onSuccess: () => { utils.accommodations.list.invalidate(); setDialogOpen(false); setForm(defaultForm); toast.success("숙박이 추가되었습니다."); },
    onError: () => toast.error("숙박 추가에 실패했습니다."),
  });

  const updateMutation = trpc.accommodations.update.useMutation({
    onSuccess: () => { utils.accommodations.list.invalidate(); setDialogOpen(false); setEditId(null); setForm(defaultForm); toast.success("숙박이 수정되었습니다."); },
    onError: () => toast.error("숙박 수정에 실패했습니다."),
  });

  const deleteMutation = trpc.accommodations.delete.useMutation({
    onSuccess: () => { utils.accommodations.list.invalidate(); toast.success("숙박이 삭제되었습니다."); },
    onError: () => toast.error("숙박 삭제에 실패했습니다."),
  });

  const openCreate = () => { setEditId(null); setForm(defaultForm); setDialogOpen(true); };
  const openEdit = (a: NonNullable<typeof accommodations>[number]) => {
    setEditId(a.id);
    setForm({
      name: a.name, address: a.address ?? "", checkIn: a.checkIn ?? "",
      checkOut: a.checkOut ?? "", bookingRef: a.bookingRef ?? "",
      price: a.price?.toString() ?? "", currency: a.currency ?? "KRW", memo: a.memo ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name) { toast.error("숙소명을 입력해주세요."); return; }
    if (editId) updateMutation.mutate({ id: editId, ...form });
    else createMutation.mutate({ tripId, ...form });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <>
      <TabShell
        title="숙박"
        description="숙소 예약 정보를 기록하세요."
        onAdd={openCreate}
        addLabel="숙박 추가"
        isEmpty={!accommodations || accommodations.length === 0}
        emptyIcon={<Hotel className="w-6 h-6 text-muted-foreground" />}
        emptyTitle="등록된 숙박이 없습니다"
        emptyDescription="숙소 예약 정보를 추가해보세요."
      >
        <div className="space-y-3">
          {accommodations?.map(a => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Hotel className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold text-foreground text-base">{a.name}</span>
                  </div>
                  {a.address && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />{a.address}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(a)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">수정</button>
                  <button onClick={() => deleteMutation.mutate({ id: a.id })} className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded hover:bg-destructive/10 transition-colors">삭제</button>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-3 mb-3">
                <div className="text-center flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">체크인</p>
                  <p className="text-sm font-semibold text-foreground">{formatDate(a.checkIn)}</p>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  {getNights(a.checkIn, a.checkOut) && (
                    <span className="text-xs font-medium text-accent">{getNights(a.checkIn, a.checkOut)}</span>
                  )}
                </div>
                <div className="text-center flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">체크아웃</p>
                  <p className="text-sm font-semibold text-foreground">{formatDate(a.checkOut)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {a.bookingRef && (
                  <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> 예약번호: <span className="font-mono font-medium text-foreground">{a.bookingRef}</span></span>
                )}
                {a.price && (
                  <span className="font-medium text-foreground">{Number(a.price).toLocaleString()} {a.currency}</span>
                )}
              </div>
              {a.memo && <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">{a.memo}</p>}
            </div>
          ))}
        </div>
      </TabShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editId ? "숙박 수정" : "숙박 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>숙소명 *</Label>
              <Input placeholder="예: 신주쿠 그랜드 호텔" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>주소</Label>
              <Input placeholder="예: 도쿄 신주쿠구 ..." value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>체크인</Label>
                <Input type="date" value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>체크아웃</Label>
                <Input type="date" value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>예약번호</Label>
                <Input placeholder="예: HTL12345" value={form.bookingRef} onChange={e => setForm(f => ({ ...f, bookingRef: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>금액</Label>
                <Input placeholder="예: 200000" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>메모</Label>
              <Textarea placeholder="조식 포함, 주차 가능 등..." value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={2} />
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

import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Plane, Loader2, ArrowRight, Clock, Hash, Armchair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import TabShell from "./TabShell";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

type FlightType = "departure" | "return" | "transit";

type FormData = {
  type: FlightType;
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalTime: string;
  bookingRef: string;
  seatNumber: string;
  memo: string;
};

const defaultForm: FormData = {
  type: "departure",
  airline: "",
  flightNumber: "",
  departureAirport: "",
  arrivalAirport: "",
  departureTime: "",
  arrivalTime: "",
  bookingRef: "",
  seatNumber: "",
  memo: "",
};

const TYPE_LABELS: Record<FlightType, string> = {
  departure: "출발편",
  return: "귀국편",
  transit: "경유편",
};

const TYPE_COLORS: Record<FlightType, string> = {
  departure: "bg-blue-50 text-blue-700 border-blue-200",
  return: "bg-green-50 text-green-700 border-green-200",
  transit: "bg-amber-50 text-amber-700 border-amber-200",
};

function formatDT(dt?: string | null) {
  if (!dt) return "-";
  try { return format(new Date(dt), "MM.dd (EEE) HH:mm", { locale: ko }); }
  catch { return dt; }
}

export default function FlightsTab({ tripId }: { tripId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  const utils = trpc.useUtils();

  const { data: flights, isLoading } = trpc.flights.list.useQuery({ tripId });

  const createMutation = trpc.flights.create.useMutation({
    onSuccess: () => { utils.flights.list.invalidate(); setDialogOpen(false); setForm(defaultForm); toast.success("항공편이 추가되었습니다."); },
    onError: () => toast.error("항공편 추가에 실패했습니다."),
  });

  const updateMutation = trpc.flights.update.useMutation({
    onSuccess: () => { utils.flights.list.invalidate(); setDialogOpen(false); setEditId(null); setForm(defaultForm); toast.success("항공편이 수정되었습니다."); },
    onError: () => toast.error("항공편 수정에 실패했습니다."),
  });

  const deleteMutation = trpc.flights.delete.useMutation({
    onSuccess: () => { utils.flights.list.invalidate(); toast.success("항공편이 삭제되었습니다."); },
    onError: () => toast.error("항공편 삭제에 실패했습니다."),
  });

  const openCreate = () => { setEditId(null); setForm(defaultForm); setDialogOpen(true); };
  const openEdit = (f: NonNullable<typeof flights>[number]) => {
    setEditId(f.id);
    setForm({
      type: (f.type ?? "departure") as FlightType,
      airline: f.airline ?? "",
      flightNumber: f.flightNumber ?? "",
      departureAirport: f.departureAirport ?? "",
      arrivalAirport: f.arrivalAirport ?? "",
      departureTime: f.departureTime ?? "",
      arrivalTime: f.arrivalTime ?? "",
      bookingRef: f.bookingRef ?? "",
      seatNumber: f.seatNumber ?? "",
      memo: f.memo ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editId) {
      updateMutation.mutate({ id: editId, ...form });
    } else {
      createMutation.mutate({ tripId, ...form });
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <>
      <TabShell
        title="항공편"
        description="출발편, 귀국편, 경유편을 기록하세요."
        onAdd={openCreate}
        addLabel="항공편 추가"
        isEmpty={!flights || flights.length === 0}
        emptyIcon={<Plane className="w-6 h-6 text-muted-foreground" />}
        emptyTitle="등록된 항공편이 없습니다"
        emptyDescription="항공편 정보를 추가해보세요."
      >
        <div className="space-y-3">
          {flights?.map(f => (
            <div key={f.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${TYPE_COLORS[f.type as FlightType]}`}>
                    {TYPE_LABELS[f.type as FlightType]}
                  </span>
                  {f.airline && <span className="text-sm font-semibold text-foreground">{f.airline}</span>}
                  {f.flightNumber && <span className="text-sm text-muted-foreground">{f.flightNumber}</span>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(f)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">수정</button>
                  <button onClick={() => deleteMutation.mutate({ id: f.id })} className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded hover:bg-destructive/10 transition-colors">삭제</button>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">{f.departureAirport || "-"}</p>
                  <p className="text-xs text-muted-foreground">{formatDT(f.departureTime)}</p>
                </div>
                <div className="flex-1 flex items-center gap-1">
                  <div className="flex-1 h-px bg-border" />
                  <Plane className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">{f.arrivalAirport || "-"}</p>
                  <p className="text-xs text-muted-foreground">{formatDT(f.arrivalTime)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {f.bookingRef && (
                  <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> 예약번호: <span className="font-mono font-medium text-foreground">{f.bookingRef}</span></span>
                )}
                {f.seatNumber && (
                  <span className="flex items-center gap-1"><Armchair className="w-3 h-3" /> 좌석: <span className="font-medium text-foreground">{f.seatNumber}</span></span>
                )}
              </div>
              {f.memo && <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">{f.memo}</p>}
            </div>
          ))}
        </div>
      </TabShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editId ? "항공편 수정" : "항공편 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>구분</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as FlightType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="departure">출발편</SelectItem>
                    <SelectItem value="return">귀국편</SelectItem>
                    <SelectItem value="transit">경유편</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>항공사</Label>
                <Input placeholder="예: 대한항공" value={form.airline} onChange={e => setForm(f => ({ ...f, airline: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>편명</Label>
                <Input placeholder="예: KE001" value={form.flightNumber} onChange={e => setForm(f => ({ ...f, flightNumber: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>예약번호</Label>
                <Input placeholder="예: ABC123" value={form.bookingRef} onChange={e => setForm(f => ({ ...f, bookingRef: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>출발 공항</Label>
                <Input placeholder="예: ICN" value={form.departureAirport} onChange={e => setForm(f => ({ ...f, departureAirport: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>도착 공항</Label>
                <Input placeholder="예: NRT" value={form.arrivalAirport} onChange={e => setForm(f => ({ ...f, arrivalAirport: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>출발 일시</Label>
                <Input type="datetime-local" value={form.departureTime} onChange={e => setForm(f => ({ ...f, departureTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>도착 일시</Label>
                <Input type="datetime-local" value={form.arrivalTime} onChange={e => setForm(f => ({ ...f, arrivalTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>좌석 번호</Label>
              <Input placeholder="예: 12A" value={form.seatNumber} onChange={e => setForm(f => ({ ...f, seatNumber: e.target.value }))} />
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

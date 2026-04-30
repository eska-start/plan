import { trpc } from "@/lib/trpc";
import { OcrUploadButton } from "@/components/OcrUploadButton";
import { useState } from "react";
import { toast } from "sonner";
import { Hotel, Car, Loader2, MapPin, Hash, Calendar, Map, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format, parseISO, differenceInDays } from "date-fns";
import { ko } from "date-fns/locale";

// ── Accommodation form ────────────────────────────────────────────────────────
type AccomForm = {
  name: string; address: string;
  checkIn: string; checkInTime: string;
  checkOut: string; checkOutTime: string;
  bookingRef: string; price: string; currency: string; memo: string; preRegisterUrl: string;
};
const defaultAccomForm: AccomForm = {
  name: "", address: "",
  checkIn: "", checkInTime: "15:00",
  checkOut: "", checkOutTime: "11:00",
  bookingRef: "", price: "", currency: "KRW", memo: "", preRegisterUrl: "",
};

// ── Rental form ───────────────────────────────────────────────────────────────
type RentalForm = {
  company: string; carModel: string; pickupLocation: string; dropoffLocation: string;
  pickupTime: string; dropoffTime: string; bookingRef: string; price: string;
  currency: string; memo: string;
};
const defaultRentalForm: RentalForm = {
  company: "", carModel: "", pickupLocation: "", dropoffLocation: "",
  pickupTime: "", dropoffTime: "", bookingRef: "", price: "", currency: "KRW", memo: "",
};


const PRE_REGISTER_TAG = "[PREREG]";
const extractPreRegisterUrl = (memo?: string | null) => memo?.match(/\[PREREG\](\S+)/)?.[1] ?? "";
const removePreRegisterTag = (memo?: string | null) => (memo ?? "").replace(/\s*\[PREREG\]\S+/g, "").trim();
const normalizeUrl = (raw: string) => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);

function formatDate(d?: string | null) {
  if (!d) return "-";
  try { return format(parseISO(d), "MM.dd (EEE)", { locale: ko }); }
  catch { return d; }
}
function formatDT(dt?: string | null) {
  if (!dt) return "-";
  try { return format(new Date(dt), "MM.dd HH:mm", { locale: ko }); }
  catch { return dt; }
}
function getNights(checkIn?: string | null, checkOut?: string | null) {
  if (!checkIn || !checkOut) return null;
  try {
    const n = differenceInDays(parseISO(checkOut), parseISO(checkIn));
    return n > 0 ? `${n}박` : null;
  } catch { return null; }
}

export default function StaysTab({ tripId, isGuestUser = false }: { tripId: number; isGuestUser?: boolean }) {
  const utils = trpc.useUtils();
  const queryOptions = { staleTime: 30_000, refetchOnWindowFocus: false } as const;

  // ── Accommodation state ───────────────────────────────────────────────────
  const [accomOpen, setAccomOpen] = useState(false);
  const [accomEditId, setAccomEditId] = useState<number | null>(null);
  const [deleteAccomId, setDeleteAccomId] = useState<number | null>(null);
  const [accomForm, setAccomForm] = useState<AccomForm>(defaultAccomForm);

  const { data: accommodations, isLoading: accomLoading } = trpc.accommodations.list.useQuery({ tripId }, queryOptions);
  const createAccom = trpc.accommodations.create.useMutation({
    onSuccess: () => { utils.accommodations.list.invalidate(); setAccomOpen(false); setAccomForm(defaultAccomForm); toast.success("숙박이 추가되었습니다."); },
    onError: () => toast.error("숙박 추가에 실패했습니다."),
  });
  const updateAccom = trpc.accommodations.update.useMutation({
    onSuccess: () => { utils.accommodations.list.invalidate(); setAccomOpen(false); setAccomEditId(null); setAccomForm(defaultAccomForm); toast.success("숙박이 수정되었습니다."); },
    onError: () => toast.error("숙박 수정에 실패했습니다."),
  });
  const deleteAccom = trpc.accommodations.delete.useMutation({
    onSuccess: () => { utils.accommodations.list.invalidate(); toast.success("숙박이 삭제되었습니다."); },
    onError: () => toast.error("숙박 삭제에 실패했습니다."),
  });
  const extractAccom = trpc.accommodations.extractFromImage.useMutation();

  const openCreateAccom = () => { setAccomEditId(null); setAccomForm(defaultAccomForm); setAccomOpen(true); };
  const openEditAccom = (a: NonNullable<typeof accommodations>[number]) => {
    setAccomEditId(a.id);
    setAccomForm({ name: a.name, address: a.address ?? "", checkIn: a.checkIn ?? "", checkInTime: a.checkInTime ?? "", checkOut: a.checkOut ?? "", checkOutTime: a.checkOutTime ?? "", bookingRef: a.bookingRef ?? "", price: a.price?.toString() ?? "", currency: a.currency ?? "KRW", memo: removePreRegisterTag(a.memo), preRegisterUrl: extractPreRegisterUrl(a.memo) });
    setAccomOpen(true);
  };
  const submitAccom = () => {
    const trimmedName = accomForm.name.trim();
    if (!trimmedName) { toast.error("숙소명을 입력해주세요."); return; }
    const cleanedMemo = removePreRegisterTag(accomForm.memo).trim();
    const taggedMemo = accomForm.preRegisterUrl.trim() ? `${cleanedMemo}${cleanedMemo ? "\n" : ""}${PRE_REGISTER_TAG}${normalizeUrl(accomForm.preRegisterUrl.trim())}` : cleanedMemo;
    const payload = { name: trimmedName, address: accomForm.address.trim() || undefined, checkIn: accomForm.checkIn || undefined, checkInTime: accomForm.checkInTime || undefined, checkOut: accomForm.checkOut || undefined, checkOutTime: accomForm.checkOutTime || undefined, bookingRef: accomForm.bookingRef.trim() || undefined, price: accomForm.price.trim() || undefined, currency: accomForm.currency || undefined, memo: taggedMemo || undefined };
    if (accomEditId) updateAccom.mutate({ id: accomEditId, tripId, ...payload });
    else createAccom.mutate({ tripId, ...payload });
  };

  // ── Rental state ──────────────────────────────────────────────────────────
  const [rentalOpen, setRentalOpen] = useState(false);
  const [rentalEditId, setRentalEditId] = useState<number | null>(null);
  const [deleteRentalId, setDeleteRentalId] = useState<number | null>(null);
  const [rentalForm, setRentalForm] = useState<RentalForm>(defaultRentalForm);

  const { data: rentals, isLoading: rentalLoading } = trpc.rentals.list.useQuery({ tripId }, queryOptions);
  const createRental = trpc.rentals.create.useMutation({
    onSuccess: () => { utils.rentals.list.invalidate(); setRentalOpen(false); setRentalForm(defaultRentalForm); toast.success("렌트카가 추가되었습니다."); },
    onError: () => toast.error("렌트카 추가에 실패했습니다."),
  });
  const updateRental = trpc.rentals.update.useMutation({
    onSuccess: () => { utils.rentals.list.invalidate(); setRentalOpen(false); setRentalEditId(null); setRentalForm(defaultRentalForm); toast.success("렌트카가 수정되었습니다."); },
    onError: () => toast.error("렌트카 수정에 실패했습니다."),
  });
  const deleteRental = trpc.rentals.delete.useMutation({
    onSuccess: () => { utils.rentals.list.invalidate(); toast.success("렌트카가 삭제되었습니다."); },
    onError: () => toast.error("렌트카 삭제에 실패했습니다."),
  });
  const extractRental = trpc.rentals.extractFromImage.useMutation();

  const openCreateRental = () => { setRentalEditId(null); setRentalForm(defaultRentalForm); setRentalOpen(true); };
  const openEditRental = (r: NonNullable<typeof rentals>[number]) => {
    setRentalEditId(r.id);
    setRentalForm({ company: r.company ?? "", carModel: r.carModel ?? "", pickupLocation: r.pickupLocation ?? "", dropoffLocation: r.dropoffLocation ?? "", pickupTime: r.pickupTime ?? "", dropoffTime: r.dropoffTime ?? "", bookingRef: r.bookingRef ?? "", price: r.price?.toString() ?? "", currency: r.currency ?? "KRW", memo: r.memo ?? "" });
    setRentalOpen(true);
  };
  const submitRental = () => {
    if (rentalEditId) updateRental.mutate({ id: rentalEditId, ...rentalForm });
    else createRental.mutate({ tripId, ...rentalForm });
  };

  return (
    <div className="space-y-8">
      {/* ── 숙박 섹션 ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Hotel className="w-4 h-4 text-indigo-500" /> 숙박
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">숙소 예약 정보를 기록하세요.</p>
          </div>
          <Button size="sm" onClick={openCreateAccom} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> 숙박 추가
          </Button>
        </div>

        {accomLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : accommodations && accommodations.length > 0 ? (
          <div className="space-y-3">
            {accommodations.map(a => (
              <div key={a.id} className="card-hover p-4 sm:p-5">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Hotel className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-foreground text-base truncate">{a.name}</span>
                    </div>
                    {a.address && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 ml-6">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{a.address}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent([a.name, a.address].filter(Boolean).join(" "))}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors flex items-center gap-1"
                    >
                      <Map className="w-3 h-3" />
                    </a>
                    <button onClick={() => openEditAccom(a)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors">수정</button>
                    <button
                      onClick={() => {
                        setDeleteAccomId(a.id);
                      }}
                      className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded-md hover:bg-destructive/10 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-muted/40 rounded-lg p-3 mb-3">
                  <div className="text-center flex-1">
                    <p className="text-xs text-muted-foreground mb-0.5">체크인</p>
                    <p className="text-sm font-semibold">{formatDate(a.checkIn)}</p>
                    {a.checkInTime && <p className="text-xs text-primary font-medium mt-0.5">{a.checkInTime}</p>}
                  </div>
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    {getNights(a.checkIn, a.checkOut) && <span className="text-xs font-medium text-primary">{getNights(a.checkIn, a.checkOut)}</span>}
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-xs text-muted-foreground mb-0.5">체크아웃</p>
                    <p className="text-sm font-semibold">{formatDate(a.checkOut)}</p>
                    {a.checkOutTime && <p className="text-xs text-primary font-medium mt-0.5">{a.checkOutTime}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {a.bookingRef && <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> 예약번호: <span className="font-mono font-medium text-foreground">{a.bookingRef}</span></span>}
                  {a.price && <span className="font-medium text-foreground">{Number(a.price).toLocaleString()} {a.currency}</span>}
                </div>
                {(a.memo || extractPreRegisterUrl(a.memo)) && <div className="mt-2 pt-2 border-t border-border space-y-2">{removePreRegisterTag(a.memo) && <p className="text-xs text-muted-foreground">{removePreRegisterTag(a.memo)}</p>}{extractPreRegisterUrl(a.memo) && <Button size="sm" variant="outline" asChild><a href={normalizeUrl(extractPreRegisterUrl(a.memo))} target="_blank" rel="noopener noreferrer" className="gap-1"><ExternalLink className="w-3.5 h-3.5" />사전등록</a></Button>}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-2xl border border-dashed border-border bg-muted/20">
            <Hotel className="w-5 h-5 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">등록된 숙박이 없습니다</p>
              <p className="text-xs text-muted-foreground mt-1">숙소 예약 정보를 추가해보세요.</p>
            </div>
            <Button size="sm" variant="outline" onClick={openCreateAccom} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> 숙박 추가
            </Button>
          </div>
        )}
      </section>

      {/* ── 렌트카 섹션 ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Car className="w-4 h-4 text-green-600" /> 렌트카
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">렌트카 예약 정보를 기록하세요.</p>
          </div>
          <Button size="sm" onClick={openCreateRental} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> 렌트카 추가
          </Button>
        </div>

        {rentalLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : rentals && rentals.length > 0 ? (
          <div className="space-y-3">
            {rentals.map(r => (
              <div key={r.id} className="card-hover p-4 sm:p-5">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Car className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-foreground">{r.company || "렌트카"}</span>
                      {r.carModel && <span className="text-sm text-muted-foreground">· {r.carModel}</span>}
                    </div>
                    {r.price && <p className="text-xs text-muted-foreground mt-0.5 ml-6">{Number(r.price).toLocaleString()} {r.currency}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEditRental(r)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors">수정</button>
                    <button
                      onClick={() => {
                        setDeleteRentalId(r.id);
                      }}
                      className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded-md hover:bg-destructive/10 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3">
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1 font-medium">픽업</p>
                    <p className="text-sm font-semibold">{formatDT(r.pickupTime)}</p>
                    {r.pickupLocation && <div className="flex items-center gap-1 mt-1"><MapPin className="w-3 h-3 text-muted-foreground shrink-0" /><p className="text-xs text-muted-foreground truncate">{r.pickupLocation}</p></div>}
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1 font-medium">반납</p>
                    <p className="text-sm font-semibold">{formatDT(r.dropoffTime)}</p>
                    {r.dropoffLocation && <div className="flex items-center gap-1 mt-1"><MapPin className="w-3 h-3 text-muted-foreground shrink-0" /><p className="text-xs text-muted-foreground truncate">{r.dropoffLocation}</p></div>}
                  </div>
                </div>
                {r.bookingRef && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Hash className="w-3 h-3" /> 예약번호: <span className="font-mono font-medium text-foreground">{r.bookingRef}</span></div>}
                {r.memo && <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">{r.memo}</p>}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-2xl border border-dashed border-border bg-muted/20">
            <Car className="w-5 h-5 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">등록된 렌트카가 없습니다</p>
              <p className="text-xs text-muted-foreground mt-1">렌트카 예약 정보를 추가해보세요.</p>
            </div>
            <Button size="sm" variant="outline" onClick={openCreateRental} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> 렌트카 추가
            </Button>
          </div>
        )}
      </section>

      {/* ── 숙박 다이얼로그 ── */}
      <Dialog open={accomOpen} onOpenChange={setAccomOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-5 sm:p-6">
          <DialogHeader className="mb-1">
            <DialogTitle className="text-lg font-semibold">{accomEditId ? "숙박 수정" : "숙박 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 max-h-[70vh] overflow-y-auto">
            <OcrUploadButton
              disabled={isGuestUser}
              onBlocked={() => toast.info("게스트는 AI 기능을 사용할 수 없어요. 로그인 후 이용해주세요.")}
              extractEndpoint={async (base64) => extractAccom.mutateAsync({ imageBase64: base64 })}
              onExtracted={(data) => setAccomForm(f => ({ ...f, name: data.name ?? f.name, address: data.address ?? f.address, checkIn: data.checkIn ?? f.checkIn, checkOut: data.checkOut ?? f.checkOut, bookingRef: data.bookingRef ?? f.bookingRef, price: data.price ?? f.price, currency: data.currency ?? f.currency }))}
            />
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">숙소명 <span className="text-destructive">*</span></Label>
              <Input className="h-10" placeholder="신주쿠 그랜드 호텔" value={accomForm.name} onChange={e => setAccomForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">주소</Label>
              <Input className="h-10" placeholder="도쿄 신주쿠구..." value={accomForm.address} onChange={e => setAccomForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">체크인</Label>
              <div className="flex gap-2">
                <Input className="h-10 flex-1 min-w-0" type="date" value={accomForm.checkIn} onChange={e => setAccomForm(f => ({ ...f, checkIn: e.target.value }))} />
                <Input className="h-10 w-28 shrink-0" type="time" placeholder="15:00" value={accomForm.checkInTime} onChange={e => setAccomForm(f => ({ ...f, checkInTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">체크아웃</Label>
              <div className="flex gap-2">
                <Input className="h-10 flex-1 min-w-0" type="date" value={accomForm.checkOut} onChange={e => setAccomForm(f => ({ ...f, checkOut: e.target.value }))} />
                <Input className="h-10 w-28 shrink-0" type="time" placeholder="11:00" value={accomForm.checkOutTime} onChange={e => setAccomForm(f => ({ ...f, checkOutTime: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">예약번호</Label>
                <Input className="h-10" placeholder="HTL12345" value={accomForm.bookingRef} onChange={e => setAccomForm(f => ({ ...f, bookingRef: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">금액</Label>
                <Input className="h-10" placeholder="200000" value={accomForm.price} onChange={e => setAccomForm(f => ({ ...f, price: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">사전등록 링크</Label>
              <Input className="h-10" placeholder="https://..." value={accomForm.preRegisterUrl} onChange={e => setAccomForm(f => ({ ...f, preRegisterUrl: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">메모</Label>
              <Textarea placeholder="조식 포함, 주차 가능 등..." value={accomForm.memo} onChange={e => setAccomForm(f => ({ ...f, memo: e.target.value }))} rows={2} className="resize-none" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setAccomOpen(false)}>취소</Button>
            <Button className="flex-1" onClick={submitAccom} disabled={createAccom.isPending || updateAccom.isPending}>
              {(createAccom.isPending || updateAccom.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {accomEditId ? "수정" : "추가"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 렌트카 다이얼로그 ── */}
      <Dialog open={rentalOpen} onOpenChange={setRentalOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-5 sm:p-6">
          <DialogHeader className="mb-1">
            <DialogTitle className="text-lg font-semibold">{rentalEditId ? "렌트카 수정" : "렌트카 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 max-h-[70vh] overflow-y-auto">
            <OcrUploadButton
              disabled={isGuestUser}
              onBlocked={() => toast.info("게스트는 AI 기능을 사용할 수 없어요. 로그인 후 이용해주세요.")}
              extractEndpoint={async (base64) => extractRental.mutateAsync({ imageBase64: base64 })}
              onExtracted={(data) => setRentalForm(f => ({ ...f, company: data.company ?? f.company, carModel: data.carModel ?? f.carModel, pickupLocation: data.pickupLocation ?? f.pickupLocation, dropoffLocation: data.dropoffLocation ?? f.dropoffLocation, pickupTime: data.pickupTime ?? f.pickupTime, dropoffTime: data.dropoffTime ?? f.dropoffTime, bookingRef: data.bookingRef ?? f.bookingRef, price: data.price ?? f.price, currency: data.currency ?? f.currency }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">렌트 업체</Label>
                <Input className="h-10" placeholder="허츠" value={rentalForm.company} onChange={e => setRentalForm(f => ({ ...f, company: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">차종</Label>
                <Input className="h-10" placeholder="토요타 캠리" value={rentalForm.carModel} onChange={e => setRentalForm(f => ({ ...f, carModel: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">픽업 일시</Label>
              <Input className="h-10" type="datetime-local" value={rentalForm.pickupTime} onChange={e => setRentalForm(f => ({ ...f, pickupTime: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">픽업 장소</Label>
              <Input className="h-10" placeholder="나리타 공항 터미널 1" value={rentalForm.pickupLocation} onChange={e => setRentalForm(f => ({ ...f, pickupLocation: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">반납 일시</Label>
              <Input className="h-10" type="datetime-local" value={rentalForm.dropoffTime} onChange={e => setRentalForm(f => ({ ...f, dropoffTime: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">반납 장소</Label>
              <Input className="h-10" placeholder="나리타 공항 터미널 1" value={rentalForm.dropoffLocation} onChange={e => setRentalForm(f => ({ ...f, dropoffLocation: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">예약번호</Label>
                <Input className="h-10" placeholder="RNT12345" value={rentalForm.bookingRef} onChange={e => setRentalForm(f => ({ ...f, bookingRef: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">금액</Label>
                <Input className="h-10" placeholder="150000" value={rentalForm.price} onChange={e => setRentalForm(f => ({ ...f, price: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">메모</Label>
              <Textarea placeholder="추가 메모..." value={rentalForm.memo} onChange={e => setRentalForm(f => ({ ...f, memo: e.target.value }))} rows={2} className="resize-none" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setRentalOpen(false)}>취소</Button>
            <Button className="flex-1" onClick={submitRental} disabled={createRental.isPending || updateRental.isPending}>
              {(createRental.isPending || updateRental.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {rentalEditId ? "수정" : "추가"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteAccomId !== null} onOpenChange={(open) => { if (!open) setDeleteAccomId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>숙박 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 숙박을 삭제할까요?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteAccomId == null) return;
                deleteAccom.mutate({ id: deleteAccomId, tripId });
                setDeleteAccomId(null);
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteRentalId !== null} onOpenChange={(open) => { if (!open) setDeleteRentalId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>렌트카 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 렌트카를 삭제할까요?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteRentalId == null) return;
                deleteRental.mutate({ id: deleteRentalId });
                setDeleteRentalId(null);
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

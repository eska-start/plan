import { useState } from "react";
import { Loader2, Plane, Hotel, Car, CheckCircle2, Circle, Sparkles, Bot } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  tripId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

type FlightData = {
  airline: string | null;
  flightNumber: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  bookingRef: string | null;
  seatNumber: string | null;
  type: "departure" | "return" | "transit" | null;
};

type AccommodationData = {
  name: string | null;
  address: string | null;
  checkIn: string | null;
  checkOut: string | null;
  bookingRef: string | null;
  price: string | null;
  currency: string | null;
};

type RentalData = {
  company: string | null;
  carModel: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  pickupTime: string | null;
  dropoffTime: string | null;
  bookingRef: string | null;
  price: string | null;
  currency: string | null;
};

type ExtractResult = {
  flights: FlightData[];
  accommodations: AccommodationData[];
  rentals: RentalData[];
  reply: string;
};

const FLIGHT_TYPE_LABEL: Record<string, string> = {
  departure: "가는편",
  return: "오는편",
  transit: "경유",
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-foreground break-all">{value}</span>
    </div>
  );
}

const SUGGESTED = [
  "제주항공 7C1603, 5월 24일 14:55 ICN→FSZ, 오는편 7C1602 30일 10:00 FSZ→ICN 등록해줘",
  "예약 확인서 내용을 여기에 붙여넣으세요",
  "호텔 이름, 체크인/아웃 날짜를 알려주세요",
];

export function AiImportDialog({ tripId, open, onOpenChange, onSaved }: Props) {
  const [step, setStep] = useState<"input" | "preview">("input");
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [selectedFlights, setSelectedFlights] = useState<Set<number>>(new Set());
  const [selectedAccommodations, setSelectedAccommodations] = useState<Set<number>>(new Set());
  const [selectedRentals, setSelectedRentals] = useState<Set<number>>(new Set());

  const extractMutation = trpc.trips.aiExtract.useMutation();
  const createFlight = trpc.flights.create.useMutation();
  const createAccommodation = trpc.accommodations.create.useMutation();
  const createRental = trpc.rentals.create.useMutation();

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    try {
      const data = await extractMutation.mutateAsync({ tripId, text: text.trim() }) as ExtractResult;
      setResult(data);
      setSelectedFlights(new Set(data.flights.map((_, i) => i)));
      setSelectedAccommodations(new Set(data.accommodations.map((_, i) => i)));
      setSelectedRentals(new Set(data.rentals.map((_, i) => i)));
      setStep("preview");
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("LLM_API_KEY")) {
        toast.error("AI 기능을 사용하려면 서버에 LLM_API_KEY 환경변수를 설정해야 합니다.");
      } else {
        toast.error("AI 분석에 실패했습니다. 잠시 후 다시 시도해보세요.");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    let saved = 0;
    try {
      for (let i = 0; i < result.flights.length; i++) {
        if (!selectedFlights.has(i)) continue;
        const f = result.flights[i];
        await createFlight.mutateAsync({
          tripId, type: f.type ?? "departure",
          airline: f.airline ?? "", flightNumber: f.flightNumber ?? "",
          departureAirport: f.departureAirport ?? "", arrivalAirport: f.arrivalAirport ?? "",
          departureTime: f.departureTime ?? "", arrivalTime: f.arrivalTime ?? "",
          bookingRef: f.bookingRef ?? "", seatNumber: f.seatNumber ?? "", memo: "",
        });
        saved++;
      }
      for (let i = 0; i < result.accommodations.length; i++) {
        if (!selectedAccommodations.has(i)) continue;
        const a = result.accommodations[i];
        await createAccommodation.mutateAsync({
          tripId, name: a.name ?? "숙소",
          address: a.address ?? "", checkIn: a.checkIn ?? "", checkOut: a.checkOut ?? "",
          bookingRef: a.bookingRef ?? "", price: a.price ?? undefined,
          currency: a.currency ?? "KRW", memo: "",
        });
        saved++;
      }
      for (let i = 0; i < result.rentals.length; i++) {
        if (!selectedRentals.has(i)) continue;
        const r = result.rentals[i];
        await createRental.mutateAsync({
          tripId, company: r.company ?? "", carModel: r.carModel ?? "",
          pickupLocation: r.pickupLocation ?? "", dropoffLocation: r.dropoffLocation ?? "",
          pickupTime: r.pickupTime ?? "", dropoffTime: r.dropoffTime ?? "",
          bookingRef: r.bookingRef ?? "", price: r.price ?? undefined,
          currency: r.currency ?? "KRW", memo: "",
        });
        saved++;
      }
      toast.success(`${saved}건 저장됐습니다.`);
      onSaved();
      handleClose();
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep("input");
    setText("");
    setResult(null);
    setAnalyzing(false);
    setSaving(false);
    onOpenChange(false);
  };

  const toggle = (set: Set<number>, i: number): Set<number> => {
    const next = new Set(set);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  };

  const hasAny = result && (result.flights.length || result.accommodations.length || result.rentals.length);
  const anySelected = selectedFlights.size > 0 || selectedAccommodations.size > 0 || selectedRentals.size > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            AI로 자동 입력
          </DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              예약 확인서 텍스트를 붙여넣거나, 자연어로 여행 정보를 입력하면 AI가 항공편·숙박·렌트카를 자동으로 등록합니다.
            </p>

            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={"예) 제주항공 7C1603, 5월 24일 14:55 ICN→FSZ 등록해줘\n\n또는 예약 확인서 전체 내용을 붙여넣기"}
              className="min-h-[160px] resize-none text-sm"
              autoFocus
            />

            {!text && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">예시</p>
                <div className="space-y-1.5">
                  {SUGGESTED.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setText(s)}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg border border-dashed border-border hover:bg-muted/50 transition-colors text-muted-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleAnalyze}
              disabled={!text.trim() || analyzing}
              className="w-full"
            >
              {analyzing ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />AI 분석 중...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" />AI로 분석하기</>
              )}
            </Button>
          </div>
        )}

        {step === "preview" && result && (
          <div className="space-y-4">
            {/* AI 응답 */}
            {result.reply && (
              <div className="flex gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15">
                <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">{result.reply}</p>
              </div>
            )}

            {!hasAny ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <p>추출된 여행 정보가 없습니다.</p>
                <p className="text-xs mt-1">더 구체적인 정보를 입력해보세요.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setStep("input")}>
                  다시 입력
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">저장할 항목을 선택하세요.</p>

                {result.flights.map((f, i) => (
                  <div key={i}
                    className={`rounded-xl border p-4 cursor-pointer transition-colors ${selectedFlights.has(i) ? "border-blue-400 bg-blue-50" : "border-border bg-muted/30"}`}
                    onClick={() => setSelectedFlights(toggle(selectedFlights, i))}>
                    <div className="flex items-center gap-2 mb-3">
                      {selectedFlights.has(i) ? <CheckCircle2 className="w-4 h-4 text-blue-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                      <Plane className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-sm">항공편{f.type ? ` — ${FLIGHT_TYPE_LABEL[f.type] ?? f.type}` : ""}</span>
                    </div>
                    <div className="space-y-1 pl-6">
                      <Row label="항공사" value={f.airline} />
                      <Row label="편명" value={f.flightNumber} />
                      <Row label="출발" value={f.departureAirport} />
                      <Row label="도착" value={f.arrivalAirport} />
                      <Row label="출발시간" value={f.departureTime} />
                      <Row label="도착시간" value={f.arrivalTime} />
                      <Row label="예약번호" value={f.bookingRef} />
                      <Row label="좌석" value={f.seatNumber} />
                    </div>
                  </div>
                ))}

                {result.accommodations.map((a, i) => (
                  <div key={i}
                    className={`rounded-xl border p-4 cursor-pointer transition-colors ${selectedAccommodations.has(i) ? "border-indigo-400 bg-indigo-50" : "border-border bg-muted/30"}`}
                    onClick={() => setSelectedAccommodations(toggle(selectedAccommodations, i))}>
                    <div className="flex items-center gap-2 mb-3">
                      {selectedAccommodations.has(i) ? <CheckCircle2 className="w-4 h-4 text-indigo-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                      <Hotel className="w-4 h-4 text-indigo-500" />
                      <span className="font-medium text-sm">숙박</span>
                    </div>
                    <div className="space-y-1 pl-6">
                      <Row label="숙소명" value={a.name} />
                      <Row label="주소" value={a.address} />
                      <Row label="체크인" value={a.checkIn} />
                      <Row label="체크아웃" value={a.checkOut} />
                      <Row label="예약번호" value={a.bookingRef} />
                      <Row label="요금" value={a.price} />
                    </div>
                  </div>
                ))}

                {result.rentals.map((r, i) => (
                  <div key={i}
                    className={`rounded-xl border p-4 cursor-pointer transition-colors ${selectedRentals.has(i) ? "border-green-400 bg-green-50" : "border-border bg-muted/30"}`}
                    onClick={() => setSelectedRentals(toggle(selectedRentals, i))}>
                    <div className="flex items-center gap-2 mb-3">
                      {selectedRentals.has(i) ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                      <Car className="w-4 h-4 text-green-500" />
                      <span className="font-medium text-sm">렌트카</span>
                    </div>
                    <div className="space-y-1 pl-6">
                      <Row label="업체" value={r.company} />
                      <Row label="차종" value={r.carModel} />
                      <Row label="픽업" value={r.pickupLocation} />
                      <Row label="반납" value={r.dropoffLocation} />
                      <Row label="예약번호" value={r.bookingRef} />
                      <Row label="요금" value={r.price} />
                    </div>
                  </div>
                ))}

                <p className="text-xs text-muted-foreground">저장 후 각 탭에서 수정할 수 있습니다.</p>

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setStep("input")} className="flex-1">
                    다시 입력
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={!anySelected || saving} className="flex-1">
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                    저장
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

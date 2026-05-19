import { useRef, useState } from "react";
import { Camera, FolderOpen, Loader2, Plane, Hotel, Car, CheckCircle2, Circle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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

type ExtractResult = {
  rawText: string;
  flights: FlightData[] | null;
  accommodation: Record<string, string | null> | null;
  rental: Record<string, string | null> | null;
};

function resizeAndToBase64(file: File, maxPx = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else { width = Math.round(width * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-foreground break-all">{value}</span>
    </div>
  );
}

const FLIGHT_TYPE_LABEL: Record<string, string> = {
  departure: "가는편",
  return: "오는편",
  transit: "경유",
};

export function ImportAllDialog({ tripId, open, onOpenChange, onSaved }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  // 항공편은 인덱스 Set으로 선택 관리
  const [selectedFlights, setSelectedFlights] = useState<Set<number>>(new Set());
  const [selectedAccommodation, setSelectedAccommodation] = useState(true);
  const [selectedRental, setSelectedRental] = useState(true);

  const extractMutation = trpc.trips.importAllFromImage.useMutation();
  const createFlight = trpc.flights.create.useMutation();
  const createAccommodation = trpc.accommodations.create.useMutation();
  const createRental = trpc.rentals.create.useMutation();

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("이미지 파일만 업로드할 수 있습니다."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("파일 크기는 10MB 이하여야 합니다."); return; }
    setLoading(true);
    try {
      const base64 = await resizeAndToBase64(file);
      const data = await extractMutation.mutateAsync({ tripId, imageBase64: base64 });
      const r = data as ExtractResult;
      setResult(r);
      setSelectedFlights(new Set((r.flights ?? []).map((_, i) => i)));
      setSelectedAccommodation(!!r.accommodation);
      setSelectedRental(!!r.rental);
      setStep("preview");
    } catch (e) {
      console.error(e);
      toast.error("이미지 분석에 실패했습니다. 더 선명한 이미지로 다시 시도해보세요.");
    } finally {
      setLoading(false);
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    let saved = 0;
    try {
      const flights = result.flights ?? [];
      for (let i = 0; i < flights.length; i++) {
        const f = flights[i];
        if (!selectedFlights.has(i)) continue;
        await createFlight.mutateAsync({
          tripId,
          type: f.type ?? "departure",
          airline: f.airline ?? "",
          flightNumber: f.flightNumber ?? "",
          departureAirport: f.departureAirport ?? "",
          arrivalAirport: f.arrivalAirport ?? "",
          departureTime: f.departureTime ?? "",
          arrivalTime: f.arrivalTime ?? "",
          bookingRef: f.bookingRef ?? "",
          seatNumber: f.seatNumber ?? "",
          memo: "",
        });
        saved++;
      }
      if (selectedAccommodation && result.accommodation) {
        await createAccommodation.mutateAsync({
          tripId,
          name: result.accommodation.name ?? "숙소",
          address: result.accommodation.address ?? "",
          checkIn: result.accommodation.checkIn ?? "",
          checkOut: result.accommodation.checkOut ?? "",
          bookingRef: result.accommodation.bookingRef ?? "",
          price: result.accommodation.price ?? undefined,
          currency: result.accommodation.currency ?? "KRW",
          memo: "",
        });
        saved++;
      }
      if (selectedRental && result.rental) {
        await createRental.mutateAsync({
          tripId,
          company: result.rental.company ?? "",
          carModel: result.rental.carModel ?? "",
          pickupLocation: result.rental.pickupLocation ?? "",
          dropoffLocation: result.rental.dropoffLocation ?? "",
          pickupTime: result.rental.pickupTime ?? "",
          dropoffTime: result.rental.dropoffTime ?? "",
          bookingRef: result.rental.bookingRef ?? "",
          price: result.rental.price ?? undefined,
          currency: result.rental.currency ?? "KRW",
          memo: "",
        });
        saved++;
      }
      toast.success(`${saved}건 저장됐습니다. 탭에서 확인 후 수정하세요.`);
      onSaved();
      handleClose();
    } catch (e) {
      console.error(e);
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep("upload");
    setResult(null);
    setLoading(false);
    setSaving(false);
    onOpenChange(false);
  };

  const toggleFlight = (i: number) =>
    setSelectedFlights(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const hasAny = result && (result.flights?.length || result.accommodation || result.rental);
  const anySelected = selectedFlights.size > 0 || selectedAccommodation || selectedRental;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>이미지로 한번에 가져오기</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              예약 확인서·항공권 이미지를 올리면 항공편·숙박·렌트카 정보를 한번에 추출합니다.
            </p>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onInput} />
            <input ref={fileRef} type="file" accept="image/*,image/heic,image/heif" className="hidden" onChange={onInput} />

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">이미지 분석 중...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => cameraRef.current?.click()}
                  className="flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all text-primary">
                  <Camera className="w-6 h-6" />
                  <span className="text-sm font-medium">카메라 촬영</span>
                </button>
                <button onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 hover:bg-indigo-100 transition-all text-indigo-600">
                  <FolderOpen className="w-6 h-6" />
                  <span className="text-sm font-medium">파일 선택</span>
                </button>
              </div>
            )}
          </div>
        )}

        {step === "preview" && result && (
          <div className="space-y-4">
            {!hasAny ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <p>인식된 예약 정보가 없습니다.</p>
                <p className="text-xs mt-1">더 선명한 이미지로 다시 시도해보세요.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setStep("upload")}>다시 시도</Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">저장할 항목을 선택하세요.</p>

                {/* 항공편 (복수) */}
                {(result.flights ?? []).map((f, i) => (
                  <div key={i}
                    className={`rounded-xl border p-4 cursor-pointer transition-colors ${selectedFlights.has(i) ? "border-blue-400 bg-blue-50" : "border-border bg-muted/30"}`}
                    onClick={() => toggleFlight(i)}>
                    <div className="flex items-center gap-2 mb-3">
                      {selectedFlights.has(i) ? <CheckCircle2 className="w-4 h-4 text-blue-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                      <Plane className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-sm">
                        항공편 {f.type ? `— ${FLIGHT_TYPE_LABEL[f.type] ?? f.type}` : ""}
                      </span>
                    </div>
                    <div className="space-y-1 pl-6">
                      <Row label="항공사" value={f.airline} />
                      <Row label="편명" value={f.flightNumber} />
                      <Row label="출발" value={f.departureAirport} />
                      <Row label="도착" value={f.arrivalAirport} />
                      <Row label="출발시간" value={f.departureTime} />
                      <Row label="도착시간" value={f.arrivalTime} />
                      <Row label="예약번호" value={f.bookingRef} />
                    </div>
                  </div>
                ))}

                {/* 숙박 */}
                {result.accommodation && (
                  <div
                    className={`rounded-xl border p-4 cursor-pointer transition-colors ${selectedAccommodation ? "border-indigo-400 bg-indigo-50" : "border-border bg-muted/30"}`}
                    onClick={() => setSelectedAccommodation(v => !v)}>
                    <div className="flex items-center gap-2 mb-3">
                      {selectedAccommodation ? <CheckCircle2 className="w-4 h-4 text-indigo-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                      <Hotel className="w-4 h-4 text-indigo-500" />
                      <span className="font-medium text-sm">숙박</span>
                    </div>
                    <div className="space-y-1 pl-6">
                      <Row label="숙소명" value={result.accommodation.name} />
                      <Row label="주소" value={result.accommodation.address} />
                      <Row label="체크인" value={result.accommodation.checkIn} />
                      <Row label="체크아웃" value={result.accommodation.checkOut} />
                      <Row label="예약번호" value={result.accommodation.bookingRef} />
                      <Row label="요금" value={result.accommodation.price} />
                    </div>
                  </div>
                )}

                {/* 렌트카 */}
                {result.rental && (
                  <div
                    className={`rounded-xl border p-4 cursor-pointer transition-colors ${selectedRental ? "border-green-400 bg-green-50" : "border-border bg-muted/30"}`}
                    onClick={() => setSelectedRental(v => !v)}>
                    <div className="flex items-center gap-2 mb-3">
                      {selectedRental ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                      <Car className="w-4 h-4 text-green-500" />
                      <span className="font-medium text-sm">렌트카</span>
                    </div>
                    <div className="space-y-1 pl-6">
                      <Row label="업체" value={result.rental.company} />
                      <Row label="차종" value={result.rental.carModel} />
                      <Row label="픽업" value={result.rental.pickupLocation} />
                      <Row label="반납" value={result.rental.dropoffLocation} />
                      <Row label="예약번호" value={result.rental.bookingRef} />
                      <Row label="요금" value={result.rental.price} />
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">저장 후 각 탭에서 수정할 수 있습니다.</p>

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setStep("upload")} className="flex-1">다시 찍기</Button>
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

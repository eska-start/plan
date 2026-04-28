import { useRef, useState } from "react";
import { Camera, FolderOpen, Loader2, Plane, Hotel, Car, CheckCircle2, Circle, Sparkles, Bot, Type, Image as ImageIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
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
  airline: string | null; flightNumber: string | null;
  departureAirport: string | null; arrivalAirport: string | null;
  departureTime: string | null; arrivalTime: string | null;
  bookingRef: string | null; seatNumber: string | null;
  type: "departure" | "return" | "transit" | null;
};
type AccommodationData = {
  name: string | null; address: string | null;
  checkIn: string | null; checkOut: string | null;
  bookingRef: string | null; price: string | null; currency: string | null;
};
type RentalData = {
  company: string | null; carModel: string | null;
  pickupLocation: string | null; dropoffLocation: string | null;
  pickupTime: string | null; dropoffTime: string | null;
  bookingRef: string | null; price: string | null; currency: string | null;
};
type ExtractResult = {
  flights: FlightData[]; accommodations: AccommodationData[];
  rentals: RentalData[]; reply: string;
};

const FLIGHT_TYPE_LABEL: Record<string, string> = { departure: "가는편", return: "오는편", transit: "경유" };

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-foreground break-all">{value}</span>
    </div>
  );
}

function resizeToBase64(file: File, maxPx = 1400, quality = 0.88): Promise<string> {
  const readOriginal = () =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
          else { width = Math.round(width * maxPx / height); height = maxPx; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        readOriginal().then(resolve).catch(reject);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      readOriginal().then(resolve).catch(reject);
    };
    img.src = url;
  });
}

function normalizeFlightDateTime(v: string | null): string | null {
  if (!v) return null;
  const raw = v.trim();
  if (!raw) return null;
  const isoMatch = raw.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (isoMatch) return isoMatch[1];
  const korMatch = raw.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{1,2}):(\d{2})/);
  if (korMatch) {
    const year = new Date().getFullYear();
    const month = korMatch[1].padStart(2, "0");
    const day = korMatch[2].padStart(2, "0");
    const hh = korMatch[3].padStart(2, "0");
    const mm = korMatch[4].padStart(2, "0");
    return `${year}-${month}-${day}T${hh}:${mm}`;
  }
  const hmMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) return `${hmMatch[1].padStart(2, "0")}:${hmMatch[2]}`;
  return raw;
}

function pickObjectList(
  data: Record<string, unknown>,
  pluralKey: string,
  singularKey?: string,
  fallbackArrayKey?: string,
): unknown[] {
  const pluralValue = data[pluralKey];
  if (Array.isArray(pluralValue)) return pluralValue;

  if (singularKey) {
    const singularValue = data[singularKey];
    if (singularValue && typeof singularValue === "object") return [singularValue];
  }

  if (fallbackArrayKey) {
    const fallbackValue = data[fallbackArrayKey];
    if (Array.isArray(fallbackValue)) return fallbackValue;
  }

  return [];
}

export function AiImportDialog({ tripId, open, onOpenChange, onSaved }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"text" | "image">("text");
  const [step, setStep] = useState<"input" | "preview">("input");
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [selectedFlights, setSelectedFlights] = useState<Set<number>>(new Set());
  const [selectedAccommodations, setSelectedAccommodations] = useState<Set<number>>(new Set());
  const [selectedRentals, setSelectedRentals] = useState<Set<number>>(new Set());

  const textExtract = trpc.trips.aiExtract.useMutation();
  const imageExtract = trpc.trips.aiExtractFromImage.useMutation();
  const createFlight = trpc.flights.create.useMutation();
  const createAccommodation = trpc.accommodations.create.useMutation();
  const createRental = trpc.rentals.create.useMutation();

  const applyResult = (raw: unknown) => {
    const d = raw as Record<string, unknown>;
    // AI가 singular key나 null을 반환하는 경우 방어
    const flightsRaw = pickObjectList(d, "flights", "flight");
    const accommodationsRaw = pickObjectList(d, "accommodations", "accommodation", "hotel");
    const rentalsRaw = pickObjectList(d, "rentals", "rental");
      reply: typeof d.reply === "string" ? d.reply : "",
    };
    setResult(data);
    setSelectedFlights(new Set(data.flights.map((_, i) => i)));
    setSelectedAccommodations(new Set(data.accommodations.map((_, i) => i)));
    setSelectedRentals(new Set(data.rentals.map((_, i) => i)));
    setStep("preview");
  };

  const handleText = async () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    try {
      const data = await textExtract.mutateAsync({ tripId, text: text.trim() }) as ExtractResult;
      applyResult(data);
    } catch (e: any) {
      toast.error(e?.message?.includes("LLM_API_KEY")
        ? "서버에 LLM_API_KEY 환경변수를 설정해야 합니다."
        : "AI 분석에 실패했습니다.");
    } finally { setAnalyzing(false); }
  };

  const handleImage = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("이미지 파일만 업로드할 수 있습니다."); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("파일 크기는 15MB 이하여야 합니다."); return; }
    const total = data.flights.length + data.accommodations.length + data.rentals.length;
    if (total === 0) {
      toast.error("AI가 인식한 항목이 없습니다. 텍스트/이미지를 더 선명하게 다시 시도해주세요.");
      setStep("input");
      return;
    }
    setAnalyzing(true);
    try {
      const base64 = await resizeToBase64(file);
      const data = await imageExtract.mutateAsync({ tripId, imageBase64: base64 }) as ExtractResult;
      applyResult(data);
    } catch (e: any) {
      toast.error(e?.message?.includes("LLM_API_KEY")
        ? "서버에 LLM_API_KEY 환경변수를 설정해야 합니다."
        : "이미지 분석에 실패했습니다. 더 선명한 이미지로 다시 시도해보세요.");
    } finally { setAnalyzing(false); }
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleImage(f);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    let saved = 0;
    try {
      const flights = result.flights;
      for (let i = 0; i < flights.length; i++) {
        if (!selectedFlights.has(i)) continue;
        const f = flights[i];
        await createFlight.mutateAsync({ tripId, type: f.type ?? "departure", airline: f.airline ?? "", flightNumber: f.flightNumber ?? "", departureAirport: f.departureAirport ?? "", arrivalAirport: f.arrivalAirport ?? "", departureTime: f.departureTime ?? "", arrivalTime: f.arrivalTime ?? "", bookingRef: f.bookingRef ?? "", seatNumber: f.seatNumber ?? "", memo: "" });
        saved++;
      }
      const accomms = result.accommodations;
      for (let i = 0; i < accomms.length; i++) {
        if (!selectedAccommodations.has(i)) continue;
        const a = accomms[i];
        await createAccommodation.mutateAsync({ tripId, name: a.name ?? "숙소", address: a.address ?? "", checkIn: a.checkIn ?? "", checkOut: a.checkOut ?? "", bookingRef: a.bookingRef ?? "", price: a.price ?? undefined, currency: a.currency ?? "KRW", memo: "" });
        saved++;
      }
      const rentals = result.rentals;
      for (let i = 0; i < rentals.length; i++) {
        if (!selectedRentals.has(i)) continue;
        const r = rentals[i];
        await createRental.mutateAsync({ tripId, company: r.company ?? "", carModel: r.carModel ?? "", pickupLocation: r.pickupLocation ?? "", dropoffLocation: r.dropoffLocation ?? "", pickupTime: r.pickupTime ?? "", dropoffTime: r.dropoffTime ?? "", bookingRef: r.bookingRef ?? "", price: r.price ?? undefined, currency: r.currency ?? "KRW", memo: "" });
        saved++;
      }
      toast.success(`${saved}건 저장됐습니다.`);
      onSaved();
      handleClose();
    } catch (e) { console.error("[AiImportDialog] save error:", e); toast.error("저장 중 오류가 발생했습니다."); }
    finally { setSaving(false); }
  };

  const handleClose = () => {
    setStep("input"); setText(""); setResult(null);
    setAnalyzing(false); setSaving(false);
    onOpenChange(false);
  };

  const toggle = (set: Set<number>, i: number) => {
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
            {/* 모드 탭 */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setMode("text")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "text" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Type className="w-3.5 h-3.5" />텍스트 입력
              </button>
              <button
                onClick={() => setMode("image")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "image" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <ImageIcon className="w-3.5 h-3.5" />이미지 분석
              </button>
            </div>

            {analyzing ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">AI 분석 중...</p>
              </div>
            ) : mode === "text" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  예약 확인서 텍스트를 붙여넣거나 자연어로 입력하세요.
                </p>
                <Textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder={"예) 제주항공 7C1603, 5월 24일 14:55 ICN→FSZ 등록해줘\n\n또는 예약 확인서 전체 내용을 붙여넣기"}
                  className="min-h-[140px] resize-none text-sm"
                  autoFocus
                />
                <Button onClick={handleText} disabled={!text.trim()} className="w-full">
                  <Sparkles className="w-4 h-4 mr-2" />AI로 분석하기
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  항공권·예약 확인서 이미지를 올리면 Gemini가 내용을 직접 읽어 분석합니다.
                </p>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileInput} />
                <input ref={fileRef} type="file" accept="image/*,image/heic,image/heif" className="hidden" onChange={onFileInput} />
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => cameraRef.current?.click()}
                    className="flex flex-col items-center gap-2 py-8 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all text-primary">
                    <Camera className="w-6 h-6" />
                    <span className="text-sm font-medium">카메라 촬영</span>
                  </button>
                  <button onClick={() => fileRef.current?.click()}
                    className="flex flex-col items-center gap-2 py-8 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 hover:bg-indigo-100 transition-all text-indigo-600">
                    <FolderOpen className="w-6 h-6" />
                    <span className="text-sm font-medium">파일 선택</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "preview" && result && (
          <div className="space-y-4">
            {result.reply && (
              <div className="flex gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15">
                <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-sm">{result.reply}</p>
              </div>
            )}

            {!hasAny ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <p>추출된 여행 정보가 없습니다.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setStep("input")}>다시 시도</Button>
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
                  <Button variant="outline" size="sm" onClick={() => setStep("input")} className="flex-1">다시 입력</Button>
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

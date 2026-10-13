import { validateBooking } from "@shared/bookingValidation";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { DocumentType, FieldVerification } from "@shared/vision";
import { verifyFields } from "@shared/vision";
import { localDocFromText } from "@shared/localDoc";
import { captureImage, isNativeApp, ocrImage } from "@/lib/capBridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/** APK analysis never uploads the image or requires a cloud key. Results fill the existing form. */
export function VisionReview({ docType, onConfirm }: { docType: DocumentType; onConfirm: (values: Record<string, string>) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"success" | "failure" | null>(null);
  const [log, setLog] = useState("");
  const lock = useRef(false);
  const alive = useRef(true);
  const ownedUrl = useRef<string | null>(null);
  const analyze = trpc.vision.analyze.useMutation();
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current); }; }, []);

  const copyLog = async () => {
    try { await navigator.clipboard.writeText(log); toast.success("로그를 복사했습니다."); }
    catch { toast.error("복사하지 못했습니다. 아래 로그를 선택해 복사해주세요."); }
  };
  const complete = (fields: FieldVerification[]) => {
    const values: Record<string, string> = {};
    for (const f of fields) {
      if (f.status !== "invalid" && f.status !== "conflict" && f.finalValue?.trim()) values[f.field] = f.finalValue.trim();
    }
    // Metadata alone (documentType/status/currency) is not a successful extraction.
    const core = docType === "flight" ? ["flightNumber", "departureAirport", "arrivalAirport", "departureDateTime", "arrivalDateTime"] : docType === "accommodation" ? ["name", "address", "checkIn", "checkOut"] : ["company", "carModel", "pickupLocation", "dropoffLocation", "pickupDateTime", "dropoffDateTime"];
    if (!core.some(k => values[k])) throw new Error("NO_BOOKING_INFORMATION");
    if (values.bookingStatus === "cancelled" || values.bookingStatus === "search_result") throw new Error("NOT_A_CONFIRMED_BOOKING");
    onConfirm(values);
    const validation = validateBooking(docType, { ...values, departureTime: values.departureDateTime, arrivalTime: values.arrivalDateTime, pickupTime: values.pickupDateTime, dropoffTime: values.dropoffDateTime });
    if (validation) throw new Error("INCOMPLETE_BOOKING_INFORMATION");
    setStatus("success");
    toast.success("성공: 예약 정보를 입력했습니다. 확인 후 저장해주세요.");
  };
  const fail = (error: unknown) => {
    // No OCR text, booking details, image path, or credentials in diagnostic logs.
    const message = error instanceof Error ? error.message.split(":")[0] : "";
    const code = /^[A-Z_]+$/.test(message) ? message : "ANALYSIS_FAILED";
    const diagnostic = JSON.stringify({ event: "booking-analysis-failed", document: docType, engine: isNativeApp() ? "mlkit-local" : "server", code, time: new Date().toISOString() }, null, 2);
    setLog(diagnostic); setStatus("failure");
    toast.error("실패: 예약 정보를 읽지 못했습니다.", { duration: 10000, action: { label: "로그 복사", onClick: () => { void navigator.clipboard.writeText(diagnostic).catch(() => toast.error("아래 로그 복사 버튼을 이용해주세요.")); } } });
  };
  const pick = async (source: "camera" | "gallery") => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setStatus(null); setLog("");
    try {
      const image = await captureImage(source);
      if (!image || !alive.current) return;
      setPreview(image.previewUrl);
      const { text } = await ocrImage(image.path);
      if (alive.current) complete(verifyFields(docType, localDocFromText(text, docType), null));
    } catch (e) { if (alive.current) fail(e); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const upload = async (file: File) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setStatus(null); setLog("");
    try {
      if (!file.type.startsWith("image/") || file.size > 16 * 1024 * 1024) throw new Error("INVALID_IMAGE");
      if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current);
      ownedUrl.current = URL.createObjectURL(file); setPreview(ownedUrl.current);
      const fd = new FormData(); fd.append("file", file);
      const response = await fetch("/api/upload-ocr", { method: "POST", body: fd, credentials: "include" });
      if (!response.ok) throw new Error("UPLOAD_FAILED");
      const { url } = await response.json();
      const result = await analyze.mutateAsync({ imageUrl: url, docType, mode: "local", cloudConsent: false });
      if (alive.current) complete(result.fields);
    } catch (e) { if (alive.current) fail(e); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <div className="rounded-xl border p-3 space-y-2">
    {isNativeApp() ? <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void pick("camera")}>카메라 촬영</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void pick("gallery")}>스크린샷 선택</Button>
    </div> : <Input aria-label="예약 스크린샷 선택" type="file" accept="image/*" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />}
    {preview && <img src={preview} alt="선택한 예약 이미지" className="h-28 w-auto rounded-lg border object-contain" />}
    <p role="status" className="text-sm">{busy ? "예약 정보를 읽고 있습니다..." : status === "success" ? "성공" : status === "failure" ? "실패" : "예약 스크린샷을 선택하면 자동 입력됩니다."}</p>
    {status === "failure" && <><Button type="button" variant="outline" onClick={() => void copyLog()}>실패 로그 복사</Button><details><summary className="text-xs">복사용 로그</summary><textarea aria-label="실패 로그" readOnly value={log} className="w-full text-xs" rows={6} /></details></>}
  </div>;
}

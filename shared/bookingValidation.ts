import type { DocumentType } from "./vision";

export function validateBooking(type: DocumentType, v: Record<string, unknown>): string | null {
  const required: Record<string, string> = type === "flight"
    ? { flightNumber: "편명", departureAirport: "출발 공항", arrivalAirport: "도착 공항", departureTime: "출발 일시", arrivalTime: "도착 일시" }
    : type === "accommodation"
      ? { name: "숙소명", address: "숙소 주소", checkIn: "체크인", checkOut: "체크아웃" }
      : type === "rental"
        ? { company: "렌트 업체", pickupLocation: "픽업 장소", dropoffLocation: "반납 장소", pickupTime: "픽업 일시", dropoffTime: "반납 일시" }
        : {};
  const missing = Object.entries(required).filter(([key]) => typeof v[key] !== "string" || !(v[key] as string).trim()).map(([, label]) => label);
  if (missing.length) return `${missing.join(", ")}을(를) 입력해주세요.`;
  const dateFields = type === "flight" ? ["departureTime", "arrivalTime"] : type === "rental" ? ["pickupTime", "dropoffTime"] : ["checkIn", "checkOut"];
  for (const key of dateFields) {
    const value = typeof v[key] === "string" ? v[key] as string : null;
    if (value && (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(value) || !Number.isFinite(Date.parse(value)))) return "날짜와 시간을 올바르게 입력해주세요.";
    if (value && new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0,10) !== value.slice(0,10)) return "존재하지 않는 날짜입니다.";
    if (value && type !== "accommodation" && !value.includes("T")) return "날짜와 시간을 모두 입력해주세요.";
  }
  if (type !== "flight" && v[dateFields[0]] && v[dateFields[1]] && String(v[dateFields[1]]) <= String(v[dateFields[0]])) return "종료 일시는 시작 일시보다 늦어야 합니다.";
  if (v.price && (!Number.isFinite(Number(v.price)) || Number(v.price) < 0)) return "금액을 올바르게 입력해주세요.";
  return null;
}

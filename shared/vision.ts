/**
 * PLAN 정밀 교차 검증 — 공용 스키마/정규화/필드 비교 엔진.
 * 웹 tRPC + Android(Capacitor/SQLite) 공용. 순수 함수만 포함.
 */

export type DocumentType = "flight" | "accommodation" | "rental" | "itinerary";
export type AnalysisMode = "local" | "smart" | "precise";
export type VerifyStatus =
  | "matched"
  | "conflict"
  | "missing"
  | "invalid"
  | "single_source"
  | "confirmed";

export interface FieldVerification {
  field: string;
  localValue: string | null;
  cloudValue: string | null;
  finalValue: string | null;
  status: VerifyStatus;
  confidence: number | null;
  evidence: string[];
  userConfirmed: boolean;
}

export const HIGH_RISK_FLIGHT_FIELDS = [
  "departureDateTime",
  "arrivalDateTime",
  "departureAirportCode",
  "arrivalAirportCode",
  "flightNumber",
  "departureDate",
  "departureTime",
  "arrivalDate",
  "arrivalTime",
] as const;

const IATA_RE = /\b([A-Z]{3})\b/;

export function normalizeAirportCode(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = String(v).toUpperCase().match(IATA_RE);
  return m ? m[1] : String(v).toUpperCase().trim().slice(0, 8) || null;
}

export function normalizeDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
  let m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // YY.MM.DD
  m = s.match(/(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `20${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // MM.DD / MM/DD (연도 없음 → null 반환 대신 원문 유지하되 비교용으로 패딩)
  m = s.match(/(\d{1,2})[.\-/](\d{1,2})/);
  if (m && s.length <= 6) return `--${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return s;
}

export function normalizeTime(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // ISO datetime에서 시간 추출
  const iso = s.match(/T(\d{1,2}):(\d{2})/);
  if (iso) return `${iso[1].padStart(2, "0")}:${iso[2]}`;
  // HH:mm 형태를 뒤에서부터 탐색 (날짜 속 숫자 오매칭 방지), 앞쪽 오전/오후 반영
  const colonMatches = Array.from(s.matchAll(/(\d{1,2}):(\d{2})/g));
  if (colonMatches.length > 0) {
    const last = colonMatches[colonMatches.length - 1];
    let h = parseInt(last[1], 10);
    const mi = parseInt(last[2], 10);
    if (h > 23 || mi > 59) return s;
    const head = s.slice(0, last.index ?? 0);
    if (/오후|PM|pm/.test(head) && h < 12) h += 12;
    if (/오전|AM|am/.test(head) && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  }
  // 한글 시 패턴 (예: 오후 8시 50분, 8시)
  const kr = s.match(/(오전|오후)?\s*(\d{1,2})\s*시\s*(\d{1,2})?\s*분?/);
  if (kr) {
    let h = parseInt(kr[2], 10);
    const mi = kr[3] ? parseInt(kr[3], 10) : 0;
    if (kr[1] === "오후" && h < 12) h += 12;
    if (kr[1] === "오전" && h === 12) h = 0;
    if (h > 23 || mi > 59) return s;
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  }
  return s;
}

export function normalizeDateTime(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const d = normalizeDate(s);
  const t = normalizeTime(s);
  if (d && d.length === 10 && t && /^\d{2}:\d{2}$/.test(t)) return `${d}T${t}`;
  if (d && d.length === 10) return d;
  if (t && /^\d{2}:\d{2}$/.test(t)) return t;
  return s || null;
}

export function normalizeCurrency(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).toUpperCase().trim();
  if (/원|KRW|₩/.test(s)) return "KRW";
  if (/USD|\$/.test(s)) return "USD";
  if (/JPY|¥|엔/.test(s)) return "JPY";
  if (/EUR|€/.test(s)) return "EUR";
  const m = s.match(/\b(USD|EUR|KRW|JPY|GBP|CNY|AUD|CAD|TWD|HKD|SGD|THB|VND)\b/);
  return m ? m[1] : s.slice(0, 8);
}

function normFor(field: string, v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === "null") return null;
  if (field.toLowerCase().includes("airportcode")) return normalizeAirportCode(s);
  if (field.toLowerCase().includes("currency")) return normalizeCurrency(s);
  if (field.toLowerCase().includes("datetime")) return normalizeDateTime(s);
  if (field.toLowerCase().includes("date")) return normalizeDate(s);
  if (field.toLowerCase().includes("time")) return normalizeTime(s);
  if (field.toLowerCase().includes("flightnumber")) {
    return s.toUpperCase().replace(/[\s-]/g, "");
  }
  if (field.toLowerCase().includes("booking")) {
    return s.toUpperCase().replace(/[\s-]/g, "");
  }
  return s;
}

export function isLogicallyInvalid(
  docType: DocumentType,
  field: string,
  value: string | null,
  all: Record<string, string | null>,
): string | null {
  if (value == null) return null;
  if (docType === "accommodation") {
    if (field === "checkOut" && all.checkIn && value) {
      const ci = normalizeDate(String(all.checkIn));
      const co = normalizeDate(value);
      if (ci && co && co < ci) return "체크아웃이 체크인보다 빠름";
    }
  }
  if (docType === "flight") {
    if (field === "departureDateTime" || field === "arrivalDateTime") {
      if (value && !/(\d{4}-\d{2}-\d{2}|\d{2}:\d{2}|T)/.test(value))
        return "날짜/시간 형식 아님";
    }
  }
  if (field.toLowerCase().includes("price")) {
    const n = Number(String(value).replace(/[^0-9.]/g, ""));
    if (Number.isNaN(n)) return "금액 형식 아님";
  }
  return null;
}

/** 검색 결과 화면을 확정 예약으로 오인 금지: 확정 단서 없으면 invalid扱い는 호출자가 판단 */
export function looksLikeSearchResult(text: string): boolean {
  return /검색\s*결과|최저가\s*비교|왕복\s*검색|날짜\s*선택|특가\s*알림/i.test(text);
}

export function verifyFields(
  docType: DocumentType,
  local: Record<string, string | null>,
  cloud: Record<string, string | null> | null,
  opts?: { highRiskBlockAuto?: boolean },
): FieldVerification[] {
  const keys = new Set([...Object.keys(local), ...Object.keys(cloud ?? {})]);
  const out: FieldVerification[] = [];
  for (const field of Array.from(keys)) {
    const lv = (local[field] ?? null) as string | null;
    const cv = (cloud?.[field] ?? null) as string | null;
    const nlv = normFor(field, lv);
    const ncv = normFor(field, cv);
    const evidence: string[] = [];
    let status: VerifyStatus;
    let finalValue: string | null = null;

    if (nlv == null && ncv == null) {
      status = "missing";
    } else if (cloud == null) {
      status = "single_source";
      finalValue = lv;
      evidence.push("local-only");
    } else if (nlv != null && ncv == null) {
      status = "single_source";
      finalValue = lv;
    } else if (nlv == null && ncv != null) {
      status = "single_source";
      finalValue = cv;
    } else if (nlv === ncv) {
      status = "matched";
      finalValue = lv ?? cv;
    } else {
      status = "conflict";
      finalValue = null;
      evidence.push(`local=${nlv} cloud=${ncv}`);
    }

    // 원본에 없는 값 확정 금지 + 논리 검증
    const merged: Record<string, string | null> = { ...local, ...(cloud ?? {}) };
    const invalidReason = isLogicallyInvalid(docType, field, finalValue, merged);
    if (invalidReason && status !== "conflict") {
      status = "invalid";
      evidence.push(invalidReason);
      finalValue = null;
    }

    // 고위험 필드: 충돌 시 자동 확정 금지 (이미 finalValue=null)
    if (
      opts?.highRiskBlockAuto !== false &&
      docType === "flight" &&
      (HIGH_RISK_FLIGHT_FIELDS as readonly string[]).includes(field) &&
      status === "conflict"
    ) {
      finalValue = null;
      evidence.push("high-risk: 사용자 확인 필요");
    }

    out.push({
      field,
      localValue: lv,
      cloudValue: cv,
      finalValue,
      status,
      confidence: null,
      evidence,
      userConfirmed: false,
    });
  }
  return out;
}

/** segments(경유/왕복) 분리용: 동일 문서 내 복수 구간이 한 필드에 뭉개졌는지 검사 */
export function splitSegmentsHint(values: Record<string, string | null>): string[] {
  const hints: string[] = [];
  const fn = values.flightNumber ?? "";
  if (typeof fn === "string" && /[A-Z]{2}\d+.*[A-Z]{2}\d+/.test(fn.replace(/\s/g, ""))) {
    hints.push("flightNumber에 복수 편명 가능 — segments 분리 필요");
  }
  return hints;
}

export const FLIGHT_CONTRACT_FIELDS = [
  "documentType",
  "bookingStatus",
  "airline",
  "flightNumber",
  "departureAirport",
  "departureAirportCode",
  "arrivalAirport",
  "arrivalAirportCode",
  "departureDateTime",
  "arrivalDateTime",
  "departureTimezone",
  "arrivalTimezone",
  "bookingReference",
  "seatNumber",
  "flightType",
  "passengerName",
  "segments",
  "needsReview",
] as const;

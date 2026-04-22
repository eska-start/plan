import { ENV } from "./env";

const DEFAULT_OCR_SPACE_FREE_KEY = "helloworld";

type OcrSpaceParsedResult = { ParsedText?: string };

type OcrSpaceResponse = {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string[] | string;
  ParsedResults?: OcrSpaceParsedResult[];
};

async function callOcrSpace(form: URLSearchParams): Promise<string> {
  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: {
      apikey: ENV.ocrSpaceApiKey || DEFAULT_OCR_SPACE_FREE_KEY,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!response.ok) throw new Error(`OCR API failed: ${response.status}`);
  const data = (await response.json()) as OcrSpaceResponse;
  if (data.IsErroredOnProcessing) {
    const err = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join(", ")
      : data.ErrorMessage ?? "Unknown OCR error";
    throw new Error(err);
  }
  return (data.ParsedResults ?? []).map(r => r.ParsedText ?? "").join("\n").trim();
}

function makeForm(lang: string, extra: Record<string, string> = {}): URLSearchParams {
  const f = new URLSearchParams();
  f.set("language", lang);
  f.set("isOverlayRequired", "false");
  f.set("OCREngine", "2");
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
}

export async function extractTextWithFreeOcr(imageUrl: string): Promise<string> {
  return callOcrSpace(makeForm("eng", { url: imageUrl }));
}

export async function extractTextWithFreeOcrBase64(base64: string): Promise<string> {
  const dataUri = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
  // 한국어 먼저 시도 (한국 예약 확인서 대응)
  const korText = await callOcrSpace(makeForm("kor", { base64Image: dataUri })).catch(() => "");
  if (korText.trim().length > 30) return korText;
  // 한국어 OCR 결과가 없으면 영어로 재시도
  return callOcrSpace(makeForm("eng", { base64Image: dataUri })).catch(() => korText);
}

// ─── 공통 헬퍼 ───────────────────────────────────────────────────────────────

const firstMatch = (text: string, patterns: RegExp[]): string | null => {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
};

// IATA 공항 코드 (대문자 3자) 추출
function extractIataCodes(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(/\b([A-Z]{3})\b/g), m => m[1])))
    .filter(code => !/^(THE|AND|FOR|KRW|USD|EUR|JPY|KOR|ENG|PDF|OTA|URL|API)$/.test(code));
}

// 날짜 추출: "05월 24일" → "MM-DD", "2025-05-24" → as-is
function extractDate(text: string): string | null {
  const ko = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (ko) return `${ko[1].padStart(2, "0")}-${ko[2].padStart(2, "0")}`;
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  return null;
}

// 항공편 번호 패턴: 7C1603, KE123, OZ456 등
function extractFlightNumber(text: string): string | null {
  const m = text.match(/\b([A-Z0-9]{2}\d{3,4})\b/);
  return m?.[1] ?? null;
}

// 한국 항공사 이름 매핑
const KOREAN_AIRLINES: Record<string, string> = {
  "제주항공": "제주항공 (Jeju Air)",
  "대한항공": "대한항공 (Korean Air)",
  "아시아나": "아시아나항공 (Asiana)",
  "진에어": "진에어 (Jin Air)",
  "에어부산": "에어부산 (Air Busan)",
  "티웨이": "티웨이항공 (T'way)",
  "이스타": "이스타항공 (Eastar)",
  "에어서울": "에어서울 (Air Seoul)",
};

function extractAirline(text: string): string | null {
  for (const [ko] of Object.entries(KOREAN_AIRLINES)) {
    if (text.includes(ko)) return ko;
  }
  return firstMatch(text, [
    /항공사\s*[:#-]?\s*([^\n]+)/i,
    /AIRLINE\s*[:#-]?\s*([^\n]+)/i,
  ]);
}

// ─── 항공편 파서 (복수 반환) ─────────────────────────────────────────────────

export type FlightData = {
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

function parseKoreanBookingSection(sectionText: string, type: "departure" | "return"): FlightData | null {
  const lines = sectionText.split("\n").map(l => l.trim()).filter(Boolean);

  // 날짜 (MM-DD 또는 YYYY-MM-DD)
  let date = "";
  for (const line of lines) {
    const d = extractDate(line);
    if (d) { date = d; break; }
  }

  // 시간들 (순서대로: 첫 번째=출발, 두 번째=도착)
  const times: string[] = [];
  for (const line of lines) {
    const t = line.match(/^(\d{1,2}:\d{2})/);
    if (t) times.push(t[1]);
  }

  // IATA 공항 코드 (시간 옆 줄에서)
  const airports: string[] = [];
  for (const line of lines) {
    if (/^\d{1,2}:\d{2}/.test(line)) {
      const codes = extractIataCodes(line);
      if (codes.length > 0) airports.push(codes[0]);
    }
  }

  // 항공편 번호
  let flightNumber: string | null = null;
  for (const line of lines) {
    const fn = extractFlightNumber(line);
    if (fn) { flightNumber = fn; break; }
  }

  const airline = extractAirline(sectionText);
  const bookingRef = firstMatch(sectionText, [
    /예약\s*(?:번호|확인번호|번)\s*[:#\s]?\s*([A-Z0-9]{4,12})/i,
    /확인\s*번호\s*[:#\s]?\s*([A-Z0-9]{4,12})/i,
    /(?:BOOKING|PNR|CONFIRMATION)\s*(?:NO\.?|REF|번호)?\s*[:#\s]?\s*([A-Z0-9]{5,12})/i,
  ]);

  const depAirport = airports[0] ?? null;
  const arrAirport = airports[1] ?? null;
  const depTime = times[0] ? (date ? `${date} ${times[0]}` : times[0]) : null;
  const arrTime = times[1] ? (date ? `${date} ${times[1]}` : times[1]) : null;

  if (!flightNumber && !depAirport) return null;

  return { airline, flightNumber, departureAirport: depAirport, arrivalAirport: arrAirport, departureTime: depTime, arrivalTime: arrTime, bookingRef, seatNumber: null, type };
}

export function parseFlightsFromText(text: string): FlightData[] {
  const results: FlightData[] = [];

  // 가는편/오는편 구분 있는 한국 예약 형식
  if (text.includes("가는편") || text.includes("오는편") || text.includes("편도")) {
    const depIdx = text.indexOf("가는편");
    const retIdx = text.indexOf("오는편");

    if (depIdx !== -1) {
      const end = retIdx !== -1 ? retIdx : text.length;
      const section = parseKoreanBookingSection(text.slice(depIdx, end), "departure");
      if (section) results.push(section);
    }
    if (retIdx !== -1) {
      const section = parseKoreanBookingSection(text.slice(retIdx), "return");
      if (section) results.push(section);
    }
    if (results.length > 0) return results;
  }

  // 일반 형식 (영어 또는 레이블 있는 한국어)
  const iataMatch = text.toUpperCase().match(/\b([A-Z]{3})\s*(?:-|->|→|TO|>)\s*([A-Z]{3})\b/);
  const generic: FlightData = {
    airline: extractAirline(text),
    flightNumber: firstMatch(text, [
      /편명\s*[:#-]?\s*([A-Z0-9]{2}\d{2,4})/i,
      /항공편\s*(?:번호)?\s*[:#-]?\s*([A-Z0-9]{2}\d{2,4})/i,
      /FLIGHT\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*([A-Z0-9]{2}\d{2,4})/i,
      /\b([A-Z0-9]{2}\d{3,4})\b/,
    ]),
    departureAirport: iataMatch?.[1] ?? null,
    arrivalAirport: iataMatch?.[2] ?? null,
    departureTime: firstMatch(text, [
      /출발\s*(?:일시|시간|날짜)?\s*[:#-]?\s*([^\n]+)/i,
      /탑승\s*(?:일시|시간|날짜)?\s*[:#-]?\s*([^\n]+)/i,
      /DEPART(?:URE)?\s*(?:TIME|DATE)?\s*[:#-]?\s*([^\n]+)/i,
    ]),
    arrivalTime: firstMatch(text, [
      /도착\s*(?:일시|시간|날짜)?\s*[:#-]?\s*([^\n]+)/i,
      /ARRIV(?:AL)?\s*(?:TIME|DATE)?\s*[:#-]?\s*([^\n]+)/i,
    ]),
    bookingRef: firstMatch(text, [
      /예약\s*(?:번호|확인번호)\s*[:#-]?\s*([A-Z0-9]{4,12})/i,
      /(?:BOOKING|PNR|RESERVATION)\s*(?:REF(?:ERENCE)?)?\s*[:#-]?\s*([A-Z0-9]{5,8})/i,
    ]),
    seatNumber: firstMatch(text, [/좌석\s*[:#-]?\s*([A-Z0-9]{1,4})/i, /SEAT\s*[:#-]?\s*([A-Z0-9]{1,4})/i]),
    type: null,
  };
  if (generic.flightNumber || generic.departureAirport) results.push(generic);
  return results;
}

// 하위 호환 (기존 단일 반환 코드용)
export function parseFlightFromText(text: string): FlightData {
  return parseFlightsFromText(text)[0] ?? {
    airline: null, flightNumber: null, departureAirport: null, arrivalAirport: null,
    departureTime: null, arrivalTime: null, bookingRef: null, seatNumber: null, type: null,
  };
}

// ─── 렌트카 파서 ─────────────────────────────────────────────────────────────

export function parseRentalFromText(text: string) {
  return {
    company: firstMatch(text, [/렌트\s*(?:카)?회사\s*[:#-]?\s*([^\n]+)/i, /COMPANY\s*[:#-]?\s*([^\n]+)/i, /RENTAL\s*COMPANY\s*[:#-]?\s*([^\n]+)/i]),
    carModel: firstMatch(text, [/차종\s*[:#-]?\s*([^\n]+)/i, /차량\s*[:#-]?\s*([^\n]+)/i, /CAR\s*(?:MODEL)?\s*[:#-]?\s*([^\n]+)/i, /VEHICLE\s*[:#-]?\s*([^\n]+)/i]),
    pickupLocation: firstMatch(text, [/픽업\s*(?:장소|위치)?\s*[:#-]?\s*([^\n]+)/i, /인수\s*(?:장소|위치)?\s*[:#-]?\s*([^\n]+)/i, /PICK[ -]?UP\s*(?:LOCATION)?\s*[:#-]?\s*([^\n]+)/i]),
    dropoffLocation: firstMatch(text, [/반납\s*(?:장소|위치)?\s*[:#-]?\s*([^\n]+)/i, /DROP[ -]?OFF\s*(?:LOCATION)?\s*[:#-]?\s*([^\n]+)/i]),
    pickupTime: firstMatch(text, [/픽업\s*(?:일시|시간|날짜)\s*[:#-]?\s*([^\n]+)/i, /인수\s*(?:일시|시간|날짜)\s*[:#-]?\s*([^\n]+)/i, /PICK[ -]?UP\s*(?:DATE|TIME)?\s*[:#-]?\s*([^\n]+)/i]),
    dropoffTime: firstMatch(text, [/반납\s*(?:일시|시간|날짜)\s*[:#-]?\s*([^\n]+)/i, /DROP[ -]?OFF\s*(?:DATE|TIME)?\s*[:#-]?\s*([^\n]+)/i]),
    bookingRef: firstMatch(text, [/예약\s*(?:번호|확인번호)\s*[:#-]?\s*([A-Z0-9-]{4,12})/i, /(?:BOOKING|RESERVATION)\s*(?:NO\.?|REF)?\s*[:#-]?\s*([A-Z0-9-]{5,12})/i]),
    price: firstMatch(text, [/(?:총|합계|요금|결제)\s*금액?\s*[:#-]?\s*([\d,]+)/i, /(?:TOTAL|AMOUNT|PRICE)\s*[:#-]?\s*([\d.,]+)/i]),
    currency: firstMatch(text, [/\b(USD|EUR|KRW|JPY|GBP|CNY|AUD|CAD|원)\b/i]),
  };
}

// ─── 숙박 파서 ───────────────────────────────────────────────────────────────

export function parseAccommodationFromText(text: string) {
  return {
    name: firstMatch(text, [/숙소\s*(?:명|이름)?\s*[:#-]?\s*([^\n]+)/i, /호텔\s*(?:명|이름)?\s*[:#-]?\s*([^\n]+)/i, /HOTEL\s*[:#-]?\s*([^\n]+)/i, /PROPERTY\s*[:#-]?\s*([^\n]+)/i]),
    address: firstMatch(text, [/주소\s*[:#-]?\s*([^\n]+)/i, /ADDRESS\s*[:#-]?\s*([^\n]+)/i]),
    checkIn: firstMatch(text, [/체크인\s*(?:일자|날짜|일시)?\s*[:#-]?\s*([^\n]+)/i, /입실\s*[:#-]?\s*([^\n]+)/i, /CHECK[ -]?IN\s*(?:DATE)?\s*[:#-]?\s*([^\n]+)/i]),
    checkOut: firstMatch(text, [/체크아웃\s*(?:일자|날짜|일시)?\s*[:#-]?\s*([^\n]+)/i, /퇴실\s*[:#-]?\s*([^\n]+)/i, /CHECK[ -]?OUT\s*(?:DATE)?\s*[:#-]?\s*([^\n]+)/i]),
    bookingRef: firstMatch(text, [/예약\s*(?:번호|확인번호)\s*[:#-]?\s*([A-Z0-9-]{4,12})/i, /확인\s*번호\s*[:#-]?\s*([A-Z0-9-]{4,12})/i, /(?:BOOKING|CONFIRMATION)\s*(?:NO\.?|REF)?\s*[:#-]?\s*([A-Z0-9-]{5,12})/i]),
    price: firstMatch(text, [/(?:총|합계|요금|결제)\s*금액?\s*[:#-]?\s*([\d,]+)/i, /(?:TOTAL|AMOUNT|PRICE)\s*[:#-]?\s*([\d.,]+)/i]),
    currency: firstMatch(text, [/\b(USD|EUR|KRW|JPY|GBP|CNY|AUD|CAD|원)\b/i]),
  };
}

// ─── 신뢰도 검사 ─────────────────────────────────────────────────────────────

export function hasFlight(f: FlightData) {
  return !!(f.flightNumber || (f.departureAirport && f.arrivalAirport));
}
export function hasAccommodation(a: ReturnType<typeof parseAccommodationFromText>) {
  return !!(a.name || (a.checkIn && a.checkOut));
}
export function hasRental(r: ReturnType<typeof parseRentalFromText>) {
  return !!(r.company || (r.pickupLocation && r.dropoffLocation));
}

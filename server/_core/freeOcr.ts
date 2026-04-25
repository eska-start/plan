import { ENV } from "./env";

const DEFAULT_OCR_SPACE_FREE_KEY = "helloworld";

type OcrSpaceParsedResult = {
  ParsedText?: string;
};

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

  if (!response.ok) {
    throw new Error(`OCR API failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as OcrSpaceResponse;
  if (data.IsErroredOnProcessing) {
    const err = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join(", ")
      : data.ErrorMessage ?? "Unknown OCR error";
    throw new Error(err);
  }

  return (data.ParsedResults ?? [])
    .map(result => result.ParsedText ?? "")
    .join("\n")
    .trim();
}

export async function extractTextWithFreeOcr(imageUrl: string): Promise<string> {
  const form = new URLSearchParams();
  form.set("url", imageUrl);
  form.set("language", "eng");
  form.set("isOverlayRequired", "false");
  form.set("OCREngine", "2");
  return callOcrSpace(form);
}

export async function extractTextWithFreeOcrBase64(base64: string): Promise<string> {
  const form = new URLSearchParams();
  // OCR.space expects "data:image/...;base64,..." or just the raw base64
  form.set("base64Image", base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`);
  form.set("language", "kor+eng");
  form.set("isOverlayRequired", "false");
  form.set("OCREngine", "2");
  return callOcrSpace(form);
}

const firstMatch = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) return m[1].trim();
  }
  return null;
};

export function parseFlightFromText(text: string) {
  const upper = text.toUpperCase();
  const iata = upper.match(/\b([A-Z]{3})\s*(?:-|->|→|TO)\s*([A-Z]{3})\b/);
  const flightNumber = firstMatch(text, [
    /편명\s*[:#-]?\s*([A-Z]{2}\s?\d{2,4})/i,
    /항공편\s*(?:번호)?\s*[:#-]?\s*([A-Z]{2}\s?\d{2,4})/i,
    /FLIGHT\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*([A-Z]{2}\s?\d{2,4})/i,
    /\b([A-Z]{2}\d{2,4})\b/,
  ]);

  return {
    airline: firstMatch(text, [
      /항공사\s*[:#-]?\s*([^\n]+)/i,
      /AIRLINE\s*[:#-]?\s*([^\n]+)/i,
    ]),
    flightNumber,
    departureAirport: iata?.[1] ?? null,
    arrivalAirport: iata?.[2] ?? null,
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
      /확인\s*번호\s*[:#-]?\s*([A-Z0-9]{4,12})/i,
      /(?:BOOKING|PNR|RESERVATION)\s*(?:REF(?:ERENCE)?)?\s*[:#-]?\s*([A-Z0-9]{5,8})/i,
    ]),
    seatNumber: firstMatch(text, [
      /좌석\s*[:#-]?\s*([A-Z0-9]{1,4})/i,
      /SEAT\s*[:#-]?\s*([A-Z0-9]{1,4})/i,
    ]),
    type: null as "departure" | "return" | "transit" | null,
  };
}

export function parseRentalFromText(text: string) {
  return {
    company: firstMatch(text, [
      /렌트\s*(?:카)?회사\s*[:#-]?\s*([^\n]+)/i,
      /COMPANY\s*[:#-]?\s*([^\n]+)/i,
      /RENTAL\s*COMPANY\s*[:#-]?\s*([^\n]+)/i,
    ]),
    carModel: firstMatch(text, [
      /차종\s*[:#-]?\s*([^\n]+)/i,
      /차량\s*[:#-]?\s*([^\n]+)/i,
      /CAR\s*(?:MODEL)?\s*[:#-]?\s*([^\n]+)/i,
      /VEHICLE\s*[:#-]?\s*([^\n]+)/i,
    ]),
    pickupLocation: firstMatch(text, [
      /픽업\s*(?:장소|위치)?\s*[:#-]?\s*([^\n]+)/i,
      /인수\s*(?:장소|위치)?\s*[:#-]?\s*([^\n]+)/i,
      /PICK[ -]?UP\s*(?:LOCATION)?\s*[:#-]?\s*([^\n]+)/i,
    ]),
    dropoffLocation: firstMatch(text, [
      /반납\s*(?:장소|위치)?\s*[:#-]?\s*([^\n]+)/i,
      /DROP[ -]?OFF\s*(?:LOCATION)?\s*[:#-]?\s*([^\n]+)/i,
    ]),
    pickupTime: firstMatch(text, [
      /픽업\s*(?:일시|시간|날짜)\s*[:#-]?\s*([^\n]+)/i,
      /인수\s*(?:일시|시간|날짜)\s*[:#-]?\s*([^\n]+)/i,
      /PICK[ -]?UP\s*(?:DATE|TIME)?\s*[:#-]?\s*([^\n]+)/i,
    ]),
    dropoffTime: firstMatch(text, [
      /반납\s*(?:일시|시간|날짜)\s*[:#-]?\s*([^\n]+)/i,
      /DROP[ -]?OFF\s*(?:DATE|TIME)?\s*[:#-]?\s*([^\n]+)/i,
    ]),
    bookingRef: firstMatch(text, [
      /예약\s*(?:번호|확인번호)\s*[:#-]?\s*([A-Z0-9-]{4,12})/i,
      /(?:BOOKING|RESERVATION)\s*(?:NO\.?|REF)?\s*[:#-]?\s*([A-Z0-9-]{5,12})/i,
    ]),
    price: firstMatch(text, [
      /(?:총|합계|요금|결제)\s*금액?\s*[:#-]?\s*([\d,]+)/i,
      /(?:TOTAL|AMOUNT|PRICE)\s*[:#-]?\s*([\d.,]+)/i,
    ]),
    currency: firstMatch(text, [/\b(USD|EUR|KRW|JPY|GBP|CNY|AUD|CAD|원)\b/i]),
  };
}

export function parseAccommodationFromText(text: string) {
  return {
    name: firstMatch(text, [
      /숙소\s*(?:명|이름)?\s*[:#-]?\s*([^\n]+)/i,
      /호텔\s*(?:명|이름)?\s*[:#-]?\s*([^\n]+)/i,
      /HOTEL\s*[:#-]?\s*([^\n]+)/i,
      /PROPERTY\s*[:#-]?\s*([^\n]+)/i,
    ]),
    address: firstMatch(text, [
      /주소\s*[:#-]?\s*([^\n]+)/i,
      /ADDRESS\s*[:#-]?\s*([^\n]+)/i,
    ]),
    checkIn: firstMatch(text, [
      /체크인\s*(?:일자|날짜|일시)?\s*[:#-]?\s*([^\n]+)/i,
      /입실\s*[:#-]?\s*([^\n]+)/i,
      /CHECK[ -]?IN\s*(?:DATE)?\s*[:#-]?\s*([^\n]+)/i,
    ]),
    checkOut: firstMatch(text, [
      /체크아웃\s*(?:일자|날짜|일시)?\s*[:#-]?\s*([^\n]+)/i,
      /퇴실\s*[:#-]?\s*([^\n]+)/i,
      /CHECK[ -]?OUT\s*(?:DATE)?\s*[:#-]?\s*([^\n]+)/i,
    ]),
    bookingRef: firstMatch(text, [
      /예약\s*(?:번호|확인번호)\s*[:#-]?\s*([A-Z0-9-]{4,12})/i,
      /확인\s*번호\s*[:#-]?\s*([A-Z0-9-]{4,12})/i,
      /(?:BOOKING|CONFIRMATION)\s*(?:NO\.?|REF)?\s*[:#-]?\s*([A-Z0-9-]{5,12})/i,
    ]),
    price: firstMatch(text, [
      /(?:총|합계|요금|결제)\s*금액?\s*[:#-]?\s*([\d,]+)/i,
      /(?:TOTAL|AMOUNT|PRICE)\s*[:#-]?\s*([\d.,]+)/i,
    ]),
    currency: firstMatch(text, [/\b(USD|EUR|KRW|JPY|GBP|CNY|AUD|CAD|원)\b/i]),
  };
}

// 추출된 데이터에 의미있는 필드가 있는지 확인
export function hasFlight(f: ReturnType<typeof parseFlightFromText>) {
  return !!(f.flightNumber || (f.departureAirport && f.arrivalAirport));
}
export function hasAccommodation(a: ReturnType<typeof parseAccommodationFromText>) {
  return !!(a.name || (a.checkIn && a.checkOut));
}
export function hasRental(r: ReturnType<typeof parseRentalFromText>) {
  return !!(r.company || (r.pickupLocation && r.dropoffLocation));
}

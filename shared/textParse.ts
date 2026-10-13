/** On-device OCR text parsing. Only explicit document evidence is used. */
import { normalizeDate, normalizeDateTime } from "./vision";

function labeled(text: string, labels: string): string | null {
  // Horizontal whitespace intentionally excludes newlines: labels may be on their own line.
  const re = new RegExp(`(?:^|\\n)[ \\t]*(?:${labels})[ \\t]*[:：#-]?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)`, "i");
  return text.match(re)?.[1]?.trim() || null;
}
function dateValue(value: string | null, time = false): string | null {
  if (!value) return null;
  const cleaned = value.replace(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/, "$1-$2-$3").replace(/(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/, "$1-$2-$3");
  const normalized = time ? normalizeDateTime(cleaned) : normalizeDate(cleaned);
  return normalized && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(normalized) ? normalized : null;
}
const ref = (text: string) => labeled(text, "예약\\s*(?:번호|코드)|확인\\s*번호|BOOKING(?:\\s*(?:REF(?:ERENCE)?|NO\\.?|NUMBER))?|PNR|RESERVATION(?:\\s*(?:REF|NO\\.?|NUMBER))?|CONFIRMATION(?:\\s*(?:NO\\.?|NUMBER))?");
const price = (text: string) => labeled(text, "총\\s*(?:금액|요금|결제금액)|결제\\s*금액|금액|TOTAL|AMOUNT|PRICE")?.replace(/[^\d.]/g, "") || null;
const currency = (text: string) => text.match(/\b(USD|EUR|KRW|JPY|GBP|CNY|AUD|CAD)\b/i)?.[1]?.toUpperCase() ?? (/₩|\d[\d,]*\s*원/.test(text) ? "KRW" : /¥|\d[\d,]*\s*엔/.test(text) ? "JPY" : null);

export function parseFlightFromText(text: string) {
  const upper = text.toUpperCase();
  const route = upper.match(/\b([A-Z]{3})\s*(?:-|->|→|TO)\s*([A-Z]{3})\b/);
  const dep = labeled(text, "출발\\s*공항|출발지|DEPARTURE\\s*AIRPORT|FROM");
  const arr = labeled(text, "도착\\s*공항|도착지|ARRIVAL\\s*AIRPORT|TO");
  const flightNumber = upper.match(/(?:편명|항공편(?:명)?|FLIGHT\s*(?:NO\.?|NUMBER)?)\s*[:：#-]?\s*([A-Z0-9]{2}\s*\d{2,4})/)?.[1]?.replace(/\s/g, "") ?? upper.match(/\b([A-Z][A-Z0-9]\s?\d{2,4})\b/)?.[1]?.replace(/\s/g, "") ?? null;
  const dt = labeled(text, "출발\\s*(?:일시|시간|일자)|DEPART(?:URE)?(?:\\s*(?:DATE|TIME))?");
  const at = labeled(text, "도착\\s*(?:일시|시간|일자)|ARRIV(?:AL)?(?:\\s*(?:DATE|TIME))?");
  return {
    airline: labeled(text, "항공사|AIRLINE") ?? text.match(/대한항공|아시아나항공|제주항공|진에어|티웨이항공|에어서울|에어부산|이스타항공|Korean Air|Asiana Airlines|Jeju Air|Jin Air|T'way Air/i)?.[0] ?? null,
    flightNumber,
    departureAirport: dep ?? route?.[1] ?? null,
    arrivalAirport: arr ?? route?.[2] ?? null,
    departureTime: dateValue(dt, true), arrivalTime: dateValue(at, true),
    bookingRef: ref(text), seatNumber: labeled(text, "좌석(?:번호)?|SEAT"), type: null,
  };
}
export function parseRentalFromText(text: string) {
  return {
    company: labeled(text, "렌트(?:카)?\\s*업체|업체(?:명)?|대여\\s*업체|RENTAL\\s*COMPANY|COMPANY"),
    carModel: labeled(text, "차종|차량(?:명)?|CAR(?:\\s*MODEL)?|VEHICLE"),
    pickupLocation: labeled(text, "픽업\\s*장소|인수\\s*장소|대여\\s*장소|PICK[ -]?UP\\s*LOCATION"),
    dropoffLocation: labeled(text, "반납\\s*장소|DROP[ -]?OFF\\s*LOCATION|RETURN\\s*LOCATION"),
    pickupTime: dateValue(labeled(text, "픽업\\s*(?:일시|시간|일자)|인수\\s*(?:일시|시간)|대여\\s*일시|PICK[ -]?UP\\s*(?:DATE|TIME)"), true),
    dropoffTime: dateValue(labeled(text, "반납\\s*(?:일시|시간|일자)|DROP[ -]?OFF\\s*(?:DATE|TIME)|RETURN\\s*(?:DATE|TIME)"), true),
    bookingRef: ref(text), price: price(text), currency: currency(text),
  };
}
export function parseAccommodationFromText(text: string) {
  return {
    name: labeled(text, "숙소(?:명)?|호텔(?:명)?|숙박시설|HOTEL|PROPERTY"),
    address: labeled(text, "숙소\\s*주소|주소|ADDRESS"),
    checkIn: dateValue(labeled(text, "체크인(?:\\s*날짜)?|입실(?:일)?|CHECK[ -]?IN(?:\\s*DATE)?")),
    checkOut: dateValue(labeled(text, "체크아웃(?:\\s*날짜)?|퇴실(?:일)?|CHECK[ -]?OUT(?:\\s*DATE)?")),
    bookingRef: ref(text), price: price(text), currency: currency(text),
  };
}

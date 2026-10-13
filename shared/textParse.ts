/**
 * 예약 텍스트 구조 분석 (순수 함수).
 * 웹 서버(freeOcr)와 네이티브 앱(ML Kit 결과)이 공용.
 * AI가 확인하지 못한 정보는 null 유지 — 임의 생성 금지.
 */

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
  const flightNumber = firstMatch(upper, [
    /FLIGHT\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*([A-Z]{2}\s?\d{2,4})/i,
    /\b([A-Z]{2}\d{2,4})\b/,
  ]);

  return {
    airline: firstMatch(text, [/AIRLINE\s*[:#-]?\s*([^\n]+)/i]),
    flightNumber,
    departureAirport: iata?.[1] ?? null,
    arrivalAirport: iata?.[2] ?? null,
    departureTime: firstMatch(text, [/DEPART(?:URE)?\s*(?:TIME)?\s*[:#-]?\s*([^\n]+)/i]),
    arrivalTime: firstMatch(text, [/ARRIV(?:AL)?\s*(?:TIME)?\s*[:#-]?\s*([^\n]+)/i]),
    bookingRef: firstMatch(upper, [
      /(?:BOOKING|PNR|RESERVATION)\s*(?:REF(?:ERENCE)?)?\s*[:#-]?\s*([A-Z0-9]{5,8})/i,
    ]),
    seatNumber: firstMatch(upper, [/SEAT\s*[:#-]?\s*([A-Z0-9]{1,4})/i]),
    type: null,
  };
}

export function parseRentalFromText(text: string) {
  return {
    company: firstMatch(text, [/COMPANY\s*[:#-]?\s*([^\n]+)/i, /RENTAL\s*COMPANY\s*[:#-]?\s*([^\n]+)/i]),
    carModel: firstMatch(text, [/CAR\s*(?:MODEL)?\s*[:#-]?\s*([^\n]+)/i, /VEHICLE\s*[:#-]?\s*([^\n]+)/i]),
    pickupLocation: firstMatch(text, [/PICK[ -]?UP\s*(?:LOCATION)?\s*[:#-]?\s*([^\n]+)/i]),
    dropoffLocation: firstMatch(text, [/DROP[ -]?OFF\s*(?:LOCATION)?\s*[:#-]?\s*([^\n]+)/i]),
    pickupTime: firstMatch(text, [/PICK[ -]?UP\s*(?:DATE|TIME)?\s*[:#-]?\s*([^\n]+)/i]),
    dropoffTime: firstMatch(text, [/DROP[ -]?OFF\s*(?:DATE|TIME)?\s*[:#-]?\s*([^\n]+)/i]),
    bookingRef: firstMatch(text, [/(?:BOOKING|RESERVATION)\s*(?:NO\.?|REF)?\s*[:#-]?\s*([A-Z0-9-]{5,12})/i]),
    price: firstMatch(text, [/(?:TOTAL|AMOUNT|PRICE)\s*[:#-]?\s*([\d.,]+)/i]),
    currency: firstMatch(text, [/\b(USD|EUR|KRW|JPY|GBP|CNY|AUD|CAD)\b/i]),
  };
}

export function parseAccommodationFromText(text: string) {
  return {
    name: firstMatch(text, [/HOTEL\s*[:#-]?\s*([^\n]+)/i, /PROPERTY\s*[:#-]?\s*([^\n]+)/i]),
    address: firstMatch(text, [/ADDRESS\s*[:#-]?\s*([^\n]+)/i]),
    checkIn: firstMatch(text, [/CHECK[ -]?IN\s*(?:DATE)?\s*[:#-]?\s*([^\n]+)/i]),
    checkOut: firstMatch(text, [/CHECK[ -]?OUT\s*(?:DATE)?\s*[:#-]?\s*([^\n]+)/i]),
    bookingRef: firstMatch(text, [/(?:BOOKING|CONFIRMATION)\s*(?:NO\.?|REF)?\s*[:#-]?\s*([A-Z0-9-]{5,12})/i]),
    price: firstMatch(text, [/(?:TOTAL|AMOUNT|PRICE)\s*[:#-]?\s*([\d.,]+)/i]),
    currency: firstMatch(text, [/\b(USD|EUR|KRW|JPY|GBP|CNY|AUD|CAD)\b/i]),
  };
}

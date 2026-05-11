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

export async function extractTextWithFreeOcr(imageUrl: string): Promise<string> {
  const form = new URLSearchParams();
  form.set("url", imageUrl);
  form.set("language", "eng");
  form.set("isOverlayRequired", "false");
  form.set("OCREngine", "2");

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
  const rawPrice = firstMatch(text, [/(?:TOTAL|AMOUNT|PRICE)\s*[:#-]?\s*([\d.,]+)/i]);
  return {
    company: firstMatch(text, [/COMPANY\s*[:#-]?\s*([^\n]+)/i, /RENTAL\s*COMPANY\s*[:#-]?\s*([^\n]+)/i]),
    carModel: firstMatch(text, [/CAR\s*(?:MODEL)?\s*[:#-]?\s*([^\n]+)/i, /VEHICLE\s*[:#-]?\s*([^\n]+)/i]),
    pickupLocation: firstMatch(text, [/PICK[ -]?UP\s*(?:LOCATION)?\s*[:#-]?\s*([^\n]+)/i]),
    dropoffLocation: firstMatch(text, [/DROP[ -]?OFF\s*(?:LOCATION)?\s*[:#-]?\s*([^\n]+)/i]),
    pickupTime: firstMatch(text, [/PICK[ -]?UP\s*(?:DATE|TIME)?\s*[:#-]?\s*([^\n]+)/i]),
    dropoffTime: firstMatch(text, [/DROP[ -]?OFF\s*(?:DATE|TIME)?\s*[:#-]?\s*([^\n]+)/i]),
    bookingRef: firstMatch(text, [/(?:BOOKING|RESERVATION)\s*(?:NO\.?|REF)?\s*[:#-]?\s*([A-Z0-9-]{5,12})/i]),
    price: rawPrice ? rawPrice.replace(/,/g, "") : null,
    currency: firstMatch(text, [/\b(USD|EUR|KRW|JPY|GBP|CNY|AUD|CAD)\b/i]),
  };
}

export function parseAccommodationFromText(text: string) {
  const rawPrice = firstMatch(text, [/(?:TOTAL|AMOUNT|PRICE)\s*[:#-]?\s*([\d.,]+)/i]);
  return {
    name: firstMatch(text, [/HOTEL\s*[:#-]?\s*([^\n]+)/i, /PROPERTY\s*[:#-]?\s*([^\n]+)/i]),
    address: firstMatch(text, [/ADDRESS\s*[:#-]?\s*([^\n]+)/i]),
    checkIn: firstMatch(text, [/CHECK[ -]?IN\s*(?:DATE)?\s*[:#-]?\s*([^\n]+)/i]),
    checkOut: firstMatch(text, [/CHECK[ -]?OUT\s*(?:DATE)?\s*[:#-]?\s*([^\n]+)/i]),
    bookingRef: firstMatch(text, [/(?:BOOKING|CONFIRMATION)\s*(?:NO\.?|REF)?\s*[:#-]?\s*([A-Z0-9-]{5,12})/i]),
    price: rawPrice ? rawPrice.replace(/,/g, "") : null,
    currency: firstMatch(text, [/\b(USD|EUR|KRW|JPY|GBP|CNY|AUD|CAD)\b/i]),
  };
}

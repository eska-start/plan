import { invokeLLM, type Message } from "../_core/llm";
import { ENV } from "../_core/env";
import {
  extractTextWithFreeOcr,
  parseAccommodationFromText,
  parseFlightFromText,
  parseRentalFromText,
} from "../_core/freeOcr";
import type { DocumentType } from "@shared/vision";

export type EngineName = "local-ocr" | "local-vlm" | "cloud-vision";

export interface EngineResult {
  engine: EngineName;
  data: Record<string, string | null>;
  rawText?: string;
  model?: string;
  note?: string;
}

const toNull = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === "null" ? null : s;
};

const sanitize = (obj: Record<string, unknown>, allowed: string[]) => {
  const out: Record<string, string | null> = {};
  for (const k of allowed) out[k] = toNull(obj[k]);
  return out;
};

export const FLIGHT_FIELDS = [
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
];

const ACCOM_FIELDS = [
  "name",
  "address",
  "checkIn",
  "checkOut",
  "checkInTime",
  "checkOutTime",
  "roomType",
  "bookingRef",
  "price",
  "currency",
  "bookingStatus",
];

const RENTAL_FIELDS = [
  "company",
  "carModel",
  "pickupLocation",
  "dropoffLocation",
  "pickupDateTime",
  "dropoffDateTime",
  "bookingRef",
  "price",
  "currency",
];

const ITIN_FIELDS = ["date", "visitTime", "placeName", "address", "order", "duration", "memo"];

function fieldsFor(docType: DocumentType): string[] {
  if (docType === "flight") return FLIGHT_FIELDS;
  if (docType === "accommodation") return ACCOM_FIELDS;
  if (docType === "rental") return RENTAL_FIELDS;
  return ITIN_FIELDS;
}

/**
 * 로컬 분석 엔진 (Step 2).
 * - 1차: ML Kit OCR 위치는 Android 네이티브에서 수행하고, 웹/서버에서는 OCR.space 텍스트로 대체.
 * - 온디바이스 VLM 미지원 기기에서는 OCR+구조분석만 사용하고 engine=local-ocr로 명시.
 * - AI가 확인하지 못한 정보는 생성하지 않음 (null 유지).
 */
export async function localAnalyze(
  imageUrl: string,
  docType: DocumentType,
): Promise<EngineResult> {
  const text = await extractTextWithFreeOcr(imageUrl);
  if (docType === "flight") {
    const p = parseFlightFromText(text);
    return {
      engine: "local-ocr",
      rawText: text,
      note: "OCR+구조분석 (온디바이스 VLM 아님과 구별 표시)",
      data: {
        documentType: "flight",
        bookingStatus: null,
        airline: p.airline,
        flightNumber: p.flightNumber,
        departureAirport: p.departureAirport,
        departureAirportCode: p.departureAirport,
        arrivalAirport: p.arrivalAirport,
        arrivalAirportCode: p.arrivalAirport,
        departureDateTime: p.departureTime,
        arrivalDateTime: p.arrivalTime,
        departureTimezone: null,
        arrivalTimezone: null,
        bookingReference: p.bookingRef,
        seatNumber: p.seatNumber,
        flightType: p.type,
        passengerName: null,
      },
    };
  }
  if (docType === "rental") {
    const p = parseRentalFromText(text);
    return {
      engine: "local-ocr",
      rawText: text,
      note: "OCR+구조분석 (온디바이스 VLM 아님과 구별 표시)",
      data: {
        company: p.company,
        carModel: p.carModel,
        pickupLocation: p.pickupLocation,
        dropoffLocation: p.dropoffLocation,
        pickupDateTime: p.pickupTime,
        dropoffDateTime: p.dropoffTime,
        bookingRef: p.bookingRef,
        price: p.price,
        currency: p.currency,
      },
    };
  }
  if (docType === "accommodation") {
    const p = parseAccommodationFromText(text);
    return {
      engine: "local-ocr",
      rawText: text,
      note: "OCR+구조분석 (온디바이스 VLM 아님과 구별 표시)",
      data: {
        name: p.name,
        address: p.address,
        checkIn: p.checkIn,
        checkOut: p.checkOut,
        checkInTime: null,
        checkOutTime: null,
        roomType: null,
        bookingRef: p.bookingRef,
        price: p.price,
        currency: p.currency,
        bookingStatus: null,
      },
    };
  }
  return { engine: "local-ocr", rawText: text, data: {}, note: "itinerary 로컬 구조분석 미지원 — 클라우드 필요" };
}

const SYSTEM_PROMPT: Record<DocumentType, string> = {
  flight: `You are a travel document parser. Analyze the IMAGE layout itself (not OCR text only): departure vs arrival, date/time proximity, round-trip vs transit segments, booking status. Specific sites (Naver Flights, Skyscanner, Trip.com, Agoda, Booking.com, airline official) have different layouts — never rely on fixed coordinates/templates.
Return JSON only with null for unconfirmed fields. Never invent data.
Schema: {"documentType":"flight","bookingStatus":string|null,"airline":string|null,"flightNumber":string|null,"departureAirport":string|null,"departureAirportCode":string|null,"arrivalAirport":string|null,"arrivalAirportCode":string|null,"departureDateTime":string|null,"arrivalDateTime":string|null,"departureTimezone":string|null,"arrivalTimezone":string|null,"bookingReference":string|null,"seatNumber":string|null,"flightType":"departure"|"return"|"transit"|null,"passengerName":string|null,"segments":[],"needsReview":[]}
Rules: distinguish departure/arrival airports; booking date != travel date; never swap dep/arr times; round-trip = separate entries hint in needsReview; transit = per-segment hint; separate bookingRef vs flightNumber; multiple passengers must not duplicate flights (note in needsReview); search-result screens are NOT confirmed bookings (bookingStatus="search_result").`,
  accommodation: `You are a hotel booking parser. Analyze the IMAGE layout. Return JSON only, null for unconfirmed. Schema: {"name":string|null,"address":string|null,"checkIn":"YYYY-MM-DD"|null,"checkOut":"YYYY-MM-DD"|null,"checkInTime":string|null,"checkOutTime":string|null,"roomType":string|null,"bookingRef":string|null,"price":string|null,"currency":string|null,"bookingStatus":"confirmed"|"cancelled"|"search_result"|null}. Distinguish cancelled vs confirmed.`,
  rental: `You are a car rental parser. Analyze the IMAGE layout. Return JSON only, null for unconfirmed. Schema: {"company":string|null,"carModel":string|null,"pickupLocation":string|null,"dropoffLocation":string|null,"pickupDateTime":string|null,"dropoffDateTime":string|null,"bookingRef":string|null,"price":string|null,"currency":string|null}. Split multiple items via needsReview note if needed.`,
  itinerary: `You parse travel plan screenshots (itinerary tables, messenger plans, blog tables, memo screenshots, photos of plans). Return JSON only: {"items":[{"date":"YYYY-MM-DD"|null,"visitTime":string|null,"placeName":string|null,"address":string|null,"order":number|null,"duration":number|null,"memo":string|null}]}. Split multi-date images by date. Never assign unclear dates.`,
};

/**
 * 클라우드 비전 AI (Step 3).
 * - 원본 이미지 시각 구조 해석 (OCR 텍스트만 전달 아님).
 * - API 키 하드코딩 금지: 서버 ENV(프록시) 경유만 허용. 키 없으면 throw → 호출자가 로컬 폴백.
 */
export async function cloudAnalyze(
  imageUrl: string,
  docType: DocumentType,
): Promise<EngineResult> {
  if (!ENV.forgeApiKey) throw new Error("CLOUD_NO_KEY: 클라우드 키 없음 — 로컬 처리로 폴백");
  const userText =
    docType === "flight"
      ? "항공권/e-ticket/탑승권/왕복·경유 예약 확인 이미지를 분석해주세요."
      : docType === "accommodation"
        ? "호텔/숙박 예약 확인 이미지를 분석해주세요."
        : docType === "rental"
          ? "렌터카 예약 확인 이미지를 분석해주세요."
          : "여행 일정표 이미지에서 여러 일정 항목을 추출해주세요.";
  const res = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT[docType] } as Message,
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
        ],
      } as Message,
    ],
    response_format: { type: "json_object" },
  });
  const raw = res.choices?.[0]?.message?.content;
  const content = typeof raw === "string" ? raw : "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  if (docType === "itinerary") return { engine: "cloud-vision", model: "vision", data: {}, note: "itinerary items 별도 처리" };
  return { engine: "cloud-vision", model: "vision", data: sanitize(parsed, fieldsFor(docType)) };
}

/**
 * 네이티브 앱 클라우드 비전 직통 호출.
 * - 사용자 본인 키(Preferences 저장)만 사용. 공용 비밀키 하드코딩 없음.
 * - 키 보호가 필요하면 workers/vision-proxy.ts (서버리스 프록시) 사용.
 * - 미확인 필드는 null 유지, 확정은 VisionReview 사용자 확인 후에만.
 */
import type { DocumentType } from "@shared/vision";

const MODEL = "gemini-2.0-flash";

const PROMPTS: Record<DocumentType, string> = {
  flight:
    "Analyze this booking image layout (departure vs arrival, date/time proximity, round-trip/transit, booking status). Never rely on fixed templates. Return JSON only, null for unconfirmed: {\"documentType\":\"flight\",\"bookingStatus\":string|null,\"airline\":string|null,\"flightNumber\":string|null,\"departureAirport\":string|null,\"departureAirportCode\":string|null,\"arrivalAirport\":string|null,\"arrivalAirportCode\":string|null,\"departureDateTime\":string|null,\"arrivalDateTime\":string|null,\"departureTimezone\":string|null,\"arrivalTimezone\":string|null,\"bookingReference\":string|null,\"seatNumber\":string|null,\"flightType\":\"departure\"|\"return\"|\"transit\"|null,\"passengerName\":string|null}. Search-result screens are NOT confirmed (bookingStatus=\"search_result\").",
  accommodation:
    "Analyze this hotel booking image. JSON only, null for unconfirmed: {\"name\":string|null,\"address\":string|null,\"checkIn\":\"YYYY-MM-DD\"|null,\"checkOut\":\"YYYY-MM-DD\"|null,\"checkInTime\":string|null,\"checkOutTime\":string|null,\"roomType\":string|null,\"bookingRef\":string|null,\"price\":string|null,\"currency\":string|null,\"bookingStatus\":\"confirmed\"|\"cancelled\"|\"search_result\"|null}.",
  rental:
    "Analyze this car rental booking image. JSON only, null for unconfirmed: {\"company\":string|null,\"carModel\":string|null,\"pickupLocation\":string|null,\"dropoffLocation\":string|null,\"pickupDateTime\":string|null,\"dropoffDateTime\":string|null,\"bookingRef\":string|null,\"price\":string|null,\"currency\":string|null}.",
  itinerary:
    "Extract itinerary items from this travel plan image. JSON only: {\"items\":[{\"date\":\"YYYY-MM-DD\"|null,\"visitTime\":string|null,\"placeName\":string|null,\"address\":string|null,\"order\":number|null,\"duration\":number|null,\"memo\":string|null}]}.",
};

const toNull = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === "null" ? null : s;
};

export async function analyzeWithUserKey(
  base64: string,
  mimeType: string,
  docType: DocumentType,
  apiKey: string,
): Promise<Record<string, string | null>> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPTS[docType] },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: { response_mime_type: "application/json" },
      }),
    },
  );
  if (!res.ok) throw new Error(`cloud ${res.status}`);
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (k === "items" || k === "segments" || k === "needsReview") continue;
    out[k] = toNull(v);
  }
  return out;
}

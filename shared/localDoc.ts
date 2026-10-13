/**
 * OCR 텍스트 → 문서별 구조 데이터 (공용).
 * 서버 localAnalyze와 네이티브 앱이 동일 로직 사용.
 * engine 표기는 호출자가付与 (local-ocr).
 */
import { parseAccommodationFromText, parseFlightFromText, parseRentalFromText } from "./textParse";
import type { DocumentType } from "./vision";

export function localDocFromText(text: string, docType: DocumentType): Record<string, string | null> {
  if (docType === "flight") {
    const p = parseFlightFromText(text);
    return {
      documentType: "flight",
      bookingStatus: /취소|cancelled/i.test(text) ? "cancelled" : /예약\s*(?:완료|확정)|confirmed|ticketed/i.test(text) ? "confirmed" : null,
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
    };
  }
  if (docType === "rental") {
    const p = parseRentalFromText(text);
    return {
      company: p.company,
      carModel: p.carModel,
      pickupLocation: p.pickupLocation,
      dropoffLocation: p.dropoffLocation,
      pickupDateTime: p.pickupTime,
      dropoffDateTime: p.dropoffTime,
      bookingRef: p.bookingRef,
      price: p.price,
      currency: p.currency,
    };
  }
  if (docType === "accommodation") {
    const p = parseAccommodationFromText(text);
    return {
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
      bookingStatus: /취소|cancelled/i.test(text) ? "cancelled" : /예약\s*(?:완료|확정)|confirmed|ticketed/i.test(text) ? "confirmed" : null,
    };
  }
  return {};
}

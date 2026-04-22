import { describe, expect, it } from "vitest";
import {
  parseAccommodationFromText,
  parseFlightFromText,
  parseRentalFromText,
} from "./_core/freeOcr";
import { sanitizeGuestRedirect } from "./_core/redirect";

describe("sanitizeGuestRedirect", () => {
  it("allows app-internal paths", () => {
    expect(sanitizeGuestRedirect("/trips/1?tab=map")).toBe("/trips/1?tab=map");
  });

  it("blocks external redirects", () => {
    expect(sanitizeGuestRedirect("https://evil.example/phish")).toBe("/");
    expect(sanitizeGuestRedirect("//evil.example")).toBe("/");
    expect(sanitizeGuestRedirect("javascript:alert(1)")).toBe("/");
  });
});

describe("free OCR parsers", () => {
  it("parses flight hints", () => {
    const text = `
AIRLINE: Korean Air
Flight No: KE123
ICN -> NRT
Departure Time: 2026-05-10T09:20
Arrival Time: 2026-05-10T11:30
PNR: ABC12D
Seat: 12A`;

    const parsed = parseFlightFromText(text);
    expect(parsed.airline).toBe("Korean Air");
    expect(parsed.flightNumber).toContain("KE123");
    expect(parsed.departureAirport).toBe("ICN");
    expect(parsed.arrivalAirport).toBe("NRT");
    expect(parsed.bookingRef).toBe("ABC12D");
    expect(parsed.seatNumber).toBe("12A");
  });

  it("parses rental hints", () => {
    const text = `
Rental Company: Hertz
Vehicle: Toyota Camry
Pick-up Location: NRT T1
Drop-off Location: Shinjuku
Booking No: RNT12345
Total: 150000 KRW`;

    const parsed = parseRentalFromText(text);
    expect(parsed.company).toBe("Hertz");
    expect(parsed.carModel).toBe("Toyota Camry");
    expect(parsed.pickupLocation).toBe("NRT T1");
    expect(parsed.dropoffLocation).toBe("Shinjuku");
    expect(parsed.bookingRef).toBe("RNT12345");
    expect(parsed.currency?.toUpperCase()).toBe("KRW");
  });

  it("parses accommodation hints", () => {
    const text = `
Hotel: Shinjuku Grand Hotel
Address: 1-2-3 Shinjuku, Tokyo
Check-in Date: 2026-05-10
Check-out Date: 2026-05-12
Confirmation No: HTL12345
Amount: 200 USD`;

    const parsed = parseAccommodationFromText(text);
    expect(parsed.name).toBe("Shinjuku Grand Hotel");
    expect(parsed.address).toContain("Shinjuku");
    expect(parsed.checkIn).toContain("2026-05-10");
    expect(parsed.checkOut).toContain("2026-05-12");
    expect(parsed.bookingRef).toBe("HTL12345");
    expect(parsed.currency?.toUpperCase()).toBe("USD");
  });
});

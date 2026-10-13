import { describe, expect, it } from "vitest";
import { normalizeDateTime, verifyFields } from "@shared/vision";

describe("vision verifyFields", () => {
  it("matched: 정규화 후 일치 (편명 공백/소문자, 공항코드)", () => {
    const f = verifyFields(
      "flight",
      { flightNumber: "ke 082", departureAirportCode: "icn" },
      { flightNumber: "KE082", departureAirportCode: "ICN" },
    );
    expect(f.find((x) => x.field === "flightNumber")?.status).toBe("matched");
    expect(f.find((x) => x.field === "departureAirportCode")?.status).toBe("matched");
  });

  it("conflict: 시간 불일치는 자동확정 금지", () => {
    const f = verifyFields(
      "flight",
      { departureDateTime: "2026-10-20T08:30" },
      { departureDateTime: "2026-10-20T08:50" },
    );
    const t = f.find((x) => x.field === "departureDateTime")!;
    expect(t.status).toBe("conflict");
    expect(t.finalValue).toBeNull();
  });

  it("invalid: 체크아웃 < 체크인 감지", () => {
    const f = verifyFields(
      "accommodation",
      { checkIn: "2026-10-20", checkOut: "2026-10-19" },
      { checkIn: "2026-10-20", checkOut: "2026-10-19" },
    );
    expect(f.find((x) => x.field === "checkOut")?.status).toBe("invalid");
  });

  it("single_source: 클라우드 없을 때 로컬값 임시 유지", () => {
    const f = verifyFields("flight", { airline: "대한항공" }, null);
    const a = f.find((x) => x.field === "airline")!;
    expect(a.status).toBe("single_source");
    expect(a.finalValue).toBe("대한항공");
  });

  it("normalizeDateTime: 오전/오후 처리", () => {
    expect(normalizeDateTime("2026.10.20 오후 8:50")).toBe("2026-10-20T20:50");
  });
});

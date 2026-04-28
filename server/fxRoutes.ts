import { Router } from "express";

type HanaRateRow = {
  code: string;
  unit: number;
  dealBaseRate: number;
};

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractCodeAndUnit(raw: string): { code: string | null; unit: number } {
  const text = stripTags(raw).replace(/\s+/g, " ").trim().toUpperCase();
  const codeMatch = text.match(/[A-Z]{3}/);
  const code = codeMatch?.[0] ?? null;
  const unitMatch = text.match(/(?:\(|\b)(\d{1,4})(?:\)|\b)/);
  const unit = unitMatch ? Number(unitMatch[1]) : 1;
  return { code, unit: Number.isFinite(unit) && unit > 0 ? unit : 1 };
}

function parseHanaRates(html: string): HanaRateRow[] {
  const rows = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
  const parsed: HanaRateRow[] = [];

  for (const rowMatch of rows) {
    const rowHtml = rowMatch[1];
    const cells = Array.from(rowHtml.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)).map((m) => m[1]);
    if (cells.length < 8) continue;

    const { code, unit } = extractCodeAndUnit(cells[0]);
    if (!code || code === "KRW") continue;

    const dealBaseRate = parseNumber(stripTags(cells[7]));
    if (!dealBaseRate || dealBaseRate <= 0) continue;

    parsed.push({ code, unit, dealBaseRate });
  }

  return parsed;
}

function normalizeRates(rows: HanaRateRow[]): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const row of rows) {
    // dealBaseRate: KRW for `unit` of foreign currency.
    // client format expects: 1 KRW => foreign currency amount.
    const krwPerOne = row.dealBaseRate / row.unit;
    if (!Number.isFinite(krwPerOne) || krwPerOne <= 0) continue;
    rates[row.code.toLowerCase()] = 1 / krwPerOne;
  }
  rates.krw = 1;
  return rates;
}

function toKstDateYYYYMMDD(date = new Date()): string {
  const kstMs = date.getTime() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 10).replace(/-/g, "");
}

export function registerFxRoutes(app: import("express").Express) {
  const router = Router();

  router.get("/api/fx/hana", async (_req, res) => {
    try {
      const today = toKstDateYYYYMMDD();
      const body = new URLSearchParams({
        tmpInqStrDt: today,
        pbldDvCd: "3",
        inqStrTp: "Y",
        requestTarget: "searchContentDiv",
      });

      const response = await fetch("https://www.kebhana.com/cms/rate/wpfxd651_07i_01.do", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "user-agent": "Mozilla/5.0",
          referer: "https://www.kebhana.com/",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`hana response ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
      }

      const html = await response.text();
      const rows = parseHanaRates(html);
      if (!rows.length) {
        throw new Error("hana rates parsing failed");
      }

      res.json({
        source: "hana-bank",
        asOf: new Date().toISOString(),
        rates: normalizeRates(rows),
      });
    } catch (error) {
      console.error("[fx/hana]", error);
      res.status(502).json({ error: "hana fx unavailable" });
    }
  });

  app.use(router);
}

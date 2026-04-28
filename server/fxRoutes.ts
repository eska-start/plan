import { Router } from "express";

type ParsedRateRow = {
  code: string;
  unit: number;
  krwPrice: number;
};

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseCodeAndUnit(text: string): { code: string | null; unit: number } {
  const normalized = stripTags(text).toUpperCase();
  const code = normalized.match(/[A-Z]{3}/)?.[0] ?? null;
  const unitText = normalized.match(/(?:\(|\s)(\d{1,4})(?:\)|\s*엔|\s*동|\s*루피아|\s*PESO)?/)?.[1];
  const unit = unitText ? Number(unitText) : 1;
  return { code, unit: Number.isFinite(unit) && unit > 0 ? unit : 1 };
}

function normalizeRates(rows: ParsedRateRow[]): Record<string, number> {
  const rates: Record<string, number> = { krw: 1 };
  for (const row of rows) {
    const krwPerOne = row.krwPrice / row.unit;
    if (!Number.isFinite(krwPerOne) || krwPerOne <= 0) continue;
    rates[row.code.toLowerCase()] = 1 / krwPerOne;
  }
  return rates;
}

function parseHanaRates(html: string): ParsedRateRow[] {
  const rows = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
  const parsed: ParsedRateRow[] = [];

  for (const rowMatch of rows) {
    const cells = Array.from(
      rowMatch[1].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)
    ).map((m) => m[1]);
    if (cells.length < 8) continue;

    const { code, unit } = parseCodeAndUnit(cells[0]);
    if (!code || code === "KRW") continue;

    const krwPrice = parseNumber(stripTags(cells[7]));
    if (!krwPrice || krwPrice <= 0) continue;

    parsed.push({ code, unit, krwPrice });
  }

  return parsed;
}

function parseNaverRates(html: string): ParsedRateRow[] {
  const rows = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
  const parsed: ParsedRateRow[] = [];

  for (const rowMatch of rows) {
    const rowHtml = rowMatch[1];
    const titleRaw = rowHtml.match(/<td[^>]*class=["'][^"']*tit[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1];
    const saleRaw = rowHtml.match(/<td[^>]*class=["'][^"']*sale[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1];
    if (!titleRaw || !saleRaw) continue;

    const { code, unit } = parseCodeAndUnit(titleRaw);
    if (!code || code === "KRW") continue;

    const krwPrice = parseNumber(stripTags(saleRaw));
    if (!krwPrice || krwPrice <= 0) continue;

    parsed.push({ code, unit, krwPrice });
  }

  return parsed;
}

function toKstDateYYYYMMDD(date = new Date()): string {
  const kstMs = date.getTime() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchNaverRates(): Promise<{ rates: Record<string, number>; source: "naver-finance"; asOf: string }> {
  const response = await fetch("https://finance.naver.com/marketindex/exchangeList.naver", {
    headers: {
      "user-agent": "Mozilla/5.0",
      referer: "https://finance.naver.com/",
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`naver response ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }

  const html = await response.text();
  const rows = parseNaverRates(html);
  if (!rows.length) throw new Error("naver rates parsing failed");

  return {
    source: "naver-finance",
    asOf: new Date().toISOString(),
    rates: normalizeRates(rows),
  };
}

async function fetchHanaRates(): Promise<{ rates: Record<string, number>; source: "hana-bank"; asOf: string }> {
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
  if (!rows.length) throw new Error("hana rates parsing failed");

  return {
    source: "hana-bank",
    asOf: new Date().toISOString(),
    rates: normalizeRates(rows),
  };
}

export function registerFxRoutes(app: import("express").Express) {
  const router = Router();

  router.get("/api/fx/hana", async (_req, res) => {
    try {
      try {
        const naver = await fetchNaverRates();
        res.json(naver);
        return;
      } catch (error) {
        console.warn("[fx/naver] fallback to hana", error);
      }

      const hana = await fetchHanaRates();
      res.json(hana);
    } catch (error) {
      console.error("[fx/hana]", error);
      res.status(502).json({ error: "fx unavailable" });
    }
  });

  app.use(router);
}

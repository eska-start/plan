import type { Express, Request, Response } from "express";
import * as db from "../db";
import { sdk } from "./sdk";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  try {
    const [y, m, day] = d.split("-");
    return `${y}.${m}.${day}`;
  } catch { return d; }
}

function fmtDateTime(dt: string | null | undefined): string {
  if (!dt) return "";
  try {
    const date = new Date(dt);
    if (isNaN(date.getTime())) return dt;
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${mm}.${dd} ${hh}:${min}`;
  } catch { return dt; }
}

const MOOD_LABEL: Record<string, string> = {
  amazing: "최고",
  happy: "좋음",
  neutral: "보통",
  tired: "피곤",
  sad: "아쉬움",
};

const WEATHER_LABEL: Record<string, string> = {
  sunny: "맑음",
  cloudy: "흐림",
  rainy: "비",
  snowy: "눈",
  windy: "바람",
};

const CATEGORY_LABEL: Record<string, string> = {
  place: "장소",
  food: "음식",
  activity: "활동",
  shopping: "쇼핑",
  accommodation: "숙박",
};

const FLIGHT_TYPE_LABEL: Record<string, string> = {
  departure: "출발",
  return: "귀국",
  transit: "경유",
};

function generateHtml(data: {
  trip: { name: string; destination: string; startDate: string; endDate: string; description?: string | null; coverColor?: string | null };
  flights: any[];
  rentals: any[];
  accommodations: any[];
  itinerary: any[];
  memos: any[];
  diary: any[];
}): string {
  const { trip, flights, rentals, accommodations, itinerary, memos, diary } = data;
  const coverColor = trip.coverColor ?? "#1e293b";

  // Group itinerary by date, sorted by visitTime within each day
  const itineraryByDate = new Map<string, any[]>();
  for (const item of itinerary) {
    const list = itineraryByDate.get(item.date) ?? [];
    list.push(item);
    itineraryByDate.set(item.date, list);
  }
  Array.from(itineraryByDate.values()).forEach(items => {
    items.sort((a: any, b: any) => {
      if (!a.visitTime && !b.visitTime) return 0;
      if (!a.visitTime) return 1;
      if (!b.visitTime) return -1;
      return a.visitTime.localeCompare(b.visitTime);
    });
  });

  // Group diary by date
  const diaryByDate = new Map<string, any>();
  for (const entry of diary) {
    diaryByDate.set(entry.date, entry);
  }

  const allDates = Array.from(new Set([
    ...Array.from(itineraryByDate.keys()),
    ...Array.from(diaryByDate.keys()),
  ])).sort();

  function section(title: string, content: string): string {
    if (!content.trim()) return "";
    return `<section><h2>${esc(title)}</h2>${content}</section>`;
  }

  // Flights
  const flightsHtml = flights.map(f => `
    <div class="card">
      <div class="card-header">
        <span class="badge">${esc(FLIGHT_TYPE_LABEL[f.type] ?? f.type)}</span>
        <strong>${esc(f.airline ?? "")} ${esc(f.flightNumber ?? "")}</strong>
      </div>
      <div class="row"><span>${esc(f.departureAirport ?? "")} → ${esc(f.arrivalAirport ?? "")}</span></div>
      <div class="row muted">${fmtDateTime(f.departureTime)} → ${fmtDateTime(f.arrivalTime)}</div>
      ${f.seatNumber ? `<div class="row muted">좌석: ${esc(f.seatNumber)}</div>` : ""}
      ${f.bookingRef ? `<div class="row muted">예약번호: ${esc(f.bookingRef)}</div>` : ""}
      ${f.memo ? `<div class="memo">${esc(f.memo)}</div>` : ""}
    </div>
  `).join("");

  // Rentals
  const rentalsHtml = rentals.map(r => `
    <div class="card">
      <div class="card-header"><strong>${esc(r.company ?? "")} ${esc(r.carModel ?? "")}</strong></div>
      <div class="row">${esc(r.pickupLocation ?? "")} → ${esc(r.dropoffLocation ?? "")}</div>
      <div class="row muted">${fmtDateTime(r.pickupTime)} → ${fmtDateTime(r.dropoffTime)}</div>
      ${r.price ? `<div class="row muted">요금: ${r.price} ${esc(r.currency ?? "KRW")}</div>` : ""}
      ${r.bookingRef ? `<div class="row muted">예약번호: ${esc(r.bookingRef)}</div>` : ""}
      ${r.memo ? `<div class="memo">${esc(r.memo)}</div>` : ""}
    </div>
  `).join("");

  // Accommodations
  const accommodationsHtml = accommodations.map(a => `
    <div class="card">
      <div class="card-header"><strong>${esc(a.name)}</strong></div>
      ${a.address ? `<div class="row muted">${esc(a.address)}</div>` : ""}
      <div class="row">체크인: ${fmtDate(a.checkIn)} → 체크아웃: ${fmtDate(a.checkOut)}</div>
      ${a.price ? `<div class="row muted">요금: ${a.price} ${esc(a.currency ?? "KRW")}</div>` : ""}
      ${a.bookingRef ? `<div class="row muted">예약번호: ${esc(a.bookingRef)}</div>` : ""}
      ${a.memo ? `<div class="memo">${esc(a.memo)}</div>` : ""}
    </div>
  `).join("");

  // Daily itinerary + diary
  const dailyHtml = allDates.map(date => {
    const items = itineraryByDate.get(date) ?? [];
    const diaryEntry = diaryByDate.get(date);
    const dayItems = items.map(item => `
      <div class="itinerary-item${item.visited ? " visited" : ""}">
        <div class="item-label">
          <span class="badge sm">${esc(CATEGORY_LABEL[item.category] ?? item.category)}</span>
          <strong>${esc(item.placeName)}</strong>
          ${item.visitTime ? `<span class="muted">${esc(item.visitTime)}</span>` : ""}
          ${item.duration ? `<span class="muted">${item.duration}분</span>` : ""}
          ${item.visited ? `<span class="visited-mark">✓ 방문완료</span>` : ""}
        </div>
        ${item.address ? `<div class="muted small">${esc(item.address)}</div>` : ""}
        ${item.memo ? `<div class="memo">${esc(item.memo)}</div>` : ""}
      </div>
    `).join("");

    const diaryHtml = diaryEntry ? `
      <div class="diary-entry">
        ${diaryEntry.title ? `<div class="diary-title">${esc(diaryEntry.title)}</div>` : ""}
        <div class="diary-meta muted small">
          ${diaryEntry.mood ? `기분: ${esc(MOOD_LABEL[diaryEntry.mood] ?? diaryEntry.mood)}` : ""}
          ${diaryEntry.weather ? ` · 날씨: ${esc(WEATHER_LABEL[diaryEntry.weather] ?? diaryEntry.weather)}` : ""}
        </div>
        ${diaryEntry.content ? `<div class="diary-content">${esc(diaryEntry.content).replace(/\n/g, "<br>")}</div>` : ""}
      </div>
    ` : "";

    if (!dayItems && !diaryHtml) return "";
    return `
      <div class="day-block">
        <div class="day-header">${fmtDate(date)}</div>
        ${dayItems}
        ${diaryHtml}
      </div>
    `;
  }).join("");

  // Memos
  const memosHtml = memos.map(m => `
    <div class="card">
      ${m.pinned ? `<span class="badge">고정</span> ` : ""}
      ${m.title ? `<strong>${esc(m.title)}</strong>` : ""}
      ${m.content ? `<div class="memo">${esc(m.content).replace(/\n/g, "<br>")}</div>` : ""}
    </div>
  `).join("");

  const totalDays = (() => {
    try {
      const ms = new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime();
      return Math.round(ms / 86400000) + 1;
    } catch { return 0; }
  })();

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(trip.name)} — ${esc(trip.destination)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; color: #1e293b; background: #f8fafc; }
    .header { background: ${esc(coverColor)}; color: white; padding: 32px 40px 28px; }
    .header .destination { font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; opacity: 0.5; margin-bottom: 6px; }
    .header h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .header .meta { font-size: 13px; opacity: 0.6; }
    .header .desc { font-size: 13px; opacity: 0.45; margin-top: 8px; max-width: 600px; line-height: 1.5; }
    .print-btn { position: fixed; top: 16px; right: 16px; background: ${esc(coverColor)}; color: white; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer; font-weight: 500; }
    @media print { .print-btn { display: none; } }
    main { max-width: 800px; margin: 0 auto; padding: 32px 24px; }
    section { margin-bottom: 36px; }
    section h2 { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; }
    .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .row { margin-bottom: 4px; }
    .muted { color: #64748b; }
    .small { font-size: 12px; }
    .memo { margin-top: 8px; padding: 8px 10px; background: #f8fafc; border-radius: 6px; color: #475569; font-size: 13px; line-height: 1.5; }
    .badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 99px; background: #e2e8f0; color: #475569; }
    .badge.sm { font-size: 10px; padding: 1px 6px; }
    .day-block { margin-bottom: 24px; }
    .day-header { font-weight: 700; font-size: 14px; color: #334155; margin-bottom: 10px; padding: 6px 12px; background: #f1f5f9; border-radius: 6px; }
    .itinerary-item { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-left: 3px solid #e2e8f0; margin-bottom: 8px; background: white; border-radius: 0 8px 8px 0; }
    .itinerary-item.visited { border-left-color: #22c55e; opacity: 0.75; }
    .item-label { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .visited-mark { font-size: 11px; color: #22c55e; font-weight: 600; }
    .diary-entry { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-top: 10px; }
    .diary-title { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
    .diary-meta { margin-bottom: 8px; }
    .diary-content { line-height: 1.7; color: #334155; white-space: pre-wrap; }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ PDF 저장 / 인쇄</button>
  <div class="header">
    <div class="destination">${esc(trip.destination)}</div>
    <h1>${esc(trip.name)}</h1>
    <div class="meta">${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)}  ·  ${totalDays}일</div>
    ${trip.description ? `<div class="desc">${esc(trip.description)}</div>` : ""}
  </div>
  <main>
    ${section("항공편", flightsHtml)}
    ${section("렌트카", rentalsHtml)}
    ${section("숙박", accommodationsHtml)}
    ${section("일정 & 일기", dailyHtml)}
    ${section("메모", memosHtml)}
  </main>
</body>
</html>`;
}

export function registerExportRoutes(app: Express) {
  app.get("/api/trips/:id/export", async (req: Request, res: Response) => {
    try {
      // JWT만 검증 — OAuth 서버 불필요
      let userId: number | null = null;
      try {
        const rawCookies = req.headers.cookie;
        if (rawCookies) {
          const parsed = parseCookieHeader(rawCookies);
          const cookieValue = parsed[COOKIE_NAME];
          if (cookieValue) {
            const session = await sdk.verifySession(cookieValue);
            if (session?.openId) {
              const user = await db.getUserByOpenId(session.openId);
              if (user) userId = user.id;
            }
          }
        }
      } catch (authErr) {
        console.error("[Export] Auth error:", authErr);
      }

      if (!userId) {
        console.warn("[Export] Unauthorized: no userId resolved for tripId", req.params.id);
        res.status(401).send("로그인이 필요합니다.");
        return;
      }

      const tripId = parseInt(req.params.id);
      if (isNaN(tripId)) {
        res.status(400).send("잘못된 여행 ID입니다.");
        return;
      }

      const [trip, flights, rentals, accommodations, itinerary, memos, diary] = await Promise.all([
        db.getTripById(tripId, userId),
        db.getFlightsByTrip(tripId, userId),
        db.getRentalsByTrip(tripId, userId),
        db.getAccommodationsByTrip(tripId, userId),
        db.getItineraryByTrip(tripId, userId),
        db.getMemosByTrip(tripId, userId),
        db.getDiaryEntriesByTrip(tripId, userId),
      ]);

      if (!trip) {
        res.status(404).send("여행을 찾을 수 없습니다.");
        return;
      }

      const html = generateHtml({ trip, flights, rentals, accommodations, itinerary, memos, diary });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(html);
    } catch (err) {
      console.error("[Export] Failed:", err);
      res.status(500).send("내보내기에 실패했습니다.");
    }
  });
}

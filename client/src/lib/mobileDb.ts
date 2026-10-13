import { validateBooking } from "@shared/bookingValidation";
/**
 * 네이티브 앱 로컬 DB (CapacitorSQLite).
 * 웹 server/db.ts + routers.ts 숙박→일정 동기화와 동일한 UI 동작.
 * 단일 로컬 사용자(userId=1). 공유/초대(온라인 전용)는 미지원 — UI에서 안내.
 */
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from "@capacitor-community/sqlite";
import { DB_NAME, SCHEMA_SQL } from "@shared/sqliteSchema";

const sqlite = new SQLiteConnection(CapacitorSQLite);
let db: SQLiteDBConnection | null = null;

export const LOCAL_USER_ID = 1;

async function conn(): Promise<SQLiteDBConnection> {
  if (db) return db;
  const exists = (await sqlite.isConnection(DB_NAME, false).catch(() => ({ result: false }))).result;
  db = exists
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
  await db.open();
  await db.execute(SCHEMA_SQL);
  return db;
}

type Row = Record<string, unknown>;

function norm<T extends Row>(r: T): T {
  const out = { ...r } as Row;
  if ("pinned" in out) out.pinned = Boolean(out.pinned);
  if ("visited" in out) out.visited = Boolean(out.visited);
  return out as T;
}

async function all<T extends Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await conn();
  const res = await c.query(sql, params);
  return ((res.values ?? []) as T[]).map(norm);
}

async function one<T extends Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await all<T>(sql, params);
  return rows[0];
}

async function run(sql: string, params: unknown[] = []): Promise<number> {
  const c = await conn();
  const res = await c.run(sql, params);
  return res.changes?.lastId ?? 0;
}

// ─── Trips ───
export const getTrips = () =>
  all("SELECT * FROM trips WHERE userId=? ORDER BY id DESC", [LOCAL_USER_ID]);

export const getTrip = (id: number) =>
  one("SELECT * FROM trips WHERE id=?", [id]);

export async function createTrip(d: { name: string; destination: string; startDate: string; endDate: string; coverColor?: string; description?: string }) {
  return run(
    "INSERT INTO trips (userId,name,destination,startDate,endDate,coverColor,description) VALUES (?,?,?,?,?,?,?)",
    [LOCAL_USER_ID, d.name, d.destination, d.startDate, d.endDate, d.coverColor ?? "#6366f1", d.description ?? null],
  );
}

export async function updateTrip(id: number, d: Partial<{ name: string; destination: string; startDate: string; endDate: string; coverColor: string; description: string }>) {
  const sets: string[] = [];
  const p: unknown[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) { sets.push(`${k}=?`); p.push(v); }
  }
  if (!sets.length) return;
  p.push(id);
  await run(`UPDATE trips SET ${sets.join(",")},updatedAt=datetime('now') WHERE id=?`, p);
}

export const deleteTrip = (id: number) => run("DELETE FROM trips WHERE id=?", [id]);

// ─── Flights ───
export const getFlights = (tripId: number) =>
  all("SELECT * FROM flights WHERE tripId=? ORDER BY id ASC", [tripId]);

export async function createFlight(tripId: number, d: Record<string, string | undefined>) {
  const error = validateBooking("flight", d);
  if (error) throw new Error(error);
  return run(
    "INSERT INTO flights (tripId,userId,type,airline,flightNumber,departureAirport,arrivalAirport,departureTime,arrivalTime,bookingRef,seatNumber,memo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    [tripId, LOCAL_USER_ID, d.type ?? "departure", d.airline ?? null, d.flightNumber ?? null, d.departureAirport ?? null, d.arrivalAirport ?? null, d.departureTime ?? null, d.arrivalTime ?? null, d.bookingRef ?? null, d.seatNumber ?? null, d.memo ?? null],
  );
}

export async function updateFlight(id: number, d: Record<string, string | undefined>) {
  const sets: string[] = [];
  const p: unknown[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) { sets.push(`${k}=?`); p.push(v || null); }
  }
  if (!sets.length) return;
  p.push(id);
  await run(`UPDATE flights SET ${sets.join(",")},updatedAt=datetime('now') WHERE id=?`, p);
}

export const deleteFlight = (id: number) => run("DELETE FROM flights WHERE id=?", [id]);

// ─── Rentals ───
export const getRentals = (tripId: number) =>
  all("SELECT * FROM rentals WHERE tripId=? ORDER BY id ASC", [tripId]);

export async function createRental(tripId: number, d: Record<string, string | undefined>) {
  const error = validateBooking("rental", d);
  if (error) throw new Error(error);
  return run(
    "INSERT INTO rentals (tripId,userId,company,carModel,pickupLocation,dropoffLocation,pickupTime,dropoffTime,bookingRef,price,currency,memo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    [tripId, LOCAL_USER_ID, d.company ?? null, d.carModel ?? null, d.pickupLocation ?? null, d.dropoffLocation ?? null, d.pickupTime ?? null, d.dropoffTime ?? null, d.bookingRef ?? null, d.price ?? null, d.currency ?? "KRW", d.memo ?? null],
  );
}

export async function updateRental(id: number, d: Record<string, string | undefined>) {
  const sets: string[] = [];
  const p: unknown[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) { sets.push(`${k}=?`); p.push(v || null); }
  }
  if (!sets.length) return;
  p.push(id);
  await run(`UPDATE rentals SET ${sets.join(",")},updatedAt=datetime('now') WHERE id=?`, p);
}

export const deleteRental = (id: number) => run("DELETE FROM rentals WHERE id=?", [id]);

// ─── Accommodations (+ 일정 자동 연동) ───
export const getAccommodations = (tripId: number) =>
  all("SELECT * FROM accommodations WHERE tripId=? ORDER BY id ASC", [tripId]);

function eachDay(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const s = new Date(checkIn + "T00:00:00");
  const e = new Date(checkOut + "T00:00:00");
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

async function syncAccommodationToItinerary(tripId: number, accId: number, name: string, address: string | null, checkIn: string | null, checkOut: string | null) {
  await run("DELETE FROM itinerary_items WHERE tripId=? AND sourceType='accommodation' AND sourceId=?", [tripId, accId]);
  if (!checkIn || !checkOut) return;
  const days = eachDay(checkIn, checkOut);
  for (let i = 0; i < days.length; i++) {
    const label = i === 0 ? `🏨 체크인 — ${name}` : i === days.length - 1 ? `🏨 체크아웃 — ${name}` : `🏨 숙박 — ${name}`;
    await run(
      "INSERT INTO itinerary_items (tripId,userId,date,placeName,address,category,sourceType,sourceId,\"order\",visited) VALUES (?,?,?,?,?,?,?,?,0,0)",
      [tripId, LOCAL_USER_ID, days[i], label, address, "accommodation", "accommodation", accId],
    );
  }
}

export async function createAccommodation(tripId: number, d: Record<string, string | undefined>) {
  const error = validateBooking("accommodation", d);
  if (error) throw new Error(error);
  const id = await run(
    "INSERT INTO accommodations (tripId,userId,name,address,checkIn,checkOut,bookingRef,price,currency,memo) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [tripId, LOCAL_USER_ID, d.name ?? "", d.address ?? null, d.checkIn ?? null, d.checkOut ?? null, d.bookingRef ?? null, d.price ?? null, d.currency ?? "KRW", d.memo ?? null],
  );
  await syncAccommodationToItinerary(tripId, id, d.name ?? "", d.address ?? null, d.checkIn ?? null, d.checkOut ?? null);
  return { id };
}

export async function updateAccommodation(id: number, tripId: number, d: Record<string, string | undefined>) {
  const sets: string[] = [];
  const p: unknown[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) { sets.push(`${k}=?`); p.push(v || null); }
  }
  if (sets.length) {
    p.push(id);
    await run(`UPDATE accommodations SET ${sets.join(",")},updatedAt=datetime('now') WHERE id=?`, p);
  }
  const acc = await one("SELECT * FROM accommodations WHERE id=?", [id]);
  if (acc) {
    await syncAccommodationToItinerary(tripId, id, String(acc.name ?? d.name ?? ""), (d.address ?? acc.address ?? null) as string | null, (d.checkIn ?? acc.checkIn ?? null) as string | null, (d.checkOut ?? acc.checkOut ?? null) as string | null);
  }
}

export async function deleteAccommodation(id: number, tripId: number) {
  await run("DELETE FROM accommodations WHERE id=?", [id]);
  await run("DELETE FROM itinerary_items WHERE tripId=? AND sourceType='accommodation' AND sourceId=?", [tripId, id]);
}

// ─── Memos ───
export const getMemos = (tripId: number) =>
  all("SELECT * FROM memos WHERE tripId=? ORDER BY id DESC", [tripId]);

export async function createMemo(tripId: number, d: { title?: string; content?: string; pinned?: boolean }) {
  return run("INSERT INTO memos (tripId,userId,title,content,pinned) VALUES (?,?,?,?,?)",
    [tripId, LOCAL_USER_ID, d.title ?? null, d.content ?? null, d.pinned ? 1 : 0]);
}

export async function updateMemo(id: number, d: { title?: string; content?: string; pinned?: boolean }) {
  const sets: string[] = [];
  const p: unknown[] = [];
  if (d.title !== undefined) { sets.push("title=?"); p.push(d.title); }
  if (d.content !== undefined) { sets.push("content=?"); p.push(d.content); }
  if (d.pinned !== undefined) { sets.push("pinned=?"); p.push(d.pinned ? 1 : 0); }
  if (!sets.length) return;
  p.push(id);
  await run(`UPDATE memos SET ${sets.join(",")},updatedAt=datetime('now') WHERE id=?`, p);
}

export const deleteMemo = (id: number) => run("DELETE FROM memos WHERE id=?", [id]);

// ─── Itinerary ───
export const getItineraryByDate = (tripId: number, date: string) =>
  all("SELECT * FROM itinerary_items WHERE tripId=? AND date=? ORDER BY \"order\" ASC, id ASC", [tripId, date]);

export const getItineraryByTrip = (tripId: number) =>
  all("SELECT * FROM itinerary_items WHERE tripId=? ORDER BY date ASC, \"order\" ASC, id ASC", [tripId]);

export async function createItineraryItem(tripId: number, d: Record<string, string | number | boolean | undefined>) {
  return run(
    "INSERT INTO itinerary_items (tripId,userId,date,placeName,address,lat,lng,visitTime,duration,visited,memo,category,\"order\") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [tripId, LOCAL_USER_ID, d.date ?? "", d.placeName ?? "", d.address ?? null, d.lat ?? null, d.lng ?? null, d.visitTime ?? null, d.duration ?? null, d.visited ? 1 : 0, d.memo ?? null, d.category ?? "place", d.order ?? 0],
  );
}

export async function updateItineraryItem(id: number, d: Record<string, string | number | boolean | undefined>) {
  const sets: string[] = [];
  const p: unknown[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    if (k === "visited" || k === "pinned") { sets.push(`${k}=?`); p.push(v ? 1 : 0); }
    else { sets.push(k === "order" ? `"order"=?` : `${k}=?`); p.push(v); }
  }
  if (!sets.length) return;
  p.push(id);
  await run(`UPDATE itinerary_items SET ${sets.join(",")},updatedAt=datetime('now') WHERE id=?`, p);
}

export const deleteItineraryItem = (id: number) => run("DELETE FROM itinerary_items WHERE id=?", [id]);

export async function reorderItineraryItems(tripId: number, orderedIds: number[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    await run("UPDATE itinerary_items SET \"order\"=? WHERE id=? AND tripId=?", [i, orderedIds[i], tripId]);
  }
}

// ─── Diary ───
export const getDiaryByTrip = (tripId: number) =>
  all("SELECT * FROM diary_entries WHERE tripId=? ORDER BY date DESC", [tripId]);

export const getDiaryByDate = (tripId: number, date: string) =>
  one("SELECT * FROM diary_entries WHERE tripId=? AND date=?", [tripId, date]);

export async function upsertDiary(tripId: number, d: { date: string; title?: string; content?: string; mood?: string; weather?: string }) {
  const ex = await getDiaryByDate(tripId, d.date);
  if (ex) {
    const sets: string[] = [];
    const p: unknown[] = [];
    if (d.title !== undefined) { sets.push("title=?"); p.push(d.title); }
    if (d.content !== undefined) { sets.push("content=?"); p.push(d.content); }
    if (d.mood !== undefined) { sets.push("mood=?"); p.push(d.mood); }
    if (d.weather !== undefined) { sets.push("weather=?"); p.push(d.weather); }
    if (sets.length) {
      p.push(ex.id);
      await run(`UPDATE diary_entries SET ${sets.join(",")},updatedAt=datetime('now') WHERE id=?`, p);
    }
    return ex.id;
  }
  return run("INSERT INTO diary_entries (tripId,userId,date,title,content,mood,weather) VALUES (?,?,?,?,?,?,?)",
    [tripId, LOCAL_USER_ID, d.date, d.title ?? null, d.content ?? null, d.mood ?? "happy", d.weather ?? "sunny"]);
}

export const deleteDiary = (id: number) => run("DELETE FROM diary_entries WHERE id=?", [id]);

// ─── Expenses (모바일 확장) ───
export const getExpenses = (tripId: number) =>
  all("SELECT * FROM expenses WHERE tripId=? ORDER BY id DESC", [tripId]);

export async function createExpense(tripId: number, d: { category?: string; amount: string; currency?: string; spentAt?: string; memo?: string; receiptPath?: string }) {
  return run("INSERT INTO expenses (tripId,userId,category,amount,currency,spentAt,memo,receiptPath) VALUES (?,?,?,?,?,?,?,?)",
    [tripId, LOCAL_USER_ID, d.category ?? "other", d.amount, d.currency ?? "KRW", d.spentAt ?? null, d.memo ?? null, d.receiptPath ?? null]);
}

export const deleteExpense = (id: number) => run("DELETE FROM expenses WHERE id=?", [id]);

export async function wipeAll(): Promise<void> {
  const c = await conn();
  for (const t of ["expenses", "diary_entries", "itinerary_items", "memos", "accommodations", "rentals", "flights", "trips"]) {
    await c.run(`DELETE FROM ${t}`);
  }
}

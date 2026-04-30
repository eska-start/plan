import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  InsertUser, users,
  trips, InsertTrip,
  flights, InsertFlight,
  rentals, InsertRental,
  accommodations, InsertAccommodation,
  memos, InsertMemo,
  itineraryItems, InsertItineraryItem,
  diaryEntries, InsertDiaryEntry,
  tripShares, InsertTripShare,
  tripMembers, InsertTripMember,
  expenses, InsertExpense,
  checklistItems, InsertChecklistItem,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
function isMissingPreregistrationColumn(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /Unknown column .*preregistrationUrl/i.test(error.message);
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Strip ssl-mode query param (not supported by mysql2) and enable SSL explicitly
      const uri = process.env.DATABASE_URL.replace(/[?&]ssl-mode=[^&]*/i, "").replace(/\?$/, "");
      const pool = mysql.createPool({
        uri,
        ssl: { rejectUnauthorized: false },
        waitForConnections: true,
        connectionLimit: 5,
        connectTimeout: 5000,   // 5초 안에 연결 못 하면 즉시 실패
      });
      _db = drizzle(pool);
    }
    catch (e) { console.warn("[Database] Failed to connect:", e); _db = null; }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const f of textFields) {
    const v = user[f];
    if (v !== undefined) { values[f] = v ?? null; updateSet[f] = v ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return r[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return r[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return r[0];
}


export async function updateUserName(userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set({ name }).where(eq(users.id, userId));
}

export async function setUserPasswordHash(openId: string, passwordHash: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordHash }).where(eq(users.openId, openId));
}

// ─── Trips ────────────────────────────────────────────────────────────────────
export async function getTripsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // 내가 만든 여행 + 공유 멤버로 참여한 여행
  const ownTrips = await db.select().from(trips).where(eq(trips.userId, userId));
  const memberRows = await db.select().from(tripMembers).where(eq(tripMembers.userId, userId));
  const sharedTripIds = memberRows.map(m => m.tripId).filter(id => !ownTrips.find(t => t.id === id));
  let sharedTrips: typeof ownTrips = [];
  if (sharedTripIds.length > 0) {
    sharedTrips = await db.select().from(trips).where(inArray(trips.id, sharedTripIds));
  }
  const all = [...ownTrips, ...sharedTrips];
  all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return all;
}

export async function getTripById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  // owner 또는 member이면 접근 가능
  const r = await db.select().from(trips).where(eq(trips.id, id)).limit(1);
  if (!r[0]) return undefined;
  if (r[0].userId === userId) return r[0];
  const mem = await db.select().from(tripMembers)
    .where(and(eq(tripMembers.tripId, id), eq(tripMembers.userId, userId))).limit(1);
  if (mem[0]) return r[0];
  return undefined;
}

export async function createTrip(data: InsertTrip) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(trips).values(data);
}

export async function updateTrip(id: number, userId: number, data: Partial<InsertTrip>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // owner or member can update
  const trip = await getTripById(id, userId);
  if (!trip) throw new Error("Trip not found or no access");
  await db.update(trips).set(data).where(eq(trips.id, id));
}

export async function deleteTrip(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(trips).where(and(eq(trips.id, id), eq(trips.userId, userId)));
}

// ─── Trip Shares & Members ────────────────────────────────────────────────────
export async function createTripShare(data: InsertTripShare) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(tripShares).values(data);
}

export async function getTripShareByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(tripShares).where(eq(tripShares.inviteToken, token)).limit(1);
  return r[0];
}

export async function getTripSharesByTrip(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tripShares).where(eq(tripShares.tripId, tripId));
}

export async function deleteTripShare(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(tripShares).where(and(eq(tripShares.id, id), eq(tripShares.createdBy, userId)));
}

export async function getTripMembers(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, tripId));
  // Enrich with user info
  const enriched = await Promise.all(members.map(async m => {
    const u = await getUserById(m.userId);
    return { ...m, userName: u?.name ?? "알 수 없음", userEmail: u?.email ?? "" };
  }));
  return enriched;
}

export async function addTripMember(data: InsertTripMember) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Prevent duplicate
  const existing = await db.select().from(tripMembers)
    .where(and(eq(tripMembers.tripId, data.tripId), eq(tripMembers.userId, data.userId))).limit(1);
  if (existing[0]) return; // already member
  await db.insert(tripMembers).values(data);
}

export async function removeTripMember(tripId: number, userId: number, requesterId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Only owner can remove, or member removes themselves
  const trip = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip[0]) throw new Error("Trip not found");
  if (trip[0].userId !== requesterId && userId !== requesterId) throw new Error("No permission");
  await db.delete(tripMembers).where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
}

// ─── Flights ──────────────────────────────────────────────────────────────────
export async function getFlightsByTrip(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const trip = await getTripById(tripId, userId);
  if (!trip) return [];
  try {
    return await db.select().from(flights).where(eq(flights.tripId, tripId)).orderBy(asc(flights.departureTime));
  } catch (error) {
    if (!isMissingPreregistrationColumn(error)) throw error;
    return db.select({
      id: flights.id, tripId: flights.tripId, userId: flights.userId, type: flights.type, airline: flights.airline,
      flightNumber: flights.flightNumber, departureAirport: flights.departureAirport, arrivalAirport: flights.arrivalAirport,
      departureTime: flights.departureTime, arrivalTime: flights.arrivalTime, bookingRef: flights.bookingRef, seatNumber: flights.seatNumber,
      memo: flights.memo, createdAt: flights.createdAt, updatedAt: flights.updatedAt, preregistrationUrl: sql`null`,
    }).from(flights).where(eq(flights.tripId, tripId)).orderBy(asc(flights.departureTime));
  }
}

export async function createFlight(data: InsertFlight) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  try {
    await db.insert(flights).values(data);
  } catch (error) {
    if (!isMissingPreregistrationColumn(error)) throw error;
    const { preregistrationUrl: _ignored, ...legacyData } = data as InsertFlight & { preregistrationUrl?: string | null };
    await db.insert(flights).values(legacyData);
  }
}

export async function updateFlight(id: number, userId: number, data: Partial<InsertFlight>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Allow owner or trip member to update
  const row = await db.select().from(flights).where(eq(flights.id, id)).limit(1);
  if (!row[0]) throw new Error("Not found");
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  try {
    await db.update(flights).set(data).where(eq(flights.id, id));
  } catch (error) {
    if (!isMissingPreregistrationColumn(error)) throw error;
    const { preregistrationUrl: _ignored, ...legacyData } = data as Partial<InsertFlight> & { preregistrationUrl?: string | null };
    await db.update(flights).set(legacyData).where(eq(flights.id, id));
  }
}

export async function deleteFlight(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(flights).where(eq(flights.id, id)).limit(1);
  if (!row[0]) return;
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  await db.delete(flights).where(eq(flights.id, id));
}

// ─── Rentals ──────────────────────────────────────────────────────────────────
export async function getRentalsByTrip(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const trip = await getTripById(tripId, userId);
  if (!trip) return [];
  return db.select().from(rentals).where(eq(rentals.tripId, tripId)).orderBy(asc(rentals.pickupTime));
}

export async function createRental(data: InsertRental) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(rentals).values(data);
}

export async function updateRental(id: number, userId: number, data: Partial<InsertRental>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(rentals).where(eq(rentals.id, id)).limit(1);
  if (!row[0]) throw new Error("Not found");
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  await db.update(rentals).set(data).where(eq(rentals.id, id));
}

export async function deleteRental(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(rentals).where(eq(rentals.id, id)).limit(1);
  if (!row[0]) return;
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  await db.delete(rentals).where(eq(rentals.id, id));
}

// ─── Accommodations ───────────────────────────────────────────────────────────
export async function getAccommodationsByTrip(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const trip = await getTripById(tripId, userId);
  if (!trip) return [];
  try {
    return await db.select().from(accommodations).where(eq(accommodations.tripId, tripId)).orderBy(asc(accommodations.checkIn));
  } catch (error) {
    if (!isMissingPreregistrationColumn(error)) throw error;
    return db.select({
      id: accommodations.id, tripId: accommodations.tripId, userId: accommodations.userId, name: accommodations.name, address: accommodations.address,
      checkIn: accommodations.checkIn, checkInTime: accommodations.checkInTime, checkOut: accommodations.checkOut, checkOutTime: accommodations.checkOutTime,
      bookingRef: accommodations.bookingRef, price: accommodations.price, currency: accommodations.currency, memo: accommodations.memo,
      createdAt: accommodations.createdAt, updatedAt: accommodations.updatedAt, preregistrationUrl: sql`null`,
    }).from(accommodations).where(eq(accommodations.tripId, tripId)).orderBy(asc(accommodations.checkIn));
  }
}

export async function createAccommodation(data: InsertAccommodation) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  let r;
  try {
    r = await db.insert(accommodations).values(data);
  } catch (error) {
    if (!isMissingPreregistrationColumn(error)) throw error;
    const { preregistrationUrl: _ignored, ...legacyData } = data as InsertAccommodation & { preregistrationUrl?: string | null };
    r = await db.insert(accommodations).values(legacyData);
  }
  // insertId from mysql2
  const insertId = (r[0] as any).insertId as number;
  return insertId;
}

export async function updateAccommodation(id: number, userId: number, data: Partial<InsertAccommodation>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(accommodations).where(eq(accommodations.id, id)).limit(1);
  if (!row[0]) throw new Error("Not found");
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  try {
    await db.update(accommodations).set(data).where(eq(accommodations.id, id));
  } catch (error) {
    if (!isMissingPreregistrationColumn(error)) throw error;
    const { preregistrationUrl: _ignored, ...legacyData } = data as Partial<InsertAccommodation> & { preregistrationUrl?: string | null };
    await db.update(accommodations).set(legacyData).where(eq(accommodations.id, id));
  }
}

export async function deleteAccommodation(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(accommodations).where(eq(accommodations.id, id)).limit(1);
  if (!row[0]) return;
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  await db.delete(accommodations).where(eq(accommodations.id, id));
}

// ─── Memos ────────────────────────────────────────────────────────────────────
export async function getMemosByTrip(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const trip = await getTripById(tripId, userId);
  if (!trip) return [];
  return db.select().from(memos).where(eq(memos.tripId, tripId)).orderBy(desc(memos.pinned), desc(memos.updatedAt));
}

export async function createMemo(data: InsertMemo) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(memos).values(data);
}

export async function updateMemo(id: number, userId: number, data: Partial<InsertMemo>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(memos).where(eq(memos.id, id)).limit(1);
  if (!row[0]) throw new Error("Not found");
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  await db.update(memos).set(data).where(eq(memos.id, id));
}

export async function deleteMemo(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(memos).where(eq(memos.id, id)).limit(1);
  if (!row[0]) return;
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  await db.delete(memos).where(eq(memos.id, id));
}

// ─── Itinerary Items ──────────────────────────────────────────────────────────
export async function getItineraryByDate(tripId: number, userId: number, date: string) {
  const db = await getDb();
  if (!db) return [];
  const trip = await getTripById(tripId, userId);
  if (!trip) return [];
  return db.select().from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.date, date)))
    .orderBy(asc(itineraryItems.order), asc(itineraryItems.visitTime));
}

export async function getItineraryByTrip(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const trip = await getTripById(tripId, userId);
  if (!trip) return [];
  return db.select().from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId))
    .orderBy(asc(itineraryItems.date), asc(itineraryItems.order));
}

export async function createItineraryItem(data: InsertItineraryItem) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(itineraryItems).values(data);
}

export async function updateItineraryItem(id: number, userId: number, data: Partial<InsertItineraryItem>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(itineraryItems).where(eq(itineraryItems.id, id)).limit(1);
  if (!row[0]) throw new Error("Not found");
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  await db.update(itineraryItems).set(data).where(eq(itineraryItems.id, id));
}

export async function deleteItineraryItem(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(itineraryItems).where(eq(itineraryItems.id, id)).limit(1);
  if (!row[0]) return;
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  await db.delete(itineraryItems).where(eq(itineraryItems.id, id));
}

/** 일정 항목 순서 일괄 업데이트 */
export async function reorderItineraryItems(tripId: number, userId: number, orderedIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const trip = await getTripById(tripId, userId);
  if (!trip) throw new Error("No access");
  // 각 항목의 order를 배열 인덱스 값으로 업데이트
  await Promise.all(
    orderedIds.map((id, index) =>
      db.update(itineraryItems)
        .set({ order: index })
        .where(and(eq(itineraryItems.id, id), eq(itineraryItems.tripId, tripId)))
    )
  );
}

/** 숙박 연동: sourceId로 묶인 일정 항목 전체 삭제 */
export async function deleteItineraryItemsBySource(tripId: number, sourceId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.sourceId, sourceId)));
}

// ─── Diary Entries ────────────────────────────────────────────────────────────
export async function getDiaryEntriesByTrip(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const trip = await getTripById(tripId, userId);
  if (!trip) return [];
  return db.select().from(diaryEntries)
    .where(eq(diaryEntries.tripId, tripId))
    .orderBy(asc(diaryEntries.date));
}

export async function getDiaryEntryByDate(tripId: number, userId: number, date: string) {
  const db = await getDb();
  if (!db) return undefined;
  const trip = await getTripById(tripId, userId);
  if (!trip) return undefined;
  const r = await db.select().from(diaryEntries)
    .where(and(eq(diaryEntries.tripId, tripId), eq(diaryEntries.date, date)))
    .limit(1);
  return r[0];
}

export async function upsertDiaryEntry(data: InsertDiaryEntry) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(diaryEntries).values(data).onDuplicateKeyUpdate({
    set: { title: data.title, content: data.content, mood: data.mood, weather: data.weather },
  });
}

export async function deleteDiaryEntry(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(diaryEntries).where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)));
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
export async function getExpensesByTrip(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const trip = await getTripById(tripId, userId);
  if (!trip) return [];
  return db.select().from(expenses)
    .where(eq(expenses.tripId, tripId))
    .orderBy(desc(expenses.date), desc(expenses.createdAt));
}

export async function createExpense(data: InsertExpense) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const r = await db.insert(expenses).values(data);
  return (r[0] as any).insertId as number;
}

export async function updateExpense(id: number, userId: number, data: Partial<InsertExpense>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!row[0]) throw new Error("Not found");
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  await db.update(expenses).set(data).where(eq(expenses.id, id));
}

export async function deleteExpense(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!row[0]) return;
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  await db.delete(expenses).where(eq(expenses.id, id));
}

// ─── Checklist Items ──────────────────────────────────────────────────────────
export async function getChecklistByTrip(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const trip = await getTripById(tripId, userId);
  if (!trip) return [];
  return db.select().from(checklistItems)
    .where(eq(checklistItems.tripId, tripId))
    .orderBy(asc(checklistItems.group), asc(checklistItems.order), asc(checklistItems.id));
}

export async function createChecklistItem(data: InsertChecklistItem) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const r = await db.insert(checklistItems).values(data);
  return (r[0] as any).insertId as number;
}

export async function updateChecklistItem(id: number, userId: number, data: Partial<InsertChecklistItem>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(checklistItems).where(eq(checklistItems.id, id)).limit(1);
  if (!row[0]) throw new Error("Not found");
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  await db.update(checklistItems).set(data).where(eq(checklistItems.id, id));
}

export async function deleteChecklistItem(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const row = await db.select().from(checklistItems).where(eq(checklistItems.id, id)).limit(1);
  if (!row[0]) return;
  const trip = await getTripById(row[0].tripId, userId);
  if (!trip) throw new Error("No access");
  await db.delete(checklistItems).where(eq(checklistItems.id, id));
}

export async function bulkCreateChecklistItems(items: InsertChecklistItem[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (items.length === 0) return;
  await db.insert(checklistItems).values(items);
}

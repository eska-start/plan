import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); }
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
  return db.select().from(flights).where(eq(flights.tripId, tripId)).orderBy(asc(flights.departureTime));
}

export async function createFlight(data: InsertFlight) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(flights).values(data);
}

export async function updateFlight(id: number, userId: number, data: Partial<InsertFlight>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(flights).set(data).where(and(eq(flights.id, id), eq(flights.userId, userId)));
}

export async function deleteFlight(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(flights).where(and(eq(flights.id, id), eq(flights.userId, userId)));
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
  await db.update(rentals).set(data).where(and(eq(rentals.id, id), eq(rentals.userId, userId)));
}

export async function deleteRental(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(rentals).where(and(eq(rentals.id, id), eq(rentals.userId, userId)));
}

// ─── Accommodations ───────────────────────────────────────────────────────────
export async function getAccommodationsByTrip(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const trip = await getTripById(tripId, userId);
  if (!trip) return [];
  return db.select().from(accommodations).where(eq(accommodations.tripId, tripId)).orderBy(asc(accommodations.checkIn));
}

export async function createAccommodation(data: InsertAccommodation) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const r = await db.insert(accommodations).values(data);
  // insertId from mysql2
  const insertId = (r[0] as any).insertId as number;
  return insertId;
}

export async function updateAccommodation(id: number, userId: number, data: Partial<InsertAccommodation>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(accommodations).set(data).where(and(eq(accommodations.id, id), eq(accommodations.userId, userId)));
}

export async function deleteAccommodation(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(accommodations).where(and(eq(accommodations.id, id), eq(accommodations.userId, userId)));
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
  await db.update(memos).set(data).where(and(eq(memos.id, id), eq(memos.userId, userId)));
}

export async function deleteMemo(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(memos).where(and(eq(memos.id, id), eq(memos.userId, userId)));
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
  await db.update(itineraryItems).set(data).where(and(eq(itineraryItems.id, id), eq(itineraryItems.userId, userId)));
}

export async function deleteItineraryItem(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(itineraryItems).where(and(eq(itineraryItems.id, id), eq(itineraryItems.userId, userId)));
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

import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  trips,
  flights,
  rentals,
  accommodations,
  memos,
  itineraryItems,
  diaryEntries,
  InsertTrip,
  InsertFlight,
  InsertRental,
  InsertAccommodation,
  InsertMemo,
  InsertItineraryItem,
  InsertDiaryEntry,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
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
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Trips ────────────────────────────────────────────────────────────────────
export async function getTripsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(trips).where(eq(trips.userId, userId)).orderBy(desc(trips.createdAt));
}

export async function getTripById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(trips).where(and(eq(trips.id, id), eq(trips.userId, userId))).limit(1);
  return r[0];
}

export async function createTrip(data: InsertTrip) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const r = await db.insert(trips).values(data);
  return r[0];
}

export async function updateTrip(id: number, userId: number, data: Partial<InsertTrip>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(trips).set(data).where(and(eq(trips.id, id), eq(trips.userId, userId)));
}

export async function deleteTrip(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(trips).where(and(eq(trips.id, id), eq(trips.userId, userId)));
}

// ─── Flights ──────────────────────────────────────────────────────────────────
export async function getFlightsByTrip(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(flights).where(and(eq(flights.tripId, tripId), eq(flights.userId, userId))).orderBy(asc(flights.departureTime));
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
  return db.select().from(rentals).where(and(eq(rentals.tripId, tripId), eq(rentals.userId, userId))).orderBy(asc(rentals.pickupTime));
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
  return db.select().from(accommodations).where(and(eq(accommodations.tripId, tripId), eq(accommodations.userId, userId))).orderBy(asc(accommodations.checkIn));
}

export async function createAccommodation(data: InsertAccommodation) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(accommodations).values(data);
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
  return db.select().from(memos).where(and(eq(memos.tripId, tripId), eq(memos.userId, userId))).orderBy(desc(memos.pinned), desc(memos.updatedAt));
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
  return db.select().from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.userId, userId), eq(itineraryItems.date, date)))
    .orderBy(asc(itineraryItems.order), asc(itineraryItems.visitTime));
}

export async function getItineraryByTrip(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.userId, userId)))
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

// ─── Diary Entries ────────────────────────────────────────────────────────────
export async function getDiaryEntriesByTrip(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(diaryEntries)
    .where(and(eq(diaryEntries.tripId, tripId), eq(diaryEntries.userId, userId)))
    .orderBy(asc(diaryEntries.date));
}

export async function getDiaryEntryByDate(tripId: number, userId: number, date: string) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(diaryEntries)
    .where(and(eq(diaryEntries.tripId, tripId), eq(diaryEntries.userId, userId), eq(diaryEntries.date, date)))
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

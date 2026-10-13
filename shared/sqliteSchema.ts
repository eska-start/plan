/**
 * 네이티브 앱(SQLite) 스키마.
 * 웹 drizzle/schema.ts와 호환되는 테이블 + 모바일 확장(expenses).
 * 버전 관리: SCHEMA_VERSION, 필요시 마이그레이션 추가.
 */

export const SCHEMA_VERSION = 1;
export const DB_NAME = "plan-local.db";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  coverColor TEXT DEFAULT '#6366f1',
  description TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS flights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tripId INTEGER NOT NULL,
  userId INTEGER NOT NULL DEFAULT 1,
  type TEXT DEFAULT 'departure',
  airline TEXT,
  flightNumber TEXT,
  departureAirport TEXT,
  arrivalAirport TEXT,
  departureTime TEXT,
  arrivalTime TEXT,
  bookingRef TEXT,
  seatNumber TEXT,
  memo TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rentals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tripId INTEGER NOT NULL,
  userId INTEGER NOT NULL DEFAULT 1,
  company TEXT,
  carModel TEXT,
  pickupLocation TEXT,
  dropoffLocation TEXT,
  pickupTime TEXT,
  dropoffTime TEXT,
  bookingRef TEXT,
  price TEXT,
  currency TEXT DEFAULT 'KRW',
  memo TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS accommodations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tripId INTEGER NOT NULL,
  userId INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  address TEXT,
  checkIn TEXT,
  checkOut TEXT,
  bookingRef TEXT,
  price TEXT,
  currency TEXT DEFAULT 'KRW',
  memo TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS memos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tripId INTEGER NOT NULL,
  userId INTEGER NOT NULL DEFAULT 1,
  title TEXT,
  content TEXT,
  pinned INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS itinerary_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tripId INTEGER NOT NULL,
  userId INTEGER NOT NULL DEFAULT 1,
  date TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  placeName TEXT NOT NULL,
  address TEXT,
  lat TEXT,
  lng TEXT,
  visitTime TEXT,
  duration INTEGER,
  visited INTEGER DEFAULT 0,
  memo TEXT,
  category TEXT DEFAULT 'place',
  sourceType TEXT DEFAULT 'manual',
  sourceId INTEGER,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS diary_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tripId INTEGER NOT NULL,
  userId INTEGER NOT NULL DEFAULT 1,
  date TEXT NOT NULL,
  title TEXT,
  content TEXT,
  mood TEXT DEFAULT 'happy',
  weather TEXT DEFAULT 'sunny',
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tripId INTEGER NOT NULL,
  userId INTEGER NOT NULL DEFAULT 1,
  category TEXT DEFAULT 'other',
  amount TEXT NOT NULL,
  currency TEXT DEFAULT 'KRW',
  spentAt TEXT,
  memo TEXT,
  receiptPath TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_flights_trip ON flights(tripId);
CREATE INDEX IF NOT EXISTS idx_rentals_trip ON rentals(tripId);
CREATE INDEX IF NOT EXISTS idx_accommodations_trip ON accommodations(tripId);
CREATE INDEX IF NOT EXISTS idx_memos_trip ON memos(tripId);
CREATE INDEX IF NOT EXISTS idx_itinerary_trip_date ON itinerary_items(tripId, date);
CREATE INDEX IF NOT EXISTS idx_diary_trip_date ON diary_entries(tripId, date);
CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(tripId);
`;

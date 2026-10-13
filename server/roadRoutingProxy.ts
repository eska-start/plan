import type { Express, Request, Response } from "express";

/**
 * Small-volume, best-effort OpenStreetMap road routing for PlanLog.
 * Requests are globally throttled within the single Render instance.
 * No arbitrary daily quota; public FOSSGIS rate/fair-use policy still applies.
 * Not a replacement for a dedicated production routing SLA.
 */
const UPSTREAM = "https://routing.openstreetmap.de";
const MIN_INTERVAL_MS = 1250;
const MAX_QUEUE = 8;
const PER_IP_WINDOW_MS = 15 * 60 * 1000;
const PER_IP_LIMIT = 16;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE = 120;
const MAX_STOPS = 20;
type CacheEntry = { value: unknown; expires: number };
const cache = new Map<string, CacheEntry>();
const ipHits = new Map<string, number[]>();
let nextStart = 0;
let activeQueue = 0;
let dailyBucket = new Date().toISOString().slice(0, 10);
let dailyCount = 0;
let cacheHits = 0;
let rejectedRequests = 0;
let failedUpstream = 0;
let totalUpstream = 0;
const serverStartedAt = new Date().toISOString();
const utcDay = () => new Date().toISOString().slice(0, 10);

let pending: Promise<void> = Promise.resolve();
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function validCoords(raw: unknown): raw is { lat: number; lng: number }[] {
  return Array.isArray(raw) && raw.length >= 2 && raw.length <= MAX_STOPS &&
    raw.every(p => p && typeof p.lat === "number" && typeof p.lng === "number" &&
      Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
      Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
}
const round = (n: number) => n.toFixed(5);

export function registerRoadRoutingProxy(app: Express) {
  app.get("/api/road-routing/stats", (_req, res) => {
    if (dailyBucket !== utcDay()) { dailyBucket = utcDay(); dailyCount = 0; }
    res.setHeader("Cache-Control", "no-store");
    res.json({ dayUtc: dailyBucket, upstreamToday: dailyCount, dailyLimit: null,
      cacheHitsSinceStart: cacheHits, rejectedSinceStart: rejectedRequests,
      upstreamFailuresSinceStart: failedUpstream, upstreamSinceStart: totalUpstream,
      cacheEntries: cache.size, cacheDays: 7, serverStartedAt,
      note: "서버 재시작 시 통계 초기화 · Google Maps/Places/Geocoding 사용량은 포함되지 않음" });
  });
  app.post("/api/road-routing", async (req: Request, res: Response) => {
    const body = req.body as { kind?: string; mode?: string; points?: unknown };
    const { kind, mode, points } = body ?? {};
    res.setHeader("Cache-Control", "no-store");
    if (!validCoords(points) || (kind !== "route" && kind !== "matrix") ||
      (mode !== "foot" && mode !== "car") || (kind === "matrix" && (mode !== "car" || points.length < 3))) {
      return res.status(400).json({ error: "INVALID_ROUTE_REQUEST" });
    }
    const coords = points.map(p => `${round(p.lng)},${round(p.lat)}`).join(";");
    const path = kind === "route"
      ? `/routed-${mode}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`
      : `/routed-car/table/v1/driving/${coords}?annotations=duration`;
    const key = `${kind}:${mode}:${coords}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) { cacheHits++; return res.json(cached.value); }
    if (cached) cache.delete(key);

    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const recent = (ipHits.get(ip) ?? []).filter(t => now - t < PER_IP_WINDOW_MS);
    if (recent.length >= PER_IP_LIMIT || activeQueue >= MAX_QUEUE) {
      rejectedRequests++;
      res.setHeader("Retry-After", "30");
      return res.status(429).json({ error: "ROUTING_BUSY" });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (dailyBucket !== today) { dailyBucket = today; dailyCount = 0; }
    recent.push(now);
    ipHits.set(ip, recent);
    if (ipHits.size > 500) {
      for (const [k, v] of ipHits) {
        if (!v.some(t => now - t < PER_IP_WINDOW_MS)) ipHits.delete(k);
      }
    }

    ++activeQueue;
    let release!: () => void;
    const turn = new Promise<void>(resolve => { release = resolve; });
    const predecessor = pending;
    pending = turn;
    try {
      await predecessor;
      await sleep(Math.max(0, nextStart - Date.now()));
      nextStart = Date.now() + MIN_INTERVAL_MS;
      const currentDay = new Date().toISOString().slice(0, 10);
      if (dailyBucket !== currentDay) { dailyBucket = currentDay; dailyCount = 0; }
      ++dailyCount;
      ++totalUpstream;
      release();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      try {
        const response = await fetch(UPSTREAM + path, {
          signal: controller.signal,
          headers: {
            "User-Agent": "PlanLogRoutePlanner/1.0 (https://plan-9zef.onrender.com; info: https://github.com/eska-start/plan)",
            "Accept": "application/json",
            "Referer": "https://plan-9zef.onrender.com/",
          },
        });
        if (!response.ok) { failedUpstream++; return res.status(503).json({ error: "ROUTING_UNAVAILABLE" }); }
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || (data as { code?: string }).code !== "Ok")
          { failedUpstream++; return res.status(503).json({ error: "NO_ROUTE" }); }
        const value = kind === "route"
          ? (() => {
              const route = (data as { routes?: Array<{ geometry?: { coordinates?: number[][] }; legs?: Array<{ duration: number; distance: number }>; duration?: number; distance?: number }> }).routes?.[0];
              if (!route?.geometry?.coordinates || route.geometry.coordinates.length > 20000 || route.legs?.length !== points.length - 1) return null;
              return { path: route.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] })), legs: route.legs.map(l => ({ duration: l.duration, distance: l.distance })), duration: route.duration, distance: route.distance };
            })()
          : (() => {
              const rows = (data as { durations?: Array<Array<number | null>> }).durations;
              return rows?.length === points.length && rows.every(row => row.length === points.length) ? { durations: rows } : null;
            })();
        if (!value) { failedUpstream++; return res.status(503).json({ error: "INVALID_ROUTE_RESPONSE" }); }
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
        cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
        return res.json(value);
      } finally { clearTimeout(timeout); }
    } catch {
      failedUpstream++;
      return res.status(503).json({ error: "ROUTING_UNAVAILABLE" });
    } finally {
      release();
      --activeQueue;
    }
  });
}

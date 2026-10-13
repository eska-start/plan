/** OSRM road routing through PlanLog's rate-limited, same-origin server proxy. */
export type RoadPoint = { lat: number; lng: number };
export type RoadLeg = { duration: number; distance: number };
export type RoadRoute = { path: RoadPoint[]; legs: RoadLeg[]; duration: number; distance: number };
export type RoadMode = "car" | "foot";
const MAX_STOPS = 20;
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const LOCAL_PREFIX = "planlog-road-v2:";
const MAX_LOCAL_KEYS = 45;
function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { expires: number; data: T };
    if (!saved || saved.expires < Date.now()) {
      localStorage.removeItem(LOCAL_PREFIX + key);
      return null;
    }
    return saved.data;
  } catch { return null; }
}
function store<T>(key: string, data: T) {
  try {
    const storageKey = LOCAL_PREFIX + key;
    const keys = Object.keys(localStorage).filter(x => x.startsWith(LOCAL_PREFIX) && x !== storageKey);
    if (keys.length >= MAX_LOCAL_KEYS) {
      for (const staleKey of keys.slice(0, keys.length - MAX_LOCAL_KEYS + 1)) localStorage.removeItem(staleKey);
    }
    localStorage.setItem(storageKey, JSON.stringify({ expires: Date.now() + CACHE_MS, data }));
  } catch { /* Storage disabled or full; server caching still works. */ }
}

const memo = new Map<string, Promise<RoadRoute | null>>();
const keyOf = (points: RoadPoint[], mode: string) =>
  mode + ":" + points.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");
const valid = (points: RoadPoint[]) =>
  points.length >= 2 && points.length <= MAX_STOPS && points.every(p =>
    Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);

async function submit(kind: "route" | "matrix", points: RoadPoint[], mode: RoadMode): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch("/api/road-routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ kind, points, mode }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export function requestRoadRoute(points: RoadPoint[], mode: RoadMode): Promise<RoadRoute | null> {
  if (!valid(points)) return Promise.resolve(null);
  const key = keyOf(points, mode);
  const existing = memo.get(key);
  if (existing) return existing;
  const stored = readStored<RoadRoute>("route:" + key);
  if (stored && Array.isArray(stored.path) && stored.legs?.length === points.length - 1)
    return Promise.resolve(stored);
  const task = submit("route", points, mode).then((body): RoadRoute | null => {
    if (!body || !Array.isArray(body.path) || !Array.isArray(body.legs) ||
      body.legs.length !== points.length - 1 || !Number.isFinite(body.duration) ||
      !Number.isFinite(body.distance)) return null;
    return body as RoadRoute;
  });
  memo.set(key, task);
  if (memo.size > 120) memo.delete(memo.keys().next().value!);
  void task.then(result => { if (!result) memo.delete(key); else store("route:" + key, result); });
  return task;
}

export async function requestDriveTimeMatrix(points: RoadPoint[]): Promise<number[][] | null> {
  if (!valid(points) || points.length < 3) return null;
  const matrixKey = "matrix:" + keyOf(points, "car");
  const stored = readStored<number[][]>(matrixKey);
  if (stored && stored.length === points.length && stored.every(row => row.length === points.length && row.every(v => v === null || typeof v === "number")))
    return stored.map(row => row.map(v => v === null ? Infinity : v));
  const body = await submit("matrix", points, "car");
  if (!Array.isArray(body?.durations) || body.durations.length !== points.length ||
    !body.durations.every((row: unknown) => Array.isArray(row) && row.length === points.length)) return null;
  const matrix = body.durations.map((row: Array<number | null>) =>
    row.map(x => typeof x === "number" && Number.isFinite(x) ? x : Infinity));
  store(matrixKey, matrix);
  return matrix;
}
export const readableDuration = (seconds: number): string =>
  seconds >= 3600 ? `약 ${Math.floor(seconds / 3600)}시간 ${Math.round((seconds % 3600) / 60)}분` :
    `약 ${Math.max(1, Math.round(seconds / 60))}분`;
export const readableDistance = (meters: number): string =>
  meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;

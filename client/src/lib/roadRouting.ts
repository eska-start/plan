/**
 * Experimental web-only road routing via FOSSGIS's public OSRM demo.
 * Non-commercial light testing ONLY: https://routing.openstreetmap.de/about.html
 * This demo requires attribution, <=1 request/s aggregate and does not guarantee uptime.
 * For production, replace with a dedicated/contracted routing service.
 */
export type RoadPoint = { lat: number; lng: number };
export type RoadLeg = { duration: number; distance: number };
export type RoadRoute = { path: RoadPoint[]; legs: RoadLeg[]; duration: number; distance: number };
export type RoadMode = "car" | "foot";
const memo = new Map<string, Promise<RoadRoute | null>>();
let queue = Promise.resolve();
let lastStarted = 0;
const MAX_STOPS = 20;
const TIMEOUT_MS = 9000;
const round = (n: number) => n.toFixed(5);

export async function requestRoadRoute(points: RoadPoint[], mode: RoadMode): Promise<RoadRoute | null> {
  if (points.length < 2 || points.length > MAX_STOPS ||
      points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) ||
        Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) return null;
  const coordinates = points.map(p => `${round(p.lng)},${round(p.lat)}`).join(";");
  const key = `${mode}:${coordinates}`;
  const previous = memo.get(key);
  if (previous) return previous;

  const task = queue.catch(() => undefined).then(async () => {
    const wait = Math.max(0, 1150 - (Date.now() - lastStarted));
    if (wait) await new Promise<void>(resolve => setTimeout(resolve, wait));
    lastStarted = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const url = `https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      const body = await response.json() as {
        code?: string;
        routes?: Array<{
          geometry?: { coordinates?: number[][] };
          legs?: RoadLeg[];
          duration?: number;
          distance?: number;
        }>;
      };
      const route = body.code === "Ok" ? body.routes?.[0] : undefined;
      const geo = route?.geometry?.coordinates;
      if (!geo?.length || route?.legs?.length !== points.length - 1) return null;
      return {
        path: geo.map(c => ({ lat: c[1]!, lng: c[0]! })),
        legs: route.legs!,
        duration: route.duration ?? 0,
        distance: route.distance ?? 0,
      };
    } catch { return null; }
    finally { clearTimeout(timeout); }
  });
  queue = task.then(() => undefined);
  memo.set(key, task);
  // Don't cache failures; a test can retry after an outage.
  void task.then(result => { if (!result) memo.delete(key); });
  return task;
}
export const readableDuration = (seconds: number): string =>
  seconds >= 3600 ? `약 ${Math.floor(seconds / 3600)}시간 ${Math.round(seconds % 3600 / 60)}분` :
    `약 ${Math.max(1, Math.round(seconds / 60))}분`;
export const readableDistance = (meters: number): string =>
  meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;

/** Drive-time matrix for the explicit Optimize button, only one additional API call. */
export async function requestDriveTimeMatrix(points: RoadPoint[]): Promise<number[][] | null> {
  if (points.length < 3 || points.length > MAX_STOPS ||
      points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) ||
        Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) return null;
  const coords = points.map(p => `${round(p.lng)},${round(p.lat)}`).join(";");
  const task = queue.catch(() => undefined).then(async () => {
    const wait = Math.max(0, 1150 - (Date.now() - lastStarted));
    if (wait) await new Promise<void>(resolve => setTimeout(resolve, wait));
    lastStarted = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const url = `https://routing.openstreetmap.de/routed-car/table/v1/driving/${coords}?annotations=duration`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      const body = await response.json() as { code?: string; durations?: Array<Array<number | null>> };
      if (body.code !== "Ok" || body.durations?.length !== points.length ||
          body.durations.some(row => row.length !== points.length)) return null;
      return body.durations.map(row => row.map(value => value === null ? Infinity : value));
    } catch { return null; }
    finally { clearTimeout(timeout); }
  });
  queue = task.then(() => undefined);
  return task;
}

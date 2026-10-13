/** OSRM road routing through PlanLog's rate-limited, same-origin server proxy. */
export type RoadPoint = { lat: number; lng: number };
export type RoadLeg = { duration: number; distance: number };
export type RoadRoute = { path: RoadPoint[]; legs: RoadLeg[]; duration: number; distance: number };
export type RoadMode = "car" | "foot";
const MAX_STOPS = 20;
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
  const task = submit("route", points, mode).then((body): RoadRoute | null => {
    if (!body || !Array.isArray(body.path) || !Array.isArray(body.legs) ||
      body.legs.length !== points.length - 1 || !Number.isFinite(body.duration) ||
      !Number.isFinite(body.distance)) return null;
    return body as RoadRoute;
  });
  memo.set(key, task);
  if (memo.size > 120) memo.delete(memo.keys().next().value!);
  void task.then(result => { if (!result) memo.delete(key); });
  return task;
}

export async function requestDriveTimeMatrix(points: RoadPoint[]): Promise<number[][] | null> {
  if (!valid(points) || points.length < 3) return null;
  const body = await submit("matrix", points, "car");
  if (!Array.isArray(body?.durations) || body.durations.length !== points.length ||
    !body.durations.every((row: unknown) => Array.isArray(row) && row.length === points.length)) return null;
  return body.durations.map((row: Array<number | null>) =>
    row.map(x => typeof x === "number" && Number.isFinite(x) ? x : Infinity));
}
export const readableDuration = (seconds: number): string =>
  seconds >= 3600 ? `약 ${Math.floor(seconds / 3600)}시간 ${Math.round((seconds % 3600) / 60)}분` :
    `약 ${Math.max(1, Math.round(seconds / 60))}분`;
export const readableDistance = (meters: number): string =>
  meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;

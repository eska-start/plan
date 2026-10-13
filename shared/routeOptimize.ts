export type RoutePoint = { id: number; lat: number; lng: number };
export function distance(a: RoutePoint, b: RoutePoint): number {
  const rad = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, x)));
}
/** Fixed first stop, open route. Exact DP through 12 stops; nearest-neighbor + 2-opt above that. */
export function optimizeRoute(points: RoutePoint[], costs?: number[][]): number[] {
  if (points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) throw new Error("INVALID_COORDINATES");
  const n = points.length;
  if (n < 2) return points.map(p => p.id);
  const m = costs ?? points.map(a => points.map(b => distance(a, b)));
  if (m.length !== n || m.some(row => row.length !== n || row.some(v => !Number.isFinite(v) || v < 0))) throw new Error("INVALID_DISTANCE_MATRIX");
  if (n <= 12) {
    const dp = new Map<string, { cost: number; path: number[] }>();
    dp.set("1:0", { cost: 0, path: [0] });
    for (let mask = 1; mask < (1 << n); mask += 2) for (let end = 0; end < n; end++) {
      const state = dp.get(`${mask}:${end}`); if (!state) continue;
      for (let next = 1; next < n; next++) if (!(mask & (1 << next))) {
        const key = `${mask | (1 << next)}:${next}`, cost = state.cost + m[end][next];
        if (!dp.has(key) || cost < dp.get(key)!.cost) dp.set(key, { cost, path: [...state.path, next] });
      }
    }
    const states = Array.from({ length: n }, (_, end) => dp.get(`${(1 << n) - 1}:${end}`)).filter(s => s !== undefined);
    return states.sort((a, b) => a.cost - b.cost)[0].path.map(i => points[i].id);
  }
  const path = [0], remaining = new Set(points.map((_, i) => i).slice(1));
  while (remaining.size) { const last = path[path.length - 1]; const next = [...remaining].sort((a,b) => m[last][a] - m[last][b])[0]; path.push(next); remaining.delete(next); }
  const cost = (p: number[]) => p.slice(1).reduce((s, index, i) => s + m[p[i]][index], 0);
  let improved = true;
  while (improved) { improved = false; for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
    const candidate = [...path.slice(0, i), ...path.slice(i, j + 1).reverse(), ...path.slice(j + 1)];
    if (cost(candidate) + 0.001 < cost(path)) { path.splice(0, n, ...candidate); improved = true; }
  } }
  return path.map(i => points[i].id);
}

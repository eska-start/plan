import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowDownUp, ArrowUp, Car, Footprints, GripVertical, MapPin, Navigation, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestRoadRoute, requestDriveTimeMatrix, readableDistance, readableDuration, type RoadPoint, type RoadRoute } from "@/lib/roadRouting";

type Point = RoadPoint & { name: string };
const SAMPLE: Point[] = [
  { name: "도쿄역", lat: 35.681236, lng: 139.767125 },
  { name: "니혼바시", lat: 35.683794, lng: 139.773924 },
  { name: "아키하바라", lat: 35.698383, lng: 139.773071 },
];
const MAX_POINTS = 8;
declare global { interface Window { L?: any } }

function leafletReady(): Promise<any> {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    if (!document.getElementById("road-demo-leaflet-css")) {
      const css = document.createElement("link");
      css.id = "road-demo-leaflet-css";
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    const finish = () => window.L ? resolve(window.L) : reject(new Error("지도 라이브러리 로드 실패"));
    const existing = document.getElementById("road-demo-leaflet-js");
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("지도 라이브러리 접속 실패")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "road-demo-leaflet-js";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = finish;
    script.onerror = () => reject(new Error("지도 라이브러리 접속 실패"));
    document.head.appendChild(script);
  });
}

export default function RoadDemo() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const pinLayers = useRef<any[]>([]);
  const routeLayer = useRef<any>(null);
  const requestVersion = useRef(0);
  const dragFromIndex = useRef<number | null>(null);
  const [points, setPoints] = useState<Point[]>(SAMPLE);
  const [mode, setMode] = useState<"car" | "foot">("car");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RoadRoute | null>(null);
  const [notice, setNotice] = useState("지도를 준비하고 있습니다.");

  useEffect(() => {
    let canceled = false;
    leafletReady().then((L) => {
      if (canceled || !container.current) return;
      const m = L.map(container.current).setView([35.690, 139.772], 13);
      map.current = m;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        maxZoom: 19,
      }).addTo(m);
      m.on("click", (e: any) => {
        setPoints((old) => old.length >= MAX_POINTS ? old : [
          ...old,
          {name: "장소 " + (old.length + 1), lat: e.latlng.lat, lng: e.latlng.lng},
        ]);
      });
      setReady(true);
      setNotice("로그인 없이 시험하실 수 있습니다. '도로 경로 계산'을 눌러주세요.");
    }).catch((err) => setNotice("지도 로드 실패: " + String(err)));
    return () => { canceled = true; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!ready || !map.current || !window.L) return;
    pinLayers.current.forEach((pin) => pin.remove());
    pinLayers.current = points.map((p, i) => {
      const icon = window.L.divIcon({
        className: "",
        html: '<span style="display:flex;width:34px;height:34px;align-items:center;justify-content:center;background:#6366f1;border:2px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 10px #0003"><b style="transform:rotate(45deg);font-size:12px;color:white">' + (i + 1) + '</b></span>',
        iconSize: [36, 36],
        iconAnchor: [12, 34],
      });
      return window.L.marker([p.lat, p.lng], { icon }).addTo(map.current).bindPopup((i + 1) + ". " + p.name);
    });
    if (points.length > 1) map.current.fitBounds(window.L.latLngBounds(points.map(p => [p.lat,p.lng])), { padding: [25,25] });
  }, [points, ready]);

  const calculate = async () => {
    if (busy || points.length < 2) return;
    const id = ++requestVersion.current;
    setBusy(true);
    setNotice("공개 OSRM 서버에서 도로 경로를 계산하고 있습니다...");
    setResult(null);
    try {
      const route = await requestRoadRoute(points, mode);
      if (requestVersion.current !== id) return;
      routeLayer.current?.remove();
      routeLayer.current = null;
      if (!route) {
        setNotice("OSRM 서버가 응답하지 않거나 경로를 찾지 못했습니다. Google Directions 호출은 없습니다.");
        return;
      }
      setResult(route);
      const path = route.path.map(p => [p.lat, p.lng]);
      routeLayer.current = window.L.polyline(path, { color: "#4f46e5", weight: 5, opacity: 0.9 }).addTo(map.current);
      map.current.fitBounds(window.L.latLngBounds(path), {padding:[20,20]});
      setNotice("실제 도로 경로 계산 성공. Google Directions 호출: 0회");
    } catch(err) {
      setNotice("경로 요청 오류: " + String(err));
    } finally { setBusy(false); }
  };

  const optimize = async () => {
    if (busy || points.length < 3) return;
    const id = ++requestVersion.current;
    setBusy(true);
    setNotice("차량 도로 이동시간 행렬 계산 중...");
    try {
      const times = await requestDriveTimeMatrix(points);
      if (id !== requestVersion.current) return;
      if (!times) { setNotice("이동시간 행렬을 가져올 수 없습니다."); return; }
      let current = 0;
      const remaining = points.slice(1,-1).map((_p,i) => i+1);
      const ordered = [0];
      while (remaining.length) {
        remaining.sort((a,b) => times[current][a] - times[current][b]);
        const next = remaining.shift()!;
        if (!Number.isFinite(times[current][next])) throw new Error("연결되지 않은 도로가 있습니다.");
        ordered.push(next); current = next;
      }
      ordered.push(points.length-1);
      if (!Number.isFinite(times[current][points.length-1])) throw new Error("도착지까지 도로가 연결되지 않았습니다.");
      setPoints(ordered.map(i => points[i]));
      routeLayer.current?.remove(); routeLayer.current=null;
      setResult(null);
      setNotice("도로 이동시간 기준으로 방문 순서를 재정렬했습니다. 경로 계산 버튼으로 확인하세요.");
    } catch(err) { setNotice("동선 정렬 실패: " + String(err)); }
    finally { setBusy(false); }
  };

  const reset = () => {
    ++requestVersion.current;
    setPoints(SAMPLE);setResult(null);
    routeLayer.current?.remove();routeLayer.current=null;
    setNotice("샘플 장소를 복구했습니다.");
  };
  const changed = () => { ++requestVersion.current;setResult(null);routeLayer.current?.remove();routeLayer.current=null; };
  const movePoint = (from: number, to: number) => {
    if (busy || from === to || from < 0 || to < 0 || from >= points.length || to >= points.length) return;
    changed();
    setPoints(current => {
      const next = [...current];
      const [picked] = next.splice(from, 1);
      next.splice(to, 0, picked!);
      return next;
    });
    setNotice("방문 순서를 직접 변경했습니다. '도로 경로 계산'을 누르시면 새 순서대로 계산합니다.");
  };
  return (
    <main className="mx-auto max-w-6xl px-3 sm:px-6 py-5 space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">동선 지도 <span className="text-xs font-medium text-primary ml-1">TEST</span></h1>
          <p className="text-sm text-muted-foreground mt-0.5 break-keep">방문 순서를 변경하면 지도와 도로 경로에 반영됩니다. 로그인 없이 시험할 수 있어요.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button size="sm" variant="outline" onClick={reset} className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> 초기화</Button>
          <Button size="sm" variant="outline" disabled={busy || points.length < 3} onClick={optimize} className="gap-1.5">
            <ArrowDownUp className="h-3.5 w-3.5" /> 동선 최적화
          </Button>
        </div>
      </header>

      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs sm:text-sm text-muted-foreground break-keep" role="status">
        {busy ? "도로 경로 계산 중… " : ""}{notice}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-card p-0.5 gap-0.5">
          <button type="button" onClick={() => {setMode("car");changed();}} aria-pressed={mode==="car"}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode==="car"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted"}`}>
            <Car className="w-3.5 h-3.5" /> 자동차
          </button>
          <button type="button" onClick={() => {setMode("foot");changed();}} aria-pressed={mode==="foot"}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode==="foot"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted"}`}>
            <Footprints className="w-3.5 h-3.5" /> 도보
          </button>
        </div>
        <Button size="sm" disabled={!ready || busy || points.length < 2} onClick={calculate} className="gap-1.5">
          <Navigation className="w-3.5 h-3.5" /> 도로 경로 계산
        </Button>
        {result && <span className="rounded-lg border bg-card px-3 py-1.5 text-xs sm:text-sm font-semibold text-foreground">
          총 {readableDistance(result.distance)} · {readableDuration(result.duration)}
        </span>}
      </div>

      <div className="flex flex-col lg:flex-row lg:gap-4 gap-3 lg:items-start">
        <div className="lg:flex-1 min-w-0">
          <div className="relative rounded-2xl overflow-hidden border border-border shadow-sm bg-muted">
            <div ref={container} className="w-full h-[290px] sm:h-[420px] lg:h-[600px]" />
            <div className="absolute top-3 right-3 z-[500] rounded-lg bg-background/90 px-2.5 py-1.5 text-[11px] text-foreground shadow-sm pointer-events-none">
              <MapPin className="inline w-3 h-3 mr-0.5" /> 지도를 눌러 장소 추가
            </div>
          </div>
        </div>

        <section className="lg:w-[390px] xl:w-[420px] w-full shrink-0 border border-border rounded-2xl bg-card p-3 sm:p-4 space-y-3 shadow-sm lg:max-h-[600px] lg:overflow-y-auto">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">방문 순서</h2>
            <span className="text-[11px] text-muted-foreground">{points.length}개 장소</span>
          </div>
          <p className="text-xs text-muted-foreground break-keep">드래그하거나 ↑ ↓ 버튼으로 자유롭게 이동하세요. 자동 최적화 후에도 변경할 수 있습니다.</p>
          <div className="space-y-1">
            {points.map((point, i) => (
              <div key={point.name + ":" + point.lat + ":" + point.lng} className="space-y-1">
                <div
                  draggable={!busy}
                  onDragStart={e => { if (busy) { e.preventDefault(); return; } dragFromIndex.current = i; e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={e => { if (!busy) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                  onDrop={e => { e.preventDefault(); const from = dragFromIndex.current; dragFromIndex.current = null; if (from !== null) movePoint(from, i); }}
                  onDragEnd={() => { dragFromIndex.current = null; }}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-3 text-sm hover:bg-muted/30 transition-colors"
                >
                  <GripVertical className="w-4 h-4 shrink-0 cursor-grab text-muted-foreground/50" />
                  <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground shrink-0 flex items-center justify-center text-xs font-semibold">{i + 1}</span>
                  <span className="font-medium text-foreground truncate min-w-0 flex-1" title={point.name}>{point.name}</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" aria-label={point.name + " 위로 이동"} disabled={busy || i === 0} onClick={() => movePoint(i, i - 1)}
                      className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-muted disabled:opacity-25"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button type="button" aria-label={point.name + " 아래로 이동"} disabled={busy || i === points.length - 1} onClick={() => movePoint(i, i + 1)}
                      className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-muted disabled:opacity-25"><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button type="button" aria-label={point.name + " 삭제"} disabled={busy} onClick={() => { changed(); setPoints(v => v.filter((_, j) => j !== i)); }}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {i < points.length - 1 && (
                  <div className="flex items-center gap-2 px-2 py-2.5 text-xs text-muted-foreground" aria-label={`${i + 1}번에서 ${i + 2}번으로 이동`}>
                    <div className="w-7 flex justify-center shrink-0"><ArrowDown className="w-3 h-3 text-primary/60" /></div>
                    <span className="shrink-0">{i + 1} → {i + 2} · {mode === "car" ? "차량" : "도보"}</span>
                    <span className="flex-1 border-t border-dashed border-border min-w-2" />
                    {result?.legs?.[i] && result.legs.length === points.length - 1 ? (
                      <span className="font-semibold tabular-nums text-foreground whitespace-nowrap">
                        {readableDistance(result.legs[i]!.distance)} · {readableDuration(result.legs[i]!.duration)}
                      </span>
                    ) : <span className="text-[11px] text-muted-foreground whitespace-nowrap">계산 전</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            전체 {result ? `${readableDistance(result.distance)} · ${readableDuration(result.duration)}` : "경로 계산 전"}
          </div>
        </section>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        이 화면은 독립 테스트용입니다. OpenStreetMap 지도와 OSRM/FOSSGIS 도로 경로 서버를 사용하며, Google Directions API는 호출하지 않습니다.
        기존 플랜로그 웹 지도와 APK는 변경하지 않았습니다.
      </p>
    </main>
  );
}

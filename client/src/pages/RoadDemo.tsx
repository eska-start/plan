import { useEffect, useRef, useState } from "react";
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
    pinLayers.current = points.map((p, i) =>
      window.L.marker([p.lat, p.lng]).addTo(map.current).bindPopup((i + 1) + ". " + p.name)
    );
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
    <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">플랜로그 · 도로경로 테스트</h1>
          <p className="text-sm text-muted-foreground mt-1">로그인·DB·Google API 키 불필요 · 독립 테스트 페이지</p></div>
        <a href="/" className="underline text-sm">일반 로그인 화면</a>
      </div>
      <p className="border rounded-lg px-3 py-2 text-sm bg-muted/50" role="status">{notice}</p>
      <div className="flex flex-wrap gap-2 items-center">
        <select aria-label="교통수단" value={mode} onChange={e=>{setMode(e.target.value as "car"|"foot");changed();}}
          className="border rounded-lg px-3 py-2 bg-background">
          <option value="car">자동차</option><option value="foot">도보</option>
        </select>
        <button type="button" disabled={!ready || busy || points.length<2}
          onClick={calculate} className="bg-indigo-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg font-semibold">도로 경로 계산</button>
        <button type="button" disabled={busy || points.length<3} onClick={optimize}
          className="bg-slate-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg">방문 순서 최적화</button>
        <button type="button" onClick={reset} className="border rounded-lg px-4 py-2">초기화</button>
        {busy && <span className="text-sm">계산 중...</span>}
      </div>
      <div ref={container} className="w-full h-[55vh] min-h-[340px] rounded-xl border overflow-hidden" />
      {result && <p className="font-semibold">도로 이동거리 {readableDistance(result.distance)} · 예상 이동시간 {readableDuration(result.duration)}</p>}
      <div className="border rounded-xl p-3 space-y-2">
        <p className="font-semibold">방문 지점 (최대 8개 · 지도 클릭으로 추가)</p>
        <p className="text-xs text-muted-foreground">PC에서는 목록을 드래그해 옮기거나, 휴대폰에서는 위·아래 버튼으로 순서를 자유롭게 바꾸실 수 있습니다. 자동 최적화 후에도 수동으로 다시 변경 가능합니다.</p>
        {points.map((point, i)=><div key={point.name + ":" + point.lat + ":" + point.lng}
          draggable={!busy} onDragStart={e => { if (busy) {e.preventDefault();return;} dragFromIndex.current = i; e.dataTransfer.effectAllowed="move"; }}
          onDragOver={e => {if (!busy) {e.preventDefault();e.dataTransfer.dropEffect="move";}}}
          onDrop={e => {e.preventDefault();const from=dragFromIndex.current;dragFromIndex.current=null;if(from!==null)movePoint(from,i);}}
          onDragEnd={()=>{dragFromIndex.current=null;}}
          className="flex justify-between items-center gap-3 text-sm border-b py-2 rounded-lg px-2 hover:bg-muted/50">
          <span className="flex items-center gap-2 min-w-0"><span className="cursor-grab text-muted-foreground select-none" title="드래그로 순서 변경">☰</span>
            <span className="font-semibold shrink-0">{i+1}.</span><span className="truncate">{point.name}</span></span>
          <span className="flex gap-1 shrink-0">
            <button type="button" aria-label={point.name+" 위로 이동"} title="위로 이동" disabled={busy||i===0} onClick={()=>movePoint(i,i-1)}
              className="border rounded px-3 py-1 disabled:opacity-30">↑</button>
            <button type="button" aria-label={point.name+" 아래로 이동"} title="아래로 이동" disabled={busy||i===points.length-1} onClick={()=>movePoint(i,i+1)}
              className="border rounded px-3 py-1 disabled:opacity-30">↓</button>
            <button type="button" disabled={busy} className="text-red-600 border rounded px-2 disabled:opacity-30"
              onClick={()=>{changed();setPoints(v=>v.filter((_,j)=>j!==i));}}>삭제</button>
          </span>
        </div>)}
      </div>
      <p className="text-xs text-muted-foreground">
        도로 계산은 OSRM/FOSSGIS 공개 시험 서버를 사용합니다. 지도 배경은 테스트 서버에 Google 키가 없어 OpenStreetMap으로 표시합니다.
        운영 웹버전의 구글 지도는 변경되지 않습니다. 대량 사용·상업 운영은 이 공개 서버에서 지원되지 않습니다.
      </p>
    </main>
  );
}

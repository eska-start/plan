import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { FreeMap, type Pin } from "@/components/FreeMap";
import { useItineraryByDate, useCreateItineraryItem, useUpdateItineraryItem } from "@/lib/entities";
import { optimizeRoute, distance } from "@shared/routeOptimize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type PlanStop = { id: number; name: string; time: string; order: number };
export default function LocalMapTab({ tripId, tripDays }: { tripId: number; tripDays: Date[] }) {
  const [date, setDate] = useState(() => format(tripDays[0] ?? new Date(), "yyyy-MM-dd"));
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlanStop[] | null>(null);
  const [method, setMethod] = useState("");
  const [route, setRoute] = useState<[number, number][]>([]);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const applying = useRef(false);
  const { data: items, isLoading, error } = useItineraryByDate(tripId, date);
  const create = useCreateItineraryItem({ onSuccess: () => { setPicked(null); setName(""); toast.success("핀을 일정에 추가했습니다."); }, onError: () => toast.error("장소 저장에 실패했습니다.") });
  const update = useUpdateItineraryItem();
  const pins = useMemo<Pin[]>(() => (items ?? []).filter(item => item.lat != null && item.lng != null && item.lat !== "" && item.lng !== "" && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)) && Math.abs(Number(item.lat)) <= 90 && Math.abs(Number(item.lng)) <= 180).map(item => ({ id: item.id, lat: Number(item.lat), lng: Number(item.lng), name: item.placeName, address: item.address })), [items]);
  useEffect(() => { if (applying.current) return; generation.current++; abort.current?.abort(); setPlan(null); setRoute([]); setBusy(false); }, [date, items]);
  useEffect(() => () => { generation.current++; abort.current?.abort(); }, []);

  const optimize = async () => {
    if (busy) return;
    if (pins.length < 2) { toast.error("핀을 두 곳 이상 등록해주세요."); return; }
    if (pins.length !== items?.length) { toast.error("좌표가 없는 장소가 있습니다. 해당 장소의 위치를 핀으로 지정해주세요."); return; }
    if (pins.length > 25) { toast.error("한 번에 25곳까지 최적화할 수 있습니다."); return; }
    if (!/^\d{2}:\d{2}$/.test(startTime)) { toast.error("출발 시간을 입력해주세요."); return; }
    const current = ++generation.current;
    const controller = new AbortController(); abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 12000);
    setBusy(true); setPlan(null);
    try {
      let matrix: number[][];
      let label = "자동차 도로 이동시간 기준";
      const coordinates = pins.map(p => `${p.lng},${p.lat}`).join(";");
      try {
        const response = await fetch(`https://router.project-osrm.org/table/v1/driving/${coordinates}?annotations=duration`, { signal: controller.signal });
        if (!response.ok) throw new Error("ROAD_SERVICE_FAILED");
        const data = await response.json();
        if (data.code !== "Ok" || !Array.isArray(data.durations) || data.durations.length !== pins.length || data.durations.some((row: unknown[]) => !Array.isArray(row) || row.length !== pins.length || row.some(v => typeof v !== "number" || !Number.isFinite(v)))) throw new Error("NO_ROAD_ROUTE");
        matrix = data.durations;
      } catch {
        if (generation.current !== current) return;
        matrix = pins.map(a => pins.map(b => distance(a, b) / (30 * 1000 / 3600)));
        label = "도로 정보 없음: 직선거리·시속 30km 기준 추정";
      }
      if (generation.current !== current) return;
      const ids = optimizeRoute(pins, matrix);
      let minutes = Number(startTime.slice(0,2)) * 60 + Number(startTime.slice(3));
      const stops = ids.map((id, order) => {
        if (order > 0) {
          const previous = items!.find(i => i.id === ids[order - 1]);
          minutes += (previous?.duration ?? 60) + Math.ceil(matrix[pins.findIndex(p => p.id === ids[order-1])][pins.findIndex(p => p.id === id)] / 60);
        }
        const time = `${String(Math.floor(minutes / 60)).padStart(2,"0")}:${String(minutes % 60).padStart(2,"0")}`;
        return { id, order, name: pins.find(p => p.id === id)!.name, time };
      });
      if (minutes >= 1440) throw new Error("DAY_OVERFLOW");
      setMethod(label + (pins.length > 12 ? " · 근사 최적화" : " · 첫 장소 고정")); setPlan(stops);
      setRoute(ids.map(id => { const p = pins.find(p => p.id === id)!; return [p.lat, p.lng]; }));
    } catch (e) { if (generation.current === current) toast.error(e instanceof Error && e.message === "DAY_OVERFLOW" ? "일정이 자정을 넘습니다. 장소나 체류 시간을 줄여주세요." : "일정 계산에 실패했습니다."); }
    finally { clearTimeout(timer); if (generation.current === current) setBusy(false); }
  };
  const apply = async () => {
    if (!plan || busy) return;
    applying.current = true; setBusy(true);
    try {
      // Writes happen only after the user reviews the proposed schedule.
      for (const stop of plan) await update.mutateAsync({ id: stop.id, order: stop.order, visitTime: stop.time });
      setPlan(null); toast.success("방문 순서와 시간을 일정에 반영했습니다.");
    } catch { toast.error("일정 저장에 실패했습니다. 저장된 내용을 확인해주세요."); }
    finally { applying.current = false; setBusy(false); }
  };
  const [placingId, setPlacingId] = useState<number | null>(null);
  return <div className="space-y-3">
    <h2 className="text-lg font-semibold">지도 · 일정 최적화</h2>
    <p className="text-sm text-muted-foreground">지도를 눌러 핀을 추가하세요. 목록의 첫 장소를 출발점으로 사용합니다.</p>
    <select aria-label="일정 날짜" value={date} disabled={busy} onChange={e => { setDate(e.target.value); setPicked(null); setPlacingId(null); }} className="border rounded p-2">{tripDays.map(d => <option key={format(d,"yyyy-MM-dd")} value={format(d,"yyyy-MM-dd")}>{format(d,"M월 d일")}</option>)}</select>
    {error && <p role="alert">일정을 불러오지 못했습니다.</p>}
    <FreeMap pins={plan ? plan.map(stop => pins.find(pin => pin.id === stop.id)!) : pins} route={route} onPick={(lat,lng) => { if (!busy) setPicked({lat,lng}); }} />
    {picked && <div className="border rounded-xl p-3 space-y-2">
      <p className="text-xs">{picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}</p>
      <Input aria-label="장소명" value={name} onChange={e => setName(e.target.value)} placeholder="방문 장소 이름" />
      <Button disabled={create.isPending || update.isPending || (!placingId && !name.trim())} onClick={async () => {
        if (placingId) { try { await update.mutateAsync({id:placingId,lat:String(picked.lat),lng:String(picked.lng)}); setPlacingId(null); setPicked(null); toast.success("위치를 지정했습니다."); } catch { toast.error("위치 저장 실패"); } }
        else create.mutate({tripId,date,placeName:name.trim(),lat:String(picked.lat),lng:String(picked.lng),duration:60,order:items?.length ?? 0});
      }}>{placingId ? "이 장소의 위치로 저장" : "핀을 일정에 추가"}</Button>
      <Button variant="outline" onClick={() => { setPicked(null); setPlacingId(null); }}>취소</Button>
    </div>}
    {isLoading ? <p>일정 로딩 중...</p> : <ol className="space-y-2">{items?.map((item,index) => <li key={item.id} className="border rounded p-3">
      <p>{index+1}. {item.placeName} {item.visitTime ? `· ${item.visitTime}` : ""}</p>
      {item.address && <p className="text-xs break-words">{item.address}</p>}
      <label className="flex items-center gap-2 text-xs">체류 시간(분)<Input type="number" min={0} max={1440} defaultValue={item.duration ?? 60} disabled={busy} className="w-24" onBlur={e => { const duration = Number(e.target.value); if (Number.isFinite(duration) && duration >= 0 && duration <= 1440 && duration !== item.duration) void update.mutateAsync({id:item.id,duration}).catch(() => toast.error("체류 시간 저장 실패")); }} /></label>
      {!pins.some(pin => pin.id === item.id) && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setPlacingId(item.id); setName(item.placeName); setPicked(null); toast.info("지도에서 이 장소의 위치를 눌러주세요."); }}>핀 위치 지정</Button>}
    </li>)}</ol>}
    <div className="flex gap-2 items-center"><label htmlFor="route-start">출발 시간</label><Input id="route-start" type="time" value={startTime} onChange={e => { setStartTime(e.target.value); setPlan(null); }} className="w-28" disabled={busy} /><Button disabled={busy || pins.length<2} onClick={() => void optimize()}>{busy ? "처리 중..." : "일정 최적화"}</Button></div>
    {placingId && !picked && <p role="status">{name}의 위치를 지도에서 선택해주세요.</p>}
    {plan && <div className="border rounded-xl p-3 space-y-2"><p className="text-xs">{method}</p><p className="text-xs">지도 선은 방문 순서 연결선입니다.</p><p className="text-xs">기존 방문 시간이 아래 시간으로 변경됩니다. 체류 시간 미입력 시 60분을 사용합니다.</p>{plan.map(stop => <p key={stop.id}>{stop.time} · {stop.name}</p>)}<Button disabled={busy} onClick={() => void apply()}>확인 후 일정에 반영</Button></div>}
  </div>;
}

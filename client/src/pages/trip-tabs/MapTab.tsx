import { trpc } from "@/lib/trpc";
import { useItineraryByDate, useReorderItinerary, useTrip } from "@/lib/entities";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { FreeMap, type Pin } from "@/components/FreeMap";
import { geocodePlace } from "@/lib/freeGeocode";
import { optimizeRoute } from "@shared/routeOptimize";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { MapPin, Navigation, Loader2, CheckCircle2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const CATEGORY_COLORS: Record<string, string> = {
  place: "#6366f1",
  food: "#f97316",
  activity: "#22c55e",
  shopping: "#a855f7",
};

const CATEGORY_LABELS: Record<string, string> = {
  place: "장소",
  food: "음식",
  activity: "활동",
  shopping: "쇼핑",
};

type ItemType = {
  id: number;
  placeName: string;
  address?: string | null;
  visitTime?: string | null;
  visited?: boolean | null;
  category?: string | null;
  lat?: string | null;
  lng?: string | null;
  order?: number | null;
  sourceType?: string | null;
};

// 드래그 가능한 방문 순서 아이템
function SortableVisitItem({
  item,
  index,
  total,
}: {
  item: ItemType;
  index: number;
  total: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const color = CATEGORY_COLORS[item.category ?? "place"] ?? "#6366f1";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 bg-card border rounded-xl px-3 py-3 transition-shadow ${
        isDragging ? "shadow-lg ring-2 ring-primary/30" : ""
      } ${item.visited ? "opacity-60" : ""}`}
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none p-0.5 shrink-0"
        aria-label="순서 변경"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* 번호 뱃지 */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
        style={{ backgroundColor: color }}
      >
        {index + 1}
      </div>

      {/* 장소 정보 */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${item.visited ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {item.placeName}
        </p>
        {item.address && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{item.address}</span>
          </p>
        )}
      </div>

      {/* 우측 정보 */}
      <div className="flex items-center gap-2 shrink-0">
        {item.visitTime && (
          <span className="text-xs text-muted-foreground">{item.visitTime}</span>
        )}
        {item.visited && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        {index < total - 1 && (
          <Navigation className="w-3.5 h-3.5 text-muted-foreground/30" />
        )}
      </div>
    </div>
  );
}

export default function MapTab({ tripId, tripDays }: { tripId: number; tripDays: Date[] }) {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (tripDays.length > 0) return format(tripDays[0], "yyyy-MM-dd");
    return format(new Date(), "yyyy-MM-dd");
  });

  const [pins,setPins]=useState<Pin[]>([]);
  const [geocoding,setGeocoding]=useState(false);
  const [missingLocations,setMissingLocations]=useState(0);
  const [optimizing,setOptimizing]=useState(false);
  const {data:trip}=useTrip(tripId);

  // 로컬 순서 상태 (드래그 즉시 반영)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);

  const utils = trpc.useUtils();

  const { data: serverItems, isLoading } = useItineraryByDate(
    tripId, selectedDate, true,
    { refetchInterval: 3000 }
  );

  // 서버 데이터 수신 시 로컬 순서 초기화 (드래그 중이 아닐 때만)
  useEffect(() => {
    setLocalOrder(null);
  }, [selectedDate, serverItems]);

  // 표시할 아이템 (로컬 순서 우선)
  const items: ItemType[] = useMemo(() => {
    if (!serverItems) return [];
    if (!localOrder) return serverItems as ItemType[];
    const map = new Map((serverItems as ItemType[]).map(i => [i.id, i]));
    return localOrder.map(id => map.get(id)).filter((x): x is ItemType => x !== undefined);
  }, [serverItems, localOrder]);

  const reorderMutation = useReorderItinerary({
    onSuccess: () => {
      utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
    },
    onError: () => {
      toast.error("순서 저장에 실패했습니다.");
      setLocalOrder(null);
    },
  });

  // dnd-kit 센서
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 드래그 종료 핸들러
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentIds = items.map(i => i.id);
    const oldIndex = currentIds.indexOf(active.id as number);
    const newIndex = currentIds.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(currentIds, oldIndex, newIndex);

    // 로컬 즉시 반영
    setLocalOrder(newOrder);

    // 서버 저장 + 일정 탭 캐시 무효화
    reorderMutation.mutate(
      { tripId, orderedIds: newOrder },
      {
        onSuccess: () => {
          utils.itinerary.listByDate.invalidate({ tripId, date: selectedDate });
          toast.success("방문 순서가 저장되었습니다.");
        },
      }
    );
  }, [items, reorderMutation, tripId, selectedDate, utils]);

  useEffect(()=>{
    const controller=new AbortController();
    setGeocoding(true);setPins([]);setMissingLocations(0);
    void (async()=>{
      const resolved:Pin[]=[];let missing=0;
      for(const item of items){
        let position=item.lat && item.lng && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)) ? {lat:Number(item.lat),lng:Number(item.lng)}:null;
        if(!position){
          const place=item.placeName.replace(/^🏨\s*(?:체크인|체크아웃|숙박)\s*[—-]\s*/,"");
          const query=item.address?.trim() || [place,trip?.destination].filter(Boolean).join(" ");
          position=await geocodePlace(query,controller.signal);
        }
        if(controller.signal.aborted)return;
        if(position)resolved.push({id:item.id,name:item.placeName,address:item.address,...position});else missing++;
      }
      if(!controller.signal.aborted){setPins(resolved);setMissingLocations(missing);setGeocoding(false);}
    })();
    return()=>controller.abort();
  },[items,trip?.destination]);
  const optimize=async()=>{
    if(pins.length<2||pins.length!==items.length||optimizing)return;
    setOptimizing(true);
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try{
      let matrix:number[][]|undefined;
      try{
        const coordinates=pins.map(pin=>`${pin.lng},${pin.lat}`).join(";");
        const response=await fetch(`https://router.project-osrm.org/table/v1/driving/${coordinates}?annotations=duration`,{signal:controller.signal});
        if(!response.ok)throw new Error("ROAD_UNAVAILABLE");
        const data=await response.json() as {code:string;durations:number[][]};
        if(data.code!=="Ok"||data.durations.some(row=>row.some(value=>typeof value!=="number"||!Number.isFinite(value))))throw new Error("ROAD_UNAVAILABLE");
        matrix=data.durations;
      }catch{toast.info("도로 정보를 불러오지 못해 직선거리 기준으로 방문 순서를 계산합니다.");}
      const ids=optimizeRoute(pins,matrix);
      setLocalOrder(ids);
      reorderMutation.mutate({tripId,orderedIds:ids},{onSuccess:()=>toast.success("방문 순서를 최적화했습니다.")});
    }catch{toast.error("동선 계산에 실패했습니다.");}finally{clearTimeout(timeout);setOptimizing(false);}
  };
  const orderedPins=items.map(item=>pins.find(pin=>pin.id===item.id)).filter((pin):pin is Pin=>!!pin);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">동선 지도</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          아래 목록에서 드래그해 방문 순서를 변경하면 지도와 일정 탭에 즉시 반영됩니다.
        </p>
      </div>

      {/* 날짜 선택 */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {tripDays.map((day, idx) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isSelected = selectedDate === dateStr;
          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl border transition-all shrink-0 ${
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-foreground border-border hover:border-primary/30 hover:bg-muted/50"
              }`}
            >
              <span className="text-xs font-medium">{format(day, "EEE", { locale: ko })}</span>
              <span className="text-lg font-bold leading-none">{format(day, "d")}</span>
              <span className="text-xs opacity-70">{format(day, "M.d")}</span>
              <span className={`text-xs mt-0.5 ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                Day {idx + 1}
              </span>
            </button>
          );
        })}
      </div>

      {/* 지도 */}
      <div className="rounded-2xl overflow-hidden border border-border shadow-sm relative">
        {(geocoding || isLoading) && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5 shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">지도 로딩 중...</span>
            </div>
          </div>
        )}
        <FreeMap pins={orderedPins} route={orderedPins.map(pin=>[pin.lat,pin.lng])} />
      </div>

      {missingLocations>0 && <p role="status" className="text-sm text-muted-foreground">{missingLocations}개 장소의 위치를 찾지 못했습니다. 등록된 주소를 확인해주세요.</p>}
      <Button disabled={optimizing||geocoding||pins.length<2||pins.length!==items.length||pins.length>25} onClick={()=>void optimize()}>{optimizing?"동선 계산 중...":"방문 순서 최적화"}</Button>

      {/* 방문 순서 목록 (드래그 앤 드롭) */}
      {items && items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              {format(new Date(selectedDate + "T00:00:00"), "M월 d일", { locale: ko })} 방문 순서
            </h3>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <GripVertical className="w-3.5 h-3.5" />
              드래그해서 순서 변경
            </span>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map(i => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {items.map((item, idx) => (
                  <SortableVisitItem
                    key={item.id}
                    item={item}
                    index={idx}
                    total={items.length}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <p className="text-xs text-muted-foreground text-center pt-1">
            순서를 변경하면 지도 마커 번호, 경로, 일정 탭이 자동으로 업데이트됩니다
          </p>
        </div>
      )}

      {(!items || items.length === 0) && !isLoading && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-2xl border border-dashed border-border bg-muted/30">
          <MapPin className="w-8 h-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">이 날의 방문 장소가 없습니다</p>
            <p className="text-xs text-muted-foreground mt-1">일정 탭에서 방문 장소를 추가하면 지도에 표시됩니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}

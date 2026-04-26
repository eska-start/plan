import { trpc } from "@/lib/trpc";
import { Loader2, Plane, Hotel, CalendarDays, StickyNote, Wallet, ArrowRight, CheckSquare, Clock } from "lucide-react";
import { format, parseISO, differenceInDays, isAfter, isBefore } from "date-fns";
import { ko } from "date-fns/locale";
import { useLocation } from "wouter";
import FadeIn from "@/components/FadeIn";

interface Trip {
  id: number;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget?: string | null;
  budgetCurrency?: string | null;
}

interface Props {
  tripId: number;
  trip: Trip;
  tripDays: Date[];
}

const CAT_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  place:         { label: "장소",     bg: "#DEF1EA", color: "#2E6B58" },
  food:          { label: "식사",     bg: "#FDE2D7", color: "#A04A30" },
  activity:      { label: "액티비티", bg: "#DEF1EA", color: "#2E6B58" },
  shopping:      { label: "쇼핑",    bg: "#EDE9FE", color: "#7C3AED" },
  accommodation: { label: "숙박",    bg: "#FBEFCC", color: "#7A5A1E" },
};

function ProgressCard({ icon, label, value, sub, pct, tint }: { icon: React.ReactNode; label: string; value: string; sub: string; pct: number; tint: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: tint + "22", color: tint }}>{icon}</div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="font-display text-2xl font-semibold text-foreground leading-none">{value}</div>
      <div className="space-y-1">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: tint }} />
        </div>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

export default function OverviewTab({ tripId, trip, tripDays }: Props) {
  const [, setLocation] = useLocation();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = parseISO(trip.startDate);
  const endDate = parseISO(trip.endDate);
  const isOngoing = !isAfter(startDate, today) && !isBefore(endDate, today);
  const isPast = isBefore(endDate, today);

  const { data: flights } = trpc.flights.list.useQuery({ tripId });
  const { data: accommodations } = trpc.accommodations.list.useQuery({ tripId });
  const { data: itinerary } = trpc.itinerary.listByTrip.useQuery({ tripId });
  const { data: memos } = trpc.memos.list.useQuery({ tripId });
  const { data: expenses } = trpc.expenses.list.useQuery({ tripId });
  const { data: checklist } = trpc.checklist.list.useQuery({ tripId });

  const upcomingItems = (itinerary ?? [])
    .filter(item => !item.visited && !isBefore(parseISO(item.date), today))
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      if (a.visitTime && b.visitTime) return a.visitTime.localeCompare(b.visitTime);
      return 0;
    })
    .slice(0, 4);

  const pinnedMemo = (memos ?? []).find(m => m.pinned);
  const totalSpent = (expenses ?? []).reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
  const budgetNum = trip.budget ? parseFloat(trip.budget) : null;
  const budgetCurrency = trip.budgetCurrency ?? "KRW";
  const budgetPct = budgetNum && budgetNum > 0 ? Math.min((totalSpent / budgetNum) * 100, 100) : 0;
  const checkDone = (checklist ?? []).filter(i => i.done).length;
  const checkTotal = (checklist ?? []).length;
  const nightsTotal = (accommodations ?? []).reduce((sum, a) => {
    try { return sum + differenceInDays(parseISO(a.checkOut ?? ""), parseISO(a.checkIn ?? "")); }
    catch { return sum; }
  }, 0);
  const fmt = (n: number) => n.toLocaleString("ko-KR");

  const allLoaded = flights !== undefined && accommodations !== undefined && itinerary !== undefined;

  if (!allLoaded) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">불러오는 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Two-column layout */}
      <FadeIn>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

        {/* Left: upcoming items */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-base font-semibold">곧 다가오는 일정</h3>
            <button onClick={() => setLocation(`/trips/${tripId}/journey`)}
              className="text-xs text-primary flex items-center gap-1 hover:underline">
              전체 여정 보기 <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {upcomingItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <CalendarDays className="w-8 h-8 opacity-25" />
              <p className="text-sm">{isPast ? "여행이 완료됐어요" : isOngoing ? "남은 일정이 없어요" : "아직 일정이 없어요"}</p>
              {!isPast && <button onClick={() => setLocation(`/trips/${tripId}/journey`)} className="text-xs text-primary hover:underline mt-1">일정 추가하기</button>}
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingItems.map(item => {
                const s = CAT_STYLE[item.sourceType === "accommodation" ? "accommodation" : (item.category ?? "place")] ?? CAT_STYLE.place;
                let displayDate = item.date;
                try { displayDate = format(parseISO(item.date), "MM.dd (EEE)", { locale: ko }); } catch {}
                return (
                  <div key={item.id} className="flex items-center gap-3 bg-muted/40 rounded-xl px-4 py-3">
                    <div className="w-[68px] shrink-0">
                      <p className="text-xs font-semibold text-primary">{displayDate}</p>
                      {item.visitTime && <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5"><Clock className="w-2.5 h-2.5" />{item.visitTime}</p>}
                    </div>
                    <div className="w-px h-8 bg-border shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                        <p className="text-sm font-semibold truncate">{item.placeName}</p>
                      </div>
                      {(item.address ?? item.memo) && <p className="text-xs text-muted-foreground truncate">{item.address ?? item.memo}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Budget */}
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-semibold">예산 현황</h3>
              <button onClick={() => setLocation(`/trips/${tripId}/budget`)} className="text-xs text-primary flex items-center gap-1 hover:underline">자세히 <ArrowRight className="w-3 h-3" /></button>
            </div>
            {budgetNum != null ? (
              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="font-display text-xl font-semibold">{fmt(Math.round(totalSpent))}</p>
                    <p className="text-xs text-muted-foreground">/ {fmt(budgetNum)} {budgetCurrency}</p>
                  </div>
                  <p className="text-lg font-semibold" style={{ color: budgetPct > 90 ? "#F18A6A" : "#5BB4D8" }}>{Math.round(budgetPct)}%</p>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${budgetPct}%`, background: budgetPct > 90 ? "#F18A6A" : "#5BB4D8" }} />
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground">예산 미설정</p>
                <button onClick={() => setLocation(`/trips/${tripId}/budget`)} className="text-xs text-primary hover:underline mt-1">예산 설정하기</button>
              </div>
            )}
          </div>

          {/* Travel note */}
          <div className="rounded-2xl border bg-[#FBEFCC]/60 p-5 flex-1">
            <h3 className="font-display text-base font-semibold flex items-center gap-2 mb-3">
              <StickyNote className="w-4 h-4 text-[#F2C75A]" /> 여행 노트
            </h3>
            {pinnedMemo ? (
              <div>
                {pinnedMemo.title && <p className="text-sm font-semibold mb-1">"{pinnedMemo.title}"</p>}
                {pinnedMemo.content && <p className="text-sm text-muted-foreground leading-relaxed line-clamp-5">{pinnedMemo.content}</p>}
              </div>
            ) : (
              <div className="text-center py-3">
                <p className="text-sm text-muted-foreground">고정 메모가 없어요</p>
                <button onClick={() => setLocation(`/trips/${tripId}/memory`)} className="text-xs text-primary hover:underline mt-1 block mx-auto">메모 작성하기</button>
              </div>
            )}
          </div>
        </div>
      </div>
      </FadeIn>

      {/* 4 progress cards */}
      <FadeIn delay={0.1}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ProgressCard icon={<Plane className="w-4 h-4" />} label="항공편" value={`${(flights ?? []).length}편`} sub="등록된 항공편" pct={(flights ?? []).length > 0 ? 100 : 0} tint="#5BB4D8" />
          <ProgressCard icon={<Hotel className="w-4 h-4" />} label="숙박" value={`${nightsTotal}박`} sub={`${(accommodations ?? []).length}곳 예약`} pct={(accommodations ?? []).length > 0 ? 100 : 0} tint="#7CC8B0" />
          <ProgressCard icon={<CheckSquare className="w-4 h-4" />} label="준비물" value={`${checkDone}/${checkTotal}`} sub={checkDone === checkTotal && checkTotal > 0 ? "모두 완료!" : `${checkTotal - checkDone}개 남음`} pct={checkTotal > 0 ? (checkDone / checkTotal) * 100 : 0} tint="#F18A6A" />
          <ProgressCard icon={<Wallet className="w-4 h-4" />} label="예산" value={budgetNum != null ? `${Math.round(budgetPct)}%` : `${fmt(Math.round(totalSpent))}`} sub={budgetNum != null ? `${fmt(Math.round(totalSpent))} 사용` : `${budgetCurrency} 기록`} pct={budgetPct} tint="#F2C75A" />
        </div>
      </FadeIn>
    </div>
  );
}

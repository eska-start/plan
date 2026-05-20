import { trpc } from "@/lib/trpc";
import { Loader2, Plane, Hotel, CalendarDays, StickyNote, Wallet, ArrowRight, CheckSquare, Clock } from "lucide-react";
import { format, parseISO, differenceInDays, isAfter, isBefore } from "date-fns";
import { ko } from "date-fns/locale";
import { useLocation } from "wouter";
import FadeIn from "@/components/FadeIn";
import { useEffect, useState } from "react";
import { fetchRates } from "@/utils/currency";
import LinkifiedText from "@/components/LinkifiedText";

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
  const [krwRates, setKrwRates] = useState<Record<string, number> | null>(null);
  const [budgetViewMode, setBudgetViewModeState] = useState<"total" | "ontrip">(() => {
    try { return (localStorage.getItem(`budget-view-${tripId}`) as "total" | "ontrip") ?? "total"; } catch { return "total"; }
  });
  function setBudgetViewMode(mode: "total" | "ontrip") {
    setBudgetViewModeState(mode);
    try { localStorage.setItem(`budget-view-${tripId}`, mode); } catch {}
  }
  const queryOptions = { staleTime: 30_000, refetchOnWindowFocus: false } as const;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = parseISO(trip.startDate);
  const endDate = parseISO(trip.endDate);
  const isOngoing = !isAfter(startDate, today) && !isBefore(endDate, today);
  const isPast = isBefore(endDate, today);

  const { data: flights } = trpc.flights.list.useQuery({ tripId }, queryOptions);
  const { data: accommodations } = trpc.accommodations.list.useQuery({ tripId }, queryOptions);
  const { data: itinerary } = trpc.itinerary.listByTrip.useQuery({ tripId }, queryOptions);
  const { data: memos } = trpc.memos.list.useQuery({ tripId }, queryOptions);
  const { data: expenses } = trpc.expenses.list.useQuery({ tripId }, queryOptions);
  const { data: checklist } = trpc.checklist.list.useQuery({ tripId }, queryOptions);

  const budgetCurrency = trip.budgetCurrency ?? "KRW";

  useEffect(() => {
    if (!expenses) return;
    const hasNonBase = expenses.some(e => e.currency && e.currency !== budgetCurrency);
    if (!hasNonBase || krwRates) return;
    fetchRates("KRW").then(r => setKrwRates(r)).catch(() => {});
  }, [expenses, budgetCurrency]);

  function toBase(amount: number, expCurrency: string): number {
    if (expCurrency === budgetCurrency) return amount;
    if (!krwRates) return amount;
    if (budgetCurrency === "KRW") {
      const rate = krwRates[expCurrency.toLowerCase()];
      return rate ? Math.round(amount / rate) : amount;
    }
    return amount;
  }

  const upcomingItems = (itinerary ?? [])
    .filter(item => !item.visited && !isBefore(parseISO(item.date), today))
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      if (a.visitTime && b.visitTime) return a.visitTime.localeCompare(b.visitTime);
      return 0;
    })
    .slice(0, 4);

  const pinnedMemos = (memos ?? []).filter(m => m.pinned);
  const totalSpent = (expenses ?? []).reduce((s, e) =>
    s + toBase(parseFloat(e.amount ?? "0"), e.currency ?? budgetCurrency), 0);
  const safeTotalSpent = Number.isFinite(totalSpent) ? totalSpent : 0;
  function expToKrw(e: { amount?: string | null; currency?: string | null; krwAmount?: string | null }): number {
    if (e.krwAmount) return parseFloat(e.krwAmount);
    const amount = parseFloat(e.amount ?? "0");
    const cur = (e.currency ?? budgetCurrency).toUpperCase();
    if (cur === "KRW") return amount;
    const rate = krwRates?.[cur.toLowerCase()];
    return rate ? amount / rate : amount;
  }
  const onTripExpenses = (expenses ?? []).filter(e => !e.paidBefore);
  const onTripKrw = onTripExpenses.reduce((s, e) => s + expToKrw(e), 0);
  const displaySpent = budgetViewMode === "ontrip" ? onTripKrw : safeTotalSpent;
  const budgetNum = trip.budget ? parseFloat(trip.budget) : null;
  const budgetPct = budgetNum && budgetNum > 0 ? Math.min((displaySpent / budgetNum) * 100, 100) : 0;
  const checkDone = (checklist ?? []).filter(i => i.done).length;
  const checkTotal = (checklist ?? []).length;
  const nightsTotal = (accommodations ?? []).reduce((sum, a) => {
    try { return sum + differenceInDays(parseISO(a.checkOut ?? ""), parseISO(a.checkIn ?? "")); }
    catch { return sum; }
  }, 0);
  const fmt = (n: number) => n.toLocaleString("ko-KR");

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

          {itinerary === undefined ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <p className="text-sm">일정 불러오는 중...</p>
            </div>
          ) : upcomingItems.length === 0 ? (
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
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-semibold">예산 현황</h3>
                <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
                  <button
                    onClick={() => setBudgetViewMode("total")}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${budgetViewMode === "total" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
                  >총</button>
                  <button
                    onClick={() => setBudgetViewMode("ontrip")}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${budgetViewMode === "ontrip" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
                  >현지</button>
                </div>
              </div>
              <button onClick={() => setLocation(`/trips/${tripId}/budget`)} className="text-xs text-primary flex items-center gap-1 hover:underline">자세히 <ArrowRight className="w-3 h-3" /></button>
            </div>
            {budgetNum != null ? (
              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="font-display text-xl font-semibold">{fmt(Math.round(displaySpent))}</p>
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
            {pinnedMemos.length > 0 ? (
              <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                {pinnedMemos.map((memo) => (
                  <div key={memo.id} className="rounded-xl border border-[#F2C75A]/30 bg-white/50 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#F2C75A]/20 text-[#7A5A1E]">고정</span>
                      <div className="min-w-0">
                        {memo.title && <p className="text-sm font-semibold truncate">{memo.title}</p>}
                        {memo.content && (
                          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-3">
                            <LinkifiedText text={memo.content} />
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-3">
                <p className="text-sm text-muted-foreground">고정 메모가 없어요</p>
                <button onClick={() => setLocation(`/trips/${tripId}/memos`)} className="text-xs text-primary hover:underline mt-1 block mx-auto">메모 작성하기</button>
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
          <ProgressCard icon={<Wallet className="w-4 h-4" />} label="예산" value={budgetNum != null ? `${Math.round(budgetPct)}%` : `${fmt(Math.round(displaySpent))}`} sub={budgetNum != null ? `${fmt(Math.round(displaySpent))} 사용` : `${fmt(Math.round(displaySpent))} ${budgetCurrency}`} pct={budgetPct} tint="#F2C75A" />
        </div>
      </FadeIn>
    </div>
  );
}

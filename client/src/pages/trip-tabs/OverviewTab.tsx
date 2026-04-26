import { trpc } from "@/lib/trpc";
import { Loader2, Plane, Hotel, CalendarDays, StickyNote, Wallet, ArrowRight } from "lucide-react";
import { format, parseISO, differenceInDays, isAfter, isBefore, isToday } from "date-fns";
import { ko } from "date-fns/locale";
import { useLocation } from "wouter";

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

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-2xl border p-4 flex items-start gap-3 bg-card`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
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

  const daysUntil = differenceInDays(startDate, today);
  const isOngoing = !isAfter(startDate, today) && !isBefore(endDate, today);
  const isPast = isBefore(endDate, today);

  const { data: flights } = trpc.flights.list.useQuery({ tripId });
  const { data: accommodations } = trpc.accommodations.list.useQuery({ tripId });
  const { data: itinerary } = trpc.itinerary.listByTrip.useQuery({ tripId });
  const { data: memos } = trpc.memos.list.useQuery({ tripId });
  const { data: expenses } = trpc.expenses.list.useQuery({ tripId });

  const upcomingItems = (itinerary ?? [])
    .filter(item => !item.visited && !isBefore(parseISO(item.date), today))
    .slice(0, 4);

  const pinnedMemos = (memos ?? []).filter(m => m.pinned).slice(0, 3);

  const totalSpent = (expenses ?? []).reduce((sum, e) => sum + parseFloat(e.amount ?? "0"), 0);
  const budgetNum = trip.budget ? parseFloat(trip.budget) : null;
  const budgetCurrency = trip.budgetCurrency ?? "KRW";
  const remaining = budgetNum != null ? budgetNum - totalSpent : null;
  const budgetPct = budgetNum && budgetNum > 0 ? Math.min((totalSpent / budgetNum) * 100, 100) : 0;

  const statusLabel = isPast ? "여행 완료" : isOngoing ? "여행 중" : daysUntil === 0 ? "D-Day" : `D-${daysUntil}`;

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="space-y-6">
      {/* D-day banner */}
      <div className="rounded-2xl bg-primary px-5 py-4 text-white flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-white/70 mb-0.5">
            {trip.destination}
          </p>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {isPast ? "여행을 마쳤어요" : isOngoing ? "지금 여행 중이에요" : (
              <>여행까지 <span className="italic">{daysUntil}일</span> 남았어요</>
            )}
          </h2>
          <p className="text-xs text-white/60 mt-1">
            {format(startDate, "yyyy.MM.dd", { locale: ko })} – {format(endDate, "yyyy.MM.dd", { locale: ko })} · {tripDays.length}일
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-3xl font-display font-bold opacity-80">{statusLabel}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Plane className="w-4 h-4 text-primary" />}
          label="항공편"
          value={`${(flights ?? []).length}편`}
          color="bg-[#DBEEF6]"
        />
        <StatCard
          icon={<Hotel className="w-4 h-4 text-indigo-500" />}
          label="숙박"
          value={`${(accommodations ?? []).length}건`}
          color="bg-indigo-50"
        />
        <StatCard
          icon={<CalendarDays className="w-4 h-4 text-[#7CC8B0]" />}
          label="일정"
          value={`${(itinerary ?? []).length}개`}
          color="bg-[#DEF1EA]"
        />
        <StatCard
          icon={<Wallet className="w-4 h-4 text-[#F18A6A]" />}
          label="지출"
          value={`${fmt(Math.round(totalSpent))}`}
          sub={budgetNum ? `/ ${fmt(budgetNum)} ${budgetCurrency}` : budgetCurrency}
          color="bg-[#FDE2D7]"
        />
      </div>

      {/* Budget bar */}
      {budgetNum != null && (
        <div className="rounded-2xl border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">예산 현황</span>
            <button
              onClick={() => setLocation(`/trips/${tripId}/budget`)}
              className="text-xs text-primary flex items-center gap-1 hover:underline"
            >
              자세히 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>지출 {fmt(Math.round(totalSpent))} {budgetCurrency}</span>
            <span>{remaining != null ? `잔여 ${fmt(Math.round(remaining))} ${budgetCurrency}` : ""}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${budgetPct}%`,
                background: budgetPct > 90 ? "#F18A6A" : "#5BB4D8",
              }}
            />
          </div>
        </div>
      )}

      {/* Upcoming itinerary */}
      {upcomingItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">다가오는 일정</h3>
            <button
              onClick={() => setLocation(`/trips/${tripId}/journey`)}
              className="text-xs text-primary flex items-center gap-1 hover:underline"
            >
              전체 보기 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {upcomingItems.map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                <div className="w-14 text-right shrink-0">
                  <p className="text-xs font-medium text-primary">
                    {format(parseISO(item.date), "MM.dd", { locale: ko })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(parseISO(item.date), "EEE", { locale: ko })}
                  </p>
                </div>
                <div className="w-px h-8 bg-border shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.placeName}</p>
                  {item.visitTime && <p className="text-xs text-muted-foreground">{item.visitTime}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pinned memos */}
      {pinnedMemos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5 text-[#F2C75A]" /> 고정 메모
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {pinnedMemos.map(memo => (
              <div key={memo.id} className="rounded-xl border bg-[#FBEFCC]/60 px-4 py-3">
                {memo.title && <p className="text-xs font-semibold text-foreground mb-1">{memo.title}</p>}
                {memo.content && <p className="text-xs text-muted-foreground line-clamp-3">{memo.content}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!flights && !accommodations && !itinerary && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <p className="text-sm">불러오는 중...</p>
        </div>
      )}
    </div>
  );
}

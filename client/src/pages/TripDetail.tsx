import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Loader2, ArrowLeft, Plane, Hotel, CalendarDays, BookOpen, Map, Users, Download, Bot, LayoutDashboard, Wallet, ClipboardList, DollarSign, AlignLeft, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO, differenceInDays, eachDayOfInterval } from "date-fns";
import { ko } from "date-fns/locale";
import OverviewTab from "./trip-tabs/OverviewTab";
import FlightsTab from "./trip-tabs/FlightsTab";
import StaysTab from "./trip-tabs/StaysTab";
import ItineraryTab from "./trip-tabs/ItineraryTab";
import ScheduleTab from "./trip-tabs/ScheduleTab";
import DiaryTab from "./trip-tabs/DiaryTab";
import MemosTab from "./trip-tabs/MemosTab";
import MapTab from "./trip-tabs/MapTab";
import BudgetTab from "./trip-tabs/BudgetTab";
import ChecklistTab from "./trip-tabs/ChecklistTab";
import ExchangeTab from "./trip-tabs/ExchangeTab";
import { ShareDialog } from "@/components/ShareDialog";
import { AiImportDialog } from "@/components/AiImportDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

const TABS = [
  { id: "overview", label: "오버뷰", icon: LayoutDashboard },
  { id: "journey", label: "타임라인", icon: CalendarDays },
  { id: "schedule", label: "일정", icon: AlignLeft },
  { id: "flights", label: "항공편", icon: Plane },
  { id: "stays", label: "숙박·이동", icon: Hotel },
  { id: "map", label: "지도", icon: Map },
  { id: "budget", label: "예산", icon: Wallet },
  { id: "exchange", label: "환율", icon: DollarSign },
  { id: "checklist", label: "체크리스트", icon: ClipboardList },
  { id: "memos", label: "메모", icon: StickyNote },
  { id: "memory", label: "기억", icon: BookOpen },
];

export default function TripDetail() {
  const params = useParams<{ id: string; tab?: string }>();
  const [, setLocation] = useLocation();
  const [shareOpen, setShareOpen] = useState(false);
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const tripId = parseInt(params.id);
  const activeTab = params.tab || "overview";
  const { user } = useAuth();
  const isGuestUser = user?.loginMethod === "guest";

  const { data: trip, isLoading, error, refetch, isFetching } = trpc.trips.get.useQuery(
    { id: tripId },
    {
      retry: 1,
      retryDelay: 1_000,
      refetchOnWindowFocus: true,
    }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isUnauthorized = error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED";

  // 데이터가 전혀 없고 에러인 경우만 에러 화면 노출 (기존 데이터가 있으면 화면 유지)
  if (error && !trip) {
    if (isUnauthorized) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <p className="text-muted-foreground text-sm">로그인이 필요합니다.</p>
          <Button variant="outline" size="sm" onClick={() => setLocation("/")}>홈으로</Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <p className="text-muted-foreground text-sm text-center">서버 연결이 지연되고 있어요. 잠시 후 다시 시도해주세요.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "다시 시도 중..." : "다시 시도"}
        </Button>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground text-sm">여행을 찾을 수 없습니다.</p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/")}>돌아가기</Button>
      </div>
    );
  }

  const duration = differenceInDays(parseISO(trip.endDate), parseISO(trip.startDate)) + 1;
  const tripDays = eachDayOfInterval({ start: parseISO(trip.startDate), end: parseISO(trip.endDate) });

  const formatDate = (d: string) => {
    try { return format(parseISO(d), "yyyy.MM.dd", { locale: ko }); }
    catch { return d; }
  };

  const coverColor = trip.coverColor ?? "#1e293b";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Trip Header ── */}
      <div className="relative" style={{ backgroundColor: coverColor }}>
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/20 to-black/60 pointer-events-none" />

        {/* Header content */}
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-4">
          <div className="flex items-start justify-between gap-2">
            <button
              onClick={() => setLocation("/")}
              className="inline-flex items-center gap-1.5 text-white/55 hover:text-white/90 transition-colors text-xs mb-3 group"
            >
              <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
              <span>내 여행</span>
            </button>
            <div className="flex items-center gap-3">
              {/* AI 자동 입력 */}
              <button
                onClick={() => {
                  if (isGuestUser) {
                    toast.info("게스트는 AI 기능을 사용할 수 없어요. 로그인 후 이용해주세요.");
                    return;
                  }
                  setAiImportOpen(true);
                }}
                className="inline-flex items-center gap-1.5 text-white/55 hover:text-white/90 transition-colors text-xs mb-3 group"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>AI 입력</span>
              </button>
              {/* 내보내기 버튼 */}
              <a
                href={`/api/trips/${tripId}/export`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-white/55 hover:text-white/90 transition-colors text-xs mb-3 group"
              >
                <Download className="w-3.5 h-3.5" />
                <span>내보내기</span>
              </a>
              {/* 공유 버튼 */}
              <button
                onClick={() => setShareOpen(true)}
                className="inline-flex items-center gap-1.5 text-white/55 hover:text-white/90 transition-colors text-xs mb-3 group"
              >
                <Users className="w-3.5 h-3.5" />
                <span>공유</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-white/50 text-[10px] font-semibold tracking-[0.15em] uppercase">
              {trip.destination}
            </p>
            <h1 className="text-white text-xl sm:text-2xl font-bold tracking-tight leading-tight">
              {trip.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-white/55 text-xs">
              <span>{formatDate(trip.startDate)}</span>
              <span className="text-white/25">–</span>
              <span>{formatDate(trip.endDate)}</span>
              <span className="bg-white/15 px-2 py-0.5 rounded-full text-white/80 text-[10px] font-medium">
                {duration}일
              </span>
            </div>
            {trip.description && (
              <p className="text-white/40 text-xs leading-relaxed max-w-md pt-0.5">{trip.description}</p>
            )}
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div className="relative z-10 max-w-5xl mx-auto">
          {/* Bottom border line */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-white/10" />
          <div className="flex overflow-x-auto scrollbar-none px-4 sm:px-6">
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setLocation(`/trips/${tripId}/${tab.id}`)}
                  className="relative flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150"
                  style={{
                    color: isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.40)",
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  {/* Active underline — flush to bottom of button */}
                  {isActive && (
                    <span
                      className="absolute left-0 right-0 rounded-full"
                      style={{ bottom: 0, height: "2px", background: "rgba(255,255,255,0.9)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div
        className={`flex-1 mx-auto w-full px-4 sm:px-6 py-5 sm:py-6 ${
          activeTab === "journey" ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        {activeTab === "overview" && <OverviewTab tripId={tripId} trip={trip} tripDays={tripDays} />}
        {activeTab === "schedule" && <ScheduleTab tripId={tripId} tripDays={tripDays} />}
        {activeTab === "journey" && <ItineraryTab tripId={tripId} tripDays={tripDays} isGuestUser={isGuestUser} />}
        {activeTab === "flights" && <FlightsTab tripId={tripId} isGuestUser={isGuestUser} />}
        {activeTab === "stays" && <StaysTab tripId={tripId} isGuestUser={isGuestUser} />}
        {activeTab === "map" && <MapTab tripId={tripId} tripDays={tripDays} />}
        {activeTab === "budget" && <BudgetTab tripId={tripId} trip={trip} isGuestUser={isGuestUser} />}
        {activeTab === "exchange" && <ExchangeTab tripId={tripId} trip={trip} />}
        {activeTab === "checklist" && <ChecklistTab tripId={tripId} isGuestUser={isGuestUser} />}
        {activeTab === "memos" && <MemosTab tripId={tripId} />}
        {activeTab === "memory" && <DiaryTab tripId={tripId} tripDays={tripDays} />}
      </div>

      <ShareDialog
        tripId={tripId}
        tripName={trip.name}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
      <AiImportDialog
        tripId={tripId}
        open={aiImportOpen}
        onOpenChange={setAiImportOpen}
        onSaved={() => {}}
      />
    </div>
  );
}

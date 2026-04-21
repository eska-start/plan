import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { Loader2, ArrowLeft, Plane, Car, Hotel, StickyNote, CalendarDays, BookOpen, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO, differenceInDays, eachDayOfInterval } from "date-fns";
import { ko } from "date-fns/locale";
import FlightsTab from "./trip-tabs/FlightsTab";
import RentalsTab from "./trip-tabs/RentalsTab";
import AccommodationsTab from "./trip-tabs/AccommodationsTab";
import MemosTab from "./trip-tabs/MemosTab";
import ItineraryTab from "./trip-tabs/ItineraryTab";
import DiaryTab from "./trip-tabs/DiaryTab";
import MapTab from "./trip-tabs/MapTab";

const TABS = [
  { id: "flights", label: "항공편", icon: Plane },
  { id: "rentals", label: "렌트카", icon: Car },
  { id: "accommodations", label: "숙박", icon: Hotel },
  { id: "memos", label: "메모", icon: StickyNote },
  { id: "itinerary", label: "일정", icon: CalendarDays },
  { id: "diary", label: "일기", icon: BookOpen },
  { id: "map", label: "지도", icon: Map },
];

export default function TripDetail() {
  const params = useParams<{ id: string; tab?: string }>();
  const [, setLocation] = useLocation();
  const tripId = parseInt(params.id);
  const activeTab = params.tab || "flights";

  const { data: trip, isLoading } = trpc.trips.get.useQuery({ id: tripId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">여행을 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => setLocation("/")}>돌아가기</Button>
      </div>
    );
  }

  const duration = differenceInDays(parseISO(trip.endDate), parseISO(trip.startDate)) + 1;
  const tripDays = eachDayOfInterval({ start: parseISO(trip.startDate), end: parseISO(trip.endDate) });

  const formatDate = (d: string) => {
    try { return format(parseISO(d), "yyyy.MM.dd (EEE)", { locale: ko }); }
    catch { return d; }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Trip Header */}
      <div
        className="relative"
        style={{ backgroundColor: trip.coverColor ?? "#1e293b" }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/60" />
        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-5 pb-6">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            내 여행으로
          </button>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium mb-1">{trip.destination}</p>
              <h1 className="text-white font-serif text-3xl font-semibold tracking-tight mb-2">
                {trip.name}
              </h1>
              <div className="flex items-center gap-3 text-white/70 text-sm">
                <span>{formatDate(trip.startDate)}</span>
                <span>—</span>
                <span>{formatDate(trip.endDate)}</span>
                <span className="bg-white/20 backdrop-blur-sm px-2.5 py-0.5 rounded-full text-white text-xs font-medium">
                  {duration}일
                </span>
              </div>
              {trip.description && (
                <p className="text-white/60 text-sm mt-2 max-w-lg">{trip.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="relative z-10 border-t border-white/10">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex gap-0 overflow-x-auto scrollbar-none">
              {TABS.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setLocation(`/trips/${tripId}/${tab.id}`)}
                    className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${
                      isActive
                        ? "border-white text-white"
                        : "border-transparent text-white/50 hover:text-white/80 hover:border-white/30"
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-6">
        {activeTab === "flights" && <FlightsTab tripId={tripId} />}
        {activeTab === "rentals" && <RentalsTab tripId={tripId} />}
        {activeTab === "accommodations" && <AccommodationsTab tripId={tripId} />}
        {activeTab === "memos" && <MemosTab tripId={tripId} />}
        {activeTab === "itinerary" && <ItineraryTab tripId={tripId} tripDays={tripDays} />}
        {activeTab === "diary" && <DiaryTab tripId={tripId} tripDays={tripDays} />}
        {activeTab === "map" && <MapTab tripId={tripId} tripDays={tripDays} />}
      </div>
    </div>
  );
}

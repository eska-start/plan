import { useAuth } from "@/_core/hooks/useAuth";
import FadeIn from "@/components/FadeIn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { TRPCClientError } from "@trpc/client";
import {
  Plus, Trash2, ArrowRight, Loader2, LogIn, Eye, EyeOff,
  MapPin, Calendar, Plane, Hotel, Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { format, differenceInDays, parseISO, isBefore, isAfter } from "date-fns";
import { ko } from "date-fns/locale";

const COVER_COLORS = [
  "#5BB4D8", "#7CC8B0", "#F18A6A", "#F2C75A",
  "#A07ECF", "#7AA2F7", "#5DA88F", "#FF9E7A",
  "#6EC9E0", "#B7E36A", "#FFB4A2", "#CDB4DB",
];

type TripFormData = {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  coverColor: string;
  description: string;
};
const defaultForm: TripFormData = {
  name: "", destination: "", startDate: "", endDate: "",
  coverColor: COVER_COLORS[0], description: "",
};

const ADMIN_OPEN_ID = "eska";
const ADMIN_LOCAL_OPEN_ID = `local_${ADMIN_OPEN_ID}`;
const NOTICE_STORAGE_KEY = "app-global-notice";
type GlobalNotice = { content: string; updatedAt: string; images?: string[] };
const NOTICE_HIDE_UNTIL_KEY = "app-global-notice-hide-until";

/* ── Auth Screen ──────────────────────────────────────────────────────────── */
function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signupSecret, setSignupSecret] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body = mode === "login" ? { username, password } : { username, password, signupSecret };
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "오류가 발생했습니다."); return; }
      window.location.href = "/";
    } catch { setError("서버에 연결할 수 없습니다."); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 48 48" width="32" height="32" fill="none">
              <path d="M18 11 q0-4 6-4 t6 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-primary"/>
              <rect x="8" y="13" width="32" height="26" rx="5" fill="#DBEEF6"/>
              <rect x="8" y="13" width="32" height="26" rx="5" stroke="currentColor" strokeWidth="2" className="text-primary"/>
              <path d="M8 22 H40" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.4" className="text-primary"/>
              <circle cx="34" cy="30" r="3.4" fill="#F18A6A"/>
            </svg>
          </div>
          <h1 className="font-display text-2xl font-semibold text-foreground mb-1">Voya·journal</h1>
          <p className="text-sm text-muted-foreground">나만의 여행을 기록하고 관리하세요</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex gap-1 mb-5 p-1 bg-muted rounded-xl">
            {(["login", "signup"] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${mode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {m === "login" ? "로그인" : "회원가입"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">아이디</Label>
              <Input placeholder="아이디 입력" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">비밀번호</Label>
              <div className="relative">
                <Input type={showPw ? "text" : "password"} placeholder="비밀번호 입력" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} className="h-10 pr-10" />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">가입 코드</Label>
                <Input placeholder="관리자 코드 입력" value={signupSecret} onChange={e => setSignupSecret(e.target.value)} className="h-10" />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full h-10" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === "login" ? "로그인" : "회원가입"}
            </Button>
          </form>
        </div>

        <div className="mt-4 text-center">
          <a href={getLoginUrl()} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 mx-auto justify-center">
            <LogIn className="w-3.5 h-3.5" /> 게스트로 시작하기
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Small trip card ──────────────────────────────────────────────────────── */
function TripCard({ trip, onClick, onEdit, onDelete }: {
  trip: { id: number; name: string; destination: string; startDate: string; endDate: string; coverColor?: string | null };
  onClick: () => void; onEdit: (e: React.MouseEvent) => void; onDelete: (e: React.MouseEvent) => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = parseISO(trip.startDate);
  const end = parseISO(trip.endDate);
  const isPast = isBefore(end, today);
  const isOngoing = !isAfter(start, today) && !isBefore(end, today);
  const daysUntil = differenceInDays(start, today);
  const duration = differenceInDays(end, start) + 1;

  let badge = "";
  let badgeBg = "";
  if (isOngoing) { badge = "여행 중"; badgeBg = "#7CC8B0"; }
  else if (!isPast) { badge = `D-${daysUntil}`; badgeBg = "#F18A6A"; }

  const fmtDate = (d: string) => { try { return format(parseISO(d), "yyyy.MM.dd", { locale: ko }); } catch { return d; } };

  return (
    <div onClick={onClick} className="group cursor-pointer rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
      {/* Cover */}
      <div className="h-32 relative flex items-end p-4" style={{ backgroundColor: trip.coverColor ?? "#1e293b" }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="relative z-10 flex items-end justify-between w-full gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <MapPin className="w-3 h-3 text-white/70 shrink-0" />
              <span className="text-white/70 text-xs font-medium truncate">{trip.destination}</span>
            </div>
            <h3 className="text-white font-display font-semibold text-base leading-tight truncate">{trip.name}</h3>
          </div>
          <div className="flex flex-col items-end gap-1">
            {badge && (
              <span className="text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: badgeBg }}>
                {badge}
              </span>
            )}
            <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight className="w-3 h-3 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2.5">
          <Calendar className="w-3 h-3 shrink-0" />
          <span className="truncate">{fmtDate(trip.startDate)} — {fmtDate(trip.endDate)}</span>
          <span className="ml-auto shrink-0 text-[10px] font-semibold text-primary bg-primary/8 px-2 py-0.5 rounded-full">{duration}일</span>
        </div>
        <div className="flex items-center justify-between pt-2.5 border-t border-border">
          <span className="text-xs text-muted-foreground">{isPast ? "여행 완료" : isOngoing ? "진행 중" : "예정된 여행"}</span>
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors">수정</button>
            <button onClick={onDelete} className="text-xs text-muted-foreground hover:text-destructive px-1.5 py-1 rounded-md hover:bg-destructive/10 transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Featured trip card ───────────────────────────────────────────────────── */
function FeaturedTripCard({ trip, onClick, onEdit, onDelete }: {
  trip: { id: number; name: string; destination: string; startDate: string; endDate: string; coverColor?: string | null; description?: string | null };
  onClick: () => void; onEdit: (e: React.MouseEvent) => void; onDelete: (e: React.MouseEvent) => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = parseISO(trip.startDate);
  const end = parseISO(trip.endDate);
  const isPast = isBefore(end, today);
  const isOngoing = !isAfter(start, today) && !isBefore(end, today);
  const daysUntil = differenceInDays(start, today);
  const duration = differenceInDays(end, start) + 1;
  const fmtDate = (d: string) => { try { return format(parseISO(d), "yyyy.MM.dd", { locale: ko }); } catch { return d; } };

  const statusLabel = isPast ? "여행 완료" : isOngoing ? "여행 중" : `D-${daysUntil}`;
  const statusBg = isPast ? "#A0B4BE" : isOngoing ? "#7CC8B0" : "#F18A6A";

  return (
    <button onClick={onClick} className="w-full text-left rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-xl transition-all duration-300 group">
      <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr]">
        {/* Cover side */}
        <div className="relative min-h-[200px] md:min-h-[260px] flex items-end p-6" style={{ backgroundColor: trip.coverColor ?? "#1e293b" }}>
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/70" />
          {/* Status badge */}
          <div className="absolute top-5 left-5 flex gap-2 z-10">
            {isOngoing && <span className="text-white text-xs font-bold px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm">진행중인 여행</span>}
            <span className="text-white text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: statusBg }}>{statusLabel}</span>
          </div>
          {/* Edit/Delete buttons */}
          <div className="absolute top-5 right-5 flex gap-1.5 z-10">
            <button onClick={onEdit} className="flex items-center gap-1 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white text-xs font-semibold px-2.5 py-1 rounded-full transition-colors">
              수정
            </button>
            <button onClick={onDelete} className="flex items-center justify-center w-7 h-7 bg-white/20 backdrop-blur-sm hover:bg-red-500/60 text-white rounded-full transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <div className="relative z-10 text-white">
            <p className="text-xs font-semibold tracking-[0.2em] opacity-80 mb-2 uppercase">{trip.destination}</p>
            <h2 className="font-display text-3xl md:text-4xl font-semibold leading-tight tracking-tight">{trip.name}</h2>
            {trip.description && <p className="text-white/60 text-sm mt-2 leading-relaxed max-w-xs">{trip.description}</p>}
          </div>
        </div>

        {/* Details side */}
        <div className="p-5 md:p-6 flex flex-col gap-4 bg-card">
          <DetailRow icon={<Calendar className="w-4 h-4" />} label="여행 일정" value={`${fmtDate(trip.startDate)} — ${fmtDate(trip.endDate)}`} sub={`${duration}일 일정`} />
          <div className="h-px bg-border" />
          <p className="text-xs text-muted-foreground">항공편, 숙박, 일정이 모두 이 여행에 연결되어 있어요.</p>

          <div className="mt-auto">
            <div className="flex items-center justify-between bg-muted/50 rounded-xl px-4 py-3">
              <span className="text-sm text-muted-foreground">{isOngoing ? "지금 여행 중이에요!" : isPast ? "여행 기록 보기" : "여행 준비하기"}</span>
              <span className="flex items-center gap-1.5 text-sm text-primary font-semibold group-hover:gap-2 transition-all">
                여정 보기 <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function DetailRow({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Home ─────────────────────────────────────────────────────────────────── */
export default function Home() {
  const { user, isAuthenticated, loading, slowLoading, logout, error, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [editTrip, setEditTrip] = useState<number | null>(null);
  const [form, setForm] = useState<TripFormData>(defaultForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [noticeEditorOpen, setNoticeEditorOpen] = useState(false);
  const [noticePopupOpen, setNoticePopupOpen] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState("");
  const [globalNotice, setGlobalNotice] = useState<GlobalNotice | null>(null);
  const [noticeImages, setNoticeImages] = useState<string[]>([]);

  const isAdminUser = user?.role === "admin" || user?.openId === ADMIN_OPEN_ID || user?.openId === ADMIN_LOCAL_OPEN_ID;
  const noticeUpdatedLabel = useMemo(() => {
    if (!globalNotice?.updatedAt) return "";
    const parsed = new Date(globalNotice.updatedAt);
    if (Number.isNaN(parsed.getTime())) return "";
    return format(parsed, "yyyy.MM.dd HH:mm");
  }, [globalNotice?.updatedAt]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTICE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as GlobalNotice | null;
      const legacyImages = typeof parsed?.content === "string"
        ? Array.from(parsed.content.matchAll(/!\[[^\]]*\]\((.+)\)/g)).map(match => match[1]).filter(Boolean)
        : [];
      const normalizedContent = (parsed?.content ?? "").replace(/!\[[^\]]*\]\((.+)\)/g, "").trim();
      const normalizedImages = Array.isArray(parsed?.images) ? parsed.images : legacyImages;
      if (!normalizedContent && normalizedImages.length === 0) return;
      setGlobalNotice({ content: normalizedContent, images: normalizedImages, updatedAt: parsed?.updatedAt ?? new Date().toISOString() });
      const hideUntil = localStorage.getItem(NOTICE_HIDE_UNTIL_KEY);
      const todayKey = format(new Date(), "yyyy-MM-dd");
      setNoticePopupOpen(hideUntil !== todayKey);
    } catch {
      // ignore invalid localStorage
    }
  }, []);

  const utils = trpc.useUtils();
  const {
    data: trips,
    isLoading: tripsLoading,
    isFetching: tripsFetching,
    error: tripsError,
    refetch: refetchTrips,
  } = trpc.trips.list.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: 1,
    retryDelay: 1_000,
    refetchOnWindowFocus: true,
  });

  const createMutation = trpc.trips.create.useMutation({
    onSuccess: () => { utils.trips.list.invalidate(); setDialogOpen(false); setForm(defaultForm); toast.success("여행이 생성됐습니다!"); },
    onError: () => toast.error("여행 생성에 실패했습니다."),
  });
  const updateMutation = trpc.trips.update.useMutation({
    onSuccess: () => { utils.trips.list.invalidate(); setDialogOpen(false); setEditTrip(null); setForm(defaultForm); toast.success("수정됐습니다!"); },
    onError: () => toast.error("수정에 실패했습니다."),
  });
  const deleteMutation = trpc.trips.delete.useMutation({
    onSuccess: () => { utils.trips.list.invalidate(); setDeleteConfirm(null); toast.success("삭제됐습니다."); },
    onError: () => toast.error("삭제에 실패했습니다."),
  });
  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      setProfileDialogOpen(false);
      toast.success("닉네임이 변경됐습니다.");
    },
    onError: () => toast.error("닉네임 변경에 실패했습니다."),
  });

  const openCreate = () => { setEditTrip(null); setForm(defaultForm); setDialogOpen(true); };
  const openEdit = (trip: NonNullable<typeof trips>[number], e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTrip(trip.id);
    setForm({ name: trip.name, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, coverColor: trip.coverColor ?? COVER_COLORS[0], description: trip.description ?? "" });
    setDialogOpen(true);
  };
  const handleSubmit = () => {
    if (!form.name.trim() || !form.destination.trim() || !form.startDate || !form.endDate) { toast.error("필수 항목을 모두 입력해주세요."); return; }
    if (editTrip) updateMutation.mutate({ id: editTrip, ...form });
    else createMutation.mutate(form);
  };
  const displayName = user?.name?.trim() || "사용자";
  const saveNotice = () => {
    const content = noticeDraft.trim();
    if (!content && noticeImages.length === 0) {
      toast.error("공지 내용 또는 이미지를 입력해주세요.");
      return;
    }
    try {
      const nextNotice = { content, images: noticeImages, updatedAt: new Date().toISOString() };
      localStorage.setItem(NOTICE_STORAGE_KEY, JSON.stringify(nextNotice));
      localStorage.removeItem(NOTICE_HIDE_UNTIL_KEY);
      setGlobalNotice(nextNotice);
      setNoticeDraft("");
      setNoticeImages([]);
      setNoticeEditorOpen(false);
      setNoticePopupOpen(true);
      toast.success("공지가 등록되었습니다.");
    } catch {
      toast.error("공지 저장에 실패했습니다. 이미지 크기를 줄여 다시 시도해주세요.");
    }
  };
  const removeNotice = () => {
    localStorage.removeItem(NOTICE_STORAGE_KEY);
    localStorage.removeItem(NOTICE_HIDE_UNTIL_KEY);
    setGlobalNotice(null);
    setNoticeDraft("");
    setNoticeImages([]);
    setNoticePopupOpen(false);
    setNoticeEditorOpen(false);
    toast.success("공지가 삭제되었습니다.");
  };
  const hideNoticeToday = () => {
    const todayKey = format(new Date(), "yyyy-MM-dd");
    localStorage.setItem(NOTICE_HIDE_UNTIL_KEY, todayKey);
    setNoticePopupOpen(false);
    toast.success("오늘은 공지를 숨겼습니다.");
  };
  const handleNoticeImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setNoticeImages(prev => [...prev, reader.result as string]);
      toast.success("이미지를 공지에 추가했습니다.");
    };
    reader.onerror = () => toast.error("이미지 업로드에 실패했습니다.");
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
      {slowLoading && (
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">서버를 시작하는 중이에요...</p>
          <p className="text-xs text-muted-foreground/60">첫 접속 시 최대 30초 소요될 수 있습니다</p>
        </div>
      )}
    </div>
  );

  const isUnauthorized = error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED";
  if (!isAuthenticated && !isUnauthorized && error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-muted-foreground text-center">
          인증 정보를 불러오는 중 문제가 발생했어요. 다시 시도해주세요.
        </p>
        <Button onClick={() => void refresh()} className="h-10 px-5">
          다시 시도
        </Button>
      </div>
    );
  }

  if (!isAuthenticated) return <AuthScreen />;

  // Find featured trip: ongoing > nearest upcoming > most recent past
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sortedTrips = [...(trips ?? [])];
  const featuredTrip = sortedTrips.sort((a, b) => {
    const aStart = parseISO(a.startDate); const aEnd = parseISO(a.endDate);
    const bStart = parseISO(b.startDate); const bEnd = parseISO(b.endDate);
    const aOngoing = !isAfter(aStart, today) && !isBefore(aEnd, today);
    const bOngoing = !isAfter(bStart, today) && !isBefore(bEnd, today);
    if (aOngoing && !bOngoing) return -1;
    if (bOngoing && !aOngoing) return 1;
    const aFuture = isAfter(aStart, today); const bFuture = isAfter(bStart, today);
    if (aFuture && bFuture) return differenceInDays(aStart, today) - differenceInDays(bStart, today);
    if (aFuture) return -1;
    if (bFuture) return 1;
    return bStart.getTime() - aStart.getTime();
  })[0];

  const otherTrips = (trips ?? []).filter(t => t.id !== featuredTrip?.id);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "좋은 아침" : hour < 18 ? "안녕하세요" : "좋은 저녁";

  // D-day for next upcoming trip
  const nextTrip = (trips ?? []).filter(t => isAfter(parseISO(t.startDate), today) || (!isBefore(parseISO(t.endDate), today)))
    .sort((a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime())[0];
  const daysLeft = nextTrip && isAfter(parseISO(nextTrip.startDate), today) ? differenceInDays(parseISO(nextTrip.startDate), today) : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <div className="sticky top-0 z-20 px-4 sm:px-6 pt-3 pb-2 bg-background/80 backdrop-blur-sm border-b border-border/50">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 48 48" width="28" height="28" fill="none">
              <path d="M18 11 q0-4 6-4 t6 4" stroke="#5BB4D8" strokeWidth="2.4" strokeLinecap="round"/>
              <rect x="8" y="13" width="32" height="26" rx="5" fill="#DBEEF6"/>
              <rect x="8" y="13" width="32" height="26" rx="5" stroke="#142033" strokeWidth="2"/>
              <path d="M8 22 H40" stroke="#142033" strokeOpacity="0.5" strokeWidth="1.4"/>
              <circle cx="34" cy="30" r="3.4" fill="#F18A6A"/>
            </svg>
            <span className="font-display font-semibold text-foreground tracking-tight">Voya<span className="text-[#F18A6A]">·</span>journal</span>
          </div>

          {/* User */}
          <div className="flex items-center gap-3">
            <Button onClick={openCreate} size="sm" className="gap-1.5 hidden sm:flex">
              <Plus className="w-3.5 h-3.5" />새 여행
            </Button>
            <button
              onClick={() => {
                setNickname(displayName);
                setProfileDialogOpen(true);
              }}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:inline">{displayName}</span>
            </button>
            {isAdminUser && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNoticeDraft(globalNotice?.content ?? "");
                  setNoticeImages(globalNotice?.images ?? []);
                  setNoticeEditorOpen(true);
                }}
              >
                공지사항 관리
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {tripsLoading || (!trips && tripsFetching) ? (
          <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>
        ) : tripsError && !trips ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <p className="text-sm text-muted-foreground text-center">
              여행 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.
            </p>
            <Button variant="outline" onClick={() => void refetchTrips()}>
              다시 시도
            </Button>
          </div>
        ) : !trips || trips.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Plane className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center">
              <h2 className="font-display text-2xl font-semibold text-foreground mb-2">첫 여행을 기록해보세요</h2>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">항공편, 숙박, 일정, 예산까지 모든 여행 기록을 한 곳에서 관리하세요.</p>
            </div>
            <Button onClick={openCreate} size="lg" className="gap-2"><Plus className="w-4 h-4" />첫 여행 만들기</Button>
          </div>
        ) : (
          <>
            {/* Greeting */}
            <FadeIn>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold tracking-widest uppercase mb-1">{greeting}, {displayName.toUpperCase()}</p>
                  <h1 className="font-display text-3xl sm:text-4xl font-semibold text-foreground leading-tight">
                    {daysLeft != null ? (
                      <>다음 여행은 <em className="italic" style={{ color: "#5BB4D8" }}>{daysLeft}일</em> 남았어요.</>
                    ) : nextTrip ? "지금 여행 중이에요!" : "새로운 여행을 계획해보세요."}
                  </h1>
                </div>
                <Button onClick={openCreate} size="sm" className="gap-1.5 shrink-0 self-start mt-1 sm:hidden">
                  <Plus className="w-3.5 h-3.5" />추가
                </Button>
              </div>
            </FadeIn>

            {/* Featured trip */}
            {featuredTrip && (
              <FadeIn delay={0.07}>
                <FeaturedTripCard
                  trip={featuredTrip}
                  onClick={() => setLocation(`/trips/${featuredTrip.id}`)}
                  onEdit={(e) => openEdit(featuredTrip, e)}
                  onDelete={(e) => { e.stopPropagation(); setDeleteConfirm(featuredTrip.id); }}
                />
              </FadeIn>
            )}

            {/* Other trips */}
            {otherTrips.length > 0 && (
              <div>
                <FadeIn delay={0.1}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-display text-xl font-semibold text-foreground">내 여행</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">지난 여행과 예정된 여행들</p>
                    </div>
                  </div>
                </FadeIn>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {otherTrips.map((trip, i) => (
                    <FadeIn key={trip.id} delay={0.13 + i * 0.06}>
                      <TripCard
                        trip={trip}
                        onClick={() => setLocation(`/trips/${trip.id}`)}
                        onEdit={(e) => openEdit(trip, e)}
                        onDelete={(e) => { e.stopPropagation(); setDeleteConfirm(trip.id); }}
                      />
                    </FadeIn>
                  ))}
                  {/* Add card */}
                  <FadeIn delay={0.13 + otherTrips.length * 0.06}>
                    <button onClick={openCreate}
                      className="rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/4 transition-all flex flex-col items-center justify-center gap-3 p-8 min-h-[200px] group w-full h-full">
                      <div className="w-11 h-11 rounded-xl bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                        <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors font-medium">새 여행 추가</span>
                    </button>
                  </FadeIn>
                </div>
              </div>
            )}

            {/* If only one trip, show add card anyway */}
            {otherTrips.length === 0 && featuredTrip && (
              <FadeIn delay={0.14}>
                <button onClick={openCreate}
                  className="w-full rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/4 transition-all flex items-center justify-center gap-3 py-8 group">
                  <div className="w-9 h-9 rounded-xl bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                    <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors font-medium">또 다른 여행 추가하기</span>
                </button>
              </FadeIn>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-5 sm:p-6">
          <DialogHeader className="mb-1">
            <DialogTitle className="text-lg font-semibold">{editTrip ? "여행 수정" : "새 여행 만들기"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">여행 이름 <span className="text-destructive">*</span></Label>
              <Input className="h-10" placeholder="2024 도쿄 여행" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">목적지 <span className="text-destructive">*</span></Label>
              <Input className="h-10" placeholder="일본 도쿄" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">출발일 <span className="text-destructive">*</span></Label>
                <Input className="h-10 w-full min-w-0" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">귀국일 <span className="text-destructive">*</span></Label>
                <Input className="h-10 w-full min-w-0" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">커버 색상</Label>
              <div className="flex gap-2 flex-wrap">
                {COVER_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, coverColor: c }))}
                    className={`w-8 h-8 rounded-lg transition-all ${form.coverColor === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">설명</Label>
              <Textarea className="resize-none" placeholder="여행 메모..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editTrip ? "수정" : "만들기"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile Dialog */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="w-[calc(100%-2rem)] max-w-sm rounded-xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">프로필</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">닉네임</Label>
              <Input
                className="h-10"
                placeholder="표시할 이름"
                value={nickname}
                maxLength={24}
                onChange={e => setNickname(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">닉네임이 설정되면 아이디 대신 닉네임이 표시됩니다.</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => updateProfileMutation.mutate({ name: nickname.trim() })}
                disabled={!nickname.trim() || updateProfileMutation.isPending}
              >
                저장
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => void logout()}
              >
                로그아웃
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notice Popup */}
      <Dialog open={noticePopupOpen && Boolean(globalNotice)} onOpenChange={setNoticePopupOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-4xl rounded-xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">공지사항</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[80vh] overflow-y-auto">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{globalNotice?.content}</p>
            {globalNotice?.images?.length ? (
              <div className="grid grid-cols-1 gap-3">
                {globalNotice.images.map((imageUrl, idx) => (
                  <img key={`notice-image-${idx}`} src={imageUrl} alt={`공지 이미지 ${idx + 1}`} className="w-full max-h-[65vh] rounded-md border object-contain bg-muted/20" />
                ))}
              </div>
            ) : null}
            {noticeUpdatedLabel && <p className="text-xs text-muted-foreground">업데이트: {noticeUpdatedLabel}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={hideNoticeToday}>오늘은 보지 않기</Button>
              <Button variant="outline" onClick={() => setNoticePopupOpen(false)}>닫기</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notice Editor (admin only) */}
      <Dialog open={noticeEditorOpen && isAdminUser} onOpenChange={setNoticeEditorOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">공지사항 관리</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={noticeDraft}
              onChange={e => setNoticeDraft(e.target.value)}
              rows={6}
              placeholder="공지 내용을 입력하세요."
              className="resize-none"
            />
            <Input type="file" accept="image/*" onChange={handleNoticeImageUpload} />
            {noticeImages.length > 0 && <p className="text-xs text-muted-foreground">이미지 {noticeImages.length}개 첨부됨</p>}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={saveNotice}>공지 저장/팝업 표시</Button>
              <Button variant="destructive" className="flex-1" onClick={removeNotice} disabled={!globalNotice}>공지 삭제</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-xl p-5 sm:p-6">
          <DialogHeader><DialogTitle className="text-lg font-semibold">여행 삭제</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mt-1 mb-4">이 여행의 모든 기록이 함께 삭제됩니다. 계속하시겠습니까?</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>취소</Button>
            <Button variant="destructive" className="flex-1" onClick={() => deleteConfirm !== null && deleteMutation.mutate({ id: deleteConfirm })} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}삭제
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

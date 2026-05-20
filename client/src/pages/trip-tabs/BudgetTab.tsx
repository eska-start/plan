import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { Plus, Wallet, TrendingUp, PiggyBank, Trash2, X, Loader2, Camera, FileText, Sparkles, RefreshCw, Image as ImageIcon, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import FadeIn from "@/components/FadeIn";
import { fetchHistoricalRate, fetchRates, CURRENCY_FLAGS, CURRENCY_NAMES } from "@/utils/currency";
import { toast } from "sonner";

interface Trip {
  id: number; name: string;
  budget?: string | null; budgetCurrency?: string | null;
}
interface Props { tripId: number; trip: Trip; tripDays?: Date[]; isGuestUser?: boolean; }

const CATEGORIES = ["항공", "숙박", "식비", "교통", "쇼핑", "액티비티", "기타"] as const;
type Category = typeof CATEGORIES[number];

const CAT_COLORS: Record<string, string> = {
  항공: "#5BB4D8", 숙박: "#7CC8B0", 식비: "#F18A6A", 교통: "#F2C75A",
  쇼핑: "#A07ECF", 액티비티: "#5DA88F", 기타: "#A0B4BE",
};

const CURRENCIES = ["KRW", "JPY", "USD", "EUR", "CNY", "THB", "VND", "SGD", "HKD", "TWD", "AUD", "GBP"];

function fmt(n: number, currency = "KRW") {
  return n.toLocaleString(currency === "KRW" || currency === "JPY" ? "ko-KR" : "en-US");
}

function resizeImageBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1400; let { width, height } = img;
      if (width > MAX || height > MAX) { if (width > height) { height = Math.round(height * MAX / width); width = MAX; } else { width = Math.round(width * MAX / height); height = MAX; } }
      const c = document.createElement("canvas"); c.width = width; c.height = height;
      c.getContext("2d")!.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = reject; img.src = url;
  });
}

type AiPreviewItem = {
  date: string; amount: number; origAmount: number;
  currency: string; origCurrency: string;
  category: string; description: string;
  krwAmount?: number; rateUsed?: number; selected: boolean;
};

export default function BudgetTab({ tripId, trip, tripDays, isGuestUser = false }: Props) {
  const utils = trpc.useUtils();
  const currency = trip.budgetCurrency ?? "KRW";
  const budgetNum = trip.budget ? parseFloat(trip.budget) : null;

  const { data: expenses, isLoading } = trpc.expenses.list.useQuery({ tripId });
  const createExpense = trpc.expenses.create.useMutation({ onSuccess: () => utils.expenses.list.invalidate({ tripId }) });
  const updateExpense = trpc.expenses.update.useMutation({
    onSuccess: () => { utils.expenses.list.invalidate({ tripId }); setEditExpenseId(null); toast.success("지출이 수정되었습니다."); },
    onError: () => toast.error("지출 수정에 실패했습니다."),
  });
  const deleteExpense = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate({ tripId });
      toast.success("지출이 삭제되었습니다.");
    },
    onError: () => toast.error("지출 삭제에 실패했습니다."),
  });
  const updateTrip = trpc.trips.update.useMutation({ onSuccess: () => utils.trips.get.invalidate({ id: tripId }) });
  const aiExtract = trpc.expenses.aiExtract.useMutation();
  const aiExtractFromImage = trpc.expenses.aiExtractFromImage.useMutation();

  const [showAdd, setShowAdd] = useState(false);
  const [showBudgetSetup, setShowBudgetSetup] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiMode, setAiMode] = useState<"text" | "image" | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState<AiPreviewItem[]>([]);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const [krwRates, setKrwRates] = useState<Record<string, number> | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<number | null>(null);
  const [editExpenseId, setEditExpenseId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ date: "", amount: "", currency: "KRW", category: "기타" as Category, description: "", paidBefore: false });
  const [listTab, setListTab] = useState<"ontrip" | "pretrip">("ontrip");
  const [budgetViewMode, setBudgetViewModeState] = useState<"total" | "ontrip">(() => {
    try { return (localStorage.getItem(`budget-view-${tripId}`) as "total" | "ontrip") ?? "total"; } catch { return "total"; }
  });
  function setBudgetViewMode(mode: "total" | "ontrip") {
    setBudgetViewModeState(mode);
    try { localStorage.setItem(`budget-view-${tripId}`, mode); } catch {}
  }
  const tripStartStr = tripDays?.[0] ? format(tripDays[0], "yyyy-MM-dd") : null;

  const [form, setForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"), amount: "", currency, category: "기타" as Category, description: "", paidBefore: false,
  });
  const [budgetForm, setBudgetForm] = useState({ budget: trip.budget ?? "", budgetCurrency: currency });

  // 비KRW 지출이 있을 때 환율 조회 (합계 계산에도 필요)
  useEffect(() => {
    if (!expenses) return;
    const hasNonKrw = expenses.some(e => (e.currency ?? currency) !== "KRW");
    if (!hasNonKrw || krwRates) return;
    fetchRates("KRW").then(r => setKrwRates(r)).catch(() => {});
  }, [expenses, currency, krwRates]);

  // 지출 금액을 여행 기준 통화(KRW)로 환산
  function toBase(amount: number, expCurrency: string): number {
    if (expCurrency === currency) return amount;
    if (!krwRates) return amount; // 환율 미로딩 시 원본 값 유지
    if (currency === "KRW") {
      const rate = krwRates[expCurrency.toLowerCase()];
      return rate ? Math.round(amount / rate) : amount;
    }
    return amount;
  }

  // 수동 입력 폼에서 비KRW 통화 선택 시 실시간 한화 미리보기
  const formKrwPreview = (() => {
    if (form.currency === "KRW" || !form.amount || isNaN(parseFloat(form.amount))) return null;
    if (!krwRates) return null;
    const rate = krwRates[form.currency.toLowerCase()];
    if (!rate) return null;
    return Math.round(parseFloat(form.amount) / rate);
  })();

  const totalSpent = (expenses ?? []).reduce((s, e) =>
    s + toBase(parseFloat(e.amount ?? "0"), e.currency ?? currency), 0);
  function expToKrw(e: { amount?: string | null; currency?: string | null; krwAmount?: string | null }): number {
    if (e.krwAmount) return parseFloat(e.krwAmount);
    const amount = parseFloat(e.amount ?? "0");
    const cur = (e.currency ?? currency).toUpperCase();
    if (cur === "KRW") return amount;
    const rate = krwRates?.[cur.toLowerCase()];
    return rate ? amount / rate : amount;
  }
  const totalSpentKrw = (expenses ?? []).reduce((s, e) => s + expToKrw(e), 0);
  const krwOnlyTotal = (expenses ?? []).reduce((s, e) => {
    const expCurrency = (e.currency ?? currency).toUpperCase();
    return expCurrency === "KRW" ? s + parseFloat(e.amount ?? "0") : s;
  }, 0);
  const localCurrencyTotals = (expenses ?? []).reduce<Record<string, number>>((acc, e) => {
    const expCurrency = (e.currency ?? currency).toUpperCase();
    if (expCurrency === "KRW") return acc;
    const amount = parseFloat(e.amount ?? "0");
    if (!Number.isFinite(amount)) return acc;
    acc[expCurrency] = (acc[expCurrency] ?? 0) + amount;
    return acc;
  }, {});
  const localCurrencySummary = Object.entries(localCurrencyTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cur, amount]) => `${CURRENCY_FLAGS[cur] ?? ""}${cur} ${fmt(Math.round(amount), cur)}`)
    .join(" · ");

  // 사전 지출 / 현지 지출 분리
  const preTrip = (expenses ?? []).filter(e => e.paidBefore);
  const onTrip  = (expenses ?? []).filter(e => !e.paidBefore);
  function sumKrw(list: typeof expenses) {
    return (list ?? []).reduce((s, e) => s + expToKrw(e), 0);
  }
  const preTripKrw = sumKrw(preTrip);
  const onTripKrw  = sumKrw(onTrip);

  const remaining = budgetNum != null ? budgetNum - totalSpent : null;
  const budgetPct = budgetNum && budgetNum > 0 ? Math.min((totalSpent / budgetNum) * 100, 100) : 0;

  const catTotals: Record<string, number> = {};
  (expenses ?? []).forEach(e => {
    const cat = e.category ?? "기타";
    catTotals[cat] = (catTotals[cat] ?? 0) + toBase(parseFloat(e.amount ?? "0"), e.currency ?? currency);
  });

  const filteredExpenses = (expenses ?? []).filter(e => listTab === "pretrip" ? e.paidBefore : !e.paidBefore);
  const byDate: Record<string, typeof expenses> = {};
  filteredExpenses.forEach(e => { const d = e.date ?? ""; if (!byDate[d]) byDate[d] = []; byDate[d]!.push(e); });
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  // Convert AI-extracted expenses with exchange rates
  async function processAiExpenses(rawExpenses: Array<Record<string, unknown>>): Promise<AiPreviewItem[]> {
    const today = format(new Date(), "yyyy-MM-dd");
    const results: AiPreviewItem[] = [];
    for (const e of rawExpenses) {
      const expDate = (e.date as string | null) ?? today;
      const expCurrency = ((e.currency as string | null) ?? currency).toUpperCase();
      const amount = parseFloat(String(e.amount ?? "0"));
      let krwAmount: number | undefined;
      let rateUsed: number | undefined;
      // Fetch historical rate if currency differs from trip base
      if (expCurrency !== "KRW" && currency === "KRW") {
        try {
          const rate = await fetchHistoricalRate(expCurrency, "KRW", expDate);
          if (rate) { krwAmount = Math.round(amount * rate); rateUsed = rate; }
        } catch { /* ignore */ }
      }
      results.push({
        date: expDate, amount: krwAmount ?? amount,
        origAmount: amount, origCurrency: expCurrency,
        currency: krwAmount ? "KRW" : expCurrency,
        krwAmount, rateUsed,
        category: (e.category as string) ?? "기타",
        description: (e.description as string) ?? "",
        selected: true,
      });
    }
    return results;
  }

  async function handleAiText() {
    if (isGuestUser) { toast.info("게스트는 AI 기능을 사용할 수 없어요. 로그인 후 이용해주세요."); return; }
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const res = await aiExtract.mutateAsync({ tripId, text: aiText });
      if (res.expenses?.length) {
        const preview = await processAiExpenses(res.expenses as Array<Record<string, unknown>>);
        setAiPreview(preview);
      } else { toast.error("지출 정보를 찾지 못했습니다."); }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "AI 분석 실패";
      toast.error(msg.includes("429") ? "AI API 쿼터 초과 — OpenAI 결제/한도를 확인해주세요." : msg);
    } finally { setAiLoading(false); }
  }

  async function handleAiImage(file: File) {
    if (isGuestUser) { toast.info("게스트는 AI 기능을 사용할 수 없어요. 로그인 후 이용해주세요."); return; }
    setAiLoading(true);
    try {
      const b64 = await resizeImageBase64(file);
      const res = await aiExtractFromImage.mutateAsync({ tripId, imageBase64: b64 });
      if (res.expenses?.length) {
        const preview = await processAiExpenses(res.expenses as Array<Record<string, unknown>>);
        setAiPreview(preview);
      } else { toast.error("영수증에서 지출 정보를 찾지 못했습니다."); }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "이미지 분석 실패";
      toast.error(msg.includes("429") ? "AI API 쿼터 초과 — OpenAI 결제/한도를 확인해주세요." : msg);
    } finally { setAiLoading(false); }
  }

  async function handleAiSave() {
    const toSave = aiPreview.filter(p => p.selected);
    for (const p of toSave) {
      const desc = p.krwAmount && p.origCurrency !== "KRW"
        ? `${p.description}${p.description ? " " : ""}(${CURRENCY_FLAGS[p.origCurrency] ?? ""}${p.origCurrency} ${p.origAmount.toLocaleString()})`
        : p.description;
      const paidBefore = tripStartStr ? p.date < tripStartStr : false;
      const krwAmount = p.krwAmount ? String(p.krwAmount) : (p.currency === "KRW" ? String(p.amount) : undefined);
      await createExpense.mutateAsync({ tripId, date: p.date, amount: String(p.amount), currency: p.currency, category: p.category, description: desc, paidBefore, krwAmount });
    }
    toast.success(`${toSave.length}개 지출이 추가됐습니다.`);
    setAiPreview([]); setAiMode(null); setAiText("");
  }

  async function handleSave() {
    if (!form.amount || isNaN(parseFloat(form.amount))) return;
    let krwAmount: string | undefined;
    const amt = parseFloat(form.amount);
    if (form.currency === "KRW") {
      krwAmount = String(Math.round(amt));
    } else if (krwRates) {
      const rate = krwRates[form.currency.toLowerCase()];
      if (rate) krwAmount = String(Math.round(amt / rate));
    }
    await createExpense.mutateAsync({ tripId, date: form.date, amount: form.amount, currency: form.currency, category: form.category, description: form.description, paidBefore: form.paidBefore, krwAmount });
    setForm({ date: format(new Date(), "yyyy-MM-dd"), amount: "", currency, category: "기타", description: "", paidBefore: false });
    setShowAdd(false);
  }

  async function handleBudgetSave() {
    await updateTrip.mutateAsync({ id: tripId, budget: budgetForm.budget || null, budgetCurrency: budgetForm.budgetCurrency });
    setShowBudgetSetup(false);
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="space-y-3">
        {/* 메인 지출 카드 */}
        <FadeIn>
          <div className="rounded-2xl border bg-[#142033] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-0.5 bg-white/10 rounded-lg p-0.5">
                <button
                  onClick={() => setBudgetViewMode("total")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${budgetViewMode === "total" ? "bg-white/20 text-white" : "text-white/50"}`}
                >총 지출</button>
                <button
                  onClick={() => setBudgetViewMode("ontrip")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${budgetViewMode === "ontrip" ? "bg-white/20 text-white" : "text-white/50"}`}
                >📍 현지</button>
              </div>
              {budgetNum && <span className="text-xs text-white/50">{Math.round(budgetPct)}% 사용</span>}
            </div>
            <p className="text-2xl font-bold text-white mb-1">₩{fmt(Math.round(budgetViewMode === "ontrip" ? onTripKrw : totalSpentKrw))}</p>
            <p className="text-xs text-white/50 mb-3">{budgetViewMode === "ontrip" ? `현지 지출 ${onTrip.length}건 · 원화 환산` : "원화 환산 합계"}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/5 p-2.5">
                <p className="text-[10px] text-white/50 mb-0.5">✈️ 사전 지출</p>
                <p className="text-sm font-semibold text-white">₩{fmt(Math.round(preTripKrw))}</p>
                <p className="text-[10px] text-white/40">{preTrip.length}건</p>
              </div>
              <div className="rounded-xl bg-white/5 p-2.5">
                <p className="text-[10px] text-white/50 mb-0.5">📍 현지 지출</p>
                <p className="text-sm font-semibold text-white">₩{fmt(Math.round(onTripKrw))}</p>
                <p className="text-[10px] text-white/40">{onTrip.length}건</p>
              </div>
            </div>
          </div>
        </FadeIn>
        {/* 계획 예산 / 잔여 예산 */}
        {budgetNum != null && (
          <FadeIn delay={0.05}>
            <div className="rounded-2xl border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">계획 예산</p>
                    <p className="text-sm font-semibold">{fmt(budgetNum, currency)} {currency}</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">잔여 예산</p>
                    <p className={`text-sm font-semibold ${remaining != null && remaining < 0 ? "text-[#F18A6A]" : ""}`}>
                      {remaining != null ? `${fmt(Math.round(remaining), currency)} ${currency}` : "—"}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{Math.round(budgetPct)}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${budgetPct}%`, background: budgetPct > 90 ? "#F18A6A" : "#5BB4D8" }} />
              </div>
            </div>
          </FadeIn>
        )}
      </div>

      {/* 통화별 합계 */}
      {Object.keys(localCurrencyTotals).length > 0 && (
        <FadeIn delay={0.08}>
          <div className="rounded-2xl border bg-card p-4 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">통화별</p>
            {Object.entries(localCurrencyTotals).sort(([a],[b]) => a.localeCompare(b)).map(([cur, amount]) => {
              const krwEq = Math.round((expenses ?? []).filter(e => (e.currency ?? currency).toUpperCase() === cur).reduce((s,e) => s + expToKrw(e), 0));
              return (
                <div key={cur} className="flex items-center justify-between">
                  <span className="text-sm">{CURRENCY_FLAGS[cur] ?? ""} {cur}</span>
                  <div className="text-right">
                    <span className="text-sm font-semibold">{fmt(Math.round(amount), cur)}</span>
                    <span className="text-xs text-muted-foreground ml-2">≈ ₩{fmt(krwEq)}</span>
                  </div>
                </div>
              );
            })}
            {krwOnlyTotal > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm">🇰🇷 KRW</span>
                <span className="text-sm font-semibold">₩{fmt(Math.round(krwOnlyTotal))}</span>
              </div>
            )}
          </div>
        </FadeIn>
      )}

      {/* Action buttons */}
      <FadeIn>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> 지출 추가</Button>
          <Button size="sm" variant="outline" onClick={() => { if (isGuestUser) { toast.info("게스트는 AI 기능을 사용할 수 없어요. 로그인 후 이용해주세요."); return; } setAiMode("text"); setAiPreview([]); }} className="gap-1.5"><FileText className="w-3.5 h-3.5" /> AI 텍스트</Button>
          <Button size="sm" variant="outline" onClick={() => { if (isGuestUser) { toast.info("게스트는 AI 기능을 사용할 수 없어요. 로그인 후 이용해주세요."); return; } setAiMode("image"); setAiPreview([]); }} className="gap-1.5"><Camera className="w-3.5 h-3.5" /> 영수증 사진</Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowBudgetSetup(true); setBudgetForm({ budget: trip.budget ?? "", budgetCurrency: currency }); }} className="gap-1.5 ml-auto text-muted-foreground"><Wallet className="w-3.5 h-3.5" /> 예산 설정</Button>
        </div>
      </FadeIn>

      {/* AI input panel */}
      {aiMode && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button onClick={() => setAiMode("text")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${aiMode === "text" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                <FileText className="w-3.5 h-3.5" />텍스트
              </button>
              <button onClick={() => setAiMode("image")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${aiMode === "image" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                <Camera className="w-3.5 h-3.5" />영수증
              </button>
            </div>
            <button onClick={() => { setAiMode(null); setAiPreview([]); setAiText(""); }}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>

          {aiLoading ? (
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>AI가 분석 중입니다…</span>
              {aiMode === "image" && <span className="text-xs text-muted-foreground">환율 조회 중일 수 있습니다</span>}
            </div>
          ) : aiPreview.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">저장할 항목을 선택하세요. 외화는 해당 날짜 환율로 변환됩니다.</p>
              {aiPreview.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${item.selected ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}
                  onClick={() => setAiPreview(prev => prev.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                >
                  <input type="checkbox" checked={item.selected} readOnly className="mt-0.5 accent-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CAT_COLORS[item.category] ?? "#A0B4BE" }} />
                      <p className="text-sm font-semibold">{item.description || item.category}</p>
                      <span className="text-xs text-muted-foreground">{item.category}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.origCurrency !== "KRW" ? (
                        <>
                          <span className="text-xs text-muted-foreground">
                            {CURRENCY_FLAGS[item.origCurrency] ?? ""} {item.origCurrency} {item.origAmount.toLocaleString()}
                          </span>
                          {item.krwAmount ? (
                            <span className="text-xs font-semibold text-primary">→ ₩{item.krwAmount.toLocaleString()}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">(환율 미조회)</span>
                          )}
                        </>
                      ) : (
                        <span className="text-sm font-semibold">₩{item.amount.toLocaleString()}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{item.date}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setAiPreview([])} className="flex-1">다시 입력</Button>
                <Button size="sm" onClick={handleAiSave} disabled={!aiPreview.some(p => p.selected) || createExpense.isPending} className="flex-1">저장</Button>
              </div>
            </div>
          ) : aiMode === "text" ? (
            <>
              <textarea
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none h-28 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="예: '라멘 1,200엔, 커피 480엔, 교통카드 충전 2,000엔'"
                value={aiText} onChange={e => setAiText(e.target.value)}
              />
              <Button size="sm" onClick={handleAiText} disabled={aiLoading || !aiText.trim()} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />분석 및 환율 적용
              </Button>
            </>
          ) : (
            <>
              <button onClick={() => imageFileRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <Camera className="w-6 h-6" />
                <span className="text-sm">사진 선택 또는 카메라 촬영</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => cameraFileRef.current?.click()} className="gap-1.5">
                  <Camera className="w-3.5 h-3.5" /> 카메라
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => imageFileRef.current?.click()} className="gap-1.5">
                  이미지 업로드
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">날짜 포함 시 해당일 환율로 자동 변환</p>
              <input ref={cameraFileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAiImage(f); e.target.value = ""; }} />
              <input ref={imageFileRef} type="file" accept="image/*,image/heic,image/heif" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAiImage(f); e.target.value = ""; }} />
            </>
          )}
        </div>
      )}

      {/* Manual add form */}
      {showAdd && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">지출 추가</p>
            <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">날짜</Label><Input className="w-full min-w-0" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label className="text-xs">카테고리</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">금액</Label>
              <Input className="w-full min-w-0" type="number" placeholder="0" value={form.amount} onChange={e => {
                setForm(f => ({ ...f, amount: e.target.value }));
                if (form.currency !== "KRW" && !krwRates) fetchRates("KRW").then(r => setKrwRates(r)).catch(() => {});
              }} />
              {formKrwPreview != null && (
                <p className="text-xs text-muted-foreground">≈ ₩{formKrwPreview.toLocaleString("ko-KR")}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">통화</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.currency} onChange={e => {
                setForm(f => ({ ...f, currency: e.target.value }));
                if (e.target.value !== "KRW" && !krwRates) fetchRates("KRW").then(r => setKrwRates(r)).catch(() => {});
              }}>
                {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_FLAGS[c] ?? ""} {c}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1"><Label className="text-xs">설명 (선택)</Label><Input placeholder="예: 라멘, 교통카드 충전" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, paidBefore: false }))}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!form.paidBefore ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}
            >📍 현지 지출</button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, paidBefore: true }))}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.paidBefore ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}
            >✈️ 사전 지출</button>
          </div>
          <Button size="sm" onClick={handleSave} disabled={createExpense.isPending}>저장</Button>
        </div>
      )}

      {/* Budget setup */}
      {showBudgetSetup && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">예산 설정</p>
            <button onClick={() => setShowBudgetSetup(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">총 예산</Label><Input type="number" placeholder="0" value={budgetForm.budget} onChange={e => setBudgetForm(f => ({ ...f, budget: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label className="text-xs">통화</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={budgetForm.budgetCurrency} onChange={e => setBudgetForm(f => ({ ...f, budgetCurrency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <Button size="sm" onClick={handleBudgetSave} disabled={updateTrip.isPending}>저장</Button>
        </div>
      )}

      {/* Category breakdown */}
      {Object.keys(catTotals).length > 0 && (
        <FadeIn>
          <div className="rounded-2xl border bg-card p-4 space-y-1">
            <p className="text-sm font-semibold mb-3">카테고리별 지출</p>
            {Object.entries(catTotals).sort(([, a], [, b]) => b - a).map(([cat, total]) => {
              const pct = totalSpent > 0 ? (total / totalSpent) * 100 : 0;
              const color = CAT_COLORS[cat] ?? "#A0B4BE";
              return (
                <div key={cat} className="py-2 border-t first:border-t-0 border-border">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />{cat}
                    </div>
                    <span className="text-sm text-muted-foreground">{fmt(Math.round(total), currency)} {currency}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </FadeIn>
      )}

      {/* Expense list tabs */}
      {(expenses ?? []).length > 0 && (
        <div className="flex gap-1 p-1 bg-muted rounded-xl">
          <button onClick={() => setListTab("ontrip")} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${listTab === "ontrip" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>📍 현지 지출 {onTrip.length > 0 && `(${onTrip.length})`}</button>
          <button onClick={() => setListTab("pretrip")} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${listTab === "pretrip" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>✈️ 사전 지출 {preTrip.length > 0 && `(${preTrip.length})`}</button>
        </div>
      )}

      {/* Expense list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">불러오는 중…</span>
        </div>
      ) : sortedDates.length === 0 ? (
        <FadeIn>
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Wallet className="w-8 h-8 opacity-30" />
            <p className="text-sm">아직 기록된 지출이 없어요.</p>
            <p className="text-xs">영수증 사진으로 찍으면 환율 자동 적용!</p>
          </div>
        </FadeIn>
      ) : (
        <div className="space-y-4">
          {sortedDates.map((date, di) => {
            const dayExpenses = byDate[date] ?? [];
            const dayTotal = dayExpenses.reduce((s, e) =>
              s + toBase(parseFloat(e.amount ?? "0"), e.currency ?? currency), 0);
            // 외화 원본 합계 (통화별)
            const foreignTotals: Record<string, number> = {};
            dayExpenses.forEach(e => {
              const ec = e.currency ?? currency;
              if (ec !== currency) foreignTotals[ec] = (foreignTotals[ec] ?? 0) + parseFloat(e.amount ?? "0");
            });
            let displayDate = date;
            try { displayDate = format(parseISO(date), "MM월 dd일 (EEE)", { locale: ko }); } catch {}
            return (
              <FadeIn key={date} delay={di * 0.05}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">{displayDate}</p>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{fmt(Math.round(dayTotal), currency)} {currency}</p>
                      {Object.entries(foreignTotals).map(([cur, amt]) => (
                        <p key={cur} className="text-[10px] text-muted-foreground/60">{fmt(Math.round(amt), cur)} {cur}</p>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-card divide-y divide-border">
                    {dayExpenses.map(exp => {
                      const color = CAT_COLORS[exp.category ?? "기타"] ?? "#A0B4BE";
                      const expCurrency = exp.currency ?? currency;
                      const expAmount = parseFloat(exp.amount ?? "0");
                      const krwEquiv = expCurrency !== "KRW" && krwRates
                        ? Math.round(expAmount / (krwRates[expCurrency.toLowerCase()] ?? 1))
                        : null;
                      return (
                        <div key={exp.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{exp.description || exp.category}</p>
                            <p className="text-xs text-muted-foreground">{exp.category}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-foreground">
                              {fmt(Math.round(expAmount), expCurrency)} {expCurrency}
                            </p>
                            {krwEquiv != null && (
                              <p className="text-xs text-muted-foreground">≈ ₩{krwEquiv.toLocaleString("ko-KR")}</p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setEditExpenseId(exp.id);
                              setEditForm({
                                date: exp.date ?? format(new Date(), "yyyy-MM-dd"),
                                amount: exp.amount ?? "",
                                currency: exp.currency ?? currency,
                                category: (exp.category ?? "기타") as Category,
                                description: exp.description ?? "",
                                paidBefore: exp.paidBefore ?? false,
                              });
                            }}
                            className="text-muted-foreground hover:text-foreground ml-1 shrink-0"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteExpenseId(exp.id)}
                            className="text-muted-foreground hover:text-destructive shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </FadeIn>
            );
          })}
        </div>
      )}
      {/* Edit Dialog */}
      <Dialog open={editExpenseId !== null} onOpenChange={(open) => { if (!open) setEditExpenseId(null); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-5 sm:p-6">
          <DialogHeader className="mb-1">
            <DialogTitle className="text-lg font-semibold">지출 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1"><Label className="text-xs">설명 (선택)</Label><Input placeholder="예: 라멘, 교통카드 충전" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">카테고리</Label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value as Category }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label className="text-xs">날짜</Label><Input className="w-full" type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div className="space-y-1">
                <Label className="text-xs">금액</Label>
                <Input className="w-full" type="number" placeholder="0" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">통화</Label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={editForm.currency} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_FLAGS[c] ?? ""} {c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditForm(f => ({ ...f, paidBefore: false }))}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!editForm.paidBefore ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}
              >📍 현지 지출</button>
              <button
                type="button"
                onClick={() => setEditForm(f => ({ ...f, paidBefore: true }))}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${editForm.paidBefore ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}
              >✈️ 사전 지출</button>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setEditExpenseId(null)}>취소</Button>
            <Button
              className="flex-1"
              disabled={updateExpense.isPending}
              onClick={() => {
                if (editExpenseId == null || !editForm.amount) return;
                let krwAmount: string | undefined;
                const amt = parseFloat(editForm.amount);
                if (editForm.currency === "KRW") {
                  krwAmount = String(Math.round(amt));
                } else if (krwRates) {
                  const rate = krwRates[editForm.currency.toLowerCase()];
                  if (rate) krwAmount = String(Math.round(amt / rate));
                }
                updateExpense.mutate({ id: editExpenseId, date: editForm.date, amount: editForm.amount, currency: editForm.currency, category: editForm.category, description: editForm.description || undefined, paidBefore: editForm.paidBefore, krwAmount });
              }}
            >
              {updateExpense.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              수정
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteExpenseId !== null} onOpenChange={(open) => { if (!open) setDeleteExpenseId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>지출 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 지출 항목을 삭제할까요?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteExpenseId == null) return;
                deleteExpense.mutate({ id: deleteExpenseId });
                setDeleteExpenseId(null);
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { Plus, Wallet, TrendingUp, PiggyBank, Trash2, Pencil, X, Loader2, Camera, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Trip {
  id: number;
  name: string;
  budget?: string | null;
  budgetCurrency?: string | null;
}

interface Props {
  tripId: number;
  trip: Trip;
}

const CATEGORIES = ["항공", "숙박", "식비", "교통", "쇼핑", "액티비티", "기타"] as const;
type Category = typeof CATEGORIES[number];

const CAT_COLORS: Record<string, string> = {
  항공: "#5BB4D8",
  숙박: "#7CC8B0",
  식비: "#F18A6A",
  교통: "#F2C75A",
  쇼핑: "#A07ECF",
  액티비티: "#5DA88F",
  기타: "#A0B4BE",
};

const CURRENCIES = ["KRW", "JPY", "USD", "EUR", "CNY"];

function fmt(n: number, currency = "KRW") {
  const locale = currency === "KRW" || currency === "JPY" ? "ko-KR" : "en-US";
  return n.toLocaleString(locale);
}

function resizeImageBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1400;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const b64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
      resolve(b64);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function BudgetTab({ tripId, trip }: Props) {
  const utils = trpc.useUtils();
  const currency = trip.budgetCurrency ?? "KRW";
  const budgetNum = trip.budget ? parseFloat(trip.budget) : null;

  const { data: expenses, isLoading } = trpc.expenses.list.useQuery({ tripId });
  const createExpense = trpc.expenses.create.useMutation({ onSuccess: () => utils.expenses.list.invalidate({ tripId }) });
  const deleteExpense = trpc.expenses.delete.useMutation({ onSuccess: () => utils.expenses.list.invalidate({ tripId }) });
  const updateTrip = trpc.trips.update.useMutation({ onSuccess: () => utils.trips.get.invalidate({ id: tripId }) });
  const aiExtract = trpc.expenses.aiExtract.useMutation();
  const aiExtractFromImage = trpc.expenses.aiExtractFromImage.useMutation();

  const [showAdd, setShowAdd] = useState(false);
  const [showBudgetSetup, setShowBudgetSetup] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiMode, setAiMode] = useState<"text" | "image" | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    amount: "",
    currency: currency,
    category: "기타" as Category,
    description: "",
  });

  const [budgetForm, setBudgetForm] = useState({
    budget: trip.budget ?? "",
    budgetCurrency: currency,
  });

  const totalSpent = (expenses ?? []).reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
  const remaining = budgetNum != null ? budgetNum - totalSpent : null;
  const budgetPct = budgetNum && budgetNum > 0 ? Math.min((totalSpent / budgetNum) * 100, 100) : 0;

  const catTotals: Record<string, number> = {};
  (expenses ?? []).forEach(e => {
    const cat = e.category ?? "기타";
    catTotals[cat] = (catTotals[cat] ?? 0) + parseFloat(e.amount ?? "0");
  });

  const byDate: Record<string, typeof expenses> = {};
  (expenses ?? []).forEach(e => {
    const d = e.date ?? "";
    if (!byDate[d]) byDate[d] = [];
    byDate[d]!.push(e);
  });
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  async function handleSave() {
    if (!form.amount || isNaN(parseFloat(form.amount))) return;
    await createExpense.mutateAsync({
      tripId,
      date: form.date,
      amount: form.amount,
      currency: form.currency,
      category: form.category,
      description: form.description,
    });
    setForm({ date: format(new Date(), "yyyy-MM-dd"), amount: "", currency: currency, category: "기타", description: "" });
    setShowAdd(false);
  }

  async function handleAiText() {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const res = await aiExtract.mutateAsync({ tripId, text: aiText });
      if (res.expenses?.length) {
        for (const e of res.expenses) {
          await createExpense.mutateAsync({
            tripId,
            date: e.date ?? format(new Date(), "yyyy-MM-dd"),
            amount: String(e.amount ?? "0"),
            currency: e.currency ?? currency,
            category: e.category ?? "기타",
            description: e.description ?? "",
          });
        }
        setAiText("");
        setAiMode(null);
      }
    } finally {
      setAiLoading(false);
    }
  }

  async function handleAiImage(file: File) {
    setAiLoading(true);
    try {
      const b64 = await resizeImageBase64(file);
      const res = await aiExtractFromImage.mutateAsync({ tripId, imageBase64: b64 });
      if (res.expenses?.length) {
        for (const e of res.expenses) {
          await createExpense.mutateAsync({
            tripId,
            date: e.date ?? format(new Date(), "yyyy-MM-dd"),
            amount: String(e.amount ?? "0"),
            currency: e.currency ?? currency,
            category: e.category ?? "기타",
            description: e.description ?? "",
          });
        }
        setAiMode(null);
      }
    } finally {
      setAiLoading(false);
    }
  }

  async function handleBudgetSave() {
    await updateTrip.mutateAsync({
      id: tripId,
      budget: budgetForm.budget || null,
      budgetCurrency: budgetForm.budgetCurrency,
    });
    setShowBudgetSetup(false);
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="w-3.5 h-3.5" /> 계획 예산
          </div>
          <p className="text-xl font-semibold text-foreground">
            {budgetNum != null ? fmt(budgetNum, currency) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">{currency}</p>
        </div>
        <div className="rounded-2xl border bg-[#142033] p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-white/60">
            <TrendingUp className="w-3.5 h-3.5" /> 현재 지출
          </div>
          <p className="text-xl font-semibold text-white">{fmt(Math.round(totalSpent), currency)}</p>
          <p className="text-xs text-white/50">
            {budgetNum ? `${Math.round(budgetPct)}% 사용` : currency}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PiggyBank className="w-3.5 h-3.5" /> 잔여 예산
          </div>
          <p className={`text-xl font-semibold ${remaining != null && remaining < 0 ? "text-[#F18A6A]" : "text-foreground"}`}>
            {remaining != null ? fmt(Math.round(remaining), currency) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">{currency}</p>
        </div>
      </div>

      {/* Budget progress bar */}
      {budgetNum != null && (
        <div className="rounded-2xl border bg-card p-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>지출 {fmt(Math.round(totalSpent), currency)} {currency}</span>
            <span>{remaining != null ? `잔여 ${fmt(Math.round(remaining), currency)} ${currency}` : ""}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${budgetPct}%`, background: budgetPct > 90 ? "#F18A6A" : "#5BB4D8" }}
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> 지출 추가
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAiMode("text")} className="gap-1.5">
          <FileText className="w-3.5 h-3.5" /> AI 텍스트 입력
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAiMode("image")} className="gap-1.5">
          <Camera className="w-3.5 h-3.5" /> 영수증 사진
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setShowBudgetSetup(true); setBudgetForm({ budget: trip.budget ?? "", budgetCurrency: currency }); }} className="gap-1.5 ml-auto text-muted-foreground">
          <Wallet className="w-3.5 h-3.5" /> 예산 설정
        </Button>
      </div>

      {/* AI Text input */}
      {aiMode === "text" && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">AI 텍스트 입력</p>
            <button onClick={() => setAiMode(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <textarea
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none h-28 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="영수증 내용을 텍스트로 붙여넣으세요. 예: '라멘 1,200엔, 커피 480엔'"
            value={aiText}
            onChange={e => setAiText(e.target.value)}
          />
          <Button size="sm" onClick={handleAiText} disabled={aiLoading || !aiText.trim()} className="gap-1.5">
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            추출 및 저장
          </Button>
        </div>
      )}

      {/* AI Image input */}
      {aiMode === "image" && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">영수증 사진 업로드</p>
            <button onClick={() => setAiMode(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> AI가 영수증을 분석 중입니다…
            </div>
          ) : (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Camera className="w-6 h-6" />
                <span className="text-sm">사진 선택 또는 카메라 촬영</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAiImage(f); e.target.value = ""; }}
              />
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">날짜</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">카테고리</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">금액</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">통화</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">설명 (선택)</Label>
            <Input
              placeholder="예: 라멘, 교통카드 충전"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={createExpense.isPending}>저장</Button>
        </div>
      )}

      {/* Budget setup modal */}
      {showBudgetSetup && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">예산 설정</p>
            <button onClick={() => setShowBudgetSetup(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">총 예산</Label>
              <Input
                type="number"
                placeholder="0"
                value={budgetForm.budget}
                onChange={e => setBudgetForm(f => ({ ...f, budget: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">통화</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={budgetForm.budgetCurrency}
                onChange={e => setBudgetForm(f => ({ ...f, budgetCurrency: e.target.value }))}
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <Button size="sm" onClick={handleBudgetSave} disabled={updateTrip.isPending}>저장</Button>
        </div>
      )}

      {/* Category breakdown */}
      {Object.keys(catTotals).length > 0 && (
        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <p className="text-sm font-semibold mb-3">카테고리별 지출</p>
          {Object.entries(catTotals).sort(([, a], [, b]) => b - a).map(([cat, total]) => {
            const pct = totalSpent > 0 ? (total / totalSpent) * 100 : 0;
            const color = CAT_COLORS[cat] ?? "#A0B4BE";
            return (
              <div key={cat} className="py-2 border-t first:border-t-0 border-border">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                    {cat}
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
      )}

      {/* Expense list by date */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">불러오는 중…</span>
        </div>
      ) : sortedDates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Wallet className="w-8 h-8 opacity-30" />
          <p className="text-sm">아직 기록된 지출이 없어요.</p>
          <p className="text-xs">영수증 사진이나 텍스트로 지출을 기록해보세요.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map(date => {
            const dayExpenses = byDate[date] ?? [];
            const dayTotal = dayExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
            let displayDate = date;
            try { displayDate = format(parseISO(date), "MM월 dd일 (EEE)", { locale: ko }); } catch {}
            return (
              <div key={date} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">{displayDate}</p>
                  <p className="text-xs text-muted-foreground">{fmt(Math.round(dayTotal), currency)} {currency}</p>
                </div>
                <div className="rounded-2xl border bg-card divide-y divide-border">
                  {dayExpenses.map(exp => {
                    const color = CAT_COLORS[exp.category ?? "기타"] ?? "#A0B4BE";
                    return (
                      <div key={exp.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {exp.description || exp.category}
                          </p>
                          <p className="text-xs text-muted-foreground">{exp.category}</p>
                        </div>
                        <p className="text-sm font-semibold text-foreground shrink-0">
                          {fmt(Math.round(parseFloat(exp.amount ?? "0")), exp.currency ?? currency)} {exp.currency ?? currency}
                        </p>
                        <button
                          onClick={() => deleteExpense.mutate({ id: exp.id })}
                          className="text-muted-foreground hover:text-destructive ml-1 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

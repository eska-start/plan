import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CURRENCY_FLAGS,
  CURRENCY_NAMES,
  detectCurrency,
  fetchRatesWithMeta,
} from "@/utils/currency";

const SHOW_CURRENCIES = ["JPY", "USD", "EUR", "CNY", "HKD", "TWD", "THB", "VND", "SGD", "AUD", "CAD", "GBP", "NZD", "MYR", "IDR", "PHP"];
const AUTO_REFRESH_MS = 30_000;

function fmtRate(n: number) {
  return n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  tripId: number;
  trip: { destination: string; budgetCurrency?: string | null };
}

function parseNumeric(v: string): number | null {
  const cleaned = v.replace(/,/g, "").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatInput(n: number, currency: string): string {
  if (currency === "KRW") return Math.round(n).toLocaleString("ko-KR");
  if (currency === "JPY" || currency === "VND" || currency === "IDR") {
    return Math.round(n).toLocaleString("en-US");
  }
  if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export default function ExchangeTab({ trip }: Props) {
  const initialMain = detectCurrency(trip.destination);
  const [mainCurrency, setMainCurrency] = useState(initialMain);

  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [rateSource, setRateSource] = useState<string>("");

  const [isKrwLeft, setIsKrwLeft] = useState(true);
  const [leftInput, setLeftInput] = useState("10,000");
  const [rightInput, setRightInput] = useState("");

  const leftCurrency = isKrwLeft ? "KRW" : mainCurrency;
  const rightCurrency = isKrwLeft ? mainCurrency : "KRW";

  const getRateFromKrw = (currency: string) => {
    if (currency === "KRW") return 1;
    return rates?.[currency.toLowerCase()] ?? null;
  };

  const convert = (amount: number, from: string, to: string): number | null => {
    if (from === to) return amount;
    const fromRate = getRateFromKrw(from);
    const toRate = getRateFromKrw(to);
    if (!fromRate || !toRate) return null;

    if (from === "KRW") return amount * toRate;
    if (to === "KRW") return amount / fromRate;
    return (amount / fromRate) * toRate;
  };

  async function load(options?: { background?: boolean }) {
    const isBackground = options?.background ?? false;
    if (!isBackground) setLoading(true);
    if (!isBackground) setError(false);
    try {
      const { rates: r, asOf, source } = await fetchRatesWithMeta("KRW");
      setRates(r);
      setLastUpdated(asOf);
      setFetchedAt(new Date());
      setRateSource(source);
    } catch {
      if (!isBackground) setError(true);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load({ background: true });
    }, AUTO_REFRESH_MS);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void load({ background: true });
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const mainPerKrw = useMemo(() => getRateFromKrw(mainCurrency), [rates, mainCurrency]);
  const krwPerMain = useMemo(() => {
    if (!mainPerKrw) return null;
    return 1 / mainPerKrw;
  }, [mainPerKrw]);
  const heroDisplay = useMemo(() => {
    if (!krwPerMain) return null;
    if (mainCurrency === "JPY") {
      return {
        value: (krwPerMain * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 }),
        unit: "KRW",
        caption: "100 JPY 기준",
      };
    }
      return {
      value: fmtRate(krwPerMain),
      unit: "KRW",
      caption: `1 ${mainCurrency} 기준`,
    };
  }, [mainCurrency, krwPerMain]);

  useEffect(() => {
    if (!mainPerKrw) return;
    const left = parseNumeric(leftInput);
    if (left == null) return;
    const converted = convert(left, leftCurrency, rightCurrency);
    if (converted == null) return;
    setRightInput(formatInput(converted, rightCurrency));
  }, [mainCurrency, rates, isKrwLeft]);

  function handleLeftChange(v: string) {
    setLeftInput(v);
    const left = parseNumeric(v);
    if (left == null) {
      setRightInput("");
      return;
    }
    const converted = convert(left, leftCurrency, rightCurrency);
    setRightInput(converted == null ? "" : formatInput(converted, rightCurrency));
  }

  function handleRightChange(v: string) {
    setRightInput(v);
    const right = parseNumeric(v);
    if (right == null) {
      setLeftInput("");
      return;
    }
    const converted = convert(right, rightCurrency, leftCurrency);
    setLeftInput(converted == null ? "" : formatInput(converted, leftCurrency));
  }

  function handleSwap() {
    setIsKrwLeft(prev => !prev);
    setLeftInput(rightInput);
    setRightInput(leftInput);
  }

  const flag = CURRENCY_FLAGS[mainCurrency] ?? "🏳️";
  const name = CURRENCY_NAMES[mainCurrency] ?? mainCurrency;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              {trip.destination} 기준 환율
            </p>
            <div className="flex items-center gap-3">
              <span className="text-4xl">{flag}</span>
              <div>
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                ) : error ? (
                  <p className="text-sm text-destructive">환율 조회 실패</p>
                ) : heroDisplay ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-3xl font-semibold text-foreground leading-none">
                        {heroDisplay.value}
                      </span>
                      <span className="text-sm text-muted-foreground">{heroDisplay.unit}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{heroDisplay.caption}</p>
                  </>
                ) : null}
              </div>
            </div>
            {krwPerMain && (
              <p className="text-sm text-foreground font-medium pt-1">
                1 {mainCurrency} = <span className="text-primary font-semibold">{fmtRate(krwPerMain)}</span> KRW
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <p className="text-[10px] text-muted-foreground/80">30초마다 자동 갱신</p>
            {lastUpdated && (
              <p className="text-[10px] text-muted-foreground">
                고시시각 {lastUpdated.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            {fetchedAt && (
              <p className="text-[10px] text-muted-foreground">수신시각 {fetchedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
            )}
            {rateSource && (
              <p className="text-[10px] text-muted-foreground/80">{rateSource === "open-er-api" ? "실시간(제공사 기준)" : "일일 고시 기준"}</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-display text-base font-semibold">환율 계산기</h3>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              {CURRENCY_FLAGS[leftCurrency] ?? "🏳️"} {leftCurrency} ({CURRENCY_NAMES[leftCurrency] ?? leftCurrency})
            </label>
            <Input
              type="text"
              inputMode="decimal"
              value={leftInput}
              onChange={e => handleLeftChange(e.target.value)}
              className="h-12 text-lg font-semibold tabular-nums"
              placeholder="0"
            />
          </div>
          <button
            className="mb-1 w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0"
            onClick={handleSwap}
          >
            <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              {CURRENCY_FLAGS[rightCurrency] ?? "🏳️"} {rightCurrency} ({CURRENCY_NAMES[rightCurrency] ?? rightCurrency})
            </label>
            <Input
              type="text"
              inputMode="decimal"
              value={rightInput}
              onChange={e => handleRightChange(e.target.value)}
              className="h-12 text-lg font-semibold tabular-nums"
              placeholder="0"
            />
          </div>
        </div>
        {!mainPerKrw && !loading && (
          <p className="text-xs text-muted-foreground text-center">환율 정보를 불러올 수 없습니다.</p>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-semibold">주요 통화 (1통화 기준 KRW)</h3>
          <span className="text-xs text-muted-foreground">
            메인 통화: {CURRENCY_FLAGS[mainCurrency] ?? ""} {mainCurrency}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">통화를 탭하면 이 환율 페이지의 메인 통화만 변경됩니다.</p>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-center text-muted-foreground py-4">환율 정보를 불러오지 못했습니다.</p>
        ) : (
          <div className="divide-y divide-border">
            {SHOW_CURRENCIES.map(c => {
              const rate = rates?.[c.toLowerCase()];
              if (!rate) return null;
              const krwPerCurrency = 1 / rate;
              const isTarget = c === mainCurrency;
              return (
                <button
                  key={c}
                  onClick={() => setMainCurrency(c)}
                  className={`w-full flex items-center justify-between py-3 transition-colors rounded-lg px-2 -mx-2 ${
                    isTarget ? "bg-primary/8" : "hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl w-8 text-center">{CURRENCY_FLAGS[c] ?? "🏳️"}</span>
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-semibold ${isTarget ? "text-primary" : "text-foreground"}`}>{c}</p>
                        {isTarget && (
                          <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">메인</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{CURRENCY_NAMES[c]}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold tabular-nums ${isTarget ? "text-primary" : "text-foreground"}`}>
                      {fmtRate(krwPerCurrency)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">KRW / 1 {c}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

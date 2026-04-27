import { useState, useEffect } from "react";
import { RefreshCw, Loader2, ArrowLeftRight, TrendingUp, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  detectCurrency, fetchRates,
  CURRENCY_NAMES, CURRENCY_FLAGS,
} from "@/utils/currency";

const SHOW_CURRENCIES = ["JPY", "USD", "EUR", "CNY", "HKD", "TWD", "THB", "VND", "SGD", "AUD", "CAD", "GBP", "NZD", "MYR", "IDR", "PHP"];

interface Props {
  tripId: number;
  trip: { destination: string; budgetCurrency?: string | null };
}

export default function ExchangeTab({ tripId, trip }: Props) {
  const destCurrency = detectCurrency(trip.destination);
  const savedCurrency = trip.budgetCurrency ?? null;

  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [inputKrw, setInputKrw] = useState("10000");
  const [inputForeign, setInputForeign] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const utils = trpc.useUtils();
  const updateTrip = trpc.trips.update.useMutation({
    onSuccess: () => {
      utils.trips.get.invalidate({ id: tripId });
    },
  });

  async function load() {
    setLoading(true); setError(false);
    try {
      const r = await fetchRates("KRW");
      setRates(r);
      setLastUpdated(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const parseNumeric = (v: string) => {
    const cleaned = v.replace(/,/g, "").replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };
  const fmtKrwInput = (n: number) => Math.round(n).toLocaleString("ko-KR");
  const fmtForeignInput = (n: number, currency: string) => {
    if (currency === "JPY" || currency === "VND" || currency === "IDR") {
      return Math.round(n).toLocaleString("en-US");
    }
    if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  };

  const destRate = rates?.[destCurrency.toLowerCase()];
  const krwRate = destRate ? 1 / destRate : null;
  const krwPerOneForeign = krwRate ? Number(krwRate.toFixed(4)) : null;

  useEffect(() => {
    if (!destRate) return;
    const n = parseNumeric(inputKrw);
    if (n != null) setInputForeign(fmtForeignInput(n * destRate, destCurrency));
  }, [destRate]);

  function handleKrwChange(v: string) {
    setInputKrw(v);
    if (!destRate) return;
    const n = parseNumeric(v);
    setInputForeign(n == null ? "" : fmtForeignInput(n * destRate, destCurrency));
  }

  function handleForeignChange(v: string) {
    setInputForeign(v);
    if (!krwRate) return;
    const n = parseNumeric(v);
    setInputKrw(n == null ? "" : fmtKrwInput(n * krwRate));
  }

  async function handleSetCurrency(currency: string) {
    if (currency === savedCurrency) return;
    await updateTrip.mutateAsync({ id: tripId, budgetCurrency: currency });
    toast.success(`여행 통화가 ${CURRENCY_FLAGS[currency] ?? ""} ${currency}로 설정됐습니다.`);
  }

  const flag = CURRENCY_FLAGS[destCurrency] ?? "🏳️";
  const name = CURRENCY_NAMES[destCurrency] ?? destCurrency;

  return (
    <div className="space-y-5">
      {/* Hero rate card */}
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
                ) : destRate ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-3xl font-semibold text-foreground leading-none">
                        {fmtForeignInput(destRate * 10000, destCurrency)}
                      </span>
                      <span className="text-sm text-muted-foreground">{destCurrency}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">10,000 KRW 기준</p>
                  </>
                ) : null}
              </div>
            </div>
            {krwPerOneForeign && (
              <p className="text-sm text-foreground font-medium pt-1">
                1 {destCurrency} = <span className="text-primary font-semibold">{krwPerOneForeign.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}</span> KRW
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            {lastUpdated && (
              <p className="text-[10px] text-muted-foreground">
                {lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Converter */}
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-display text-base font-semibold">환율 계산기</h3>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              {CURRENCY_FLAGS.KRW} KRW (한국 원)
            </label>
            <Input
              type="text"
              inputMode="decimal"
              value={inputKrw}
              onChange={e => handleKrwChange(e.target.value)}
              className="h-12 text-lg font-semibold tabular-nums"
              placeholder="0"
            />
          </div>
          <button
            className="mb-1 w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0"
            onClick={() => {
              const krw = parseNumeric(inputKrw);
              const foreign = parseNumeric(inputForeign);
              if (!destRate || krw == null || foreign == null) return;
              setInputKrw(fmtKrwInput(foreign * (1 / destRate)));
              setInputForeign(fmtForeignInput(krw * destRate, destCurrency));
            }}
          >
            <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              {flag} {destCurrency} ({name})
            </label>
            <Input
              type="text"
              inputMode="decimal"
              value={inputForeign}
              onChange={e => handleForeignChange(e.target.value)}
              className="h-12 text-lg font-semibold tabular-nums"
              placeholder="0"
            />
          </div>
        </div>
        {!destRate && !loading && (
          <p className="text-xs text-muted-foreground text-center">환율 정보를 불러올 수 없습니다.</p>
        )}
        {destRate && (
          <p className="text-[11px] text-muted-foreground text-right">
            * 실시간 기준 환율(네이버 표시값과 시점에 따라 소폭 차이 가능)
          </p>
        )}
      </div>

      {/* Currency list — click to set as trip currency */}
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-semibold">주요 통화 (1,000 KRW 기준)</h3>
          {savedCurrency && (
            <span className="text-xs text-muted-foreground">
              현재 설정: {CURRENCY_FLAGS[savedCurrency] ?? ""} {savedCurrency}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">통화를 탭하면 여행 기준 통화로 저장됩니다.</p>
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
              const per1000 = rate * 1000;
              const isTarget = c === destCurrency;
              const isSaved = c === savedCurrency;
              return (
                <button
                  key={c}
                  onClick={() => handleSetCurrency(c)}
                  disabled={updateTrip.isPending}
                  className={`w-full flex items-center justify-between py-3 transition-colors rounded-lg px-2 -mx-2 ${
                    isSaved ? "bg-primary/8" : isTarget ? "bg-muted/50" : "hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl w-8 text-center">{CURRENCY_FLAGS[c] ?? "🏳️"}</span>
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-semibold ${isSaved ? "text-primary" : "text-foreground"}`}>{c}</p>
                        {isTarget && (
                          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-semibold">여행지</span>
                        )}
                        {isSaved && (
                          <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                            <Check className="w-2.5 h-2.5" />저장됨
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{CURRENCY_NAMES[c]}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold tabular-nums ${isSaved ? "text-primary" : "text-foreground"}`}>
                      {fmtForeignInput(per1000, c)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">/ 1,000 KRW</p>
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

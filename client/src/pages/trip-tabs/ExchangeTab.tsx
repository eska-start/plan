import { useState, useEffect } from "react";
import { RefreshCw, Loader2, ArrowLeftRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  detectCurrency, fetchRates, fmtAmount,
  CURRENCY_NAMES, CURRENCY_FLAGS,
} from "@/utils/currency";

const SHOW_CURRENCIES = ["JPY", "USD", "EUR", "CNY", "HKD", "TWD", "THB", "VND", "SGD", "AUD", "CAD", "GBP", "NZD", "MYR", "IDR", "PHP"];

interface Props {
  trip: { destination: string; budgetCurrency?: string | null };
}

export default function ExchangeTab({ trip }: Props) {
  const destCurrency = detectCurrency(trip.destination);
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [inputKrw, setInputKrw] = useState("10000");
  const [inputForeign, setInputForeign] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

  const destRate = rates?.[destCurrency.toLowerCase()]; // KRW → destCurrency
  const krwRate = destRate ? 1 / destRate : null;       // destCurrency → KRW

  useEffect(() => {
    if (!destRate) return;
    const n = parseFloat(inputKrw.replace(/,/g, ""));
    if (!isNaN(n)) setInputForeign(fmtAmount(n * destRate, destCurrency));
  }, [destRate]);

  function handleKrwChange(v: string) {
    setInputKrw(v);
    if (!destRate) return;
    const n = parseFloat(v);
    setInputForeign(isNaN(n) ? "" : fmtAmount(n * destRate, destCurrency));
  }

  function handleForeignChange(v: string) {
    setInputForeign(v);
    if (!krwRate) return;
    const n = parseFloat(v);
    setInputKrw(isNaN(n) ? "" : Math.round(n * krwRate).toLocaleString("ko-KR"));
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
                        {fmtAmount(destRate * 10000, destCurrency)}
                      </span>
                      <span className="text-sm text-muted-foreground">{destCurrency}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">10,000 KRW 기준</p>
                  </>
                ) : null}
              </div>
            </div>
            {krwRate && (
              <p className="text-sm text-foreground font-medium pt-1">
                1 {destCurrency} = <span className="text-primary font-semibold">{Math.round(krwRate).toLocaleString("ko-KR")}</span> KRW
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
              type="number"
              value={inputKrw}
              onChange={e => handleKrwChange(e.target.value)}
              className="h-12 text-lg font-semibold tabular-nums"
              placeholder="0"
            />
          </div>
          <button
            className="mb-1 w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0"
            onClick={() => {
              const tmp = inputKrw;
              setInputKrw(inputForeign);
              setInputForeign(tmp);
            }}
          >
            <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">
              {flag} {destCurrency} ({name})
            </label>
            <Input
              type="number"
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
      </div>

      {/* Popular currencies */}
      <div className="rounded-2xl border bg-card p-5">
        <h3 className="font-display text-base font-semibold mb-4">주요 통화 (1,000 KRW 기준)</h3>
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
              return (
                <div
                  key={c}
                  className={`flex items-center justify-between py-3 ${isTarget ? "bg-primary/5 -mx-5 px-5 rounded-xl" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl w-8 text-center">{CURRENCY_FLAGS[c] ?? "🏳️"}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-semibold ${isTarget ? "text-primary" : "text-foreground"}`}>{c}</p>
                        {isTarget && (
                          <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">여행지</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{CURRENCY_NAMES[c]}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold tabular-nums ${isTarget ? "text-primary" : "text-foreground"}`}>
                      {fmtAmount(per1000, c)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">/ 1,000 KRW</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

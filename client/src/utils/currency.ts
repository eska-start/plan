export const CURRENCY_NAMES: Record<string, string> = {
  KRW: "한국 원", JPY: "일본 엔", USD: "미국 달러", EUR: "유로",
  GBP: "영국 파운드", CNY: "중국 위안", HKD: "홍콩 달러", TWD: "대만 달러",
  THB: "태국 바트", VND: "베트남 동", SGD: "싱가포르 달러", AUD: "호주 달러",
  CAD: "캐나다 달러", MYR: "말레이시아 링깃", IDR: "인도네시아 루피아",
  PHP: "필리핀 페소", INR: "인도 루피", AED: "UAE 디르함",
  TRY: "터키 리라", CHF: "스위스 프랑", NZD: "뉴질랜드 달러",
};

export const CURRENCY_FLAGS: Record<string, string> = {
  KRW: "🇰🇷", JPY: "🇯🇵", USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧",
  CNY: "🇨🇳", HKD: "🇭🇰", TWD: "🇹🇼", THB: "🇹🇭",
  VND: "🇻🇳", SGD: "🇸🇬", AUD: "🇦🇺", CAD: "🇨🇦",
  MYR: "🇲🇾", IDR: "🇮🇩", PHP: "🇵🇭",
  INR: "🇮🇳", AED: "🇦🇪", TRY: "🇹🇷",
  CHF: "🇨🇭", NZD: "🇳🇿",
};

export function detectCurrency(destination: string): string {
  const d = destination.toLowerCase();
  if (/일본|도쿄|오사카|교토|후쿠오카|삿포로|나라|히로시마|나고야|시즈오카|요코하마|고베|나하|오키나와|센다이|니가타|가나자와|마쓰야마|하코다테|아사히카와|구마모토|가고시마|미야자키|마쓰모토|나가노|japan|tokyo|osaka|kyoto|shizuoka|yokohama|kobe|naha|okinawa|sapporo|sendai|hiroshima|nagoya|fukuoka|nara/.test(d)) return "JPY";
  if (/미국|뉴욕|로스앤젤레스|샌프란|하와이|라스베이거스|시카고|워싱턴|usa|new york|los angeles/.test(d)) return "USD";
  if (/영국|런던|맨체스터|에든버러|uk|london|england/.test(d)) return "GBP";
  if (/유럽|프랑스|파리|독일|베를린|이탈리아|로마|스페인|바르셀로나|네덜란드|암스테르담|europe|paris/.test(d)) return "EUR";
  if (/태국|방콕|치앙마이|푸켓|thailand|bangkok/.test(d)) return "THB";
  if (/베트남|하노이|호치민|다낭|vietnam/.test(d)) return "VND";
  if (/싱가포르|singapore/.test(d)) return "SGD";
  if (/호주|시드니|멜버른|브리즈번|australia/.test(d)) return "AUD";
  if (/캐나다|밴쿠버|토론토|캘거리|canada/.test(d)) return "CAD";
  if (/홍콩|hong kong/.test(d)) return "HKD";
  if (/대만|타이완|타이베이|taiwan|taipei/.test(d)) return "TWD";
  if (/중국|베이징|상하이|청두|china/.test(d)) return "CNY";
  if (/필리핀|마닐라|세부|philippines/.test(d)) return "PHP";
  if (/말레이시아|쿠알라룸푸르|코타키나발루|malaysia/.test(d)) return "MYR";
  if (/인도네시아|발리|자카르타|indonesia/.test(d)) return "IDR";
  if (/인도|뭄바이|델리|india/.test(d)) return "INR";
  if (/스위스|취리히|제네바|switzerland/.test(d)) return "CHF";
  if (/두바이|아부다비|uae|dubai/.test(d)) return "AED";
  if (/튀르키예|터키|이스탄불|turkey/.test(d)) return "TRY";
  if (/뉴질랜드|오클랜드|new zealand/.test(d)) return "NZD";
  return "USD";
}

export function fmtAmount(n: number, currency: string): string {
  if (currency === "VND" || currency === "IDR") return Math.round(n).toLocaleString();
  if (n >= 100) return Math.round(n).toLocaleString();
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

export async function fetchRates(base: string): Promise<Record<string, number>> {
  const b = base.toLowerCase();
  const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${b}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("환율 조회 실패");
  const data = await res.json() as Record<string, unknown>;
  return (data[b] ?? {}) as Record<string, number>;
}

export async function fetchHistoricalRate(from: string, to: string, date: string): Promise<number | null> {
  try {
    const f = from.toLowerCase(), t = to.toLowerCase();
    const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${f}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const rates = data[f] as Record<string, number> | undefined;
    return rates?.[t] ?? null;
  } catch {
    return null;
  }
}

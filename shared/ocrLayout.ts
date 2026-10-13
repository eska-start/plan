import { localDocFromText } from "./localDoc";
import type { DocumentType } from "./vision";
import { normalizeDateTime } from "./vision";

export type OcrLine = { text: string; left: number; top: number; right: number; bottom: number };
export type LayoutExtraction = { values: Record<string,string|null>; segments: Record<string,string|null>[] };
const cx = (line: OcrLine) => (line.left+line.right)/2;
const cy = (line: OcrLine) => (line.top+line.bottom)/2;
const datePattern = /(?:\d{4}\s*(?:[.\/-]|년)\s*\d{1,2}\s*(?:[.\/-]|월)\s*\d{1,2}\s*일?)/;
const timePattern = /(?:오전|오후|AM|PM)?\s*\d{1,2}:\d{2}|(?:오전|오후)?\s*\d{1,2}시\s*\d{1,2}?분?/i;
function normalizeDateEvidence(text: string): string|null {
  const match = text.match(datePattern)?.[0]; if(!match) return null;
  const parts=match.match(/\d+/g); if(!parts || parts.length<3) return null;
  const value=`${parts[0]}-${parts[1].padStart(2,"0")}-${parts[2].padStart(2,"0")}`;
  return Number.isFinite(Date.parse(value)) && new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value ? value:null;
}
const airport = (text:string) => {
  const s=text.trim();
  const code=s.match(/\(([A-Z]{3})\)/)?.[1] ?? (/^[A-Z]{3}$/.test(s) ? s : null);
  return code && !["KRW","JPY","USD","EUR","GBP","CNY","AUD","CAD","PDF","PNR","VAT"].includes(code) ? code : null;
};
/** Keep duplicate words at different coordinates; dedupe only overlapping observations. */
export function mergeOcrLines(lines: OcrLine[]): OcrLine[] {
  const out:OcrLine[]=[];
  for(const line of lines) {
    if(!line.text.trim() || ![line.left,line.top,line.right,line.bottom].every(Number.isFinite)) continue;
    const duplicate=out.some(other=>other.text.trim().replace(/\s+/g,"")===line.text.trim().replace(/\s+/g,"") && Math.abs(cx(other)-cx(line))<Math.max(other.right-other.left,line.right-line.left)*.3+3 && Math.abs(cy(other)-cy(line))<Math.max(other.bottom-other.top,line.bottom-line.top)*.5+3);
    if(!duplicate)out.push(line);
  }
  return out.sort((a,b)=>a.top-b.top || a.left-b.left);
}
/** Spatially associate values with label anchors even when OCR reading order is column-major. */
function anchorValue(lines:OcrLine[], pattern:RegExp, accept:(text:string)=>boolean):string|null {
  const anchors=lines.filter(line=>pattern.test(line.text)); if(anchors.length!==1)return null;
  const label=anchors[0];
  const candidates=lines.filter(line=>line!==label && accept(line.text) && (line.top>=label.top-(label.bottom-label.top) && line.top-label.bottom<180));
  const ranked=candidates.map(line=>({line,cost:Math.abs(cx(line)-cx(label))+Math.max(0,line.top-label.bottom)*1.3})).sort((a,b)=>a.cost-b.cost);
  if(!ranked.length || (ranked[1] && Math.abs(ranked[1].cost-ranked[0].cost)<8))return null;
  return ranked[0].line.text;
}
function datetimeAt(lines:OcrLine[], point:OcrLine, other:OcrLine):string|null {
  const span=Math.max(100,Math.abs(cx(point)-cx(other))*.7);
  const nearby=lines.filter(line=>Math.abs(cx(line)-cx(point))<span && Math.abs(cy(line)-cy(point))<220);
  const times=nearby.filter(line=>timePattern.test(line.text)).sort((a,b)=>Math.abs(cy(a)-cy(point))-Math.abs(cy(b)-cy(point)));
  const time=times[0]?.text.match(timePattern)?.[0]; if(!time)return null;
  const dates=nearby.map(line=>({line,date:normalizeDateEvidence(line.text)})).filter(d=>d.date).sort((a,b)=>Math.abs(cy(a.line)-cy(point))-Math.abs(cy(b.line)-cy(point)));
  // A single shared date header can apply to the whole flight card.
  const shared=lines.map(line=>normalizeDateEvidence(line.text)).filter((value):value is string=>!!value);
  const unique=Array.from(new Set(shared));
  const date=dates[0]?.date ?? (unique.length===1 ? unique[0]:null);
  if(!date)return null;
  const result=normalizeDateTime(`${date} ${time}`);
  return result && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(result) ? result:null;
}
export function extractBookingLayout(text:string, docType:DocumentType, observations:OcrLine[]):LayoutExtraction {
  const raw=mergeOcrLines(observations);
  const heights=raw.map(line=>line.bottom-line.top).filter(height=>height>0).sort((a,b)=>a-b);
  const scale=heights.length ? 20/heights[Math.floor(heights.length/2)] : 1;
  const lines=raw.map(line=>({...line,left:line.left*scale,right:line.right*scale,top:line.top*scale,bottom:line.bottom*scale}));
  const values=localDocFromText(text,docType);
  if(docType==="accommodation") {
    for(const [field,pattern] of [["checkIn",/체크\s*인|입실|check[ -]?in|チェックイン/i],["checkOut",/체크\s*아웃|퇴실|check[ -]?out|チェックアウト/i]] as const) {
      const value=anchorValue(lines,pattern,s=>!!normalizeDateEvidence(s));
      if(!values[field] && value)values[field]=normalizeDateEvidence(value);
    }
    if(!values.name) {
      const candidates=lines.filter(line=>/hotel|resort|inn\b|stay|suites?|호텔|리조트|게스트하우스|旅館|ホテル/i.test(line.text) && !/예약|번호|confirmation|booking|체크|check/i.test(line.text));
      if(candidates.length===1)values.name=candidates[0].text.trim();
    }
    if(!values.address) {
      const candidates=lines.filter(line=>/\d.*(?:street|road|avenue|st\b|rd\b|丁目|번지)|(?:시|구|군)\s+.*(?:로|길)\s*\d/i.test(line.text));
      if(candidates.length===1)values.address=candidates[0].text.trim();
    }
    return {values,segments:[]};
  }
  if(docType==="rental") {
    for(const [field,pattern] of [["pickupDateTime",/픽업|인수|pick[ -]?up|受取/i],["dropoffDateTime",/반납|drop[ -]?off|return|返却/i]] as const) {
      if(values[field])continue;
      const date=anchorValue(lines,pattern,s=>!!normalizeDateEvidence(s));
      if(date && timePattern.test(date))values[field]=normalizeDateTime(`${normalizeDateEvidence(date)} ${date.match(timePattern)?.[0]}`);
    }
    return {values,segments:[]};
  }
  if(docType!=="flight")return {values,segments:[]};
  const airports=lines.filter(line=>airport(line.text));
  const pairs:{from:OcrLine;to:OcrLine}[]=[];
  for(let i=0;i<airports.length;i++)for(let j=i+1;j<airports.length;j++) {
    const a=airports[i],b=airports[j];
    if(airports.filter(line=>Math.abs(cy(line)-cy(a))<Math.max(a.bottom-a.top,line.bottom-line.top)*1.5).length!==2)continue;
    if(Math.abs(cy(a)-cy(b))<Math.max(a.bottom-a.top,b.bottom-b.top)*1.5 && Math.abs(cx(a)-cx(b))>Math.max(a.right-a.left,b.right-b.left))pairs.push(cx(a)<cx(b)?{from:a,to:b}:{from:b,to:a});
  }
  if(!pairs.length) {
    const from=anchorValue(lines,/출발|departure|depart|from/i,s=>!!airport(s));
    const to=anchorValue(lines,/도착|arrival|arrive|\bto\b/i,s=>!!airport(s));
    const fromLine=airports.find(line=>line.text===from),toLine=airports.find(line=>line.text===to);
    if(fromLine && toLine && fromLine!==toLine)pairs.push({from:fromLine,to:toLine});
  }
  const segments:Record<string,string|null>[]=[];
  for(const pair of pairs) {
    const departure=datetimeAt(lines,pair.from,pair.to),arrival=datetimeAt(lines,pair.to,pair.from);
    if(!departure || !arrival)continue;
    const flightLines=lines.filter(line=>/\b[A-Z][A-Z0-9]\s?\d{2,4}\b/.test(line.text) && Math.abs(cy(line)-cy(pair.from))<220);
    const number=flightLines.length===1?flightLines[0].text.match(/\b([A-Z][A-Z0-9]\s?\d{2,4})\b/)?.[1]?.replace(/\s/g,"")??null:null;
    segments.push({...values,departureAirport:airport(pair.from.text),departureAirportCode:airport(pair.from.text),arrivalAirport:airport(pair.to.text),arrivalAirportCode:airport(pair.to.text),departureDateTime:departure,arrivalDateTime:arrival,flightNumber:number ?? (pairs.length===1?values.flightNumber:null)});
  }
  if(segments.length===1) {
    for(const [key,value] of Object.entries(segments[0]))if(value && (["departureAirport","departureAirportCode","arrivalAirport","arrivalAirportCode","departureDateTime","arrivalDateTime","flightNumber"].includes(key)||!values[key]))values[key]=value;
  }
  return {values,segments:segments.length>1?segments:[]};
}

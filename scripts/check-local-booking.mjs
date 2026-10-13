import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
let ts;
try { ts = require("typescript"); }
catch { const folder = fs.readdirSync(path.join(root,"node_modules/.pnpm")).find(p => p.startsWith("typescript@")); ts = require(path.join(root,"node_modules/.pnpm",folder,"node_modules/typescript")); }
const temp = fs.mkdtempSync(path.join(os.tmpdir(),"plan-local-check-"));
try {
  fs.writeFileSync(path.join(temp,"package.json"), '{"type":"commonjs"}');
  for (const file of ["vision","textParse","localDoc","bookingValidation","routeOptimize","ocrLayout"]) {
    const src = fs.readFileSync(path.join(root,`shared/${file}.ts`),"utf8");
    fs.writeFileSync(path.join(temp,`${file}.js`),ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
  }
  const { localDocFromText } = require(path.join(temp,"localDoc.js"));
  const { validateBooking } = require(path.join(temp,"bookingValidation.js"));
  const { optimizeRoute } = require(path.join(temp,"routeOptimize.js"));
  const flight = localDocFromText(`예약 완료\n항공사: 제주항공\n편명: 7C1234\n출발 공항: ICN\n도착 공항: NRT\n출발 일시: 2026년 11월 5일 오전 9시 20분\n도착 일시: 2026-11-05 11:30\n예약번호: ABC12D`,"flight");
  assert.equal(flight.flightNumber,"7C1234"); assert.equal(flight.airline,"제주항공"); assert.equal(flight.departureDateTime,"2026-11-05T09:20"); assert.equal(flight.bookingStatus,"confirmed");
  const hotel = localDocFromText(`숙소명\n신주쿠 그랜드 호텔\n주소\n1-2-3 Shinjuku, Tokyo\n체크인\n2026.11.05\n체크아웃\n2026.11.07\n총 금액: 200,000원`,"accommodation");
  assert.equal(hotel.address,"1-2-3 Shinjuku, Tokyo"); assert.equal(hotel.checkIn,"2026-11-05"); assert.equal(hotel.price,"200000"); assert.equal(validateBooking("accommodation",hotel),null);
  const rental=localDocFromText(`렌트 업체: Hertz\n차종: Toyota Camry\n픽업 장소: NRT T1\n반납 장소: Shinjuku\n픽업 일시: 2026-11-05T12:00\n반납 일시: 2026-11-07T12:00`,"rental");
  assert.equal(rental.pickupLocation,"NRT T1"); assert.equal(rental.dropoffLocation,"Shinjuku"); assert.equal(rental.pickupDateTime,"2026-11-05T12:00");
  for(const type of ["flight","accommodation","rental"]) assert.ok(validateBooking(type,{}));
  assert.ok(validateBooking("accommodation",{...hotel,checkOut:"2026-11-04"})); assert.ok(validateBooking("accommodation",{...hotel,checkIn:"2026-02-30"}));
  assert.deepEqual(localDocFromText("not a booking screenshot","rental"),{company:null,carModel:null,pickupLocation:null,dropoffLocation:null,pickupDateTime:null,dropoffDateTime:null,bookingRef:null,price:null,currency:null});
  const { extractBookingLayout, mergeOcrLines } = require(path.join(temp,"ocrLayout.js"));
  const line=(text,left,top,width=90)=>({text,left,top,right:left+width,bottom:top+20});
  const columnLines=[line("2026.11.05",180,20,120),line("7C1234",190,60),line("ICN",60,130),line("NRT",360,130),line("09:20",60,180),line("11:30",360,180)];
  const column=extractBookingLayout(columnLines.map(l=>l.text).join("\n"),"flight",columnLines);
  assert.equal(column.values.departureAirport,"ICN");assert.equal(column.values.arrivalAirport,"NRT");assert.equal(column.values.departureDateTime,"2026-11-05T09:20");assert.equal(column.values.arrivalDateTime,"2026-11-05T11:30");
  const duplicateDates=[line("2026.11.05",40,40,120),line("2026.11.05",340,40,120),line("2026.11.05",41,41,120)];
  assert.equal(mergeOcrLines(duplicateDates).length,2);
  const second=columnLines.map(l=>({...l,text:l.text==="2026.11.05"?"2026.11.12":l.text==="7C1234"?"7C5678":l.text==="ICN"?"NRT":l.text==="NRT"?"ICN":l.text,top:l.top+600,bottom:l.bottom+600}));
  assert.equal(extractBookingLayout([...columnLines,...second].map(l=>l.text).join("\n"),"flight",[...columnLines,...second]).segments.length,2);
  const hotelColumns=[line("Rakuten STAY Atami",40,10,250),line("チェックイン",40,80,100),line("チェックアウト",300,80,100),line("2026.11.05",40,120,100),line("2026.11.07",300,120,100)];
  const hotelSpatial=extractBookingLayout(hotelColumns.map(l=>l.text).join("\n"),"accommodation",hotelColumns);assert.equal(hotelSpatial.values.name,"Rakuten STAY Atami");assert.equal(hotelSpatial.values.checkIn,"2026-11-05");assert.equal(hotelSpatial.values.checkOut,"2026-11-07");
  // Directed road times: compare exact solver against every permutation, fixed start.
  const points=[{id:10,lat:35,lng:139},{id:11,lat:36,lng:139},{id:12,lat:37,lng:139},{id:13,lat:38,lng:139}];
  const matrix=[[0,8,1,6],[2,0,8,1],[9,1,0,4],[2,8,2,0]];
  const cost=ids=>ids.slice(1).reduce((sum,id,i)=>sum+matrix[points.findIndex(p=>p.id===ids[i])][points.findIndex(p=>p.id===id)],0);
  const permutations=a=>a.length ? a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[v,...p])) : [[]];
  const route=optimizeRoute(points,matrix);assert.equal(route[0],10);assert.equal(cost(route),Math.min(...permutations([11,12,13]).map(p=>cost([10,...p]))));
  assert.deepEqual(optimizeRoute([]),[]);assert.deepEqual(optimizeRoute(points.slice(0,1)),[10]);assert.throws(()=>optimizeRoute(points,[[0]])); assert.throws(()=>optimizeRoute([{id:1,lat:NaN,lng:0}]));
  assert.equal(new Set(optimizeRoute(Array.from({length:15},(_,id)=>({id,lat:35+id/100,lng:139})))).size,15);
  // Syntax diagnostics on authored TypeScript and TSX, excluding unchanged vendored sources.
  const changed=execFileSync("git",["diff","--name-only","0a58dd8810f38fac1b732b816ded5c879348bc4e"],{cwd:root,encoding:"utf8"}).trim().split("\n").filter(file => !file.includes("vendor/"));
  const added=["client/src/components/FreeMap.tsx","client/src/pages/trip-tabs/LocalMapTab.tsx","shared/bookingValidation.ts","shared/routeOptimize.ts"];
  for(const file of [...changed,...added].filter(p=>/\.tsx?$/.test(p))) {
    const result=ts.transpileModule(fs.readFileSync(path.join(root,file),"utf8"),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
    assert.equal((result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,file);
  }
  console.log("PASS: Korean booking/date fixtures, empty/invalid reservation rejection, asymmetric route optimality, larger-route integrity, TS/TSX syntax.");
} finally { fs.rmSync(temp,{recursive:true,force:true}); }

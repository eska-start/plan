import { useEffect, useRef, useState } from "react";
export type Pin = { id:number; lat:number; lng:number; name:string; address?:string|null };
type MapLanguage = "ko"|"en"|"local";
type StyleLayer = { id:string; type:string; layout?:Record<string,unknown> };
type Style = { layers:StyleLayer[]; [key:string]:unknown };
type MapInstance = {
  on(event:string, callback:(event:{lngLat:{lat:number;lng:number}})=>void):void;
  remove():void; resize():void; setStyle(style:Style):void; isStyleLoaded():boolean;
  setCenter(center:[number,number]):void; setZoom(zoom:number):void; fitBounds(bounds:[[number,number],[number,number]],options:object):void;
  getSource(id:string):{setData(data:unknown):void}|undefined;
  addSource(id:string,source:object):void; addLayer(layer:object):void;
};
type Popup = {setDOMContent(element:HTMLElement):Popup};
type Marker = {setLngLat(point:[number,number]):Marker;setPopup(popup:Popup):Marker;addTo(map:MapInstance):Marker;remove():void};
type MapLibrary = {Map:new(options:object)=>MapInstance;Marker:new(options:object)=>Marker;Popup:new(options:object)=>Popup};
declare global { interface Window { maplibregl?:MapLibrary } }
let libraryPromise:Promise<MapLibrary>|null=null;
function loadLibrary():Promise<MapLibrary> {
  if(window.maplibregl)return Promise.resolve(window.maplibregl);
  if(libraryPromise)return libraryPromise;
  libraryPromise=new Promise((resolve,reject)=>{
    const css=document.createElement("link");css.rel="stylesheet";css.href="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css";document.head.append(css);
    const script=document.createElement("script");script.src="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js";script.async=true;
    const timeout=setTimeout(()=>{script.remove();libraryPromise=null;reject(new Error("MAP_LIBRARY_TIMEOUT"));},15000);
    script.onload=()=>{clearTimeout(timeout);if(window.maplibregl)resolve(window.maplibregl);else{libraryPromise=null;reject(new Error("MAP_LIBRARY_UNAVAILABLE"));}};
    script.onerror=()=>{clearTimeout(timeout);script.remove();libraryPromise=null;reject(new Error("MAP_LIBRARY_FAILED"));};document.head.append(script);
  });return libraryPromise;
}
/** Prefer Korean names where supplied by the vector data, then English/Latin, then local. */
export function localizedStyle(style:Style,language:MapLanguage):Style {
  const names=language==="ko"?["name:ko","name_ko","name:en","name_en","name:latin","name"]:language==="en"?["name:en","name_en","name:latin","name"]:["name"];
  const field=["coalesce",...names.map(name=>["get",name])];
  return {...style,layers:style.layers.map(layer=>layer.type==="symbol" && layer.layout?.["text-field"] && /name/.test(JSON.stringify(layer.layout["text-field"])) ? {...layer,layout:{...layer.layout,"text-field":field}}:layer)};
}
export function FreeMap({pins,route,onPick}:{pins:Pin[];route?:[number,number][];onPick?:(lat:number,lng:number)=>void}) {
  const container=useRef<HTMLDivElement>(null),map=useRef<MapInstance|null>(null),markers=useRef<Marker[]>([]),baseStyle=useRef<Style|null>(null);
  const pick=useRef(onPick);pick.current=onPick;
  const [language,setLanguage]=useState<MapLanguage>("ko"),[error,setError]=useState(""),[loaded,setLoaded]=useState(0);
  const fitted=useRef("");
  useEffect(()=>{
    let disposed=false;const controller=new AbortController();let observer:ResizeObserver|undefined;
    void (async()=>{
      try {
        const library=await loadLibrary();
        const response=await fetch("https://tiles.openfreemap.org/styles/bright",{signal:controller.signal});if(!response.ok)throw new Error("MAP_STYLE_FAILED");
        const style=await response.json() as Style;if(disposed||!container.current)return;
        baseStyle.current=style;
        const m=new library.Map({container:container.current,style:localizedStyle(style,"ko"),center:[139.6503,35.6762],zoom:12,localIdeographFontFamily:"sans-serif",attributionControl:true});map.current=m;
        m.on("click",event=>pick.current?.(event.lngLat.lat,event.lngLat.lng));
        m.on("load",()=>{if(!disposed)setLoaded(value=>value+1);});
        m.on("style.load",()=>{if(!disposed)setLoaded(value=>value+1);});
        m.on("error",()=>{if(!disposed)setError("지도 일부를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.");});
        observer=new ResizeObserver(()=>m.resize());observer.observe(container.current);
      }catch{if(!disposed)setError("지도를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.");}
    })();
    return()=>{disposed=true;controller.abort();observer?.disconnect();markers.current.forEach(marker=>marker.remove());map.current?.remove();map.current=null;};
  },[]);
  useEffect(()=>{if(map.current&&baseStyle.current){setLoaded(0);map.current.setStyle(localizedStyle(baseStyle.current,language));}},[language]);
  useEffect(()=>{
    const m=map.current,lib=window.maplibregl;if(!m||!lib||!loaded||!m.isStyleLoaded())return;
    markers.current.forEach(marker=>marker.remove());markers.current=[];
    pins.forEach((pin,index)=>{
      const marker=document.createElement("button");marker.type="button";marker.setAttribute("aria-label",`${index+1}. ${pin.name}`);marker.textContent=String(index+1);marker.style.cssText="width:28px;height:28px;border-radius:50%;background:#4f46e5;color:white;border:2px solid white;font-weight:700";
      const content=document.createElement("div"),title=document.createElement("strong");title.textContent=pin.name;content.append(title);
      if(pin.address){const address=document.createElement("p");address.textContent=pin.address;content.append(address);}
      markers.current.push(new lib.Marker({element:marker}).setLngLat([pin.lng,pin.lat]).setPopup(new lib.Popup({offset:15}).setDOMContent(content)).addTo(m));
    });
    const key=pins.map(pin=>`${pin.id}:${pin.lat}:${pin.lng}`).sort().join(";");
    if(pins.length&&key!==fitted.current){fitted.current=key;if(pins.length===1){m.setCenter([pins[0].lng,pins[0].lat]);m.setZoom(15);}else m.fitBounds([[Math.min(...pins.map(p=>p.lng)),Math.min(...pins.map(p=>p.lat))],[Math.max(...pins.map(p=>p.lng)),Math.max(...pins.map(p=>p.lat))]],{padding:35,maxZoom:15});}
    const data={type:"FeatureCollection",features:route && route.length>1 ? [{type:"Feature",properties:{},geometry:{type:"LineString",coordinates:route.map(([lat,lng])=>[lng,lat])}}]:[]};
    const source=m.getSource("visit-order");if(source)source.setData(data);else{m.addSource("visit-order",{type:"geojson",data});m.addLayer({id:"visit-order-line",type:"line",source:"visit-order",paint:{"line-color":"#4f46e5","line-width":3,"line-dasharray":[2,2]}});}
  },[pins,route,loaded]);
  return <div className="space-y-2"><div className="flex items-center gap-2 text-xs"><label htmlFor="map-language">지명 언어</label><select id="map-language" value={language} onChange={event=>setLanguage(event.target.value as MapLanguage)} className="rounded border p-1"><option value="ko">한국어 우선</option><option value="en">영문 우선</option><option value="local">현지어</option></select><span className="text-muted-foreground">한국어 지명이 없으면 영문·현지어로 표시됩니다.</span></div><div ref={container} aria-label="지도를 눌러 방문 장소 추가" className="h-[420px] w-full rounded-xl border" />{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}

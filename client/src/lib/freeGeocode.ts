export type Coordinates={lat:number;lng:number};
const key="plan-geocode-cache-v1";
const cache=new Map<string,Coordinates>();
let lastRequest=0;
let queue:Promise<unknown>=Promise.resolve();
function valid(value:Coordinates):boolean{return Number.isFinite(value.lat)&&Number.isFinite(value.lng)&&Math.abs(value.lat)<=90&&Math.abs(value.lng)<=180;}
try{const saved=JSON.parse(localStorage.getItem(key)??"[]") as [string,Coordinates][];for(const [query,coordinates] of saved)if(valid(coordinates))cache.set(query,coordinates);}catch{}
/** Modest, serialized public geocoding requests; repeats reuse device cache. */
export async function geocodePlace(query:string,signal:AbortSignal):Promise<Coordinates|null>{
  const text=query.trim();if(!text)return null;
  if(cache.has(text))return cache.get(text)!;
  const request=async()=>{
    if(signal.aborted)return null;
    if(cache.has(text))return cache.get(text)!;
    const delay=Math.max(0,1000-(Date.now()-lastRequest));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    if(signal.aborted)return null;lastRequest=Date.now();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    const cancel=()=>controller.abort();signal.addEventListener("abort",cancel,{once:true});
    try{
      const response=await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=1&lang=en`,{signal:controller.signal});if(!response.ok)return null;
      const data=await response.json() as {features?:{geometry?:{coordinates?:number[]}}[]};
      const position=data.features?.[0]?.geometry?.coordinates;if(!position||position.length<2)return null;
      const coordinates={lat:position[1],lng:position[0]};if(!valid(coordinates))return null;
      cache.set(text,coordinates);try{localStorage.setItem(key,JSON.stringify(Array.from(cache.entries()).slice(-200)));}catch{}
      return coordinates;
    }catch{return null;}finally{clearTimeout(timeout);signal.removeEventListener("abort",cancel);}
  };
  const result=queue.then(request,request);queue=result.then(()=>undefined,()=>undefined);return result;
}

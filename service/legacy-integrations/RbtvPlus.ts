import {assertPublicUrl} from '../src/yomiri/network/SourceRegistry.ts';
import type {LiveEvent,LiveOption} from './LiveTypes.ts';
import {message,messages,number,text,payload,requestFingerprint,type Fields} from './RbtvProtocol.ts';
export const RBTV_WEBSITE='https://www.rbtvplus18.best';
export const RBTV_API='https://apis-data10.tcpwe138stya.ru';
export const RBTV_ICON='https://statics1.tcpwe138stya.ru/img/rb/favicon_32.png';
const safeUrl=(raw:string):string|undefined=>{try{const url=assertPublicUrl(raw);return url.protocol==='https:'?url.href:undefined;}catch{return undefined;}};
// Some match records still reference the retired logo CDN. The current host
// is the LOGOS_URL advertised by the provider's public football page.
const logoUrl=(raw:string):string|undefined=>{const valid=safeUrl(raw);if(!valid)return undefined;const url=new URL(valid);if(url.hostname==='logos1.tcrbg61levl.cfd')url.hostname='logos1.tcpwe138stya.ru';return url.href;};
type RbtvRequest = (path: string, ttl?: number) => Promise<{body: Uint8Array; headers: Record<string, string>}>;
// The public player wraps the session issued by /api/stream/detail with AES-CTR.
// This uses that same session, without forging credentials or skipping authorization.
export async function rbtvSessionPath(session:string):Promise<string>{
 if(!session||session.length>2048)throw new Error('RBTV+ no entregó una sesión de reproducción.');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(atob('YTc5ODFjYzllYjJmNGQxOWRjZmVhNTdiMTAxZWNkODk=')),'AES-CTR',false,['encrypt']);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-CTR',counter:new TextEncoder().encode(atob('ODAxN2QzYThmMTQwMGQyZg==')),length:32},key,new TextEncoder().encode(session)));
 return encodeURIComponent(btoa(String.fromCharCode(...cipher)))+'a';
}
async function signed(path:string,code:number,params:Record<string,number|boolean>,request:RbtvRequest){const bytes=async(path:string)=>payload((await request(path,15000)).body);const bs=new URLSearchParams({code:String(code),...(params.matchId?{matchId:String(params.matchId)}:{}),sportType:'1',stream:'true'});const keys=await bytes('/api/common/bs?'+bs);const entry=messages(keys,1).find(row=>number(row,1)===code);const token=entry?text(entry,2):'';if(!/^[a-f0-9]{32}$/.test(token))throw new Error('RBTV+ no entregó la agenda solicitada.');const query=new URLSearchParams(Object.entries(params).map(([key,value])=>[key,String(value)]));return bytes('/sfver'+requestFingerprint(JSON.stringify(params)).slice(0,6)+token+path+'?'+query);}
const localized=(fields:Fields)=>{const names=messages(fields,3);return text(names.find(row=>number(row,1)===4)||names.find(row=>number(row,1)===0)||names[0]||new Map(),2);};
const team=(fields:Fields)=>({name:localized(fields)||'Equipo por confirmar',logo:logoUrl(text(fields,4))});
export function parseRbtvMatches(data:Fields,serverTime:number,updatedAt=Date.now()):LiveEvent[]{
 const available=new Set(messages(data,2).filter(row=>number(row,5)===1).map(row=>String(number(row,50))));
 return messages(data,1).slice(0,1000).filter(row=>number(row,2)===1).map<LiveEvent>(row=>{
  const id=String(number(row,1)),statusCode=number(row,4),league=message(row,10),extra=message(row,150);
  const contenders=messages(row,30).filter(item=>item.has(10));const home=team(row.has(20)?message(row,20):message(contenders[0]||new Map(),10)),away=team(row.has(21)?message(row,21):message(contenders[1]||new Map(),10));
  const status:LiveEvent['status']=statusCode===10000?'finished':statusCode===10001||statusCode===10404?'cancelled':statusCode===10103||statusCode===10101?'postponed':statusCode===10002||statusCode===10102?'suspended':statusCode>0&&statusCode<10000?'live':'upcoming';
  let clock=statusCode===102?'Descanso':statusCode===104?'Prórroga':statusCode===105?'Penales':undefined;
  if(!clock&&status==='live'){
   if(extra.has(2))clock=String(number(extra,2))+'′';
   else if(statusCode===101||statusCode===103){const start=number(extra,statusCode===101?3:4);const elapsed=start?Math.floor((serverTime-start)/60000):NaN;const base=statusCode===101?0:45,limit=statusCode===101?45:90;const minute=base+elapsed;if(elapsed>=0&&elapsed<=75)clock=(minute>limit?limit+'+'+(minute-limit):String(Math.max(base+1,minute)))+'′ aprox.';}
  }
  const date=number(row,3),leagueLink=text(extra,21),teamLink=text(extra,20);
  const pageUrl=leagueLink&&teamLink?RBTV_WEBSITE+'/es/football/'+encodeURIComponent(leagueLink)+'-'+id+'/'+encodeURIComponent(teamLink)+'.html':RBTV_WEBSITE+'/es/football.html';
  return {id:'rbtv:'+id,title:home.name+' vs '+away.name,competition:localized(league)||'Fútbol',logo:logoUrl(text(league,4)),startsAt:date>0?new Date(date).toISOString():undefined,home,away,status,clock,score:status==='live'||status==='finished'||status==='suspended'?{home:number(row,22),away:number(row,23)}:undefined,available:available.has(id),provider:'rbtvplus',options:[],updatedAt,pageUrl};
 }).sort((a,b)=>({live:0,upcoming:1,suspended:2,postponed:3,finished:4,cancelled:5}[a.status!]-{live:0,upcoming:1,suspended:2,postponed:3,finished:4,cancelled:5}[b.status!])||Date.parse(a.startsAt||'')-Date.parse(b.startsAt||''));
}
export async function loadRbtvAgenda(request: RbtvRequest): Promise<LiveEvent[]> {
 const [data, server] = await Promise.all([
  signed('/api/match/live',100,{sportType:1,language:4,stream:true},request),
  request('/api/common/timesync',15000),
 ]);
 return parseRbtvMatches(data, number(payload(server.body),1));
}

export async function loadRbtvSignals(eventId:string, request:RbtvRequest):Promise<LiveOption[]>{
 const id=/^rbtv:(\d+)$/.exec(eventId)?.[1];if(!id)return [];
 // The player API selects the delivery CDN using the viewer location it
 // reports itself. Without these fields it returns an inactive RTMP origin.
 const viewer=await request('/api-cf/user/info',60000);
 const [continent,country]=String(viewer.headers.ruserinfo||'').split('|');
 if(!/^[A-Z]{2}$/.test(continent)||!/^[A-Z]{2}$/.test(country))throw new Error('RBTV+ no pudo iniciar la sesión de reproducción. Reintentá.');
 const detail=await signed('/api/match/detail',102,{matchId:Number(id),sportType:1,language:4,stream:true},request);
 const results=await Promise.allSettled(messages(detail,2).filter(row=>number(row,5)===1&&number(row,6)===0).slice(0,6).map(async stream=>{
  const query=new URLSearchParams({matchId:id,streamId:String(number(stream,1)),sportType:'1',siteType:String(number(stream,9)),continent,country,digit:'trd'});const response=await request('/api/stream/detail?'+query,0);const data=message(payload(response.body),2);let raw=text(data,4);
  if(!/^https?:\/\//.test(raw)){raw=raw.replace(/[!-~]/g,c=>String.fromCharCode(33+(c.charCodeAt(0)-33+47)%94));raw=raw.slice(raw.search(/https?:\/\//));}
  const url=assertPublicUrl(raw);url.protocol='https:';if(!/\.m3u8$/i.test(url.pathname))throw new Error('La señal no ofrece HLS directo.');
  url.pathname='/token-'+await rbtvSessionPath(response.headers['rb-session'])+url.pathname;
  // The CDN can return HTTP 200 with a text placeholder instead of video.
  // Never advertise that response as a playable HLS signal.
  const check=await fetch(url.href,{credentials:'omit',signal:AbortSignal.timeout(8000)});
  const playlist=await check.text();if(!check.ok||!playlist.trimStart().startsWith('#EXTM3U'))throw new Error('La fuente no entregó una playlist HLS válida.');
  return {name:text(stream,3)||'Señal',url:url.href};
 }));return [...new Map(results.flatMap(result=>result.status==='fulfilled'?[[result.value.url,result.value] as const]:[])).values()];
}

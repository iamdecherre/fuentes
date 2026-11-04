import type { AnimeSource, AnimeTitle, AnimeEpisode, AnimeServer } from '../../src/yomiri/anime/types.ts';
import type { YomiriHttpClient } from '../../src/yomiri/network/types.ts';
import { assertPublicUrl } from '../../src/yomiri/network/SourceRegistry.ts';

/** Parses JSON literals only. It never executes a source's scripts. */
export function assignedJson(html:string,name:'anime_info'|'episodes'|'videos'|'animes'|'servers'):unknown {
  const match=new RegExp(`\\b${name}\\s*=\\s*`).exec(html);
  if(!match)return undefined;
  const start=match.index+match[0].length;
  const opening=html[start];if(!['[','{'].includes(opening))return undefined;
  let depth=0;let quote='';let escaped=false;
  for(let i=start;i<html.length;i++){
    const ch=html[i];
    if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}
    if(ch==='"'){quote=ch;continue;}
    if(ch==='['||ch==='{')depth++;
    if(ch===']'||ch==='}')if(--depth===0)return JSON.parse(html.slice(start,i+1));
  }
  throw new Error(`AnimeFLV: JSON incompleto (${name}).`);
}

export class AnimeFlvSource implements AnimeSource {
  readonly id='animeflv';readonly name='AnimeFLV';readonly website='https://www3.animeflv.net';readonly lang='es';
  constructor(private readonly http:YomiriHttpClient){}
  private async document(url:string){
    if(new URL(url).origin!==this.website)throw new Error('Enlace de AnimeFLV inválido.');
    const r=await this.http.text({sourceId:this.id,url,method:'GET',responseType:'text',credentials:'include',cache:{ttlMs:300000,scope:'session'}});
    if(r.status===522||r.status===524)throw new Error(`AnimeFLV no respondió a tiempo (HTTP ${r.status}). Reintentá cuando el sitio vuelva a responder.`);
    if(r.status>=400)throw new Error(`AnimeFLV: HTTP ${r.status}.`);
    if(r.classification==='challenge')throw new Error('AnimeFLV requiere verificar el navegador.');
    return {html:r.body,dom:new DOMParser().parseFromString(r.body,'text/html')};
  }
  private absolute(url:string){return new URL(url,this.website).href;}
  private async catalog(url:string){
    const {dom}=await this.document(url);
    const titles=Array.from(dom.querySelectorAll('ul.ListAnimes li article')).flatMap(card=>{
      const link=card.querySelector('a[href*="/anime/"]')?.getAttribute('href');const title=card.querySelector('h3.Title')?.textContent?.trim();
      if(!link||!title)return [];
      const id=this.absolute(link);const cover=card.querySelector('img')?.getAttribute('src');
      return [{id,url:id,sourceId:this.id,title,coverUrl:cover?this.absolute(cover):undefined,genres:[],status:'UNKNOWN' as const}];
    });
    if(!titles.length)throw new Error('AnimeFLV no devolvió títulos compatibles.');
    return {titles,hasNextPage:!!dom.querySelector('.pagination a[rel="next"], .pagination .next')};
  }
  getPopular(page=1){return this.catalog(`${this.website}/browse?order=rating&page=${page}`);}
  search(query:string,page=1){return this.catalog(`${this.website}/browse?q=${encodeURIComponent(query)}&page=${page}`);}
  async getAnime(id:string):Promise<AnimeTitle>{
    const {dom}=await this.document(id);const title=dom.querySelector('h1.Title')?.textContent?.trim();if(!title)throw new Error('AnimeFLV: no se encontró la ficha.');
    const cover=dom.querySelector('.AnimeCover img')?.getAttribute('src');
    return {id,url:id,sourceId:this.id,title,coverUrl:cover?this.absolute(cover):undefined,description:dom.querySelector('.Description p')?.textContent?.trim(),genres:Array.from(dom.querySelectorAll('.Nvgnrs a')).map(e=>e.textContent?.trim()||'').filter(Boolean),status:'UNKNOWN'};
  }
  async getEpisodes(id:string):Promise<AnimeEpisode[]>{
    const {html}=await this.document(id);const info=assignedJson(html,'anime_info');const entries=assignedJson(html,'episodes');
    if(!Array.isArray(info)||typeof info[2]!=='string'||!Array.isArray(entries))throw new Error('AnimeFLV: no se pudo extraer la lista de episodios.');
    return entries.flatMap(row=>{const number=Array.isArray(row)?Number(row[0]):NaN;if(!Number.isFinite(number))return [];const url=this.absolute(`/ver/${info[2]}-${number}`);return [{id:url,url,animeId:id,sourceId:this.id,name:`Episodio ${number}`,episodeNumber:number}];});
  }
  async getServers(id:string):Promise<AnimeServer[]>{
    const {html}=await this.document(id);const videos=assignedJson(html,'videos');
    if(!videos||typeof videos!=='object')throw new Error('AnimeFLV: no hay servidores de reproducción disponibles.');
    const result:AnimeServer[]=[];
    for(const [language,rows] of Object.entries(videos)){
      if(!Array.isArray(rows))continue;
      for(const row of rows){
        if(!row||typeof row!=='object')continue;
        const data=row as Record<string,unknown>;let raw=data.url||data.code;
        if(typeof raw!=='string')continue;
        if(raw.includes('<iframe'))raw=new DOMParser().parseFromString(raw,'text/html').querySelector('iframe')?.getAttribute('src')||'';
        let url:URL;try{url=assertPublicUrl(raw as string);}catch{continue;}
        if(url.protocol!=='https:'||url.username||url.password)continue;
        const delivery=url.pathname.endsWith('.m3u8')?'hls':/\.(mp4|webm)$/i.test(url.pathname)?'direct':'embed';
        result.push({id:`${language}:${result.length}`,name:String(data.title||data.server||'Servidor'),language,url:url.href,delivery,referer:id});
      }
    }
    return result;
  }
}

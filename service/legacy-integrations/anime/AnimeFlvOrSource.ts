import type { AnimeSource, AnimeTitle, AnimeEpisode, AnimeServer } from '../../src/yomiri/anime/types.ts';
import type { YomiriHttpClient } from '../../src/yomiri/network/types.ts';
import { assertPublicUrl, registerDynamicSource } from '../../src/yomiri/network/SourceRegistry.ts';

/** animeflv.or.at publishes episode JSON and Base64 embed URLs, unlike animeflv.net. */
export class AnimeFlvOrSource implements AnimeSource {
  readonly id = 'animeflvor';
  readonly name = 'AnimeFLV';
  readonly website = 'https://animeflv.or.at';
  readonly lang = 'es';
  private readonly networkId = 'dynamic-animeflvor';
  constructor(private readonly http: Pick<YomiriHttpClient, 'text'>) {
    registerDynamicSource({id:this.networkId, revision:'1', baseUrl:this.website, allowedHosts:['animeflv.or.at']});
  }
  private url(raw: string) {
    const url = assertPublicUrl(new URL(raw, this.website).href);
    if(url.origin !== this.website) throw new Error('AnimeFLV: enlace fuera de la fuente.');
    return url.href;
  }
  private async document(raw: string) {
    const response = await this.http.text({sourceId:this.networkId,url:this.url(raw),method:'GET',responseType:'text',credentials:'include',cache:{ttlMs:300000,scope:'session'}});
    if(response.classification==='challenge') throw new Error('AnimeFLV requiere verificar el navegador.');
    if(response.status>=400) throw new Error(`AnimeFLV: HTTP ${response.status}.`);
    return new DOMParser().parseFromString(response.body,'text/html');
  }
  private cover(dom: ParentNode): string | undefined {
    const img=dom.querySelector('img');
    const raw=img?.getAttribute('data-src')||img?.getAttribute('src');
    if(!raw)return undefined;
    try{return assertPublicUrl(new URL(raw,this.website).href).href;}catch{return undefined;}
  }
  private async catalog(path: string) {
    const dom=await this.document(path);
    const titles=new Map<string,AnimeTitle>();
    for(const a of dom.querySelectorAll('a[href*="/anime/"]')) {
      const raw=a.getAttribute('href'); if(!raw)continue;
      const url=this.url(raw); if(new URL(url).pathname==='/anime/')continue;
      const card=a.closest('article,li,.anime-card,.anime-item')||a;
      const title=card.querySelector('h2,h3,h4')?.textContent?.trim()||a.querySelector('img')?.getAttribute('alt')||a.textContent?.trim();
      const coverUrl=this.cover(card);
      if(!title||!coverUrl)continue;
      titles.set(url,{id:url,url,sourceId:this.id,title,coverUrl,genres:[],status:'UNKNOWN'});
    }
    if(!titles.size)throw new Error('AnimeFLV: no se encontraron fichas en el catálogo.');
    return {titles:[...titles.values()],hasNextPage:!!dom.querySelector('a.next,.next.page-numbers')};
  }
  getPopular(page=1){return this.catalog(page===1?'/anime/':`/anime/page/${page}/`);}
  getLatest(page=1){return this.getPopular(page);}
  search(query:string,page=1){return this.catalog(`/?s=${encodeURIComponent(query)}&paged=${page}`);}
  async getAnime(id:string):Promise<AnimeTitle>{
    const dom=await this.document(id);
    const title=dom.querySelector('h1')?.textContent?.trim();
    if(!title)throw new Error('AnimeFLV: ficha sin título.');
    const poster=dom.querySelector('.anime-poster');
    const coverUrl=poster?this.cover(poster):undefined;
    const description=dom.querySelector('.anime-synopsis')?.textContent?.replace(/^\s*Sinopsis\s*/i,'').trim();
    return {id:this.url(id),url:this.url(id),sourceId:this.id,title,coverUrl,description:description||undefined,genres:[],status:'UNKNOWN'};
  }
  async getEpisodes(id:string):Promise<AnimeEpisode[]>{
    const dom=await this.document(id);
    const raw=dom.querySelector('.animeflv-episodes-data')?.textContent;
    if(!raw)throw new Error('AnimeFLV: no se encontró la lista de episodios.');
    const rows:unknown=JSON.parse(raw);
    if(!Array.isArray(rows))throw new Error('AnimeFLV: episodios inválidos.');
    return rows.flatMap(row=>{
      if(!row||typeof row.permalink!=='string'||!Number.isFinite(row.number))return [];
      const url=this.url(row.permalink);
      return [{id:url,url,animeId:id,sourceId:this.id,name:`Episodio ${row.number}`,episodeNumber:row.number}];
    });
  }
  async getServers(id:string):Promise<AnimeServer[]>{
    const dom=await this.document(id);const servers=new Map<string,AnimeServer>();
    for(const button of dom.querySelectorAll('.iframe_code[data-src]')){
      try{
        const url=assertPublicUrl(atob(button.getAttribute('data-src')||'')).href;
        const name=button.parentElement?.querySelector('.tooltip-text')?.textContent?.trim()||new URL(url).hostname;
        servers.set(url,{id:url,url,name,language:button.getAttribute('app_type')||'Sub',delivery:/\.m3u8(?:\?|$)/.test(url)?'hls':'embed',referer:id});
      }catch{/* Ignore malformed or non-public embeds. */}
    }
    if(!servers.size)throw new Error('AnimeFLV: este episodio no ofrece servidores.');
    return [...servers.values()];
  }
}

import type { AnimeSource,AnimeTitle,AnimeEpisode,AnimeServer } from '../../src/yomiri/anime/types.ts';
import type { YomiriHttpClient } from '../../src/yomiri/network/types.ts';
import { assertPublicUrl } from '../../src/yomiri/network/SourceRegistry.ts';
import { assignedJson } from './AnimeFlvSource.ts';

/** Web connector using the public site's structure documented by Yuzono's Jkanime extension.
 * Reference: https://github.com/yuzono/anime-extensions/tree/master/src/es/jkanime
 * APKs and source scripts are never executed in Yomiri.
 */
export class JkAnimeSource implements AnimeSource {
  readonly id='jkanime';readonly name='JKanime';readonly website='https://jkanime.net';readonly lang='es';
  constructor(private readonly http:Pick<YomiriHttpClient,'text'>){}
  private url(raw:string){const url=new URL(raw,this.website);if(url.origin!==this.website)throw new Error('Enlace de JKanime inválido.');return url.href;}
  private async request(raw:string,body?:string){
    const r=await this.http.text({sourceId:this.id,url:this.url(raw),method:body?'POST':'GET',body,responseType:'text',credentials:'include',headers:{Referer:this.website+'/',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},cache:{ttlMs:body?0:300000,scope:'session'}});
    if(r.classification==='challenge')throw new Error('JKanime requiere verificar el navegador en su sitio.');
    if(r.status===419)throw new Error('JKanime: la sesión del sitio venció (HTTP 419). Abrí JKanime en este navegador y reintentá.');
    if(r.status>=400)throw new Error(`JKanime: HTTP ${r.status}.`);
    return r.body;
  }
  private async document(id:string){const html=await this.request(id);return {html,dom:new DOMParser().parseFromString(html,'text/html')};}
  private async catalog(path:string){
    const {html,dom}=await this.document(path);const data=assignedJson(html,'animes') as {data?:Record<string,unknown>[];next_page_url?:string}|undefined;
    const titles:AnimeTitle[]=data?.data?.flatMap(row=>{
      if(typeof row.url!=='string'||typeof row.title!=='string')return [];
      const id=this.url(row.url);return [{id,url:id,sourceId:this.id,title:row.title,coverUrl:typeof row.image==='string'?assertPublicUrl(new URL(row.image,this.website).href).href:undefined,description:typeof row.synopsis==='string'?row.synopsis:undefined,genres:[],status:'UNKNOWN'}];
    })||Array.from(dom.querySelectorAll('.anime__item')).flatMap(card=>{
      const a=card.querySelector('.anime__item__text a');const href=a?.getAttribute('href');const title=a?.textContent?.trim();if(!href||!title)return [];
      const id=this.url(href);const cover=card.querySelector('[data-setbg]')?.getAttribute('data-setbg');return [{id,url:id,sourceId:this.id,title,coverUrl:cover?assertPublicUrl(new URL(cover,this.website).href).href:undefined,genres:[],status:'UNKNOWN' as const}];
    });
    if(!titles.length)throw new Error('JKanime no devolvió títulos compatibles.');
    return {titles,hasNextPage:!!data?.next_page_url};
  }
  getPopular(page=1){return this.catalog(`/directorio?filtro=popularidad&p=${page}`);}
  search(query:string){return this.catalog(`/buscar/${encodeURIComponent(query.trim().replace(/\s+/g,'_'))}`);}
  async getAnime(id:string):Promise<AnimeTitle>{
    const {dom}=await this.document(id);const title=dom.querySelector('.anime__details__content .anime_info h3, .anime__details__title h3')?.textContent?.trim();if(!title)throw new Error('JKanime: no se encontró la ficha.');
    const cover=dom.querySelector('.anime__details__content .anime_pic img')?.getAttribute('src')||dom.querySelector('.anime__details__pic')?.getAttribute('data-setbg');
    return {id:this.url(id),url:this.url(id),sourceId:this.id,title,description:dom.querySelector('.anime_info p.scroll, .anime__details__text p')?.textContent?.trim(),coverUrl:cover?assertPublicUrl(new URL(cover,this.website).href).href:undefined,genres:[],status:'UNKNOWN'};
  }
  async getEpisodes(id:string):Promise<AnimeEpisode[]>{
    const {dom}=await this.document(id);const token=dom.querySelector('meta[name="csrf-token"]')?.getAttribute('content');const animeId=dom.querySelector('#guardar-anime')?.getAttribute('data-anime');
    if(!token||!animeId||!/^\d+$/.test(animeId))throw new Error('JKanime: faltan los datos de episodios.');
    const episodes:AnimeEpisode[]=[];let lastPage=1;
    for(let page=1;page<=lastPage;page++){
      const data=JSON.parse(await this.request(`/ajax/episodes/${animeId}/${page}`,new URLSearchParams({_token:token}).toString())) as {data?:{number:number}[];last_page?:number;from?:number;to?:number;total?:number};
      if(!Array.isArray(data.data))throw new Error('JKanime: respuesta de episodios inválida.');
      lastPage=data.last_page||1;if(!Number.isInteger(lastPage)||lastPage<1||lastPage>200)throw new Error('JKanime: paginación inválida.');
      for(const row of data.data){if(!Number.isFinite(row.number))continue;const url=this.url(`${id.replace(/\/$/,'')}/${row.number}`);episodes.push({id:url,url,animeId:id,sourceId:this.id,name:`Episodio ${row.number}`,episodeNumber:row.number});}
      // Yuzono's fast episode mode uses the pagination range for numbered episodes.
      // Apply it only when the returned numbers agree with that range.
      if(page===1&&Number.isInteger(data.total)&&data.total!>0&&data.total!<=10000&&data.from===1&&data.to===data.data.length&&data.data.every((row,i)=>row.number===i+1)){
        for(let number=data.data.length+1;number<=data.total!;number++){
          const url=this.url(`${id.replace(/\/$/,'')}/${number}`);episodes.push({id:url,url,animeId:id,sourceId:this.id,name:`Episodio ${number}`,episodeNumber:number});
        }
        break;
      }
    }
    return [...new Map(episodes.map(e=>[e.id,e])).values()].sort((a,b)=>b.episodeNumber-a.episodeNumber);
  }
  async getServers(id:string):Promise<AnimeServer[]>{
    const {html,dom}=await this.document(id);const rows=assignedJson(html,'servers');const results:AnimeServer[]=[];
    const add=(raw:string,name:string,language:string)=>{try{const url=assertPublicUrl(new URL(raw,this.website).href);if(url.protocol!=='https:')return;results.push({id:url.href,url:url.href,name,language,delivery:'embed',referer:id});}catch{/* Ignore unsafe server links. */}};
    if(Array.isArray(rows))for(const row of rows){if(row&&typeof row.remote==='string')try{add(atob(row.remote),String(row.server||'Servidor'),row.lang===3?'Latino':'Subtitulado');}catch{/* Invalid Base64. */}}
    for(const a of dom.querySelectorAll('.bg-servers a[data-id]')){
      const key=a.getAttribute('data-id');if(!key||!/^\d+$/.test(key))continue;
      const match=new RegExp(`video\\[${key}\\]\\s*=\\s*(['"])(.*?)\\1`,'s').exec(html);if(!match)continue;
      const iframe=new DOMParser().parseFromString(match[2].replace(/\\"/g,'"'),'text/html').querySelector('iframe')?.getAttribute('src');
      if(iframe)add(iframe,a.textContent?.trim()||'Servidor',a.className.includes('lg_3')?'Latino':'Subtitulado');
    }
    return [...new Map(results.map(s=>[s.url,s])).values()];
  }
}

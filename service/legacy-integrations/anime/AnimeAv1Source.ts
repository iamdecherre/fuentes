import type { AnimeSource, AnimeTitle, AnimeEpisode, AnimeServer, AnimeCatalogFilter } from '../../src/yomiri/anime/types.ts';
import type { YomiriHttpClient } from '../../src/yomiri/network/types.ts';
import { assertPublicUrl } from '../../src/yomiri/network/SourceRegistry.ts';

/** AnimeAV1 web adapter. Structure reference: Yuzono's Apache-2.0 AnimeAv1 connector.
 * https://github.com/yuzono/anime-extensions/tree/master/src/es/animeav1
 * Reads HTML and data literals only; it never executes scripts or APKs.
 */
export class AnimeAv1Source implements AnimeSource {
  readonly id='animeav1'; readonly name='AnimeAV1'; readonly website='https://animeav1.com'; readonly lang='es';
  constructor(private readonly http:Pick<YomiriHttpClient,'text'>){}
  private url(raw:string):string {
    const url=assertPublicUrl(new URL(raw,this.website).href);
    if(url.origin!==this.website)throw new Error('Enlace de AnimeAV1 inválido.');
    return url.href;
  }
  private async document(raw:string){
    const r=await this.http.text({sourceId:this.id,url:this.url(raw),method:'GET',responseType:'text',credentials:'include',headers:{Referer:this.website+'/'},cache:{ttlMs:300000,scope:'session'}});
    if(r.classification==='challenge')throw new Error('AnimeAV1 requiere verificar el navegador en su sitio.');
    if(r.status>=400)throw new Error(`AnimeAV1: HTTP ${r.status}.`);
    const dom=new DOMParser().parseFromString(r.body,'text/html');
    return {dom,script:Array.from(dom.querySelectorAll('script')).map(s=>s.textContent||'').filter(s=>s.includes('node_ids')).join('\n')};
  }
  private cover(raw:string|null|undefined):string|undefined {
    if(!raw)return undefined;
    try{return assertPublicUrl(new URL(raw,this.website).href).href;}catch{return undefined;}
  }
  private async catalog(path:string){
    const {dom}=await this.document(path);
    const titles:AnimeTitle[]=Array.from(dom.querySelectorAll('article[class*="group/item"]')).flatMap(card=>{
      const href=card.querySelector('a')?.getAttribute('href');const title=card.querySelector('header h3')?.textContent?.trim();
      if(!href||!title)return [];
      const id=this.url(href);const img=card.querySelector('.bg-current img, img');
      return [{id,url:id,sourceId:this.id,title,coverUrl:this.cover(img?.getAttribute('data-src')||img?.getAttribute('src')),genres:[],status:'UNKNOWN'}];
    });
    const scripts = Array.from(dom.querySelectorAll('script')).map(node => node.textContent || '').join('\n');
    if(!titles.length&&!/totalRecords\s*:\s*0\b/.test(scripts))throw new Error('AnimeAV1: el catálogo cambió o no devolvió títulos.');
    const currentPage = Number(new URL(path,this.website).searchParams.get('page') || 1);
    const hasNextPage = Array.from(dom.querySelectorAll('a[href]')).some(anchor => {
      const link = new URL(anchor.getAttribute('href')!,this.website);
      return link.origin === this.website && link.pathname === '/catalogo' && Number(link.searchParams.get('page')) === currentPage + 1;
    });
    return {titles,hasNextPage};
  }
  getPopular(page=1){return this.catalog(`/catalogo?order=popular&page=${page}`);}
  getLatest(page=1){return this.catalog(`/catalogo?order=latest_added&page=${page}`);}
  search(query:string,page=1,filters:Record<string,string>={}){
    const params = new URLSearchParams({search:query.trim(),page:String(page),order:'latest_added'});
    for(const key of ['category','genre','status','minYear','maxYear','letter','order']) if(filters[key]) params.set(key,filters[key]);
    return this.catalog(`/catalogo?${params}`);
  }
  async getSearchFilters():Promise<AnimeCatalogFilter[]> {
    const {dom} = await this.document('/catalogo');
    const scripts = Array.from(dom.querySelectorAll('script')).map(node=>node.textContent||'').join('\n');
    const genreBlock = /genresIdsMap\s*:\s*\{([\s\S]*?)\}\s*,\s*filters\s*:/.exec(scripts)?.[1] || '';
    const genres = Array.from(genreBlock.matchAll(/name\s*:\s*("(?:\\.|[^"\\])*")[^{}]*?slug\s*:\s*("(?:\\.|[^"\\])*")/g))
      .map(match=>({label:JSON.parse(match[1]) as string,value:JSON.parse(match[2]) as string}));
    if(!genres.length) throw new Error('No se pudieron leer los géneros de AnimeAV1.');
    const years = /\byears\s*:\s*\[(\d{4}),(\d{4})\]/.exec(scripts);
    const first = Number(years?.[1] || 1990), last = Number(years?.[2] || new Date().getFullYear());
    const yearOptions = Array.from({length:Math.min(200,Math.max(0,last-first+1))},(_,index)=>({value:String(last-index),label:String(last-index)}));
    return [
      {key:'category',label:'Tipo',options:[['tv-anime','TV Anime'],['pelicula','Película'],['ova','OVA'],['especial','Especial'],['ona','ONA']].map(([value,label])=>({value,label}))},
      {key:'genre',label:'Género',options:genres},
      {key:'minYear',label:'Desde año',options:yearOptions},
      {key:'maxYear',label:'Hasta año',options:yearOptions},
      {key:'status',label:'Estado',options:[{value:'finalizado',label:'Finalizado'},{value:'proximamente',label:'Próximamente'},{value:'emision',label:'En emisión'}]},
      {key:'letter',label:'Inicial',options:['#',...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(value=>({value,label:value}))},
      {key:'order',label:'Orden',options:[['latest_added','Recién agregados'],['latest_released','Últimos estrenos'],['popular','Populares'],['score','Puntuación'],['title','Alfabético'],['default','Predeterminado']].map(([value,label])=>({value,label}))},
    ];
  }
  async getAnime(id:string):Promise<AnimeTitle>{
    const {dom}=await this.document(id);const title=dom.querySelector('h1.line-clamp-2')?.textContent?.trim();
    if(!title)throw new Error('AnimeAV1: no se encontró la ficha.');
    const statusText=dom.querySelector('header')?.textContent||'';
    return {id:this.url(id),url:this.url(id),sourceId:this.id,title,coverUrl:this.cover(dom.querySelector('img.object-cover')?.getAttribute('src')),description:dom.querySelector('.entry > p')?.textContent?.trim(),genres:Array.from(dom.querySelectorAll('header > .items-center > a')).map(a=>a.textContent?.trim()||'').filter(Boolean),status:statusText.includes('Finalizado')?'COMPLETED':statusText.includes('En emisión')?'ONGOING':'UNKNOWN'};
  }
  async getEpisodes(id:string):Promise<AnimeEpisode[]>{
    const {script,dom}=await this.document(id);const block=/\bepisodes\s*:\s*\[([^\]]*)\]/s.exec(script)?.[1];
    if(block===undefined)throw new Error('AnimeAV1: no se encontraron los datos de episodios.');
    const episodes=Array.from(block.matchAll(/\{\s*id\s*:\s*\d+(?:\.\d+)?\s*,\s*number\s*:\s*(\d+(?:\.\d+)?)\s*\}/g)).map(match=>{
      const number=Number(match[1]);const url=this.url(`${new URL(this.url(id)).pathname.replace(/\/$/,'')}/${number}`);
      const anchor=Array.from(dom.querySelectorAll('a[href]')).find(a=>{try{return new URL(a.getAttribute('href')!,this.website).href===url;}catch{return false;}});const image=anchor?.querySelector('img');const raw=image?.getAttribute('data-src')||image?.getAttribute('src');let thumbnailUrl:string|undefined;try{if(raw)thumbnailUrl=assertPublicUrl(new URL(raw,this.website).href).href;}catch{}
      return {id:url,url,animeId:id,sourceId:this.id,name:`Episodio ${number}`,episodeNumber:number,thumbnailUrl};
    });
    if(block.trim()&&!episodes.length)throw new Error('AnimeAV1: el formato de episodios cambió.');
    return [...new Map(episodes.map(e=>[e.id,e])).values()].sort((a,b)=>b.episodeNumber-a.episodeNumber);
  }
  async getServers(id:string):Promise<AnimeServer[]>{
    const {script}=await this.document(id);const block=/\bembeds\s*:\s*\{([\s\S]*?)\}\s*,\s*downloads\s*:/.exec(script)?.[1];
    if(block===undefined)throw new Error('AnimeAV1: no se encontraron servidores del episodio.');
    const rawServers:AnimeServer[]=[];
    for(const group of block.matchAll(/\b(SUB|DUB)\s*:\s*\[([^\]]*)\]/g)){
      for(const row of group[2].matchAll(/\{\s*server\s*:\s*("(?:\\.|[^"\\])*")\s*,\s*url\s*:\s*("(?:\\.|[^"\\])*")\s*\}/g)){
        try{
          const name:unknown=JSON.parse(row[1]);const raw:unknown=JSON.parse(row[2]);
          if(typeof name!=='string'||typeof raw!=='string')continue;
          const url=assertPublicUrl(raw);if(url.protocol!=='https:')continue;
          rawServers.push({id:`${group[1]}:${url.href}`,name,language:group[1]==='SUB'?'Subtitulado':'Latino',url:url.href,rawUrl:url.href,delivery:'embed',referer:this.url(id)});
        }catch{/* Ignore malformed or unsafe server entries. */}
      }
    }
    if(!rawServers.length)throw new Error('AnimeAV1: no hay servidores web compatibles para este episodio.');
    const uniqueRaw=[...new Map(rawServers.map(s=>[s.id,s])).values()];

    const resolved = uniqueRaw;

    // Extract official download mirrors (e.g. TransferIt, Mega)
    const downloadsBlock = /\bdownloads\s*:\s*\{([\s\S]*?)\}/.exec(script)?.[1];
    if (downloadsBlock) {
      for (const group of downloadsBlock.matchAll(/\b(SUB|DUB)\s*:\s*\[([^\]]*)\]/g)) {
        for (const row of group[2].matchAll(/\{\s*server\s*:\s*("(?:\\.|[^"\\])*")\s*,\s*url\s*:\s*("(?:\\.|[^"\\])*")\s*\}/g)) {
          try {
            const name = JSON.parse(row[1]);
            const raw = JSON.parse(row[2]);
            if (typeof name !== 'string' || typeof raw !== 'string') continue;
            const url = assertPublicUrl(raw);
            resolved.push({
              id: `dl:${group[1]}:${url.href}`,
              name: `Descarga: ${name}`,
              language: group[1] === 'SUB' ? 'Subtitulado' : 'Latino',
              url: url.href,
              rawUrl: url.href,
              delivery: 'embed',
              downloadUrl: url.href,
            });
          } catch {}
        }
      }
    }

    // Filter out known broken/ad-redirect wrappers if native servers are available
    const filtered = resolved.filter(s => {
      // player.zilla-networks is broken in iframes / CORS
      if (s.url.includes('zilla-networks.com')) return false;
      return true;
    });

    // Put native servers first, then embed, then external download mirrors
    return filtered.sort((a,b)=>{
      if (a.isNative && !b.isNative) return -1;
      if (!a.isNative && b.isNative) return 1;
      if (a.id.startsWith('dl:') && !b.id.startsWith('dl:')) return 1;
      if (!a.id.startsWith('dl:') && b.id.startsWith('dl:')) return -1;
      return 0;
    });
  }
}

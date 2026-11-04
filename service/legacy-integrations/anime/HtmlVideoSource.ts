import type { AnimeSource, AnimeTitle, AnimeEpisode, AnimeServer } from '../../src/yomiri/anime/types.ts';
import type { YomiriHttpClient } from '../../src/yomiri/network/types.ts';
import { assertPublicUrl, registerDynamicSource } from '../../src/yomiri/network/SourceRegistry.ts';

export type HtmlVideoId = 'animeyt' | 'monoschinos' | 'lacartoons' | 'katanime';
const configs = {
  katanime: {name:'Katanime',base:'https://katanime.net',catalog:'/animes',links:'a[href*="/anime/"]',episodes:'a.episode-card',search:'q'},
  animeyt: {name:'AnimeYT',base:'https://animeyt.cc',catalog:'/tv/',links:'a[href*="/tv/"]',episodes:'a[href*="/anime/"]',search:'s'},
  monoschinos: {name:'MonosChinos',base:'https://monoschinos.st',catalog:'/animes',links:'a[href*="/anime/"]',episodes:'a[href*="/ver/"]',search:'q'},
  lacartoons: {name:'LACartoons',base:'https://www.lacartoons.com',catalog:'/',links:'a[href^="/serie/"]',episodes:'a[href*="/serie/capitulo/"]',search:'Titulo'},
} as const;

/** Selectors are source-specific; remote scripts are never evaluated. */
export class HtmlVideoSource implements AnimeSource {
  readonly lang='es'; readonly name:string; readonly website:string;
  private readonly config; private readonly networkId:string;
  constructor(readonly id:HtmlVideoId,private readonly http:Pick<YomiriHttpClient,'text'>){
    this.config=configs[id];this.name=this.config.name;this.website=this.config.base;this.networkId=`dynamic-${id}`;
    registerDynamicSource({id:this.networkId,revision:'2',baseUrl:this.website,allowedHosts:[new URL(this.website).hostname,...(id==='animeyt'?['mytsumi.com']:[])]});
  }
  private url(raw:string){const url=assertPublicUrl(new URL(raw,this.website).href);if(url.origin!==this.website)throw new Error(`${this.name}: enlace fuera de la fuente.`);return url.href;}
  private async text(raw:string,body?:string){
    const response=await this.http.text({sourceId:this.networkId,url:this.url(raw),method:body?'POST':'GET',body,responseType:'text',credentials:'include',headers:body?{'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest',Referer:this.website+'/'}:undefined,cache:{ttlMs:body?0:300000,scope:'session'}});
    if(response.classification==='challenge')throw new Error(`${this.name}: verificación del navegador requerida.`);
    if(response.status>=400)throw new Error(`${this.name}: HTTP ${response.status}.`);
    return response.body;
  }
  private async document(raw:string){return new DOMParser().parseFromString(await this.text(raw),'text/html');}
  private image(node:ParentNode){const img=node.querySelector('img');const raw=img?.getAttribute('data-src')||img?.getAttribute('src');if(!raw)return undefined;try{return assertPublicUrl(new URL(raw,this.website).href).href;}catch{return undefined;}}
  private async catalog(path:string){
    const dom=await this.document(path);const rows=new Map<string,AnimeTitle>();
    for(const a of dom.querySelectorAll(this.config.links)){
      const href=a.getAttribute('href');if(!href)continue;const url=this.url(href);
      if(this.id==='lacartoons'&&!/^\/serie\/\d+$/.test(new URL(url).pathname))continue;
      const img=a.querySelector('img');if(!img)continue;
      const title=a.querySelector('h2,h3,h4,.title,.nombre')?.textContent?.trim()||img.getAttribute('alt')||a.textContent?.trim();
      if(!title)continue;
      rows.set(url,{id:url,url,sourceId:this.id,title,coverUrl:this.image(a),genres:[],status:'UNKNOWN'});
    }
    return {titles:[...rows.values()],hasNextPage:!!dom.querySelector('a[rel="next"],a.next,.next.page-numbers')};
  }
  getPopular(page=1){return this.catalog(`${this.config.catalog}?page=${page}`);}
  getLatest(page=1){return this.getPopular(page);}
  search(query:string,page=1){return this.catalog(`${this.id==='monoschinos'||this.id==='katanime'?'/buscar':'/'}?${this.config.search}=${encodeURIComponent(query)}&page=${page}`);}
  async getAnime(id:string):Promise<AnimeTitle>{
    const dom=await this.document(id);
    const title=(this.id==='lacartoons'?dom.querySelector('.titulo,h2'):dom.querySelector('h1'))?.textContent?.trim()||dom.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if(!title)throw new Error(`${this.name}: ficha sin título.`);
    return {id:this.url(id),url:this.url(id),sourceId:this.id,title,coverUrl:dom.querySelector('meta[property="og:image"]')?.getAttribute('content')||this.image(dom),description:dom.querySelector('meta[name="description"]')?.getAttribute('content')||undefined,genres:[],status:'UNKNOWN'};
  }
  async getEpisodes(id:string):Promise<AnimeEpisode[]>{
    const dom=await this.document(id);const rows=new Map<string,AnimeEpisode>();
    const add=(url:string,number:number,name:string)=>{if(!Number.isFinite(number))return;url=this.url(url);rows.set(url,{id:url,url,animeId:id,sourceId:this.id,name,episodeNumber:number});};
    for(const a of dom.querySelectorAll(this.config.episodes)){
      const href=a.getAttribute('href');if(!href)continue;
      const text=a.textContent?.trim()||a.getAttribute('aria-label')||'';
      const match=text.match(/(?:cap[ií]tulo|episodio)\s*(\d+(?:\.\d+)?)/i)||href.match(/(?:episodio-|capitulo-)(\d+)/i);
      if(match){add(href,Number(match[1]),text||`Episodio ${match[1]}`);const image=a.querySelector('img');const raw=image?.getAttribute('data-src')||image?.getAttribute('src');if(raw){try{rows.get(this.url(href))!.thumbnailUrl=assertPublicUrl(new URL(raw,this.website).href).href;}catch{}}}
    }
    if(this.id==='monoschinos'){
      const endpoint=dom.querySelector('.caplist[data-ajax]')?.getAttribute('data-ajax');
      const first=dom.querySelector('a[href*="/ver/"]')?.getAttribute('href');
      if(endpoint&&first){
        const data:unknown=JSON.parse(await this.text(endpoint));
        if(!data||typeof data!=='object'||!('eps' in data)||!Array.isArray(data.eps))throw new Error('MonosChinos: lista de episodios inválida.');
        for(const row of data.eps)if(row&&typeof row.num==='number')add(first.replace(/-episodio-\d+$/,`-episodio-${row.num}`),row.num,`Episodio ${row.num}`);
      }
    }
    if(this.id==='katanime'){
      const endpoint=dom.querySelector('.episodes-grid[data-url]')?.getAttribute('data-url');
      const token=dom.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      if(!endpoint||!token)throw new Error('Katanime: faltan los datos de la sesión de episodios.');
      for(let page=1;page<=200;page++){
        const data=JSON.parse(await this.text(endpoint,new URLSearchParams({_token:token,pagina:String(page)}).toString())) as {ep?:{data?:{url:string;numero:string}[];last_page?:number}};
        if(!Array.isArray(data.ep?.data))throw new Error('Katanime: respuesta de episodios inválida.');
        for(const row of data.ep.data)add(row.url,Number(row.numero),`Episodio ${row.numero}`);
        if(page>=(data.ep.last_page||1))break;
        if(page===200)throw new Error('Katanime: demasiadas páginas de episodios.');
      }
    }
    if(!rows.size)throw new Error(`${this.name}: no se encontró la lista de episodios.`);
    return [...rows.values()].sort((a,b)=>b.episodeNumber-a.episodeNumber);
  }
  async getServers(id:string):Promise<AnimeServer[]>{
    const dom=await this.document(id);const servers=new Map<string,AnimeServer>();
    const add=(raw:string,name:string)=>{try{const url=assertPublicUrl(new URL(raw,this.website).href).href;servers.set(url,{id:url,url,name,delivery:/\.m3u8(?:\?|$)/.test(url)?'hls':/\.mp4(?:\?|$)/.test(url)?'direct':'embed',referer:id});}catch{/* Ignore invalid media URLs. */}};
    if(this.id==='katanime'){
      const endpoint=dom.querySelector('#player_section[data-player-uri]')?.getAttribute('data-player-uri');
      if(endpoint)for(const a of dom.querySelectorAll('a.play-video[data-player]')){
        const token=a.getAttribute('data-player');if(token)add(this.url(endpoint)+'?url='+encodeURIComponent(token),a.getAttribute('data-player-name')||'Servidor');
      }
    }
    else if(this.id==='monoschinos')for(const button of dom.querySelectorAll('button[data-player]')){try{add(atob(button.getAttribute('data-player')||''),button.textContent?.trim()||'Servidor');}catch{/* Malformed Base64. */}}
    else for(const frame of dom.querySelectorAll(this.id==='animeyt'?'.aniyt-watch iframe': 'iframe[src*="videoembed"]')){
      const raw=frame.getAttribute('data-src')||frame.getAttribute('src');if(raw)add(raw,this.name);
    }
    if(this.id==='animeyt'){
      for(const wrapper of [...servers.values()]){
        const container=new URL(wrapper.url);
        if(container.hostname==='mytsumi.com'&&container.pathname==='/multiplayer/options.php'){
          const read=async(url:URL)=>{
            const response=await this.http.text({sourceId:this.networkId,url:url.href,method:'GET',responseType:'text',credentials:'include',headers:{Referer:id},cache:{ttlMs:60000,scope:'session'}});
            if(response.status>=400||response.classification==='challenge')throw new Error('Mytsumi no disponible.');
            return response.body;
          };
          const html=await read(container);
          const encoded=/\bconst\s+azakuEncodedURL\s*=\s*"([A-Za-z0-9+/=]+)"/.exec(html)?.[1];
          if(!encoded)throw new Error('AnimeYT: no se encontró el enlace al contenedor.');
          const next=assertPublicUrl(atob(encoded));
          if(next.origin!==container.origin||next.pathname!=='/multiplayer/contenedor.php'||next.searchParams.get('id')!==container.searchParams.get('value'))throw new Error('AnimeYT: contenedor inválido.');
          const data=await read(next);
          const literal=/\bconst\s+videoTabs\s*=\s*(\[[^\n]+\]);/.exec(data)?.[1];
          const tabs:unknown=literal?JSON.parse(literal):undefined;
          if(!Array.isArray(tabs))throw new Error('AnimeYT: lista de servidores inválida.');
          let count=0;
          for(const tab of tabs){
            if(!tab||typeof tab.url!=='string'||tab.status!=='active'||tab.is_fake_player)continue;
            try{
              const url=assertPublicUrl(tab.url).href;
              servers.set(url,{id:url,url,name:String(tab.tab_name||'Servidor'),delivery:tab.is_mp4?(/\.m3u8(?:\?|$)/.test(url)?'hls':'direct'):'embed',isNative:!!tab.is_mp4,referer:next.href});
              count++;
            }catch{/* Ignore malformed URLs. */}
          }
          if(!count)throw new Error('AnimeYT: contenedor sin servidores.');
          servers.delete(wrapper.url);
          continue;
        }
        if(container.hostname!=='mytsumi.com'||container.pathname!=='/container.php')continue;
        try{
          const read=async(url:URL)=>{
            const response=await this.http.text({sourceId:this.networkId,url:url.href,method:'GET',responseType:'text',credentials:'include',headers:{Referer:id},cache:{ttlMs:60000,scope:'session'}});
            if(response.status>=400||response.classification==='challenge')throw new Error('Mytsumi no disponible.');
            return new DOMParser().parseFromString(response.body,'text/html');
          };
          let page=await read(container);
          const open=page.querySelector('#mytsumi-intro-play')?.getAttribute('href');
          if(open){
            const next=assertPublicUrl(new URL(open,container).href);
            if(next.origin!==container.origin||next.pathname!==container.pathname||next.searchParams.get('id')!==container.searchParams.get('id'))throw new Error('Mytsumi: navegación inválida.');
            page=await read(next);
          }
          const resolved:AnimeServer[]=[];
          for(const tab of page.querySelectorAll('[data-player-url]')){
            const raw=tab.getAttribute('data-player-url');if(!raw)continue;
            try{
              const url=assertPublicUrl(new URL(raw,container).href).href;
              const direct=tab.getAttribute('data-player-kind')==='video';
              const name=tab.getAttribute('data-player-label')?.trim()||new URL(url).hostname;
              resolved.push({id:url,url,name,delivery:direct?(/\.m3u8(?:\?|$)/.test(url)?'hls':'direct'):'embed',isNative:direct,quality:tab.getAttribute('title')?.match(/\b\d{3,4}p\b/)?.[0],language:container.searchParams.get('lang')||'SUB',referer:container.href});
            }catch{/* Invalid server URL. */}
          }
          if(!resolved.length)throw new Error('El proveedor no devolvió su lista de servidores.');
          servers.delete(wrapper.url);for(const server of resolved)servers.set(server.url,server);
        }catch(cause){
          const message=cause instanceof Error?cause.message:String(cause);
          throw new Error(`AnimeYT: no se pudieron separar los servidores. ${message} Si acabás de actualizar Yomiri, recargá la extensión Bridge y reintentá.`);
        }
      }
    }
    if(!servers.size)throw new Error(`${this.name}: no hay servidores disponibles en este episodio.`);
    return [...servers.values()].sort((a,b)=>Number(!!b.isNative)-Number(!!a.isNative));
  }
}

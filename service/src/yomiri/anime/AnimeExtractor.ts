import { assertPublicUrl } from '../network/SourceRegistry.ts';
import { assertAnimeMediaUrl } from '../network/AnimeMediaUrl.ts';
export { assertAnimeMediaUrl } from '../network/AnimeMediaUrl.ts';

const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeoutMs = 25000;
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal && 'any' in AbortSignal && init?.signal) {
    try {
      return fetch(input, { ...init, signal: AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) });
    } catch {}
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Tiempo de espera agotado', 'TimeoutError')), timeoutMs);
  if (init?.signal) {
    init.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      controller.abort(init.signal?.reason);
    }, { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};
/**
 * Extractor utilities for anime video providers (Voe, MP4Upload, StreamWish, etc.)
 * Matches Otakuria's native stream extraction logic.
 */

export interface ExtractedStream {
  server: string;
  url: string; // Proxied stream URL ready for Hls.js or <video>
  rawUrl: string; // Upstream direct URL
  isM3U8: boolean;
  quality: string;
  downloadUrl?: string; // Direct download link for the episode
  headers?: Record<string, string>;
}

export class AnimeServerUnavailableError extends Error {}

export async function extractStream(
  serverName: string,
  embedUrl: string
): Promise<ExtractedStream | null> {
  if (!embedUrl) return null;

  // Direct HLS or MP4 stream detection
  if (/\.m3u8(?:$|\?)/i.test(embedUrl) && !/\/e\//.test(new URL(embedUrl).pathname)) {
    return {
      server: serverName || 'Directo (HLS)',
      url: proxyUrl(embedUrl),
      rawUrl: embedUrl,
      isM3U8: true,
      quality: 'Auto',
      downloadUrl: proxyUrl(embedUrl),
    };
  }
  if (/\.mp4(?:$|\?)/i.test(embedUrl) && !/\/e\//.test(new URL(embedUrl).pathname)) {
    return {
      server: serverName || 'Directo (MP4)',
      url: proxyUrl(embedUrl),
      rawUrl: embedUrl,
      isM3U8: false,
      quality: '1080p',
      downloadUrl: proxyUrl(embedUrl),
    };
  }

  const norm = (serverName + ' ' + embedUrl).toLowerCase();

  try {
    // An embed can end in .mp4 (Streamtape); its path is not a media file.
    const host = new URL(embedUrl).hostname;
    if(host==='1fichier.com') {
      throw new AnimeServerUnavailableError('1Fichier no permite reanudar descargas gratuitas; no ofrece reproducción directa estable.');
    }
    if(host==='dsvplay.com') {
      const response=await fetchWithTimeout(proxyUrl(embedUrl));
      if(!response.ok)throw new AnimeServerUnavailableError('Doodstream no respondió. Su enlace puede estar caído.');
      return extractGeneric(embedUrl);
    }
    if(host==='mega.nz') {
      const share=new URL(embedUrl),id=/^\/(?:embed|file)\/([\w-]{8})$/.exec(share.pathname)?.[1],key=share.hash.slice(1);
      if(id&&/^[\w-]{43}$/.test(key))return {server:'MEGA',rawUrl:embedUrl,url:`/api/anime-media?mega=${id}&key=${key}`,isM3U8:false,quality:'Auto'};
      return null;
    }
    if(host==='hgcloud.to') {
      const id=/^\/e\/([a-z0-9]{12})$/.exec(new URL(embedUrl).pathname)?.[1];
      return id?extractPackedMedia(`https://audinifer.com/e/${id}`,'Streamwish'):null;
    }
    if(['mediafire.com','www.mediafire.com'].includes(host))return extractMediafire(embedUrl);
    if(host==='streamtape.com')return extractStreamtape(embedUrl);
    if(host==='player.zilla-networks.com'&&/^\/m3u8\/[a-f0-9]{32}$/.test(new URL(embedUrl).pathname))return {...mediaStream('HLS',embedUrl,new URL(embedUrl).origin+'/'),isM3U8:true};
    if (/^byse[a-z0-9-]*\.com$/.test(host)) return extractByse(embedUrl);
    if (host === 'animeav1.uns.bio') {
      const response = await fetchWithTimeout(proxyUrl(embedUrl));
      if (!response.ok) throw new AnimeServerUnavailableError('El servidor no está disponible.');
      const html = await response.text();
      const asset = /<script[^>]+src="(\/assets\/index-[^"]+\.js)"/.exec(html)?.[1];
      if (asset) {
        const bundle = await fetchWithTimeout(proxyUrl(new URL(asset, embedUrl).href));
        if (bundle.ok && /The system is under maintenance|System maintenance/.test(await bundle.text())) throw new AnimeServerUnavailableError('UPNShare está en mantenimiento.');
      }
      return null;
    }
    if (/^(?:www\.)?pixeldrain\.com$/.test(host)) {
      const id = /^\/u\/([a-zA-Z0-9]+)$/.exec(new URL(embedUrl).pathname)?.[1];
      return id ? mediaStream('PDrain', `https://pixeldrain.com/api/file/${id}`, embedUrl) : null;
    }
    if (/mixdrop|mxdrop/.test(norm)) return extractPackedMedia(embedUrl, 'Mixdrop');
    if (/luluvdo|lulustream|vidhide|callistanise/.test(norm)) return extractPackedMedia(embedUrl, serverName);
    if (host === 'ok.ru' && new URL(embedUrl).pathname.startsWith('/videoembed/')) return extractOk(embedUrl);
    if (host === 'mytsumi.com' && new URL(embedUrl).pathname.startsWith('/multiplayer/play2026/')) {
      const response = await fetchWithTimeout(proxyUrl(embedUrl));
      if (!response.ok) return null;
      const html = await response.text();
      const literal = /\bconst\s+qualities\s*=\s*(\{[^\n]+\});/.exec(html)?.[1];
      if (!literal) return null;
      const qualities = JSON.parse(literal);
      const quality = ['1080p', '720p', '480p'].find(key => typeof qualities[key] === 'string');
      return quality ? {...mediaStream(serverName, qualities[quality], embedUrl), quality} : null;
    }
    if (host === 'jkanime.net' && new URL(embedUrl).pathname.startsWith('/jkplayer/')) return extractGeneric(embedUrl);
    if (
      norm.includes('voe') ||
      norm.includes('megankiddifference') ||
      norm.includes('chaliceguzzler')
    ) {
      const res = await extractVoe(embedUrl);
      if (res) return res;
    }

    if (norm.includes('mp4upload')) {
      const res = await extractMp4Upload(embedUrl);
      if (res) return res;
    }

    if (norm.includes('streamwish') || norm.includes('wishembed') || norm.includes('strwish')) {
      const res = await extractStreamWish(embedUrl);
      if (res) return res;
    }

    // Generic attempt for any HTML embed containing .m3u8 or .mp4
    const generic = await extractGeneric(embedUrl);
    if (generic) return generic;
  } catch (err) {
    if (err instanceof AnimeServerUnavailableError) throw err;
    console.warn(`[AnimeExtractor] Error extracting stream for ${serverName}:`, err);
  }

  return null;
}

/** Voe Extractor (Decrypts encrypted payload) */
export async function extractVoe(embedUrl: string, fetchPage: typeof fetch = (url, init) => fetchWithTimeout(proxyUrl(String(url)), init)): Promise<ExtractedStream | null> {
  const url = embedUrl.replace('/d/', '/e/');
  const r = await fetchPage(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (r.status === 404 || r.status === 410) throw new AnimeServerUnavailableError('El proveedor ya no tiene disponible este video.');
  if (!r.ok) return null;
  let text = await r.text();

  // Check for JS redirect (e.g. megankiddifference.com)
  const redirectMatch = text.match(/window\.location\.href\s*=\s*['"]?(https?:\/\/[^'";\s]+)['"]?/i);
  if (redirectMatch) {
    const r2 = await fetchPage(redirectMatch[1], {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (r2.ok) text = await r2.text();
  }

  // Look for JSON script block
  const jsonMatch =
    text.match(/<script[^>]*type=["']application\/json["'][^>]*>\s*\["([^"]+)"\]\s*<\/script>/i) ||
    text.match(/\["([A-Za-z0-9+/=@$^%*!#_~?=-]{50,})"\]/);

  if (jsonMatch) {
    const decrypted = decryptVoePayload(jsonMatch[1]);
    if (decrypted) {
      if (decrypted.source && !isSampleVideo(decrypted.source)) {
        return {
          server: 'Voe',
          url: proxyUrl(decrypted.source, embedUrl),
          rawUrl: decrypted.source,
          isM3U8: true,
          quality: '1080p',
          downloadUrl: decrypted.direct_access_url
            ? proxyUrl(decrypted.direct_access_url, embedUrl)
            : proxyUrl(decrypted.source, embedUrl),
        };
      }
      if (decrypted.direct_access_url && !isSampleVideo(decrypted.direct_access_url)) {
        return {
          server: 'Voe',
          url: proxyUrl(decrypted.direct_access_url, embedUrl),
          rawUrl: decrypted.direct_access_url,
          isM3U8: false,
          quality: '1080p',
          downloadUrl: proxyUrl(decrypted.direct_access_url, embedUrl),
        };
      }
    }
  }

  // Fallback regex
  const hlsMatch =
    text.match(/['"]?hls['"]?\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i) ||
    text.match(/file\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i) ||
    text.match(/(https?:\/\/(?:delivery|cdn)[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);

  if (hlsMatch && !isSampleVideo(hlsMatch[1] || hlsMatch[0])) {
    const direct = hlsMatch[1] || hlsMatch[0];
    return {
      server: 'Voe',
      url: proxyUrl(direct, embedUrl),
      rawUrl: direct,
      isM3U8: true,
      quality: '1080p',
      downloadUrl: proxyUrl(direct, embedUrl),
    };
  }

  return null;
}

/** MP4Upload Extractor (Unpacks dean edwards packer) */
export async function extractMp4Upload(embedUrl: string): Promise<ExtractedStream | null> {
  const url = embedUrl.includes('embed-')
    ? embedUrl
    : embedUrl.replace(/\.com\/([a-zA-Z0-9]+)/, '.com/embed-$1.html');

  const r = await fetchWithTimeout(proxyUrl(url, 'https://mp4upload.com/'), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!r.ok) return null;
  let text = await r.text();

  const pMatch = text.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?split\('\|'\)\)\)/);
  if (pMatch) {
    try {
      const unpacked = unpackPacker(pMatch[0]);
      if (unpacked) text += '\n' + unpacked;
    } catch {
      /* ignore */
    }
  }

  const srcMatch =
    text.match(/(?:player\.src\(|src\s*:\s*|file\s*:\s*)['"](https?:\/\/[^'"]+\.mp4[^'"]*)['"]/i) ||
    text.match(/https?:\/\/[a-zA-Z0-9.\-:]+\/d\/[a-zA-Z0-9_\-\/]+\.mp4/i) ||
    text.match(/https?:\/\/[^'"]+\.mp4/i);

  if (srcMatch && !isSampleVideo(srcMatch[1] || srcMatch[0])) {
    const direct = srcMatch[1] || srcMatch[0];
    return {
      server: 'MP4Upload',
      url: proxyUrl(direct, 'https://mp4upload.com/') + '&embed=' + encodeURIComponent(url),
      rawUrl: direct,
      isM3U8: false,
      quality: '1080p',
      downloadUrl: proxyUrl(direct, 'https://mp4upload.com/') + '&embed=' + encodeURIComponent(url),
    };
  }

  return null;
}

/** StreamWish Extractor */
export async function extractStreamWish(embedUrl: string): Promise<ExtractedStream | null> {
  const url = embedUrl.replace('/v/', '/e/');
  const r = await fetchWithTimeout(proxyUrl(url), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!r.ok) return null;
  let text = await r.text();

  const pMatch = text.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?split\('\|'\)\)\)/);
  if (pMatch) {
    try {
      const unpacked = unpackPacker(pMatch[0]);
      if (unpacked) text += '\n' + unpacked;
    } catch {
      /* ignore */
    }
  }

  const m3u8Match =
    text.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
    text.match(/(?:file|source|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
    text.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);

  if (m3u8Match && !isSampleVideo(m3u8Match[1] || m3u8Match[0])) {
    const direct = m3u8Match[1] || m3u8Match[0];
    return {
      server: 'StreamWish',
      url: proxyUrl(direct, embedUrl),
      rawUrl: direct,
      isM3U8: true,
      quality: 'HD',
    };
  }

  return null;
}

/** Generic extractor fallback */
export async function extractGeneric(embedUrl: string): Promise<ExtractedStream | null> {
  try {
    const r = await fetchWithTimeout(proxyUrl(embedUrl), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    if (!r.ok) return null;
    const text = await r.text();

    const m3u8Match = text.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
    if (m3u8Match && !isSampleVideo(m3u8Match[0])) {
      return {
        server: 'Directo (HLS)',
        url: proxyUrl(m3u8Match[0], embedUrl),
        rawUrl: m3u8Match[0],
        isM3U8: true,
        quality: 'HD',
      };
    }

    const mp4Match = text.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/i);
    if (mp4Match && !isSampleVideo(mp4Match[0])) {
      return {
        server: 'Directo (MP4)',
        url: proxyUrl(mp4Match[0], embedUrl),
        rawUrl: mp4Match[0],
        isM3U8: false,
        quality: '720p',
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function mediaStream(server: string, rawUrl: string, referer: string): ExtractedStream {
  const url = assertAnimeMediaUrl(rawUrl).href;
  return {server, rawUrl: url, url: proxyUrl(url, referer), isM3U8: /\.m3u8(?:[?#]|$)/i.test(url), quality: 'Auto', headers: {Referer: referer}};
}

export async function extractByse(embedUrl: string): Promise<ExtractedStream | null> {
  const embed = assertPublicUrl(embedUrl);
  const code = /^\/e\/([a-zA-Z0-9]+)/.exec(embed.pathname)?.[1];
  if (!code) return null;
  const response = await fetchWithTimeout(proxyUrl(`${embed.origin}/api/videos/${code}/`, embed.href));
  if (response.status === 404 || response.status === 410) throw new AnimeServerUnavailableError('El proveedor ya no tiene disponible este video.');
  if (!response.ok) return null;
  const data = await response.json();
  const pb = data.playback;
  if (pb?.algorithm !== 'AES-256-GCM' || !Array.isArray(pb.key_parts)) return null;
  const version = Number(pb.version);
  if (!Number.isInteger(version) || version < 1 || version > 20 || pb.key_parts.length < Math.max(version, 31-version)) return null;
  const bytes = (raw: string) => Uint8Array.from(atob(raw.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
  const first = bytes(pb.key_parts[version-1]), second = bytes(pb.key_parts[30-version]);
  const keyBytes = new Uint8Array(first.length+second.length);keyBytes.set(first);keyBytes.set(second,first.length);
  if (keyBytes.length !== 32) return null;
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const decoded = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(pb.iv)},key,bytes(pb.payload))));
  if (!Array.isArray(decoded.sources)) return null;
  const source = decoded.sources.find((row: {url?: unknown}) => typeof row.url === 'string' && /^https?:/.test(row.url));
  if (!source) return null;
  return {...mediaStream('Byse', source.url, embed.origin+'/'), quality: source.label || source.quality || 'Auto'};
}

/** Decode data literals only. Never evaluate a provider's JavaScript. */
export function unpackMediaScripts(html: string): string {
  return [...html.matchAll(/\}\s*\(\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\.split\(['"]\|['"]\)/g)].map(match => {
    const literal = (value: string) => value.slice(1, -1).replace(/\\(['"\\])/g, '$1');
    const radix = Number(match[2]), count = Number(match[3]);
    if (radix < 2 || radix > 36 || count > 10000) return '';
    const words = literal(match[4]).split('|');
    return literal(match[1]).replace(/\b[0-9a-z]+\b/g, token => {
      const index = parseInt(token, radix);
      return Number.isFinite(index) && index.toString(radix) === token && index < count && words[index] ? words[index] : token;
    });
  }).join('\n');
}

async function extractPackedMedia(embedUrl: string, name: string): Promise<ExtractedStream | null> {
  const response = await fetchWithTimeout(proxyUrl(embedUrl));
  if (!response.ok) return null;
  const html = await response.text();
  const unpacked = unpackMediaScripts(html);
  const finalUrl=response.headers.get('x-yomiri-final-url')||embedUrl;
  const linksLiteral=/\b(?:var|let|const)\s+links\s*=\s*(\{[^;]+\})\s*;/.exec(unpacked)?.[1];
  if(linksLiteral){
    const links=JSON.parse(linksLiteral);
    const source=[links.hls4,links.hls3,links.hls2].find(value=>typeof value==='string'&&value);
    if(source)return {...mediaStream(name,new URL(source,finalUrl).href,finalUrl),isM3U8:true};
  }
  // Only the player's source field; unrelated advertising URLs are ignored.
  const source = unpacked.match(/(?:MDCore\.wurl|\bwurl)\s*=\s*['"]([^'"]+)['"]/)?.[1]
    || unpacked.match(/sources\s*:\s*\[\s*\{\s*(?:file|src)\s*:\s*['"]([^'"]+)['"]/)?.[1]
    || unpacked.match(/(?:file|hls)\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/)?.[1];
  if (!source || isSampleVideo(source)) return null;
  return mediaStream(name, new URL(source, finalUrl).href, finalUrl);
}

export function mediafireVideoFromHtml(html:string):string|null {
  const anchor=Array.from(html.matchAll(/<a\b[^>]*>/gi)).map(match=>match[0]).find(tag=>/\bid=['"]downloadButton['"]/i.test(tag));
  const href=anchor?.match(/\bhref=['"]([^'"]+)['"]/i)?.[1]?.replace(/&amp;/g,'&');
  if(!href)return null;
  const url=assertPublicUrl(href);
  return /^download\d+\.mediafire\.com$/.test(url.hostname)&&/\.(mp4|webm)$/i.test(url.pathname)?url.href:null;
}
async function extractMediafire(embedUrl:string):Promise<ExtractedStream|null>{
  const response=await fetchWithTimeout(proxyUrl(embedUrl));if(!response.ok)return null;
  const url=mediafireVideoFromHtml(await response.text());
  return url?mediaStream('Mediafire',url,embedUrl):null;
}

/** Read the player's string concatenation; never run its JS or advertising code. */
export function streamtapeVideoFromHtml(html:string,embedUrl:string):string|null {
  const assignments=[...html.matchAll(/getElementById\(['"](?:botlink|robotlink)['"]\)\.innerHTML\s*=\s*(['"])(.*?)\1\s*\+\s*(?:['"]['"]\s*\+\s*)?\(\s*(['"])(.*?)\3\s*\)((?:\.substring\(\d+\))*)/g)];
  for(const match of assignments){
    let suffix=match[4];for(const cut of match[5].matchAll(/substring\((\d+)\)/g))suffix=suffix.substring(Number(cut[1]));
    const url=assertPublicUrl(new URL((match[2]+suffix).replace(/&amp;/g,'&'),embedUrl).href);
    const id=/^\/e\/([^/]+)/.exec(new URL(embedUrl).pathname)?.[1];
    if(url.hostname==='streamtape.com'&&url.pathname==='/get_video'&&url.searchParams.get('id')===id){url.searchParams.set('stream','1');return url.href;}
  }
  return null;
}
async function extractStreamtape(embedUrl:string):Promise<ExtractedStream|null>{
  const response=await fetchWithTimeout(proxyUrl(embedUrl));if(!response.ok)return null;
  const url=streamtapeVideoFromHtml(await response.text(),embedUrl);
  return url?mediaStream('Streamtape',url,embedUrl):null;
}

export async function extractOk(embedUrl: string, fetchPage: typeof fetch = url => fetchWithTimeout(proxyUrl(String(url)))): Promise<ExtractedStream | null> {
  const response = await fetchPage(embedUrl);
  if (!response.ok) return null;
  const dom = new DOMParser().parseFromString(await response.text(), 'text/html');
  for (const node of dom.querySelectorAll('[data-options]')) {
    try {
      const options = JSON.parse(node.getAttribute('data-options') || '{}');
      const rawMetadata = options.flashvars?.metadata;
      const metadata = typeof rawMetadata === 'string' ? JSON.parse(rawMetadata) : rawMetadata;
      if (!metadata || typeof metadata !== 'object') continue;
      if (typeof metadata.hlsMasterPlaylistUrl === 'string') return mediaStream('OK', metadata.hlsMasterPlaylistUrl, embedUrl);
      const videos = metadata.videos;
      if (Array.isArray(videos)) {
        const video = [...videos].reverse().find(row => typeof row.url === 'string');
        if (video) return mediaStream('OK', video.url, embedUrl);
      }
    } catch { /* Other widgets also use data-options. */ }
  }
  return null;
}

export function proxyUrl(targetUrl: string, referer?: string): string {
  targetUrl = assertAnimeMediaUrl(targetUrl).href;
  const base = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
  let res = `${base}/api/anime-media?url=${encodeURIComponent(targetUrl)}`;
  if (referer) res += `&ref=${encodeURIComponent(referer)}`;
  return res;
}

/** This provider serves MP4 files on 183. Keep the exception limited to its
 * public CDN and video path; repository/network validation remains unchanged. */

function isSampleVideo(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('test-videos.co.uk') ||
    lower.includes('big_buck_bunny') ||
    lower.includes('sample-video') ||
    lower.includes('example.com')
  );
}

function decryptVoePayload(payload: string): any {
  try {
    const rot = payload
      .replace(/[a-zA-Z]/g, (c) => {
        const code = c.charCodeAt(0);
        const base = code >= 65 && code <= 90 ? 65 : 97;
        return String.fromCharCode(((code - base + 13) % 26) + base);
      })
      .replace(/(@\$|\^\^|~@|%\?|\*~|!!|#&|_)/g, '');

    let b64: string;
    if (typeof atob !== 'undefined') {
      b64 = atob(rot);
    } else if (typeof globalThis !== 'undefined' && 'Buffer' in globalThis) {
      b64 = (globalThis as any).Buffer.from(rot, 'base64').toString('latin1');
    } else {
      return null;
    }

    let shifted = '';
    for (let i = 0; i < b64.length; i++) {
      shifted += String.fromCharCode(b64.charCodeAt(i) - 3);
    }

    const reversed = shifted.split('').reverse().join('');
    let jsonStr: string;
    if (typeof atob !== 'undefined') {
      try {
        jsonStr = decodeURIComponent(escape(atob(reversed)));
      } catch {
        jsonStr = atob(reversed);
      }
    } else if (typeof globalThis !== 'undefined' && 'Buffer' in globalThis) {
      jsonStr = (globalThis as any).Buffer.from(reversed, 'base64').toString('utf8');
    } else {
      return null;
    }

    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn('Voe payload decryption error:', e);
    return null;
  }
}

function unpackPacker(pStr: string): string {
  const match = pStr.match(
    /}\s*\(\s*['"]([\s\S]*?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([\s\S]*?)['"]\.split\('\|'\)/
  );
  if (!match) return '';
  let [_, p, aStr, cStr, kStr] = match;
  let a = parseInt(aStr, 10);
  let c = parseInt(cStr, 10);
  let k = kStr.split('|');

  const e = (c: number): string => {
    return (c < a ? '' : e(Math.floor(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
  };

  while (c--) {
    if (k[c]) {
      const regex = new RegExp('\\b' + e(c) + '\\b', 'g');
      p = p.replace(regex, k[c]);
    }
  }
  return p;
}

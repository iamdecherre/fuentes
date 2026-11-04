import { assertPublicUrl } from './SourceRegistry.ts';

/** MP4Upload's public video CDN uses HTTPS port 183. */
export function assertAnimeMediaUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol === 'https:' && url.port === '183' && /^[a-z0-9-]+\.mp4upload\.com$/i.test(url.hostname) && /^\/d\/[a-z0-9_/-]+\.mp4$/i.test(url.pathname)) {
    const checked = new URL(url.href); checked.port = '';
    assertPublicUrl(checked.href);
    return url;
  }
  return assertPublicUrl(raw);
}

export function assertVideoDownloadUrl(raw: string): URL {
  if (import.meta.env?.DEV && typeof location !== 'undefined') {
    const candidate = new URL(raw, location.origin);
    if (candidate.origin === location.origin && candidate.pathname === '/api/proxy') {
      assertAnimeMediaUrl(candidate.searchParams.get('url') || '');
      return candidate;
    }
  }
  return assertAnimeMediaUrl(raw);
}

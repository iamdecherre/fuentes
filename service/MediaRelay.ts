import { createHmac, timingSafeEqual } from "node:crypto";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function target(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !/^ugc-cdn-caching-[a-z0-9]+\.cloudwindow-route\.com$/.test(url.hostname)) {
    throw new Error("CDN no permitido");
  }
  return url;
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest();
}

export function mediaLink(origin: string, raw: string, referer: string, secret: string,
  expires = Date.now() + 6 * 60 * 60 * 1000) {
  const payload = Buffer.from(JSON.stringify([target(raw).href, referer, expires])).toString("base64url");
  return origin + "/media/" + payload + "." + signature(payload, secret).toString("base64url");
}

export async function relayMedia(request: Request, secret: string) {
  const error = (status: number) => new Response(null, { status, headers });
  if (request.method !== "GET") return error(405);
  const requestUrl = new URL(request.url);
  const match = /^\/media\/([\w-]{1,10000})\.([\w-]{43})$/.exec(requestUrl.pathname);
  if (!match) return error(400);
  const [, payload, token] = match;
  if (!timingSafeEqual(signature(payload, secret), Buffer.from(token, "base64url"))) return error(403);
  try {
    const [raw, referer, expires] = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (expires <= Date.now()) return error(410);
    const url = target(raw);
    const requestHeaders = new Headers({ Referer: referer });
    const range = request.headers.get("Range");
    if (range && /^bytes=\d*-\d*$/.test(range)) requestHeaders.set("Range", range);
    const upstream = await fetch(url, {
      headers: requestHeaders, redirect: "manual", signal: AbortSignal.timeout(20000),
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return error(upstream.status >= 400 ? upstream.status : 502);
    }
    const type = upstream.headers.get("Content-Type") || "application/octet-stream";
    if (/mpegurl/i.test(type) || url.pathname.endsWith(".m3u8")) {
      const playlist = await upstream.text();
      if (!playlist.startsWith("#EXTM3U") || playlist.length > 2_000_000) return error(502);
      const rewrite = (uri: string) => mediaLink(requestUrl.origin, new URL(uri, url).href, referer, secret, expires);
      const body = playlist.split(/\r?\n/).map(line => {
        if (!line.trim()) return line;
        return line.startsWith("#") ? line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${rewrite(uri)}"`) : rewrite(line.trim());
      }).join("\n");
      return new Response(body, { headers: { ...headers, "Content-Type": "application/vnd.apple.mpegurl" } });
    }
    if (!/^(video\/|audio\/|application\/octet-stream)/i.test(type)) {
      await upstream.body?.cancel();
      return error(502);
    }
    const outgoing = new Headers({ ...headers, "Content-Type": type });
    for (const name of ["Content-Range", "Accept-Ranges", "Content-Length"]) {
      const value = upstream.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: outgoing });
  } catch {
    return error(502);
  }
}

import type { AnimeServer, AnimeSource, AnimeTitle } from "../../src/yomiri/anime/types.ts";
import { extractOk, extractVoe } from "../../src/yomiri/anime/AnimeExtractor.ts";
import { createDecipheriv, createHash } from "node:crypto";

async function unwrapKatanime(url: string): Promise<string> {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!response.ok) return "";
  const literal = /\bvar e = '([^']+)'/.exec(await response.text())?.[1];
  if (!literal) return "";
  const data = JSON.parse(literal) as { ct: string; s: string; iv: string };
  const salt = Buffer.from(data.s, "hex");
  const password = Buffer.from("hanabi");
  let block = Buffer.alloc(0);
  const key = Buffer.concat(Array.from({ length: 2 }, () => {
    block = createHash("md5").update(block).update(password).update(salt).digest();
    return block;
  }));
  const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(data.iv, "hex"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.ct, "base64")), decipher.final()]).toString("utf8"));
}

async function directStream(server: AnimeServer) {
  if (server.unavailableReason) return [];
  const title = [server.name, server.language].filter(Boolean).join(" · ");
  if (server.delivery === "hls") return [{ title, m3u8Url: server.url }];
  if (server.delivery === "direct") return [{ title, url: server.url }];

  try {
    const embed = server.name.toLowerCase() === "voe" && server.url.startsWith("https://katanime.net/reproductor?url=")
      ? await unwrapKatanime(server.url) : server.url;
    if (/^https:\/\/ok\.ru\/videoembed\/\d+(?:\?|$)/i.test(embed)) {
      const stream = await extractOk(embed, input => fetch(input, { redirect: "error", signal: AbortSignal.timeout(8000) }));
      return stream?.rawUrl ? [stream.isM3U8 ? { title, m3u8Url: stream.rawUrl } : { title, url: stream.rawUrl }] : [];
    }
    if (!/^https:\/\/(?:voe\.sx|shannoncoldalready\.com)\/e\/[a-z0-9]+$/i.test(embed)) return [];
    const stream = await extractVoe(embed, (input, init) => {
      const url = new URL(String(input));
      if (!/^https:\/\/(?:voe\.sx|shannoncoldalready\.com)\/e\/[a-z0-9]+$/i.test(url.href)) {
        throw new Error("Página de video fuera del proveedor admitido");
      }
      return fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(8000) });
    });
    return stream?.rawUrl ? [stream.isM3U8 ? { title, m3u8Url: stream.rawUrl } : { title, url: stream.rawUrl }] : [];
  } catch {
    return [];
  }
}

export function createAnimeAddon(source: AnimeSource) {
  const manifest = {
    id: `org.yomiri.example.${source.id}`,
    name: source.name,
    version: "1.0.0",
    description: "Catálogo de anime mediante un servicio externo.",
    types: ["anime"],
    resources: ["catalog", "meta", "stream"],
    catalogs: [{ type: "anime", id: source.id, name: source.name, extra: [{ name: "search" }] }],
  };
  const meta = (title: AnimeTitle) => ({
    id: title.id, type: "anime", name: title.title, poster: title.coverUrl,
  });
  return async (request: Request): Promise<Response> => {
    const headers = { "Access-Control-Allow-Origin": "*" };
    const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
    if (request.method !== "GET") return json({ error: "Método no admitido" }, 405);
    const path = new URL(request.url).pathname;
    if (path === "/manifest.json") return json(manifest);
    const match = /^\/(catalog|meta|stream)\/anime\/([^/]+)(?:\/([^/]+))?\.json$/.exec(path);
    if (!match) return json({ error: "Ruta no encontrada" }, 404);
    try {
      const [, resource, encodedId, extra] = match;
      const id = decodeURIComponent(encodedId);
      if (resource === "catalog" && id === source.id) {
        const search = new URLSearchParams(extra ?? "").get("search");
        const result = search ? await source.search(search, 1) : await source.getPopular(1);
        return json({ metas: result.titles.map(meta), hasMore: false });
      }
      if (resource === "meta") {
        const title = await source.getAnime(id);
        const episodes = await source.getEpisodes(id);
        return json({ meta: { ...meta(title), videos: episodes.map(episode => ({
          id: episode.id, title: episode.name, season: 1, episode: episode.episodeNumber,
        })) } });
      }
      if (resource === "stream") {
        const servers = await source.getServers(id);
        return json({ streams: (await Promise.all(servers.map(directStream))).flat() });
      }
      return json({ error: "Catálogo no encontrado" }, 404);
    } catch {
      return json({ error: "La fuente no respondió con datos utilizables" }, 502);
    }
  };
}

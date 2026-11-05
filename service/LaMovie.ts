type Film = {
  _id: number; title: string; slug: string; overview?: string;
  images?: { poster?: string; backdrop?: string }; release_date?: string;
};
const origin = "https://lamovie.la";
const metadata = (film: Film, type = "movie") => ({
  id: "lamovie:" + film._id + ":" + film.slug, type, name: film.title,
  description: film.overview, releaseInfo: film.release_date?.slice(0, 4),
  poster: film.images?.poster ? origin + "/wp-content/uploads" + film.images.poster : undefined,
  background: film.images?.backdrop ? origin + "/wp-content/uploads" + film.images.backdrop : undefined,
});
async function read<T>(path: string): Promise<T> {
  const response = await fetch(origin + "/wp-api/v1" + path, {
    redirect: "manual", signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("LaMovie no respondió");
  return response.json<T>();
}
export async function laMovie(request: Request) {
  const json = (data: unknown, status = 200) => Response.json(data, {
    status, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
  if (request.method !== "GET") return json({ error: "Método no admitido" }, 405);
  const path = new URL(request.url).pathname;
  if (path === "/lamovie/manifest.json") return json({
    id: "org.yomiri.lamovie", name: "LaMovie", version: "1.1.0",
    description: "Películas y series de LaMovie.",
    author: "iamdecherre", repository: "https://github.com/iamdecherre/fuentes",
    types: ["movie", "series"], resources: ["catalog", "meta", "stream"],
    catalogs: [
      { type: "movie", id: "movies", name: "Películas", extra: [{ name: "search" }, { name: "skip" }] },
      { type: "series", id: "tvshows", name: "Series", extra: [{ name: "search" }, { name: "skip" }] },
    ],
  });
  const match = /^\/lamovie\/(catalog|meta|stream)\/(movie|series)\/([^/]+)(?:\/([^/]+))?\.json$/.exec(path);
  if (!match) return json({ error: "Ruta no encontrada" }, 404);
  try {
    const [, operation, type, encoded, extra] = match;
    const postType = type === "series" ? "tvshows" : "movies";
    const id = decodeURIComponent(encoded);
    if (operation === "catalog" && id === postType) {
      const params = new URLSearchParams(extra ? decodeURIComponent(extra) : "");
      const skip = Number(params.get("skip") || 0);
      if (!Number.isSafeInteger(skip) || skip < 0 || skip > 100000) return json({ error: "Página inválida" }, 400);
      const query = params.get("search")?.trim().slice(0, 150);
      const page = Math.floor(skip / 20) + 1;
      const args = new URLSearchParams({ postType, postsPerPage: "20", page: String(page), orderBy: "date", order: "desc" });
      if (query) args.set("q", query);
      const result = await read<{ data?: { posts?: Film[]; pagination?: { last_page?: number } } }>(
        (query ? "/search?" : "/listing/" + postType + "?") + args);
      return json({ metas: (result.data?.posts ?? []).map(film => metadata(film, type)), hasMore: page < (result.data?.pagination?.last_page ?? 1) });
    }
    const filmId = /^lamovie:(\d+):(.{1,250})$/.exec(id);
    if (!filmId) return json(operation === "stream" ? { streams: [] } : { error: "Ficha inválida" }, operation === "stream" ? 200 : 404);
    if (operation === "meta") {
      const result = await read<{ data?: Film }>("/single/" + postType + "?" + new URLSearchParams({ slug: filmId[2], postType }));
      if (!result.data || String(result.data._id) !== filmId[1]) return json({ error: "Ficha no encontrada" }, 404);
      if (type === "movie") return json({ meta: metadata(result.data, type) });
      type EpisodePage = { data?: {
        posts?: { _id: number; title: string; slug: string; season_number: number; episode_number: number; still_path?: string }[];
        seasons?: string[]; pagination?: { last_page?: number };
      } };
      const load = (season: string, page: number) => read<EpisodePage>("/single/episodes/list?" +
        new URLSearchParams({ _id: filmId[1], season, page: String(page) }));
      const first = await load("1", 1);
      const videos = new Map<string, { id: string; title: string; season: number; episode: number; thumbnail?: string }>();
      for (const season of first.data?.seasons ?? ["1"]) {
        if (!/^\d+$/.test(season)) continue;
        let last = 1;
        for (let page = 1; page <= last; page++) {
          const response = season === "1" && page === 1 ? first : await load(season, page);
          last = response.data?.pagination?.last_page ?? 1;
          if (!Number.isInteger(last) || last < 1 || last > 100) throw new Error("Paginación inválida");
          for (const episode of response.data?.posts ?? []) {
            const id = "lamovie:" + episode._id + ":" + episode.slug;
            videos.set(id, { id, title: episode.title, season: episode.season_number, episode: episode.episode_number,
              thumbnail: episode.still_path?.startsWith("/") ? "https://image.tmdb.org/t/p/w500" + episode.still_path : undefined });
          }
        }
      }
      return json({ meta: { ...metadata(result.data, type), videos: [...videos.values()] } });
    }
    const result = await read<{ data?: { embeds?: { url?: string; server?: string; lang?: string }[] } }>(
      "/player?" + new URLSearchParams({ postId: filmId[1], demo: "0" }));
    const streams = (result.data?.embeds ?? []).flatMap(item => {
      if (!item.url || !/^https:\/\/vimeos\.net\/embed-[a-z0-9]+\.html$/.test(item.url)) return [];
      return [{
        title: ["LaMovie", item.lang].filter(Boolean).join(" · "),
        clientResolver: {
          kind: "packed-player-hls", url: item.url,
          referer: "https://lamovie.la/",
          allowedHosts: ["vimeos.net", "*.vimeos.net", "lamovie.la", "vimeos.zip", "*.vimeos.zip"],
        },
      }];
    });
    return json({ streams });
  } catch {
    return json({ error: "LaMovie no respondió con datos utilizables" }, 502);
  }
}

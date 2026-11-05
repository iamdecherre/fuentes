type Film = {
  _id: number; title: string; slug: string; overview?: string;
  images?: { poster?: string; backdrop?: string }; release_date?: string;
};
const origin = "https://lamovie.la";
const metadata = (film: Film) => ({
  id: "lamovie:" + film._id + ":" + film.slug, type: "movie", name: film.title,
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
    id: "org.yomiri.lamovie", name: "LaMovie", version: "1.0.0",
    description: "Catálogo de películas de LaMovie.",
    author: "iamdecherre", repository: "https://github.com/iamdecherre/fuentes",
    types: ["movie"], resources: ["catalog", "meta", "stream"],
    catalogs: [{ type: "movie", id: "movies", name: "Películas", extra: [{ name: "search" }, { name: "skip" }] }],
  });
  const match = /^\/lamovie\/(catalog|meta|stream)\/movie\/([^/]+)(?:\/([^/]+))?\.json$/.exec(path);
  if (!match) return json({ error: "Ruta no encontrada" }, 404);
  try {
    const [, operation, encoded, extra] = match;
    const id = decodeURIComponent(encoded);
    if (operation === "catalog" && id === "movies") {
      const params = new URLSearchParams(extra ? decodeURIComponent(extra) : "");
      const skip = Number(params.get("skip") || 0);
      if (!Number.isSafeInteger(skip) || skip < 0 || skip > 100000) return json({ error: "Página inválida" }, 400);
      const query = params.get("search")?.trim().slice(0, 150);
      const page = Math.floor(skip / 20) + 1;
      const args = new URLSearchParams({ postType: "movies", postsPerPage: "20", page: String(page), orderBy: "date", order: "desc" });
      if (query) args.set("q", query);
      const result = await read<{ data?: { posts?: Film[]; pagination?: { last_page?: number } } }>(
        (query ? "/search?" : "/listing/movies?") + args);
      return json({ metas: (result.data?.posts ?? []).map(metadata), hasMore: page < (result.data?.pagination?.last_page ?? 1) });
    }
    const filmId = /^lamovie:(\d+):(.{1,250})$/.exec(id);
    if (!filmId) return json(operation === "stream" ? { streams: [] } : { error: "Ficha inválida" }, operation === "stream" ? 200 : 404);
    if (operation === "meta") {
      const result = await read<{ data?: Film }>("/single/movies?" + new URLSearchParams({ slug: filmId[2], postType: "movies" }));
      if (!result.data || String(result.data._id) !== filmId[1]) return json({ error: "Ficha no encontrada" }, 404);
      return json({ meta: metadata(result.data) });
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

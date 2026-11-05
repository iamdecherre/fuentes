const origin = "https://video.blender.org";
const movies = [
  { id: "tt1254207", type: "movie", name: "Big Buck Bunny", releaseInfo: "2008",
    file: "bf1f3fb5-b119-4f9f-9930-8e20e892b898", description: "Cortometraje de animación de Blender Foundation." },
  { id: "tt1727587", type: "movie", name: "Sintel", releaseInfo: "2010",
    file: "0eb052d0-fd51-43e6-aa33-ecdbf77a5d40", description: "Una joven busca a su dragón perdido. Cortometraje de Blender Foundation." },
];
const episodes = [
  { id: "blender:caminandes:2", title: "Gran Dillama", season: 1, episode: 2, file: "fb70d459-48d2-4db5-adba-813c84f9200a" },
  { id: "blender:caminandes:3", title: "Llamigos", season: 1, episode: 3, file: "23f3ef79-15dc-44c5-aa45-cf92e78a4509" },
];
const series = {
  id: "blender:caminandes", type: "series", name: "Caminandes", releaseInfo: "2013–2016",
  description: "Las aventuras de Koro, una llama patagónica. Serie de cortos de Blender Studio.",
  file: episodes[0].file,
};
const entries = [...movies, series];
function metadata({ file, ...item }: typeof series) {
  return { ...item, poster: origin + "/lazy-static/thumbnails/" + file + ".jpg" };
}
const manifest = {
  id: "org.yomiri.blender-cinema", name: "Cine abierto de Blender", version: "1.0.0",
  description: "Cortometrajes y episodios alojados por Blender Foundation.",
  author: "iamdecherre", repository: "https://github.com/iamdecherre/fuentes",
  types: ["movie", "series"], resources: ["catalog", "meta", "stream"],
  catalogs: [
    { type: "movie", id: "open-movies", name: "Cortometrajes" },
    { type: "series", id: "open-series", name: "Series de animación" },
  ],
};

export function blenderCinema(request: Request) {
  const json = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { "Access-Control-Allow-Origin": "*" } });
  if (request.method !== "GET") return json({ error: "Método no admitido" }, 405);
  const path = new URL(request.url).pathname;
  if (path === "/blender/manifest.json") return json(manifest);
  const match = /^\/blender\/(catalog|meta|stream)\/(movie|series)\/([^/]+)\.json$/.exec(path);
  if (!match) return json({ error: "Ruta no encontrada" }, 404);
  const [, operation, type, encoded] = match;
  let id: string;
  try { id = decodeURIComponent(encoded); } catch { return json({ error: "ID inválido" }, 400); }
  if (operation === "catalog" && manifest.catalogs.some(catalog => catalog.id === id && catalog.type === type)) {
    return json({ metas: entries.filter(item => item.type === type).map(metadata) });
  }
  const item = entries.find(entry => entry.type === type && entry.id === id);
  if (operation === "meta" && item) {
    return json({ meta: { ...metadata(item), ...(type === "series" ? {
      videos: episodes.map(({ file, ...episode }) => episode),
    } : {}) } });
  }
  if (operation === "stream") {
    const playable = type === "movie" ? item : episodes.find(episode => episode.id === id);
    return json({ streams: playable ? [{
      title: "Blender Foundation · 720p",
      url: origin + "/object-storage/web_videos/" + playable.file + "-720.mp4",
    }] : [] });
  }
  return json({ error: "Entrada no encontrada" }, 404);
}

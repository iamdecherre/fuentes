import { AsyncLocalStorage } from "node:async_hooks";
import { DOMParser } from "linkedom";
import { AnimeAv1Source } from "./AnimeAv1Source.ts";
import { AnimeFlvOrSource } from "./AnimeFlvOrSource.ts";
import { HtmlVideoSource } from "./HtmlVideoSource.ts";
import { JkAnimeSource } from "./JkAnimeSource.ts";
import { AnizoneSource } from "./AnizoneSource.ts";
import { createAnimeAddon } from "./AnimeAv1Addon.ts";
import type { YomiriHttpClient } from "../../src/yomiri/network/types.ts";
import { RBTV_API, loadRbtvAgenda, loadRbtvSignals } from "../RbtvPlus.ts";

Object.assign(globalThis, { DOMParser });
const sessions = new AsyncLocalStorage<Map<string, Map<string, string>>>();
const http: Pick<YomiriHttpClient, "text"> = {
  async text(request) {
    const origin = new URL(request.url).origin;
    const session = sessions.getStore();
    const cookies = session?.get(origin) ?? new Map<string, string>();
    const headers = new Headers({ Accept: "text/html", ...request.headers });
    if (cookies.size) headers.set("Cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    const response = await fetch(request.url, {
      method: request.method,
      body: request.body,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });
    const responseHeaders = response.headers as Headers & { getAll?(name: string): string[] };
    const setCookies = responseHeaders.getSetCookie?.() ?? responseHeaders.getAll?.("Set-Cookie") ?? [];
    for (const cookie of setCookies) {
      const pair = cookie.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    session?.set(origin, cookies);
    return {
      body: await response.text(),
      status: response.status,
      finalUrl: response.url,
      headers: Object.fromEntries(response.headers),
      transport: "direct",
      fromCache: false,
      classification: response.headers.get("cf-mitigated") === "challenge" ? "challenge" : "content",
    };
  },
};
const sources = [
  new AnimeAv1Source(http), new AnimeFlvOrSource(http), new JkAnimeSource(http),
  new HtmlVideoSource("animeyt", http), new HtmlVideoSource("katanime", http),
  new HtmlVideoSource("monoschinos", http), new HtmlVideoSource("lacartoons", http),
  new AnizoneSource(http),
];
const addons = new Map(sources.map(source => [source.id, createAnimeAddon(source)]));
async function rbtvRequest(path: string) {
  const response = await fetch(RBTV_API + path, { redirect: "manual", signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`RBTV+ HTTP ${response.status}`);
  return { body: new Uint8Array(await response.arrayBuffer()), headers: Object.fromEntries(response.headers) };
}
async function rbtvAddon(request: Request) {
  const path = new URL(request.url).pathname;
  if (path === "/manifest.json") return Response.json({
    id: "org.yomiri.example.rbtvplus", name: "RBTV+", version: "1.0.0",
    types: ["live"], resources: ["catalog", "stream"],
    catalogs: [{ type: "live", id: "football", name: "Fútbol" }],
  });
  if (path === "/catalog/live/football.json") {
    const events = await loadRbtvAgenda(rbtvRequest);
    return Response.json({ metas: events.map(event => ({ id: event.id, type: "live", name: event.title, liveEvent: event })) });
  }
  const match = /^\/stream\/live\/(rbtv(?:%3A|:)\d+)\.json$/i.exec(path);
  if (!match) return Response.json({ error: "Ruta no encontrada" }, { status: 404 });
  const signals = await loadRbtvSignals(decodeURIComponent(match[1]), rbtvRequest);
  return Response.json({ streams: signals.map(signal => ({ title: signal.name, m3u8Url: signal.url })) });
}
export async function serveSources(request: Request, publicBase?: string, mediaSecret?: string): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
  try {
    if (path === "/index.json" && publicBase) return Response.json({
      format: "yomiri.repository.v1",
      name: "Fuentes de anime y fútbol",
      addons: [...addons.keys(), "rbtvplus"].map(id => new URL(`/${id}/manifest.json`, publicBase).href),
    }, { headers: { "Access-Control-Allow-Origin": "*" } });
    const sourceId = path.split("/")[1];
    const addon = sourceId === "rbtvplus" ? rbtvAddon : addons.get(sourceId);
    if (!addon) return Response.json({ error: "Fuente no encontrada" }, { status: 404 });
    url.pathname = path.slice(sourceId.length + 1);
    const response = await sessions.run(new Map(), () => addon(new Request(url), mediaSecret));
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(response.body, { status: response.status, headers });
  } catch (cause) {
    console.error("Fuente", path.split("/").slice(0, 3).join("/"), cause instanceof Error ? cause.message : String(cause));
    return Response.json({ error: "Error del servicio" }, { status: 502, headers: { "Access-Control-Allow-Origin": "*" } });
  }
}

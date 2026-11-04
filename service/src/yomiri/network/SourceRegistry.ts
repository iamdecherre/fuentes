import { NetworkError, type HttpRequest, type ImageRequest } from "./types.ts";

export interface SourcePolicy {
  dynamic?: boolean;
  baseUrl?: string;
  id: string;
  revision: string;
  allowedHosts: readonly string[];
  corsHosts: readonly string[];
  requiresSession?: boolean;
}
const dynamicPolicies = new Map<string, SourcePolicy>();
export const isDynamicSource = (id: string) => /^dynamic-/i.test(id);
export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NetworkError("PERMISSION_REQUIRED", "URL pública inválida.");
  }
  const host = url.hostname.toLowerCase();
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      host,
    ) ||
    host.includes(":") ||
    host.startsWith("[") ||
    /^[\d.]+$/.test(host) ||
    /(^|[.-])localhost([.-]|$)/.test(host) ||
    /\.(local|localhost|lan|internal|home|test|invalid|onion|arpa)$/.test(host) ||
    /(?:^|[.-])\d{1,3}[.-]\d{1,3}[.-]\d{1,3}[.-]\d{1,3}(?:[.-]|$)/.test(host)
  )
    throw new NetworkError(
      "PERMISSION_REQUIRED",
      "Solo se permiten dominios públicos HTTP/HTTPS, sin IPs ni redes locales.",
    );
  return url;
}
export function registerDynamicSource(source: {
  id: string;
  revision: string;
  allowedHosts: readonly string[];
  baseUrl: string;
}): SourcePolicy {
  if (
    !/^dynamic-[a-z0-9._-]{1,190}$/i.test(source.id) ||
    typeof source.revision !== "string" ||
    source.revision.length > 128 ||
    !source.revision ||
    !Array.isArray(source.allowedHosts) ||
    !source.allowedHosts.length ||
    source.allowedHosts.length > 128
  )
    throw new NetworkError("PERMISSION_REQUIRED", "Registro dinámico inválido.");
  const base = assertPublicUrl(source.baseUrl);
  const hosts = [
    ...new Set(
      source.allowedHosts.map((host) => {
        const hostname = typeof host === "string" ? host.replace(/^\*\./, "") : "";
        if (!hostname || hostname !== assertPublicUrl(`https://${hostname}/`).hostname)
          throw new NetworkError("PERMISSION_REQUIRED", "Host dinámico inválido.");
        return host;
      }),
    ),
  ];
  if (!hostMatches(base.hostname, hosts))
    throw new NetworkError("PERMISSION_REQUIRED", "Falta el dominio de la fuente.");
  if (!dynamicPolicies.has(source.id) && dynamicPolicies.size >= 128)
    throw new NetworkError("NETWORK_BUSY", "Máximo de 128 fuentes dinámicas instaladas.");
  const existing = dynamicPolicies.get(source.id);
  if (existing?.baseUrl && new URL(existing.baseUrl).origin !== base.origin)
    throw new NetworkError("PERMISSION_REQUIRED", "La fuente instalada cambió de dominio.");
  const result: SourcePolicy = Object.freeze({
    id: source.id,
    revision: source.revision,
    allowedHosts: Object.freeze(hosts),
    corsHosts: [],
    requiresSession: true,
    dynamic: true,
    baseUrl: base.href,
  });
  dynamicPolicies.set(source.id, result);
  return result;
}
export const getDynamicPolicies = () => Array.from(dynamicPolicies.values());
export const unregisterDynamicSource = (id: string) => dynamicPolicies.delete(id);
export function authorizeDynamicImage(sourceId: string, raw: string): URL {
  return assertSourceUrl(sourceId, raw);
}

const policy = (
  id: string,
  hosts: string[],
  corsHosts: string[] = [],
  requiresSession = false,
): SourcePolicy =>
  Object.freeze({
    id,
    revision: "1",
    allowedHosts: Object.freeze(hosts),
    corsHosts: Object.freeze(corsHosts),
    requiresSession,
  });

// Built-in access is limited to the metadata service.
export const SOURCE_POLICIES: Readonly<Record<string, SourcePolicy>> = Object.freeze({
  anilist: policy('anilist', ['graphql.anilist.co'], ['graphql.anilist.co']),
});

export const hostMatches = (host: string, patterns: readonly string[]) =>
  patterns.some((pattern) =>
    pattern.startsWith("*.") ? host.endsWith(pattern.slice(1)) : host === pattern,
  );

export const SOURCE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // Marmota
  "kei-5937472249278743372": "marmota",
  "5937472249278743372": "marmota",
  "custom-marmota": "marmota",
  "eu.kanade.tachiyomi.extension.all.marmota": "marmota",
  "eu.kanade.tachiyomi.extension.es.marmota": "marmota",
  // DB New Hope
  "kei-909008906078523978": "dbnewhope",
  "909008906078523978": "dbnewhope",
  "custom-dbnewhope": "dbnewhope",
  "db-new-hope": "dbnewhope",
  "db_new_hope": "dbnewhope",
  "eu.kanade.tachiyomi.extension.all.dbnewhope": "dbnewhope",
  "eu.kanade.tachiyomi.extension.es.dbnewhope": "dbnewhope",
  // AnzManga
  "custom-anzmanga": "anzmanga",
  "kei-7374498796507972405": "anzmanga",
  "7374498796507972405": "anzmanga",
  "anz-manga": "anzmanga",
  "eu.kanade.tachiyomi.extension.all.anzmanga": "anzmanga",
  "eu.kanade.tachiyomi.extension.es.anzmanga": "anzmanga",
  // Kazoku Den
  "kei-475788948976592183": "kazokuden",
  "475788948976592183": "kazokuden",
  "custom-kazokuden": "kazokuden",
  "kazoku-den": "kazokuden",
  "eu.kanade.tachiyomi.extension.all.kazokuden": "kazokuden",
  "eu.kanade.tachiyomi.extension.es.kazokuden": "kazokuden",
  // LeerCapitulo
  "kei-5621901596522308538": "leercapitulo",
  "5621901596522308538": "leercapitulo",
  "custom-leercapitulo": "leercapitulo",
  "leer-capitulo": "leercapitulo",
  "eu.kanade.tachiyomi.extension.all.leercapitulo": "leercapitulo",
  "eu.kanade.tachiyomi.extension.es.leercapitulo": "leercapitulo",
  // MangaDex
  "custom-mangadex": "mangadex",
  "manga-dex": "mangadex",
  "eu.kanade.tachiyomi.extension.all.mangadex": "mangadex",
});

export function normalizeSourceId(id: string): string {
  id = id.trim();
  // Repository labels and old clients can send a differently capitalized native ID.
  const canonical = id.toLowerCase();
  if (Object.hasOwn(SOURCE_POLICIES, canonical)) return canonical;
  if (SOURCE_ALIASES[canonical]) return SOURCE_ALIASES[canonical];
  if (SOURCE_ALIASES[id]) return SOURCE_ALIASES[id];
  const stripped = canonical.replace(/^dynamic-/, "");
  if (SOURCE_ALIASES[stripped]) return SOURCE_ALIASES[stripped];
  const pkgMatch = canonical.match(/\.([a-z0-9_-]+)$/i);
  if (pkgMatch && SOURCE_ALIASES[pkgMatch[1]]) return SOURCE_ALIASES[pkgMatch[1]];
  if (pkgMatch && Object.hasOwn(SOURCE_POLICIES, pkgMatch[1])) return pkgMatch[1];
  // Installed repository IDs are opaque: removing their prefix breaks runtime lookup.
  return canonical.startsWith("dynamic-") ? canonical : stripped;
}

export function getSourcePolicy(id: string): SourcePolicy {
  if (dynamicPolicies.has(id)) return dynamicPolicies.get(id)!;
  const normalized = normalizeSourceId(id);
  if (!Object.hasOwn(SOURCE_POLICIES, normalized))
    throw new NetworkError(
      "PERMISSION_REQUIRED",
      "Esta fuente necesita un conector de red compatible. Revisá su extensión.",
    );
  return SOURCE_POLICIES[normalized];
}

export function assertSourceUrl(sourceId: string, raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NetworkError("INVALID_RESPONSE", "URL inválida.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !hostMatches(url.hostname, getSourcePolicy(sourceId).allowedHosts)
  ) {
    throw new NetworkError(
      "PERMISSION_REQUIRED",
      "El dominio no está autorizado para esta fuente.",
    );
  }
  if (getSourcePolicy(sourceId).dynamic) assertPublicUrl(url.href);
  return url;
}

export function sourceIdForUrl(raw: string): string {
  for (const id of Object.keys(SOURCE_POLICIES)) {
    try {
      assertSourceUrl(id, raw);
      return id;
    } catch {
      /* Next catalog source. */
    }
  }
  throw new NetworkError("PERMISSION_REQUIRED", "Este dominio no está en el catálogo de Yomiri.");
}

export function requiresBrowserHeaders(
  request: Pick<HttpRequest, "headers"> | ImageRequest,
): boolean {
  return (
    !!request.headers &&
    Object.keys(request.headers).some((name) =>
      /^(?:referer|origin|user-agent|host|cookie)$/i.test(name),
    )
  );
}

export function canUseDirect(request: HttpRequest | ImageRequest): boolean {
  const source = getSourcePolicy(request.sourceId);
  if (source.dynamic) return false;
  const url = assertSourceUrl(request.sourceId, request.url);
  const session = request.requiresSession ?? source.requiresSession;
  return (
    !session &&
    !requiresBrowserHeaders(request) &&
    !("referer" in request && request.referer) &&
    (request.corsOpen === true ||
      (request.corsOpen !== false && hostMatches(url.hostname, source.corsHosts)))
  );
}

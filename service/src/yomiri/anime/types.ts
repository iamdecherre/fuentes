/** Anime adapters reuse YomiriHttpClient; they do not consume manga repository IDs. */
export interface AnimeTitle {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  coverUrl?: string;
  description?: string;
  genres: string[];
  status: 'ONGOING' | 'COMPLETED' | 'UNKNOWN';
}
export interface AnimeEpisode {
  id: string;
  animeId: string;
  sourceId: string;
  url: string;
  name: string;
  episodeNumber: number;
  thumbnailUrl?: string;
}
export interface AnimeServer {
  playbackNote?: string;
  unavailableReason?: string;
  id: string;
  name: string;
  language?: string;
  url: string;
  delivery: 'embed' | 'direct' | 'hls';
  mimeType?: string;
  quality?: string;
  referer?: string;
  expiresAt?: number;
  isNative?: boolean;
  rawUrl?: string;
  downloadUrl?: string;
}
export interface AnimeSource {
  readonly id: string;
  readonly name: string;
  readonly website: string;
  readonly lang: string;
  getSearchFilters?():Promise<AnimeCatalogFilter[]>;
  search(query:string,page?:number,filters?:Record<string,string>):Promise<{titles:AnimeTitle[];hasNextPage:boolean}>;
  getPopular(page?:number):Promise<{titles:AnimeTitle[];hasNextPage:boolean}>;
  getLatest?(page?:number):Promise<{titles:AnimeTitle[];hasNextPage:boolean}>;
  getAnime(id:string):Promise<AnimeTitle>;
  getEpisodes(id:string):Promise<AnimeEpisode[]>;
  getServers(episodeId:string):Promise<AnimeServer[]>;
}
export interface AnimeCatalogFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

import { serveSources } from "./legacy-integrations/anime/SourceService.ts";
import { relayMedia } from "./MediaRelay.ts";
import { blenderCinema } from "./BlenderCinema.ts";

export default {
  fetch(request: Request, env: { MEDIA_SIGNING_KEY?: string }): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/blender/")) return Promise.resolve(blenderCinema(request));
    if (url.pathname.startsWith("/media/") && env.MEDIA_SIGNING_KEY) {
      return relayMedia(request, env.MEDIA_SIGNING_KEY);
    }
    return serveSources(request, url.origin, env.MEDIA_SIGNING_KEY);
  },
};

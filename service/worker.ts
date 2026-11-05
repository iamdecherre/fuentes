import { serveSources } from "./legacy-integrations/anime/SourceService.ts";

export default {
  fetch(request: Request): Promise<Response> {
    return serveSources(request, new URL(request.url).origin);
  },
};

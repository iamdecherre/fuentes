import { createServer } from "node:http";
import { serveSources } from "./SourceService.ts";

const publicBase = process.env.PUBLIC_BASE_URL ? new URL(process.env.PUBLIC_BASE_URL) : undefined;
if (publicBase && (publicBase.protocol !== "https:" || publicBase.username || publicBase.password ||
    publicBase.pathname !== "/" || publicBase.search || publicBase.hash)) {
  throw new Error("PUBLIC_BASE_URL debe ser un origen HTTPS.");
}
const server = createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url ?? "/", "http://127.0.0.1");
  const response = await serveSources(new Request(url, { method: incoming.method }), publicBase?.origin);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});
server.listen(Number(process.env.PORT ?? "3041"), process.env.HOST ?? "127.0.0.1", () => {
  console.log("Servicio de fuentes", server.address());
});

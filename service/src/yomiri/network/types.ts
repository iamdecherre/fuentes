export type TransportMode = "extension" | "worker" | "direct" | "personal-proxy";
export type HttpBody = string | Uint8Array;

export interface HttpRequest {
  sourceId: string;
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  responseType: "text" | "bytes";
  credentials: "omit" | "include";
  timeoutMs?: number;
  cache: { ttlMs: number; scope: "public" | "session" };
  signal?: AbortSignal;
  corsOpen?: boolean;
  requiresSession?: boolean;
  purpose?: "metadata" | "image";
}

export interface HttpResponse<T extends HttpBody> {
  status: number;
  finalUrl: string;
  headers: Record<string, string>;
  body: T;
  transport: TransportMode;
  fromCache: boolean;
  classification: "content" | "challenge";
}

export interface ImageRequest {
  sourceId: string;
  url: string;
  referer?: string;
  headers?: Record<string, string>;
  corsOpen?: boolean;
  requiresSession?: boolean;
  signal?: AbortSignal;
}

export interface PreparedImage {
  url: string;
  delivery: "direct" | "blob" | "offline";
  release(): void;
}

export interface YomiriHttpClient {
  text(request: HttpRequest & { responseType: "text" }): Promise<HttpResponse<string>>;
  bytes(request: HttpRequest & { responseType: "bytes" }): Promise<HttpResponse<Uint8Array>>;
  prepareImage(request: ImageRequest): Promise<PreparedImage>;
}

export type NetworkErrorCode =
  | "BRIDGE_UNAVAILABLE"
  | "PERMISSION_REQUIRED"
  | "LOGIN_REQUIRED"
  | "QUOTA_EXHAUSTED"
  | "CHALLENGE_REQUIRED"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "ABORTED"
  | "INVALID_RESPONSE"
  | "NETWORK_BUSY";

export class NetworkError extends Error {
  constructor(
    public readonly code: NetworkErrorCode,
    message: string,
    public readonly status?: number,
    public readonly transport?: TransportMode,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

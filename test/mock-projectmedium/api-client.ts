/**
 * Large API client with many endpoints and utilities
 */
import { fetch } from "undici";
import { HttpsProxyAgent } from "https-proxy-agent";

const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
  proxy?: string;
}

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private proxy?: string;

  constructor(config: { baseUrl: string; apiKey?: string; timeout?: number; proxy?: string }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.proxy = config.proxy;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(config.apiKey ? { "Authorization": `Bearer ${config.apiKey}` } : {}),
    };
  }

  async request<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { method = "GET", headers = {}, body, timeout, retries = MAX_RETRIES, proxy } = options;
    const url = this.buildUrl(endpoint);
    const requestHeaders = { ...this.defaultHeaders, ...headers };
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.executeRequest<T>({
          url,
          method,
          headers: requestHeaders,
          body,
          timeout: timeout ?? this.timeout,
          agent,
        });
        return response;
      } catch (err) {
        lastError = err as Error;
        if (attempt < retries) {
          await this.delay(RETRY_DELAY * Math.pow(2, attempt));
        }
      }
    }
    throw lastError!;
  }

  private async executeRequest<T>(opts: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
    timeout: number;
    agent?: HttpsProxyAgent;
  }): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

    try {
      const response = await fetch(opts.url, {
        method: opts.method,
        headers: opts.headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
        dispatcher: opts.agent as any,
      });

      clearTimeout(timeoutId);

      const data = await response.json() as T;
      const respHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        respHeaders[key] = value;
      });

      return { data, status: response.status, headers: respHeaders };
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  private buildUrl(endpoint: string): string {
    if (endpoint.startsWith("http")) return endpoint;
    return `${this.baseUrl}/${endpoint.replace(/^\//, "")}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Convenience methods
  async get<T = unknown>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  async post<T = unknown>(endpoint: string, body: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: "POST", body });
  }

  async put<T = unknown>(endpoint: string, body: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: "PUT", body });
  }

  async delete<T = unknown>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }

  async patch<T = unknown>(endpoint: string, body: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: "PATCH", body });
  }
}

// Pagination helpers
export async function* paginate<T>(
  client: ApiClient,
  endpoint: string,
  pageSize = 100
): AsyncGenerator<T[]> {
  let page = 1;
  while (true) {
    const response = await client.get<{ items: T[]; hasMore: boolean }>(endpoint, {
      headers: { "X-Page": String(page), "X-Page-Size": String(pageSize) },
    });
    yield response.data.items;
    if (!response.data.hasMore) break;
    page++;
  }
}

// Rate limiter
export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private lastRefill: number;

  constructor(maxTokens: number, refillPerSecond: number) {
    this.tokens = maxTokens;
    this.maxTokens = maxTokens;
    this.refillRate = refillPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire(count = 1): Promise<void> {
    this.refill();
    while (this.tokens < count) {
      const waitTime = (count - this.tokens) / this.refillRate * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.refill();
    }
    this.tokens -= count;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

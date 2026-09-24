/**
 * Thin Pathly /v1 HTTP helper for GitHub Actions.
 * Auth: Bearer sp_… — never log the token.
 */

export const DEFAULT_API_URL = "https://api.pathlyhq.com";
export const VERSION = "0.1.0";
export const DEFAULT_USER_AGENT = `pathly-github-action/${VERSION}`;

export type FetchLike = typeof globalThis.fetch;

export class PathlyError extends Error {
  readonly status: number;
  readonly path: string;
  readonly details: unknown;

  constructor(init: { status: number; path: string; message: string; details?: unknown }) {
    super(init.message);
    this.name = "PathlyError";
    this.status = init.status;
    this.path = init.path;
    this.details = init.details;
  }

  get unauthorized(): boolean {
    return this.status === 401;
  }

  get forbidden(): boolean {
    return this.status === 403;
  }

  get notFound(): boolean {
    return this.status === 404;
  }
}

export type PathlyClientOptions = {
  token: string;
  apiUrl?: string;
  fetch?: FetchLike;
  userAgent?: string;
  idempotencyKey?: () => string;
};

export type ScenarioCreateBody = {
  type?: "http";
  name: string;
  url: string;
  method?: string;
  expectedStatus?: number;
  intervalSec?: number;
  maxLatencyMs?: number;
  regions?: string[];
  tags?: string[];
  severity?: string;
  expectText?: string;
};

export type WebhookCreateBody = {
  url: string;
  events: string[];
};

export type SlaUpsertBody = {
  name?: string;
  monitorId?: string | null;
  objectivePct: number;
  windowDays: number;
  excludeMaintenance?: boolean;
  warnAtBudgetRatio?: number;
  enabled?: boolean;
};

export type JsonObject = Record<string, unknown>;

function normalizeBaseUrl(apiUrl: string): string {
  const base = apiUrl.replace(/\/+$/, "");
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) {
    throw new Error("Pathly API URL must use https (localhost http allowed).");
  }
  return base;
}

function validateToken(token: string): string {
  const t = token.trim();
  if (!t) {
    throw new Error("Pathly API token is required (create one under Settings → API keys).");
  }
  if (!t.startsWith("sp_")) {
    throw new Error("A Pathly API token starts with sp_. Check it was not truncated.");
  }
  return t;
}

function defaultIdempotencyKey(): string {
  try {
    return `gha-${globalThis.crypto.randomUUID()}`;
  } catch {
    return `gha-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function safeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class PathlyClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly doFetch: FetchLike;
  private readonly userAgent: string;
  private readonly makeKey: () => string;

  constructor(options: PathlyClientOptions) {
    this.token = validateToken(options.token);
    this.baseUrl = normalizeBaseUrl(options.apiUrl ?? DEFAULT_API_URL);
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.makeKey = options.idempotencyKey ?? defaultIdempotencyKey;
  }

  private async request(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = this.baseUrl + path;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
      accept: "application/json",
      "user-agent": this.userAgent,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (method !== "GET") {
      headers["idempotency-key"] = this.makeKey();
    }

    const res = await this.doFetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const parsed = safeJson(text);
    if (!res.ok) {
      const errBody = (parsed ?? {}) as { error?: string; details?: unknown };
      throw new PathlyError({
        status: res.status,
        path,
        message: errBody.error || text.trim() || `HTTP ${res.status}`,
        details: errBody.details,
      });
    }
    return parsed === null ? {} : parsed;
  }

  /**
   * Verifies the token. GET /v1/usage — 403 means the token is valid but lacks org:read.
   */
  async ping(): Promise<{ ok: true; planId?: string }> {
    try {
      const data = (await this.request("GET", "/v1/usage")) as JsonObject;
      return { ok: true, planId: typeof data.planId === "string" ? data.planId : undefined };
    } catch (e) {
      if (e instanceof PathlyError && e.forbidden) {
        return { ok: true };
      }
      throw e;
    }
  }

  async listScenarios(query?: { limit?: number; cursor?: string }): Promise<{
    items: JsonObject[];
    nextCursor?: string | null;
  }> {
    const params = new URLSearchParams();
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    if (query?.cursor) params.set("cursor", query.cursor);
    const qs = params.toString();
    const data = (await this.request("GET", `/v1/scenarios${qs ? `?${qs}` : ""}`)) as {
      items?: JsonObject[];
      nextCursor?: string | null;
    };
    return { items: data.items ?? [], nextCursor: data.nextCursor ?? null };
  }

  async createScenario(body: ScenarioCreateBody): Promise<JsonObject> {
    const payload = {
      type: "http" as const,
      intervalSec: 300,
      ...body,
    };
    return (await this.request("POST", "/v1/scenarios", payload)) as JsonObject;
  }

  /**
   * Ensure an HTTP scenario exists by name (list then create).
   */
  async ensureScenario(body: ScenarioCreateBody): Promise<{ scenario: JsonObject; created: boolean }> {
    const { items } = await this.listScenarios({ limit: 200 });
    const existing = items.find((s) => s.name === body.name);
    if (existing) {
      return { scenario: existing, created: false };
    }
    const scenario = await this.createScenario(body);
    return { scenario, created: true };
  }

  async createWebhook(body: WebhookCreateBody): Promise<JsonObject> {
    return (await this.request("POST", "/v1/webhooks", body)) as JsonObject;
  }

  async upsertSla(body: SlaUpsertBody): Promise<JsonObject> {
    return (await this.request("PUT", "/v1/sla-targets", body)) as JsonObject;
  }
}

export type Operation =
  | "ping"
  | "create-scenario"
  | "ensure-scenario"
  | "list-scenarios"
  | "create-webhook"
  | "upsert-sla";

export function parseOperation(raw: string): Operation {
  const op = raw.trim().toLowerCase() as Operation;
  const allowed: Operation[] = [
    "ping",
    "create-scenario",
    "ensure-scenario",
    "list-scenarios",
    "create-webhook",
    "upsert-sla",
  ];
  if (!allowed.includes(op)) {
    throw new Error(`Unknown operation "${raw}". Allowed: ${allowed.join(", ")}`);
  }
  return op;
}

export function parseJsonInput(raw: string | undefined, label: string): JsonObject | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const parsed = safeJson(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as JsonObject;
}

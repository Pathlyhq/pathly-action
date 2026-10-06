// src/api.ts
var DEFAULT_API_URL = "https://api.pathlyhq.com";
var VERSION = "0.1.1";
var DEFAULT_USER_AGENT = `pathly-github-action/${VERSION}`;
var PathlyError = class extends Error {
  status;
  path;
  details;
  constructor(init) {
    super(init.message);
    this.name = "PathlyError";
    this.status = init.status;
    this.path = init.path;
    this.details = init.details;
  }
  get unauthorized() {
    return this.status === 401;
  }
  get forbidden() {
    return this.status === 403;
  }
  get notFound() {
    return this.status === 404;
  }
};
var TERMINAL_RUN_STATUSES = ["ok", "fail", "error"];
var DEFAULT_RUN_TIMEOUT_SEC = 120;
var DEFAULT_POLL_INTERVAL_MS = 2e3;
var defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
function isTerminalRunStatus(status) {
  return TERMINAL_RUN_STATUSES.includes(status);
}
function parseTimeoutSec(raw, fallback = DEFAULT_RUN_TIMEOUT_SEC) {
  if (raw === void 0 || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("timeout_sec must be a positive number");
  }
  return Math.min(Math.floor(n), 3600);
}
function normalizeBaseUrl(apiUrl) {
  const base = apiUrl.replace(/\/+$/, "");
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) {
    throw new Error("Pathly API URL must use https (localhost http allowed).");
  }
  return base;
}
function validateToken(token) {
  const t = token.trim();
  if (!t) {
    throw new Error("Pathly API token is required (create one under Settings \u2192 API keys).");
  }
  if (!t.startsWith("sp_")) {
    throw new Error("A Pathly API token starts with sp_. Check it was not truncated.");
  }
  return t;
}
function defaultIdempotencyKey() {
  try {
    return `gha-${globalThis.crypto.randomUUID()}`;
  } catch {
    return `gha-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}
function safeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
var PathlyClient = class {
  token;
  baseUrl;
  doFetch;
  userAgent;
  makeKey;
  sleep;
  constructor(options) {
    this.token = validateToken(options.token);
    this.baseUrl = normalizeBaseUrl(options.apiUrl ?? DEFAULT_API_URL);
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.makeKey = options.idempotencyKey ?? defaultIdempotencyKey;
    this.sleep = options.sleep ?? defaultSleep;
  }
  async request(method, path, body, opts) {
    const url = this.baseUrl + path;
    const headers = {
      authorization: `Bearer ${this.token}`,
      accept: "application/json",
      "user-agent": this.userAgent
    };
    if (body !== void 0) headers["content-type"] = "application/json";
    if (method !== "GET" && opts?.idempotent !== false) {
      headers["idempotency-key"] = this.makeKey();
    }
    const res = await this.doFetch(url, {
      method,
      headers,
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    const text = await res.text();
    const parsed = safeJson(text);
    if (!res.ok) {
      const errBody = parsed ?? {};
      throw new PathlyError({
        status: res.status,
        path,
        message: errBody.error || text.trim() || `HTTP ${res.status}`,
        details: errBody.details
      });
    }
    return parsed === null ? {} : parsed;
  }
  /**
   * Verifies the token. GET /v1/usage — 403 means the token is valid but lacks org:read.
   */
  async ping() {
    try {
      const data = await this.request("GET", "/v1/usage");
      return { ok: true, planId: typeof data.planId === "string" ? data.planId : void 0 };
    } catch (e) {
      if (e instanceof PathlyError && e.forbidden) {
        return { ok: true };
      }
      throw e;
    }
  }
  async listScenarios(query) {
    const params = new URLSearchParams();
    if (query?.limit !== void 0) params.set("limit", String(query.limit));
    if (query?.cursor) params.set("cursor", query.cursor);
    const qs = params.toString();
    const data = await this.request("GET", `/v1/scenarios${qs ? `?${qs}` : ""}`);
    return { items: data.items ?? [], nextCursor: data.nextCursor ?? null };
  }
  async getScenario(scenarioId) {
    const id = scenarioId.trim();
    if (!id) throw new Error("scenario_id is required");
    return await this.request("GET", `/v1/scenarios/${encodeURIComponent(id)}`);
  }
  async createScenario(body) {
    const payload = {
      type: "http",
      intervalSec: 300,
      ...body
    };
    return await this.request("POST", "/v1/scenarios", payload);
  }
  /**
   * Ensure an HTTP scenario exists by name (list then create).
   */
  async ensureScenario(body) {
    const { items } = await this.listScenarios({ limit: 200 });
    const existing = items.find((s) => s.name === body.name);
    if (existing) {
      return { scenario: existing, created: false };
    }
    const scenario = await this.createScenario(body);
    return { scenario, created: true };
  }
  async createWebhook(body) {
    return await this.request("POST", "/v1/webhooks", body);
  }
  async upsertSla(body) {
    return await this.request("PUT", "/v1/sla-targets", body);
  }
  /**
   * Déclenche une exécution. Non idempotent : deux appels = deux runs.
   * Réponse : `{ ok, queued, jobId }`. Le `jobId` n'est pas l'id du run.
   */
  async runScenario(scenarioId) {
    const id = scenarioId.trim();
    if (!id) throw new Error("scenario_id is required");
    return await this.request(
      "POST",
      `/v1/scenarios/${encodeURIComponent(id)}/run`,
      void 0,
      { idempotent: false }
    );
  }
  async getRun(runId) {
    const id = runId.trim();
    if (!id) throw new Error("run id is required");
    return await this.request("GET", `/v1/runs/${encodeURIComponent(id)}`);
  }
  async listRuns(query) {
    const params = new URLSearchParams();
    if (query?.scenarioId) params.set("scenarioId", query.scenarioId);
    if (query?.limit !== void 0) params.set("limit", String(query.limit));
    if (query?.cursor) params.set("cursor", query.cursor);
    const qs = params.toString();
    const data = await this.request("GET", `/v1/runs${qs ? `?${qs}` : ""}`);
    return { items: data.items ?? [], nextCursor: data.nextCursor ?? null };
  }
  /**
   * POST /run puis poll GET /v1/runs jusqu'à un statut terminal (`ok` / `fail` / `error`).
   * Lève si le run n'est pas `ok` ou si le délai expire — la CI passe au rouge.
   */
  async runAndWait(scenarioId, options = {}) {
    const timeoutSec = options.timeoutSec ?? DEFAULT_RUN_TIMEOUT_SEC;
    if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
      throw new Error("timeout_sec must be a positive number");
    }
    const pollMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const sleep = options.sleep ?? this.sleep;
    const now = options.now ?? Date.now;
    const deadline = now() + timeoutSec * 1e3;
    const prior = await this.listRuns({ scenarioId, limit: 20 });
    const seen = new Set(
      prior.items.map((r) => typeof r.id === "string" ? r.id : "").filter(Boolean)
    );
    await this.runScenario(scenarioId);
    let lastError;
    while (now() < deadline) {
      try {
        const page = await this.listRuns({ scenarioId, limit: 20 });
        const fresh = page.items.find((r) => typeof r.id === "string" && r.id && !seen.has(r.id));
        if (fresh?.id) {
          const run = await this.getRun(String(fresh.id));
          const status = typeof run.status === "string" ? run.status : "";
          if (isTerminalRunStatus(status)) {
            if (status !== "ok") {
              const detail = typeof run.message === "string" && run.message ? `: ${run.message}` : "";
              throw new Error(`Pathly run ${run.id} ended with status ${status}${detail}`);
            }
            return run;
          }
        }
      } catch (e) {
        if (e instanceof Error && /ended with status/.test(e.message)) throw e;
        if (e instanceof PathlyError && e.notFound) {
          lastError = e;
        } else {
          throw e;
        }
      }
      if (now() >= deadline) break;
      await sleep(pollMs);
    }
    const hint = lastError instanceof Error ? ` (${lastError.message})` : "";
    throw new Error(
      `Pathly run for scenario ${scenarioId} did not finish within ${timeoutSec}s${hint}`
    );
  }
};
function parseOperation(raw) {
  const op = raw.trim().toLowerCase();
  const allowed = [
    "ping",
    "create-scenario",
    "ensure-scenario",
    "list-scenarios",
    "create-webhook",
    "upsert-sla",
    "assert-scenario",
    "run-scenario",
    "run-and-wait"
  ];
  if (!allowed.includes(op)) {
    throw new Error(`Unknown operation "${raw}". Allowed: ${allowed.join(", ")}`);
  }
  return op;
}
function parseJsonInput(raw, label) {
  if (raw === void 0 || raw.trim() === "") return void 0;
  const parsed = safeJson(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

export {
  DEFAULT_API_URL,
  VERSION,
  DEFAULT_USER_AGENT,
  PathlyError,
  TERMINAL_RUN_STATUSES,
  DEFAULT_RUN_TIMEOUT_SEC,
  DEFAULT_POLL_INTERVAL_MS,
  isTerminalRunStatus,
  parseTimeoutSec,
  PathlyClient,
  parseOperation,
  parseJsonInput
};
//# sourceMappingURL=chunk-GYRFWAK5.js.map
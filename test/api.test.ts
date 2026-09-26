import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_API_URL,
  DEFAULT_RUN_TIMEOUT_SEC,
  PathlyClient,
  PathlyError,
  isTerminalRunStatus,
  parseJsonInput,
  parseOperation,
  parseTimeoutSec,
} from "../src/api.js";

type Call = { url: string; init: RequestInit };

function fakeFetch(
  responses: Array<{ status?: number; body?: unknown; headers?: Record<string, string> }>,
) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const spec = responses[Math.min(calls.length - 1, responses.length - 1)] ?? {};
    const status = spec.status ?? 200;
    return new Response(spec.body === undefined ? "" : JSON.stringify(spec.body), {
      status,
      headers: spec.headers,
    });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof globalThis.fetch };
}

function clientWith(
  responses: Array<{ status?: number; body?: unknown; headers?: Record<string, string> }>,
) {
  const { calls, fetchImpl } = fakeFetch(responses);
  const client = new PathlyClient({
    token: "sp_test_token_value",
    apiUrl: "https://api.test.pathlyhq.com",
    fetch: fetchImpl,
    idempotencyKey: () => "fixed-key",
  });
  return { client, calls };
}

describe("construction", () => {
  it("uses production default URL", () => {
    expect(DEFAULT_API_URL).toBe("https://api.pathlyhq.com");
  });

  it("rejects empty token", () => {
    expect(() => new PathlyClient({ token: "  " })).toThrow(/token is required/i);
  });

  it("rejects non-sp_ token", () => {
    expect(() => new PathlyClient({ token: "ghp_x" })).toThrow(/sp_/);
  });

  it("rejects cleartext remote http", () => {
    expect(
      () => new PathlyClient({ token: "sp_x", apiUrl: "http://api.example.com" }),
    ).toThrow(/https/);
  });

  it("allows localhost http", () => {
    expect(() => new PathlyClient({ token: "sp_x", apiUrl: "http://localhost:8084" })).not.toThrow();
    expect(() => new PathlyClient({ token: "sp_x", apiUrl: "http://127.0.0.1:8084/" })).not.toThrow();
  });
});

describe("parse helpers", () => {
  it("parses known operations", () => {
    expect(parseOperation("ping")).toBe("ping");
    expect(parseOperation(" Create-Scenario ")).toBe("create-scenario");
    expect(parseOperation("upsert-sla")).toBe("upsert-sla");
    expect(parseOperation("run-scenario")).toBe("run-scenario");
    expect(parseOperation(" RUN-AND-WAIT ")).toBe("run-and-wait");
  });

  it("parses timeout_sec", () => {
    expect(parseTimeoutSec(undefined)).toBe(DEFAULT_RUN_TIMEOUT_SEC);
    expect(parseTimeoutSec("")).toBe(DEFAULT_RUN_TIMEOUT_SEC);
    expect(parseTimeoutSec("  ")).toBe(DEFAULT_RUN_TIMEOUT_SEC);
    expect(parseTimeoutSec("90")).toBe(90);
    expect(parseTimeoutSec("3600")).toBe(3600);
    expect(parseTimeoutSec("99999")).toBe(3600);
    expect(() => parseTimeoutSec("0")).toThrow(/positive number/);
    expect(() => parseTimeoutSec("-1")).toThrow(/positive number/);
    expect(() => parseTimeoutSec("nope")).toThrow(/positive number/);
  });

  it("recognizes terminal run statuses from the API", () => {
    expect(isTerminalRunStatus("ok")).toBe(true);
    expect(isTerminalRunStatus("fail")).toBe(true);
    expect(isTerminalRunStatus("error")).toBe(true);
    expect(isTerminalRunStatus("queued")).toBe(false);
    expect(isTerminalRunStatus("running")).toBe(false);
  });

  it("rejects unknown operations", () => {
    expect(() => parseOperation("delete-all")).toThrow(/Unknown operation/);
  });

  it("parses JSON object input", () => {
    expect(parseJsonInput(undefined, "x")).toBeUndefined();
    expect(parseJsonInput("  ", "x")).toBeUndefined();
    expect(parseJsonInput('{"a":1}', "x")).toEqual({ a: 1 });
  });

  it("rejects non-object JSON", () => {
    expect(() => parseJsonInput("[1]", "body")).toThrow(/JSON object/);
    expect(() => parseJsonInput("not-json", "body")).toThrow(/JSON object/);
    expect(() => parseJsonInput('"str"', "body")).toThrow(/JSON object/);
  });
});

describe("PathlyError flags", () => {
  it("exposes status helpers", () => {
    expect(new PathlyError({ status: 401, path: "/", message: "x" }).unauthorized).toBe(true);
    expect(new PathlyError({ status: 403, path: "/", message: "x" }).forbidden).toBe(true);
    expect(new PathlyError({ status: 404, path: "/", message: "x" }).notFound).toBe(true);
    expect(new PathlyError({ status: 500, path: "/", message: "x" }).unauthorized).toBe(false);
  });
});

describe("ping", () => {
  it("returns planId on 200", async () => {
    const { client, calls } = clientWith([{ body: { planId: "pro", usage: {} } }]);
    await expect(client.ping()).resolves.toEqual({ ok: true, planId: "pro" });
    expect(calls[0].url).toBe("https://api.test.pathlyhq.com/v1/usage");
    expect(calls[0].init.headers).toMatchObject({
      authorization: "Bearer sp_test_token_value",
    });
  });

  it("treats 403 as success", async () => {
    const { client } = clientWith([{ status: 403, body: { error: "missing org:read" } }]);
    await expect(client.ping()).resolves.toEqual({ ok: true });
  });

  it("rethrows other errors", async () => {
    const { client } = clientWith([{ status: 401, body: { error: "bad token" } }]);
    await expect(client.ping()).rejects.toMatchObject({ status: 401, message: "bad token" });
  });
});

describe("scenarios", () => {
  it("lists with query string", async () => {
    const { client, calls } = clientWith([{ body: { items: [{ id: "1", name: "A" }], nextCursor: null } }]);
    const page = await client.listScenarios({ limit: 50, cursor: "c1" });
    expect(page.items).toHaveLength(1);
    expect(calls[0].url).toContain("limit=50");
    expect(calls[0].url).toContain("cursor=c1");
  });

  it("lists without query", async () => {
    const { client, calls } = clientWith([{ body: {} }]);
    const page = await client.listScenarios();
    expect(page.items).toEqual([]);
    expect(calls[0].url).toBe("https://api.test.pathlyhq.com/v1/scenarios");
  });

  it("creates scenario with Idempotency-Key", async () => {
    const { client, calls } = clientWith([{ status: 201, body: { id: "sc-1", name: "Home" } }]);
    const sc = await client.createScenario({ name: "Home", url: "https://example.com/" });
    expect(sc.id).toBe("sc-1");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBe("fixed-key");
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      type: "http",
      name: "Home",
      intervalSec: 300,
    });
  });

  it("ensureScenario returns existing", async () => {
    const { client } = clientWith([
      { body: { items: [{ id: "sc-9", name: "Checkout" }] } },
    ]);
    const result = await client.ensureScenario({
      name: "Checkout",
      url: "https://shop.example/cart",
    });
    expect(result.created).toBe(false);
    expect(result.scenario.id).toBe("sc-9");
  });

  it("ensureScenario creates when missing", async () => {
    const { client } = clientWith([
      { body: { items: [] } },
      { status: 201, body: { id: "sc-new", name: "Checkout" } },
    ]);
    const result = await client.ensureScenario({
      name: "Checkout",
      url: "https://shop.example/cart",
    });
    expect(result.created).toBe(true);
    expect(result.scenario.id).toBe("sc-new");
  });
});

describe("runs", () => {
  const scenarioId = "11111111-1111-4111-8111-111111111111";
  const runId = "22222222-2222-4222-8222-222222222222";

  it("runScenario posts without Idempotency-Key", async () => {
    const { client, calls } = clientWith([{ body: { ok: true, queued: true, jobId: "job-1" } }]);
    const queued = await client.runScenario(scenarioId);
    expect(queued.jobId).toBe("job-1");
    expect(calls[0].url).toBe(
      `https://api.test.pathlyhq.com/v1/scenarios/${scenarioId}/run`,
    );
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBeUndefined();
  });

  it("runScenario rejects an empty id", async () => {
    const { client } = clientWith([]);
    await expect(client.runScenario("  ")).rejects.toThrow(/scenario_id is required/);
  });

  it("getRun and listRuns", async () => {
    const { client, calls } = clientWith([
      { body: { id: runId, status: "ok", message: null } },
      { body: { items: [{ id: runId, status: "ok" }], nextCursor: null } },
      { body: {} },
    ]);
    await expect(client.getRun(runId)).resolves.toMatchObject({ id: runId, status: "ok" });
    const page = await client.listRuns({ scenarioId, limit: 20, cursor: "c1" });
    expect(page.items).toHaveLength(1);
    expect(calls[1].url).toContain("scenarioId=");
    expect(calls[1].url).toContain("limit=20");
    expect(calls[1].url).toContain("cursor=c1");
    const empty = await client.listRuns();
    expect(empty.items).toEqual([]);
    expect(calls[2].url).toBe("https://api.test.pathlyhq.com/v1/runs");
  });

  it("getRun rejects an empty id", async () => {
    const { client } = clientWith([]);
    await expect(client.getRun("")).rejects.toThrow(/run id is required/);
  });

  it("runAndWait returns when the new run is ok", async () => {
    const { client, calls } = clientWith([
      { body: { items: [{ id: "old-run", status: "ok" }] } },
      { body: { ok: true, queued: true, jobId: "job-1" } },
      { body: { items: [{ id: runId, status: "ok" }, { id: "old-run", status: "ok" }] } },
      { body: { id: runId, status: "ok", message: null } },
    ]);
    const run = await client.runAndWait(scenarioId, {
      timeoutSec: 5,
      pollIntervalMs: 1,
      sleep: async () => undefined,
    });
    expect(run.id).toBe(runId);
    expect(run.status).toBe("ok");
    expect(calls[1].url).toContain(`/v1/scenarios/${scenarioId}/run`);
    expect(calls[3].url).toContain(`/v1/runs/${runId}`);
  });

  it("runAndWait fails the action when status is fail", async () => {
    const { client } = clientWith([
      { body: { items: [] } },
      { body: { ok: true, queued: true, jobId: "job-1" } },
      { body: { items: [{ id: runId, status: "fail" }] } },
      { body: { id: runId, status: "fail", message: "HTTP 500" } },
    ]);
    await expect(
      client.runAndWait(scenarioId, { timeoutSec: 5, pollIntervalMs: 1, sleep: async () => undefined }),
    ).rejects.toThrow(/ended with status fail: HTTP 500/);
  });

  it("runAndWait fails when status is error without a message", async () => {
    const { client } = clientWith([
      { body: { items: [] } },
      { body: { ok: true, queued: true, jobId: "job-1" } },
      { body: { items: [{ id: runId }] } },
      { body: { id: runId, status: "error" } },
    ]);
    await expect(
      client.runAndWait(scenarioId, { timeoutSec: 5, pollIntervalMs: 1, sleep: async () => undefined }),
    ).rejects.toThrow(/ended with status error$/);
  });

  it("runAndWait keeps polling after 404 then succeeds", async () => {
    const { client } = clientWith([
      { body: { items: [] } },
      { body: { ok: true, queued: true, jobId: "job-1" } },
      { body: { items: [{ id: runId, status: "ok" }] } },
      { status: 404, body: { error: "Exécution introuvable" } },
      { body: { items: [{ id: runId, status: "ok" }] } },
      { body: { id: runId, status: "ok" } },
    ]);
    const run = await client.runAndWait(scenarioId, {
      timeoutSec: 5,
      pollIntervalMs: 1,
      sleep: async () => undefined,
    });
    expect(run.status).toBe("ok");
  });

  it("runAndWait rethrows non-404 API errors", async () => {
    const { client } = clientWith([
      { body: { items: [] } },
      { body: { ok: true, queued: true, jobId: "job-1" } },
      { status: 401, body: { error: "bad token" } },
    ]);
    await expect(
      client.runAndWait(scenarioId, { timeoutSec: 5, pollIntervalMs: 1, sleep: async () => undefined }),
    ).rejects.toMatchObject({ status: 401, message: "bad token" });
  });

  it("runAndWait times out if no new run appears", async () => {
    let t = 0;
    const { client } = clientWith([
      { body: { items: [] } },
      { body: { ok: true, queued: true, jobId: "job-1" } },
      { body: { items: [] } },
    ]);
    await expect(
      client.runAndWait(scenarioId, {
        timeoutSec: 2,
        pollIntervalMs: 1,
        now: () => t,
        sleep: async (ms) => {
          t += ms + 2_000;
        },
      }),
    ).rejects.toThrow(/did not finish within 2s/);
  });

  it("runAndWait includes the last 404 hint on timeout", async () => {
    let t = 0;
    const { client } = clientWith([
      { body: { items: [] } },
      { body: { ok: true, queued: true, jobId: "job-1" } },
      { body: { items: [{ id: runId }] } },
      { status: 404, body: { error: "Exécution introuvable" } },
    ]);
    await expect(
      client.runAndWait(scenarioId, {
        timeoutSec: 1,
        pollIntervalMs: 1,
        now: () => t,
        sleep: async (ms) => {
          t += ms + 2_000;
        },
      }),
    ).rejects.toThrow(/did not finish within 1s \(Exécution introuvable/);
  });

  it("runAndWait ignores prior items without a string id", async () => {
    const { client } = clientWith([
      { body: { items: [{ id: 12, status: "ok" }, { id: "", status: "ok" }] } },
      { body: { ok: true, queued: true, jobId: "job-1" } },
      { body: { items: [{ id: runId, status: "ok" }] } },
      { body: { id: runId, status: "ok" } },
    ]);
    await expect(
      client.runAndWait(scenarioId, { timeoutSec: 5, pollIntervalMs: 1, sleep: async () => undefined }),
    ).resolves.toMatchObject({ id: runId, status: "ok" });
  });

  it("runAndWait treats a non-string status as non-terminal then succeeds", async () => {
    const { client } = clientWith([
      { body: { items: [] } },
      { body: { ok: true, queued: true, jobId: "job-1" } },
      { body: { items: [{ id: runId }] } },
      { body: { id: runId, status: 1 } },
      { body: { items: [{ id: runId, status: "ok" }] } },
      { body: { id: runId, status: "ok" } },
    ]);
    await expect(
      client.runAndWait(scenarioId, { timeoutSec: 5, pollIntervalMs: 1, sleep: async () => undefined }),
    ).resolves.toMatchObject({ status: "ok" });
  });

  it("runAndWait breaks when the deadline is reached mid-loop", async () => {
    let t = 0;
    const { client } = clientWith([
      { body: { items: [] } },
      { body: { ok: true, queued: true, jobId: "job-1" } },
      { body: { items: [] } },
    ]);
    await expect(
      client.runAndWait(scenarioId, {
        timeoutSec: 1,
        pollIntervalMs: 1,
        now: () => {
          const current = t;
          t += 600;
          return current;
        },
        sleep: async () => {
          throw new Error("sleep should not run after deadline");
        },
      }),
    ).rejects.toThrow(/did not finish within 1s/);
  });

  it("runAndWait rejects a non-positive timeout", async () => {
    const { client } = clientWith([]);
    await expect(client.runAndWait(scenarioId, { timeoutSec: 0 })).rejects.toThrow(
      /positive number/,
    );
  });

  it("runAndWait uses client defaults when options are omitted", async () => {
    let n = 0;
    const fetchOnce = vi.fn(async (url: string | URL) => {
      const u = String(url);
      n += 1;
      if (u.includes("/scenarios/") && u.endsWith("/run")) {
        return new Response(JSON.stringify({ ok: true, queued: true, jobId: "j" }), { status: 200 });
      }
      if (u.includes(`/v1/runs/${runId}`)) {
        return new Response(JSON.stringify({ id: runId, status: "ok" }), { status: 200 });
      }
      return new Response(
        JSON.stringify(n === 1 ? { items: [] } : { items: [{ id: runId, status: "ok" }] }),
        { status: 200 },
      );
    });
    const client = new PathlyClient({
      token: "sp_x",
      apiUrl: "https://api.test.pathlyhq.com",
      fetch: fetchOnce as unknown as typeof fetch,
      sleep: async () => undefined,
    });
    await expect(client.runAndWait(scenarioId)).resolves.toMatchObject({ status: "ok" });
  });

  it("uses the default sleep when none is injected", async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const fetchOnce = vi.fn(async (url: string | URL) => {
        const u = String(url);
        n += 1;
        if (u.includes("/scenarios/") && u.endsWith("/run")) {
          return new Response(JSON.stringify({ ok: true, queued: true }), { status: 200 });
        }
        if (u.includes(`/v1/runs/${runId}`)) {
          return new Response(JSON.stringify({ id: runId, status: "ok" }), { status: 200 });
        }
        return new Response(
          JSON.stringify(n <= 3 ? { items: [] } : { items: [{ id: runId, status: "ok" }] }),
          { status: 200 },
        );
      });
      const client = new PathlyClient({
        token: "sp_x",
        apiUrl: "https://api.test.pathlyhq.com",
        fetch: fetchOnce as unknown as typeof fetch,
      });
      const pending = client.runAndWait(scenarioId, { timeoutSec: 5, pollIntervalMs: 10 });
      await vi.advanceTimersByTimeAsync(10);
      await expect(pending).resolves.toMatchObject({ status: "ok" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a non-terminal status and polls again", async () => {
    const { client } = clientWith([
      { body: { items: [] } },
      { body: { ok: true, queued: true, jobId: "job-1" } },
      { body: { items: [{ id: runId, status: "running" }] } },
      { body: { id: runId, status: "running" } },
      { body: { items: [{ id: runId, status: "ok" }] } },
      { body: { id: runId, status: "ok" } },
    ]);
    const run = await client.runAndWait(scenarioId, {
      timeoutSec: 5,
      pollIntervalMs: 1,
      sleep: async () => undefined,
    });
    expect(run.status).toBe("ok");
  });
});

describe("webhooks and sla", () => {
  it("creates webhook", async () => {
    const { client, calls } = clientWith([
      { status: 201, body: { id: "wh-1", secret: "sec" } },
    ]);
    const wh = await client.createWebhook({
      url: "https://hooks.example/pathly",
      events: ["run.failed"],
    });
    expect(wh.secret).toBe("sec");
    expect(calls[0].url).toContain("/v1/webhooks");
  });

  it("upserts sla target", async () => {
    const { client } = clientWith([{ body: { id: "sla-1", objectivePct: 99.9 } }]);
    const t = await client.upsertSla({ objectivePct: 99.9, windowDays: 30, name: "Checkout SLA" });
    expect(t.id).toBe("sla-1");
  });
});

describe("error body handling", () => {
  it("uses raw text when JSON has no error field", async () => {
    const { calls, fetchImpl } = fakeFetch([]);
    const fetchOnce = vi.fn(async () => new Response("plain fail", { status: 500 }));
    const client = new PathlyClient({
      token: "sp_x",
      apiUrl: "https://api.test.pathlyhq.com",
      fetch: fetchOnce as unknown as typeof fetch,
    });
    await expect(client.listScenarios()).rejects.toMatchObject({
      message: "plain fail",
      status: 500,
    });
    expect(calls).toHaveLength(0);
  });

  it("falls back to HTTP status when body empty", async () => {
    const fetchOnce = vi.fn(async () => new Response("", { status: 502 }));
    const client = new PathlyClient({
      token: "sp_x",
      apiUrl: "https://api.test.pathlyhq.com",
      fetch: fetchOnce as unknown as typeof fetch,
    });
    await expect(client.listScenarios()).rejects.toMatchObject({
      message: "HTTP 502",
      status: 502,
    });
  });

  it("returns empty object on empty success body", async () => {
    const fetchOnce = vi.fn(async () => new Response("", { status: 200 }));
    const client = new PathlyClient({
      token: "sp_x",
      apiUrl: "https://api.test.pathlyhq.com",
      fetch: fetchOnce as unknown as typeof fetch,
      idempotencyKey: () => "k",
    });
    // createWebhook path with empty body → {}
    const result = await client.createWebhook({ url: "https://h.example", events: ["run.failed"] });
    expect(result).toEqual({});
  });

  it("uses default fetch and userAgent when omitted", async () => {
    const fetchOnce = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const prev = globalThis.fetch;
    globalThis.fetch = fetchOnce as unknown as typeof fetch;
    try {
      const client = new PathlyClient({ token: "sp_x", apiUrl: "https://api.test.pathlyhq.com" });
      await client.listScenarios();
      expect(fetchOnce).toHaveBeenCalled();
      const headers = (fetchOnce.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers["user-agent"]).toBe("pathly-github-action/0.1.1");
    } finally {
      globalThis.fetch = prev;
    }
  });

  it("defaults apiUrl to production", async () => {
    const fetchOnce = vi.fn(async () => new Response(JSON.stringify({ planId: 42 }), { status: 200 }));
    const client = new PathlyClient({
      token: "sp_x",
      fetch: fetchOnce as unknown as typeof fetch,
    });
    const result = await client.ping();
    expect(result).toEqual({ ok: true, planId: undefined });
    expect(String(fetchOnce.mock.calls[0][0])).toBe("https://api.pathlyhq.com/v1/usage");
  });

  it("falls back when randomUUID throws", async () => {
    const fetchOnce = vi.fn(async () => new Response(JSON.stringify({ id: "1" }), { status: 201 }));
    const cryptoDesc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        randomUUID() {
          throw new Error("unavailable");
        },
      },
    });
    try {
      const client = new PathlyClient({
        token: "sp_x",
        apiUrl: "https://api.test.pathlyhq.com",
        fetch: fetchOnce as unknown as typeof fetch,
      });
      await client.createScenario({ name: "N", url: "https://e.com" });
      const headers = (fetchOnce.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers["idempotency-key"]).toMatch(/^gha-/);
      expect(headers["idempotency-key"]).not.toMatch(
        /^gha-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    } finally {
      if (cryptoDesc) Object.defineProperty(globalThis, "crypto", cryptoDesc);
    }
  });
});

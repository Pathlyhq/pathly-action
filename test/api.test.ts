import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_API_URL,
  PathlyClient,
  PathlyError,
  parseJsonInput,
  parseOperation,
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
      expect(headers["user-agent"]).toBe("pathly-github-action/0.1.0");
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

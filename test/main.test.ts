import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readInputsFromEnv, runAction } from "../src/main.js";

const TOKEN = "sp_test_token_value";

function jsonFetch(body: unknown) {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  ) as unknown as typeof fetch;
}

describe("action entry: log safety", () => {
  let written: string[];

  beforeEach(() => {
    written = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("GITHUB_OUTPUT", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("masks the token as soon as it is read", () => {
    vi.stubEnv("INPUT_API_TOKEN", ` ${TOKEN} `);
    const inputs = readInputsFromEnv();
    expect(inputs.apiToken).toBe(TOKEN);
    expect(written[0]).toBe(`::add-mask::${TOKEN}\n`);
  });

  it("warns when api_url is outside pathlyhq.com", async () => {
    await runAction(
      { apiToken: TOKEN, apiUrl: "https://api.example.com", operation: "ping" },
      jsonFetch({ planId: "pro" }),
    );
    expect(
      written.some(
        (l) => l.startsWith("::warning title=Pathly API URL::") && l.includes("api.example.com"),
      ),
    ).toBe(true);
  });

  it("does not warn for the default API URL", async () => {
    await runAction(
      { apiToken: TOKEN, apiUrl: "https://api.pathlyhq.com", operation: "ping" },
      jsonFetch({ planId: "pro" }),
    );
    expect(written.some((l) => l.startsWith("::warning"))).toBe(false);
  });

  it("masks the webhook signing secret before writing it as an output", async () => {
    await runAction(
      {
        apiToken: TOKEN,
        apiUrl: "https://api.pathlyhq.com",
        operation: "create-webhook",
        webhookJson: JSON.stringify({ url: "https://hooks.example.com/x", events: ["run.failed"] }),
      },
      jsonFetch({ id: "wh_1", secret: "whsec_value" }),
    );
    const maskAt = written.findIndex((l) => l === "::add-mask::whsec_value\n");
    const outputAt = written.findIndex((l) => l.startsWith("pathly-output webhook_secret="));
    expect(maskAt).toBeGreaterThanOrEqual(0);
    expect(outputAt).toBeGreaterThan(maskAt);
  });
});

describe("action entry: run-scenario outputs", () => {
  const scenarioId = "11111111-1111-4111-8111-111111111111";
  const runId = "22222222-2222-4222-8222-222222222222";
  let written: string[];

  /** Faux serveur : aucune exécution avant le déclenchement, puis celle de `run`. */
  function runFetch(run: Record<string, unknown> | null) {
    let triggered = false;
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      let body: unknown;
      if (init?.method === "POST") {
        triggered = true;
        body = { ok: true, queued: true, jobId: "job-1" };
      } else if (u.includes(`/v1/runs/${runId}`)) {
        body = run;
      } else {
        body = { items: triggered && run ? [{ id: runId }] : [] };
      }
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
  }

  function inputs(timeoutSec?: string) {
    return {
      apiToken: TOKEN,
      apiUrl: "https://api.pathlyhq.com",
      operation: "run-scenario",
      scenarioId,
      timeoutSec,
    };
  }

  const output = (name: string) =>
    written.find((l) => l.startsWith(`pathly-output ${name}=`))?.trim().split("=")[1];

  beforeEach(() => {
    written = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("GITHUB_OUTPUT", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("writes run_id, run_status and ok on an ok run", async () => {
    await runAction(inputs(), runFetch({ id: runId, status: "ok" }));
    expect(output("run_id")).toBe(runId);
    expect(output("run_status")).toBe("ok");
    expect(output("ok")).toBe("true");
  });

  it.each(["fail", "error"])("writes the outputs before failing on a %s run", async (status) => {
    await expect(
      runAction(inputs(), runFetch({ id: runId, status, message: "HTTP 500" })),
    ).rejects.toThrow(`Pathly run ${runId} ended with status ${status}: HTTP 500`);
    expect(output("run_id")).toBe(runId);
    expect(output("run_status")).toBe(status);
    expect(output("ok")).toBe("false");
  });

  it("writes run_id and ok=false when timeout_sec is reached after the run started", async () => {
    vi.useFakeTimers();
    const pending = runAction(inputs("1"), runFetch({ id: runId, status: "running" }));
    const assertion = expect(pending).rejects.toThrow(/did not finish within 1s/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(output("run_id")).toBe(runId);
    expect(output("run_status")).toBeUndefined();
    expect(output("ok")).toBe("false");
  });

  it("writes only ok=false when timeout_sec is reached before any run appears", async () => {
    vi.useFakeTimers();
    const pending = runAction(inputs("1"), runFetch(null));
    const assertion = expect(pending).rejects.toThrow(/did not finish within 1s/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(output("run_id")).toBeUndefined();
    expect(output("ok")).toBe("false");
  });

  it("writes no run output when the API refuses the trigger", async () => {
    const refused = vi.fn(
      async () => new Response(JSON.stringify({ error: "bad token" }), { status: 401 }),
    ) as unknown as typeof fetch;
    await expect(runAction(inputs(), refused)).rejects.toMatchObject({ status: 401 });
    expect(output("ok")).toBeUndefined();
  });
});

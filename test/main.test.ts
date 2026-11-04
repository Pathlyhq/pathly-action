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

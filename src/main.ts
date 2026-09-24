/**
 * GitHub Action entry: pathlyhq/setup-pathly
 * Reads INPUT_* from the Actions runtime and runs Pathly API operations.
 */

import { appendFileSync } from "node:fs";
import {
  PathlyClient,
  PathlyError,
  parseJsonInput,
  parseOperation,
  type ScenarioCreateBody,
  type SlaUpsertBody,
  type WebhookCreateBody,
} from "./api.js";

function getInput(name: string, required = false): string {
  const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const value = (process.env[key] ?? "").trim();
  if (required && !value) {
    throw new Error(`Input "${name}" is required`);
  }
  return value;
}

function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file) {
    if (!value.includes("\n") && !value.includes("%") && !value.includes("\r")) {
      appendFileSync(file, `${name}=${value}\n`);
      return;
    }
    const delim = `ghadelim_${Date.now()}`;
    appendFileSync(file, `${name}<<${delim}\n${value}\n${delim}\n`);
    return;
  }
  process.stdout.write(`pathly-output ${name}=${value.length > 200 ? `${value.slice(0, 200)}…` : value}\n`);
}

export type ActionInputs = {
  apiToken: string;
  apiUrl: string;
  operation: string;
  scenarioJson?: string;
  webhookJson?: string;
  slaJson?: string;
};

export function readInputsFromEnv(): ActionInputs {
  return {
    apiToken: getInput("api_token", true),
    apiUrl: getInput("api_url") || "https://api.pathlyhq.com",
    operation: getInput("operation") || "ping",
    scenarioJson: getInput("scenario_json") || undefined,
    webhookJson: getInput("webhook_json") || undefined,
    slaJson: getInput("sla_json") || undefined,
  };
}

export async function runAction(inputs: ActionInputs, fetchImpl?: typeof fetch): Promise<void> {
  const client = new PathlyClient({
    token: inputs.apiToken,
    apiUrl: inputs.apiUrl,
    fetch: fetchImpl,
  });
  const op = parseOperation(inputs.operation);

  if (op === "ping") {
    const result = await client.ping();
    setOutput("ok", "true");
    if (result.planId) setOutput("plan_id", result.planId);
    console.log("Pathly token verified.");
    return;
  }

  if (op === "list-scenarios") {
    const { items } = await client.listScenarios({ limit: 100 });
    setOutput("count", String(items.length));
    setOutput("scenarios_json", JSON.stringify(items));
    console.log(`Listed ${items.length} Pathly scenario(s).`);
    return;
  }

  if (op === "create-scenario" || op === "ensure-scenario") {
    const body = parseJsonInput(inputs.scenarioJson, "scenario_json") as ScenarioCreateBody | undefined;
    if (!body?.name || !body?.url) {
      throw new Error('scenario_json must include "name" and "url"');
    }
    if (op === "ensure-scenario") {
      const { scenario, created } = await client.ensureScenario(body);
      setOutput("scenario_id", String(scenario.id ?? ""));
      setOutput("created", created ? "true" : "false");
      console.log(
        created ? `Created scenario ${scenario.id}` : `Scenario already present ${scenario.id}`,
      );
      return;
    }
    const scenario = await client.createScenario(body);
    setOutput("scenario_id", String(scenario.id ?? ""));
    setOutput("created", "true");
    console.log(`Created scenario ${scenario.id}`);
    return;
  }

  if (op === "create-webhook") {
    const body = parseJsonInput(inputs.webhookJson, "webhook_json") as WebhookCreateBody | undefined;
    if (!body?.url || !Array.isArray(body.events) || body.events.length === 0) {
      throw new Error('webhook_json must include "url" and non-empty "events"');
    }
    const hook = await client.createWebhook(body);
    setOutput("webhook_id", String(hook.id ?? ""));
    if (typeof hook.secret === "string") {
      setOutput("webhook_secret", hook.secret);
    }
    console.log(`Created Pathly webhook ${hook.id}`);
    return;
  }

  if (op === "upsert-sla") {
    const body = parseJsonInput(inputs.slaJson, "sla_json") as SlaUpsertBody | undefined;
    if (body?.objectivePct === undefined || body?.windowDays === undefined) {
      throw new Error('sla_json must include "objectivePct" and "windowDays"');
    }
    const target = await client.upsertSla(body);
    setOutput("sla_id", String(target.id ?? ""));
    console.log(`Upserted SLA target ${target.id}`);
    return;
  }
}

export async function main(): Promise<void> {
  try {
    await runAction(readInputsFromEnv());
  } catch (e) {
    const msg =
      e instanceof PathlyError
        ? `${e.message} (HTTP ${e.status})`
        : e instanceof Error
          ? e.message
          : String(e);
    console.error(`Pathly action failed: ${msg}`);
    process.exitCode = 1;
  }
}

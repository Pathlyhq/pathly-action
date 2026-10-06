import {
  PathlyClient,
  PathlyError,
  parseJsonInput,
  parseOperation,
  parseTimeoutSec
} from "./chunk-GYRFWAK5.js";

// src/main.ts
import { appendFileSync } from "fs";
function getInput(name, required = false) {
  const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const value = (process.env[key] ?? "").trim();
  if (required && !value) {
    throw new Error(`Input "${name}" is required`);
  }
  return value;
}
function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) {
    if (!value.includes("\n") && !value.includes("%") && !value.includes("\r")) {
      appendFileSync(file, `${name}=${value}
`);
      return;
    }
    const delim = `ghadelim_${Date.now()}`;
    appendFileSync(file, `${name}<<${delim}
${value}
${delim}
`);
    return;
  }
  process.stdout.write(`pathly-output ${name}=${value.length > 200 ? `${value.slice(0, 200)}\u2026` : value}
`);
}
function readInputsFromEnv() {
  return {
    apiToken: getInput("api_token", true),
    apiUrl: getInput("api_url") || "https://api.pathlyhq.com",
    operation: getInput("operation") || "ping",
    scenarioJson: getInput("scenario_json") || void 0,
    webhookJson: getInput("webhook_json") || void 0,
    slaJson: getInput("sla_json") || void 0,
    scenarioId: getInput("scenario_id") || void 0,
    timeoutSec: getInput("timeout_sec") || void 0
  };
}
async function runAction(inputs, fetchImpl) {
  const client = new PathlyClient({
    token: inputs.apiToken,
    apiUrl: inputs.apiUrl,
    fetch: fetchImpl
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
    const body = parseJsonInput(inputs.scenarioJson, "scenario_json");
    if (!body?.name || !body?.url) {
      throw new Error('scenario_json must include "name" and "url"');
    }
    if (op === "ensure-scenario") {
      const { scenario: scenario2, created } = await client.ensureScenario(body);
      setOutput("scenario_id", String(scenario2.id ?? ""));
      setOutput("created", created ? "true" : "false");
      console.log(
        created ? `Created scenario ${scenario2.id}` : `Scenario already present ${scenario2.id}`
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
    const body = parseJsonInput(inputs.webhookJson, "webhook_json");
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
    const body = parseJsonInput(inputs.slaJson, "sla_json");
    if (body?.objectivePct === void 0 || body?.windowDays === void 0) {
      throw new Error('sla_json must include "objectivePct" and "windowDays"');
    }
    const target = await client.upsertSla(body);
    setOutput("sla_id", String(target.id ?? ""));
    console.log(`Upserted SLA target ${target.id}`);
    return;
  }
  if (op === "assert-scenario") {
    const scenarioId = (inputs.scenarioId ?? "").trim();
    if (!scenarioId) {
      throw new Error('Input "scenario_id" is required for assert-scenario');
    }
    const scenario = await client.getScenario(scenarioId);
    const status = typeof scenario.lastStatus === "string" ? scenario.lastStatus : typeof scenario.last_status === "string" ? scenario.last_status : "";
    setOutput("scenario_id", String(scenario.id ?? scenarioId));
    setOutput("run_status", status || "unknown");
    setOutput("ok", status === "ok" ? "true" : "false");
    console.log(
      `Pathly assert-scenario ${scenario.name ?? scenarioId}: lastStatus=${status || "null"}`
    );
    if (status !== "ok") {
      throw new Error(
        `Scenario ${scenarioId} lastStatus=${status || "null"} (expected ok)`
      );
    }
    return;
  }
  if (op === "run-scenario" || op === "run-and-wait") {
    const scenarioId = (inputs.scenarioId ?? "").trim();
    if (!scenarioId) {
      throw new Error('Input "scenario_id" is required for run-scenario');
    }
    const timeoutSec = parseTimeoutSec(inputs.timeoutSec);
    const run = await client.runAndWait(scenarioId, { timeoutSec });
    const status = typeof run.status === "string" ? run.status : "";
    setOutput("run_id", String(run.id ?? ""));
    setOutput("run_status", status);
    setOutput("ok", status === "ok" ? "true" : "false");
    console.log(`Pathly run ${run.id} finished with status ${status}.`);
    if (status !== "ok") {
      throw new Error(`Pathly run ${run.id} status=${status || "unknown"} (expected ok)`);
    }
  }
}
async function main() {
  try {
    await runAction(readInputsFromEnv());
  } catch (e) {
    const msg = e instanceof PathlyError ? `${e.message} (HTTP ${e.status})` : e instanceof Error ? e.message : String(e);
    console.error(`Pathly action failed: ${msg}`);
    process.exitCode = 1;
  }
}

// src/index.ts
void main();
//# sourceMappingURL=index.js.map
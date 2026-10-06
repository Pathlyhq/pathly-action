/**
 * Thin Pathly /v1 HTTP helper for GitHub Actions.
 * Auth: Bearer sp_… — never log the token.
 */
declare const DEFAULT_API_URL = "https://api.pathlyhq.com";
declare const VERSION = "0.1.1";
declare const DEFAULT_USER_AGENT = "pathly-github-action/0.1.1";
type FetchLike = typeof globalThis.fetch;
declare class PathlyError extends Error {
    readonly status: number;
    readonly path: string;
    readonly details: unknown;
    constructor(init: {
        status: number;
        path: string;
        message: string;
        details?: unknown;
    });
    get unauthorized(): boolean;
    get forbidden(): boolean;
    get notFound(): boolean;
}
type PathlyClientOptions = {
    token: string;
    apiUrl?: string;
    fetch?: FetchLike;
    userAgent?: string;
    idempotencyKey?: () => string;
    /** Attente entre deux sondes. Remplaçable en test. */
    sleep?: (ms: number) => Promise<void>;
};
/** Statuts terminaux d'une exécution Pathly (`runs.status`). */
declare const TERMINAL_RUN_STATUSES: readonly ["ok", "fail", "error"];
type TerminalRunStatus = (typeof TERMINAL_RUN_STATUSES)[number];
declare const DEFAULT_RUN_TIMEOUT_SEC = 120;
declare const DEFAULT_POLL_INTERVAL_MS = 2000;
type JsonObject = Record<string, unknown>;
type RunRecord = JsonObject & {
    id?: string;
    status?: string;
    message?: string;
};
type RunWaitOptions = {
    timeoutSec?: number;
    pollIntervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
};
declare function isTerminalRunStatus(status: string): status is TerminalRunStatus;
declare function parseTimeoutSec(raw: string | undefined, fallback?: number): number;
type ScenarioCreateBody = {
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
type WebhookCreateBody = {
    url: string;
    events: string[];
};
type SlaUpsertBody = {
    name?: string;
    monitorId?: string | null;
    objectivePct: number;
    windowDays: number;
    excludeMaintenance?: boolean;
    warnAtBudgetRatio?: number;
    enabled?: boolean;
};
declare class PathlyClient {
    private readonly token;
    private readonly baseUrl;
    private readonly doFetch;
    private readonly userAgent;
    private readonly makeKey;
    private readonly sleep;
    constructor(options: PathlyClientOptions);
    private request;
    /**
     * Verifies the token. GET /v1/usage — 403 means the token is valid but lacks org:read.
     */
    ping(): Promise<{
        ok: true;
        planId?: string;
    }>;
    listScenarios(query?: {
        limit?: number;
        cursor?: string;
    }): Promise<{
        items: JsonObject[];
        nextCursor?: string | null;
    }>;
    getScenario(scenarioId: string): Promise<JsonObject>;
    createScenario(body: ScenarioCreateBody): Promise<JsonObject>;
    /**
     * Ensure an HTTP scenario exists by name (list then create).
     */
    ensureScenario(body: ScenarioCreateBody): Promise<{
        scenario: JsonObject;
        created: boolean;
    }>;
    createWebhook(body: WebhookCreateBody): Promise<JsonObject>;
    upsertSla(body: SlaUpsertBody): Promise<JsonObject>;
    /**
     * Déclenche une exécution. Non idempotent : deux appels = deux runs.
     * Réponse : `{ ok, queued, jobId }`. Le `jobId` n'est pas l'id du run.
     */
    runScenario(scenarioId: string): Promise<JsonObject>;
    getRun(runId: string): Promise<RunRecord>;
    listRuns(query?: {
        scenarioId?: string;
        limit?: number;
        cursor?: string;
    }): Promise<{
        items: RunRecord[];
        nextCursor?: string | null;
    }>;
    /**
     * POST /run puis poll GET /v1/runs jusqu'à un statut terminal (`ok` / `fail` / `error`).
     * Lève si le run n'est pas `ok` ou si le délai expire — la CI passe au rouge.
     */
    runAndWait(scenarioId: string, options?: RunWaitOptions): Promise<RunRecord>;
}
type Operation = "ping" | "create-scenario" | "ensure-scenario" | "list-scenarios" | "create-webhook" | "upsert-sla" | "assert-scenario" | "run-scenario" | "run-and-wait";
declare function parseOperation(raw: string): Operation;
declare function parseJsonInput(raw: string | undefined, label: string): JsonObject | undefined;

export { DEFAULT_API_URL, DEFAULT_POLL_INTERVAL_MS, DEFAULT_RUN_TIMEOUT_SEC, DEFAULT_USER_AGENT, type FetchLike, type JsonObject, type Operation, PathlyClient, type PathlyClientOptions, PathlyError, type RunRecord, type RunWaitOptions, type ScenarioCreateBody, type SlaUpsertBody, TERMINAL_RUN_STATUSES, type TerminalRunStatus, VERSION, type WebhookCreateBody, isTerminalRunStatus, parseJsonInput, parseOperation, parseTimeoutSec };

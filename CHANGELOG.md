# Changelog

## 0.1.4 - 2026-10-12

- Runtime moved from Node.js 20 to Node.js 24 (`runs.using: node24`). GitHub deprecated Node.js 20 on Actions runners and showed a warning on every job. No input or behavior change.

## 0.1.3 — 2026-10-12

- `action.yml` description shortened under 125 characters so the Action can be listed on the GitHub Marketplace. No input or behavior change.

## 0.1.2 — 2026-10-06

- Operation `assert-scenario`: GET scenario and fail the job if `lastStatus` is not `ok` (no new run).
- `run-scenario` / `run-and-wait` now throw on non-ok so the GitHub job exits red reliably.

## 0.1.1 — 2026-09-26

- Operations `run-scenario` and `run-and-wait`: POST `/v1/scenarios/:id/run`, then poll until the run is `ok`, `fail` or `error`. The action fails if the run is not `ok`. Inputs: `scenario_id`, `timeout_sec` (default 120).
- `create-scenario` / `ensure-scenario` accept `httpChain` hops (Chain).

## 0.1.0 — 2026-09-23

- First release of `pathlyhq/setup-pathly` (JavaScript action, Node 20).
- Operations: `ping`, `create-scenario`, `ensure-scenario`, `list-scenarios`, `create-webhook`, `upsert-sla`.
- API helper uses native `fetch`, `Idempotency-Key` on writes, https-only remote base URL.
- Vitest coverage thresholds at 100% on `src/api.ts`.

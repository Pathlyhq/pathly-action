# Changelog

## 0.1.0 — 2026-09-23

- First release of `pathlyhq/setup-pathly` (JavaScript action, Node 20).
- Operations: `ping`, `create-scenario`, `ensure-scenario`, `list-scenarios`, `create-webhook`, `upsert-sla`.
- API helper uses native `fetch`, `Idempotency-Key` on writes, https-only remote base URL.
- Vitest coverage thresholds at 100% on `src/api.ts`.

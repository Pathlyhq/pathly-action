# Setup Pathly (GitHub Action)

**English** · [Français](README.fr.md) · [Español](README.es.md)


[![Powered by Pathly](https://img.shields.io/badge/Powered%20by-Pathly-0B5FFF?style=flat-square)](https://pathlyhq.com)
[![Website](https://img.shields.io/badge/Website-pathlyhq.com-111827?style=flat-square)](https://pathlyhq.com)
[![API docs](https://img.shields.io/badge/API-developers-2563eb?style=flat-square)](https://pathlyhq.com/en/developers)
[![Start free](https://img.shields.io/badge/Solo-start%20free-16a34a?style=flat-square)](https://pathlyhq.com/en/login?mode=signup)

> **Get started in one click.** Create a free account on [Pathly](https://pathlyhq.com) ([sign up](https://pathlyhq.com/en/login?mode=signup)), create an API key in the console, then export `PATHLY_API_TOKEN`. This project is the official bridge to [Pathly monitoring](https://pathlyhq.com) — real-browser and HTTP checks for checkout, login and availability, with data hosted in the EU. Full API reference: [pathlyhq.com/en/developers](https://pathlyhq.com/en/developers).

Marketplace-ready GitHub Action to wire [Pathly](https://pathlyhq.com) synthetic monitoring into your CI.

[Developers (EN)](https://pathlyhq.com/en/developers) · [Développeurs (FR)](https://pathlyhq.com/fr/developers) · [pathlyhq.com](https://pathlyhq.com)

> English is the default / canonical documentation language.

**Author:** Simon Raynaud / keyral · **Company:** [Pathly](https://pathlyhq.com)

## What it does

`pathlyhq/pathly-action` verifies your Pathly API token (`sp_…`) against `https://api.pathlyhq.com`, then optionally:

- creates or ensures an HTTP monitoring scenario
- lists scenarios
- creates a signed outbound webhook
- upserts an availability (SLA) target
- asserts the last status of a scenario, without starting a run
- runs a scenario and fails the job if the run is not `ok`

Use it as a deploy gate, a post-merge smoke, or to keep Pathly-as-code in sync with GitHub Actions.

Docs: [Pathly developers](https://pathlyhq.com/en/developers) · product: [Pathly monitoring](https://pathlyhq.com).

## Quick start

```yaml
- name: Verify Pathly API token
  uses: pathlyhq/pathly-action@v1
  with:
    api_token: ${{ secrets.PATHLY_API_TOKEN }}
    operation: ping
```

Ensure an HTTP scenario after deploy:

```yaml
- name: Ensure checkout check
  uses: pathlyhq/pathly-action@v1
  with:
    api_token: ${{ secrets.PATHLY_API_TOKEN }}
    operation: ensure-scenario
    scenario_json: |
      {
        "name": "Checkout",
        "url": "https://shop.example.com/cart",
        "intervalSec": 300,
        "severity": "major"
      }
```

Run a scenario after deploy (CI goes red if the run is `fail` or `error`):

```yaml
- name: Smoke checkout
  uses: pathlyhq/pathly-action@v1
  with:
    api_token: ${{ secrets.PATHLY_API_TOKEN }}
    operation: run-scenario
    scenario_id: ${{ vars.PATHLY_CHECKOUT_SCENARIO_ID }}
    timeout_sec: "120"
```

`run-and-wait` is an alias of `run-scenario`. The key needs scope `runs:trigger` (and `runs:read` to poll). Full example: [`examples/workflow.yml`](./examples/workflow.yml).

Assert the last status of a scenario after your test job (CI goes red if it is not `ok`):

```yaml
pathly:
  needs: test
  runs-on: ubuntu-latest
  steps:
    - name: Assert checkout is green
      uses: pathlyhq/pathly-action@v1
      with:
        api_token: ${{ secrets.PATHLY_API_TOKEN }}
        operation: assert-scenario
        scenario_id: ${{ vars.PATHLY_CHECKOUT_SCENARIO_ID }}
```

`assert-scenario` reads the scenario (`GET /v1/scenarios/{id}`) and fails the job when its last status is not `ok`. It starts no run, so it uses none of your plan's runs, and the key only needs scope `scenarios:read`. `run-scenario` starts a new run and waits for its result: use it after a deploy, when you need a result for the version you just shipped.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api_token` | yes | — | Pathly API token (`sp_…`). Store in GitHub Secrets. |
| `api_url` | no | `https://api.pathlyhq.com` | API base URL |
| `operation` | no | `ping` | `ping` \| `create-scenario` \| `ensure-scenario` \| `list-scenarios` \| `create-webhook` \| `upsert-sla` \| `assert-scenario` \| `run-scenario` \| `run-and-wait` |
| `scenario_json` | for scenario ops | — | JSON with at least `name` and `url` |
| `webhook_json` | for webhook | — | JSON with `url` and `events` |
| `sla_json` | for SLA | — | JSON with `objectivePct` and `windowDays` |
| `scenario_id` | for `assert-scenario`, `run-scenario`, `run-and-wait` | — | Scenario UUID to assert or to trigger |
| `timeout_sec` | no | `120` | Seconds to wait for a terminal run (`ok` / `fail` / `error`) |

## Outputs

| Output | When |
|--------|------|
| `ok`, `plan_id` | `ping` |
| `scenario_id`, `created` | scenario ops |
| `count`, `scenarios_json` | `list-scenarios` |
| `webhook_id`, `webhook_secret` | `create-webhook` (secret returned once) |
| `sla_id` | `upsert-sla` |
| `scenario_id`, `run_status`, `ok` | `assert-scenario` (`run_status` is the last status, `unknown` if the scenario never ran) |
| `run_id`, `run_status`, `ok` | `run-scenario` / `run-and-wait` |

## Security

- Never commit `sp_` tokens. Use `secrets.PATHLY_API_TOKEN`.
- Prefer least privilege scopes (`scenarios:read` for list/ping-ish checks, `scenarios:write` to create, `runs:trigger` + `runs:read` to run and poll, `alerting:write` for webhooks, `sla:write` for targets).
- `assert-scenario` only needs `scenarios:read`: it reads the scenario and starts no run.
- `ping` calls `GET /v1/usage`. HTTP `403` is treated as success (token valid, missing `org:read`).
- Creates send an `Idempotency-Key` header.
- The token is masked in the job logs as soon as it is read, even when it does not come from `secrets.*`. The `webhook_secret` output is masked too.
- The action writes a warning in the log when `api_url` points outside `pathlyhq.com` (except `localhost`), because the token is sent to that host.

## Versions

- `@v1` follows the latest release (0.x releases included). It only moves forward, when a release is published.
- `@vX.Y.Z` (for example `@v0.1.5`) never changes. New releases are published as GitHub [immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases): their tag cannot be moved or deleted. Releases published before this was turned on (v0.1.4 and earlier) are not locked by GitHub.
- For the strongest pin, use the commit SHA of a release: `uses: pathlyhq/pathly-action@<commit-sha> # vX.Y.Z`.
- Each release has notes generated from [CHANGELOG.md](./CHANGELOG.md). Check a release with `gh release verify vX.Y.Z -R pathlyhq/pathly-action`.
- `dist/` is the code the runner executes. CI rebuilds it from `src/` and fails if it differs from the committed files.

## Local development

```bash
npm ci
npm test    # vitest, 100% coverage on src/api.ts
npm run build
```


## Related packages

| Package | Role |
|---|---|
| [pathly-gitlab-ci](https://github.com/pathlyhq/pathly-gitlab-ci) | GitLab CI templates |
| [pathly-sdk-typescript](https://github.com/pathlyhq/pathly-sdk-typescript) | @pathly/sdk |
| [pathly-sdk-python](https://github.com/pathlyhq/pathly-sdk-python) | Python SDK |
| [pathly-postman](https://github.com/pathlyhq/pathly-postman) | Postman collection |
| [Pathly product](https://pathlyhq.com) | [Pathly monitoring](https://pathlyhq.com) |
## About Pathly

[Pathly](https://pathlyhq.com) is synthetic monitoring for agencies and e-commerce: replay the customer journey, catch broken checkouts before your clients call, and keep evidence (screenshot, step, runbook) ready for the invoice. Product: [pathlyhq.com](https://pathlyhq.com) · Developers: [pathlyhq.com/en/developers](https://pathlyhq.com/en/developers) · Status & pricing: [pathlyhq.com/en/pricing](https://pathlyhq.com/en/pricing).

## Author

Company: [Pathly](https://pathlyhq.com)  
Author: Simon Raynaud / keyral  

See [AUTHORS](./AUTHORS), [NOTICE](./NOTICE), [CHANGELOG](./CHANGELOG.md).

## License

Apache License 2.0 — see [LICENSE](./LICENSE).

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

`pathlyhq/setup-pathly` verifies your Pathly API token (`sp_…`) against `https://api.pathlyhq.com`, then optionally:

- creates or ensures an HTTP monitoring scenario
- lists scenarios
- creates a signed outbound webhook
- upserts an availability (SLA) target

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

Full example: [`examples/workflow.yml`](./examples/workflow.yml).

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api_token` | yes | — | Pathly API token (`sp_…`). Store in GitHub Secrets. |
| `api_url` | no | `https://api.pathlyhq.com` | API base URL |
| `operation` | no | `ping` | `ping` \| `create-scenario` \| `ensure-scenario` \| `list-scenarios` \| `create-webhook` \| `upsert-sla` |
| `scenario_json` | for scenario ops | — | JSON with at least `name` and `url` |
| `webhook_json` | for webhook | — | JSON with `url` and `events` |
| `sla_json` | for SLA | — | JSON with `objectivePct` and `windowDays` |

## Outputs

| Output | When |
|--------|------|
| `ok`, `plan_id` | `ping` |
| `scenario_id`, `created` | scenario ops |
| `count`, `scenarios_json` | `list-scenarios` |
| `webhook_id`, `webhook_secret` | `create-webhook` (secret returned once) |
| `sla_id` | `upsert-sla` |

## Security

- Never commit `sp_` tokens. Use `secrets.PATHLY_API_TOKEN`.
- Prefer least privilege scopes (`scenarios:read` for list/ping-ish checks, `scenarios:write` to create, `alerting:write` for webhooks, `sla:write` for targets).
- `ping` calls `GET /v1/usage`. HTTP `403` is treated as success (token valid, missing `org:read`).
- Creates send an `Idempotency-Key` header.

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
| [pathly-sdk-typescript](https://github.com/pathlyhq/pathly-sdk-typescript) | @pathlyhq/sdk |
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

# Setup Pathly (GitHub Action)

[English](README.md) · [Français](README.fr.md) · **Español**


[![Powered by Pathly](https://img.shields.io/badge/Powered%20by-Pathly-0B5FFF?style=flat-square)](https://pathlyhq.com)
[![Website](https://img.shields.io/badge/Website-pathlyhq.com-111827?style=flat-square)](https://pathlyhq.com)
[![API docs](https://img.shields.io/badge/API-developers-2563eb?style=flat-square)](https://pathlyhq.com/es/developers)
[![Start free](https://img.shields.io/badge/Solo-start%20free-16a34a?style=flat-square)](https://pathlyhq.com/es/login?mode=signup)

> **Empiece en un clic.** Cree una cuenta gratuita en [Pathly](https://pathlyhq.com) ([registro](https://pathlyhq.com/es/login?mode=signup)), genere una clave API en la consola y exporte `PATHLY_API_TOKEN`. Este repositorio es el puente oficial hacia [la monitorización Pathly](https://pathlyhq.com): comprobaciones HTTP y de navegador (carrito, login, disponibilidad), con datos en la UE. Referencia API: [pathlyhq.com/es/developers](https://pathlyhq.com/es/developers).

Action de GitHub lista para el Marketplace que conecta el monitoreo sintético de [Pathly](https://pathlyhq.com) a su CI.

**Autor:** Simon Raynaud / keyral · **Empresa:** [Pathly](https://pathlyhq.com)

> La versión en inglés ([`README.md`](README.md)) es la canónica.

## Qué hace

`pathlyhq/pathly-action` verifica su token de API Pathly (`sp_…`) contra `https://api.pathlyhq.com` y, opcionalmente:

- crea o asegura un escenario HTTP
- lista escenarios
- crea un webhook de salida firmado
- hace upsert de un objetivo de disponibilidad (SLA)
- comprueba el último estado de un escenario, sin lanzar ningún run
- ejecuta un escenario y falla el job si el run no es `ok`

Úselo como puerta de despliegue, smoke post-merge, o para mantener Pathly-as-code sincronizado con GitHub Actions.

Docs: [desarrolladores Pathly](https://pathlyhq.com/es/developers) · producto: [monitoreo Pathly](https://pathlyhq.com).

## Inicio rápido

```yaml
- name: Verify Pathly API token
  uses: pathlyhq/pathly-action@v1
  with:
    api_token: ${{ secrets.PATHLY_API_TOKEN }}
    operation: ping
```

Asegurar un escenario HTTP tras el despliegue:

```yaml
- name: Ensure checkout check
  uses: pathlyhq/pathly-action@v1
  with:
    api_token: ${{ secrets.PATHLY_API_TOKEN }}
    operation: ensure-scenario
    scenario_json: |
      {
        "name": "Checkout",
        "url": "https://tienda.ejemplo.com/carrito",
        "intervalSec": 300,
        "severity": "major"
      }
```

Comprobar el último estado de un escenario después del job de tests (la CI se pone en rojo si no es `ok`):

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

`assert-scenario` lee el escenario (`GET /v1/scenarios/{id}`) y falla el job si su último estado no es `ok`. No lanza ningún run: no consume ninguna ejecución de su plan, y la clave solo necesita el alcance `scenarios:read`. `run-scenario` lanza un run nuevo y espera su resultado: úselo después de un despliegue, cuando necesite un resultado sobre la versión que acaba de publicar. Su clave necesita los alcances `runs:trigger` y `runs:read`.

Ejemplo completo: [`examples/workflow.yml`](./examples/workflow.yml).

## Entradas

| Entrada | Obligatoria | Por defecto | Descripción |
|---------|-------------|-------------|-------------|
| `api_token` | sí | — | Token Pathly (`sp_…`). Guardarlo en GitHub Secrets. |
| `api_url` | no | `https://api.pathlyhq.com` | URL base de la API |
| `operation` | no | `ping` | `ping` \| `create-scenario` \| `ensure-scenario` \| `list-scenarios` \| `create-webhook` \| `upsert-sla` \| `assert-scenario` \| `run-scenario` \| `run-and-wait` |
| `scenario_json` | ops de escenario | — | JSON con al menos `name` y `url` |
| `webhook_json` | webhook | — | JSON con `url` y `events` |
| `sla_json` | SLA | — | JSON con `objectivePct` y `windowDays` |
| `scenario_id` | `assert-scenario`, `run-scenario`, `run-and-wait` | — | UUID del escenario a comprobar o a lanzar |
| `timeout_sec` | no | `120` | Espera de un estado terminal (`ok` / `fail` / `error`) |

## Salidas

| Salida | Cuándo |
|--------|--------|
| `ok`, `plan_id` | `ping` |
| `scenario_id`, `created` | ops de escenario |
| `count`, `scenarios_json` | `list-scenarios` |
| `webhook_id`, `webhook_secret` | `create-webhook` (secreto una sola vez) |
| `sla_id` | `upsert-sla` |
| `scenario_id`, `run_status`, `ok` | `assert-scenario` (`run_status` es el último estado, `unknown` si el escenario nunca se ejecutó) |
| `run_id`, `run_status`, `ok` | `run-scenario` / `run-and-wait`. Se escriben antes de que falle el job: con un run `fail` o `error`, un paso posterior con `if: failure()` puede leerlas. Si se agota el tiempo, `ok` vale `false` y `run_id` se escribe si el run había empezado |

## Seguridad

- Nunca haga commit de tokens `sp_`. Use `secrets.PATHLY_API_TOKEN`.
- Preferir menor privilegio (`scenarios:read`, `scenarios:write`, `runs:trigger` + `runs:read`, `alerting:write`, `sla:write`).
- `assert-scenario` solo necesita el alcance `scenarios:read`: lee el escenario y no lanza ningún run.
- `ping` llama `GET /v1/usage`. HTTP `403` se trata como éxito (token válido, falta `org:read`).
- Las creaciones envían un encabezado `Idempotency-Key`.
- El token se oculta en los registros del job en cuanto se lee, aunque no venga de `secrets.*`. La salida `webhook_secret` también se oculta.
- La acción escribe un aviso en el registro cuando `api_url` apunta fuera de `pathlyhq.com` (salvo `localhost`), porque el token se envía a ese host.

## Versiones

- `@v1` sigue la última versión publicada (incluidas las 0.x). Solo avanza cuando se publica una versión.
- `@vX.Y.Z` (por ejemplo `@v0.1.5`) no cambia nunca. Las nuevas versiones se publican como [versiones inmutables](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) de GitHub: su tag no se puede mover ni borrar. Las versiones publicadas antes de activar este ajuste (v0.1.4 y anteriores) no están bloqueadas por GitHub.
- Para el anclaje más seguro, use el SHA del commit de una versión: `uses: pathlyhq/pathly-action@<sha-del-commit> # vX.Y.Z`.
- Cada versión tiene sus notas, generadas desde [CHANGELOG.md](./CHANGELOG.md). Verifique una versión con `gh release verify vX.Y.Z -R pathlyhq/pathly-action`.
- `dist/` es el código que ejecuta el runner. La CI lo reconstruye desde `src/` y falla si difiere de los archivos versionados.

## Desarrollo local

```bash
npm ci
npm test    # vitest, 100% cobertura en src/api.ts
npm run build
```


## Paquetes relacionados

| Package | Role |
|---|---|
| [pathly-gitlab-ci](https://github.com/pathlyhq/pathly-gitlab-ci) | GitLab CI templates |
| [pathly-sdk-typescript](https://github.com/pathlyhq/pathly-sdk-typescript) | @pathly/sdk |
| [pathly-sdk-python](https://github.com/pathlyhq/pathly-sdk-python) | Python SDK |
| [pathly-postman](https://github.com/pathlyhq/pathly-postman) | Postman collection |
| [Pathly product](https://pathlyhq.com) | [Pathly monitoring](https://pathlyhq.com) |
## Acerca de Pathly

[Pathly](https://pathlyhq.com) es monitorización sintética para agencias y e-commerce: reproduce el recorrido del cliente, detecta un checkout roto antes de la llamada, y deja la prueba (captura, paso, runbook) lista para la factura. Producto: [pathlyhq.com](https://pathlyhq.com) · Desarrolladores: [pathlyhq.com/es/developers](https://pathlyhq.com/es/developers) · Precios: [pathlyhq.com/es/pricing](https://pathlyhq.com/es/pricing).

## Autor

Empresa: [Pathly](https://pathlyhq.com)  
Autor: Simon Raynaud / keyral  

Ver [AUTHORS](./AUTHORS), [NOTICE](./NOTICE), [CHANGELOG](./CHANGELOG.md).

## Licencia

Apache License 2.0 — ver [LICENSE](./LICENSE).

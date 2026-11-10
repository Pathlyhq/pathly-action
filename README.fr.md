# Setup Pathly (GitHub Action)

[English](README.md) · **Français** · [Español](README.es.md)


[![Powered by Pathly](https://img.shields.io/badge/Powered%20by-Pathly-0B5FFF?style=flat-square)](https://pathlyhq.com)
[![Website](https://img.shields.io/badge/Website-pathlyhq.com-111827?style=flat-square)](https://pathlyhq.com)
[![API docs](https://img.shields.io/badge/API-developers-2563eb?style=flat-square)](https://pathlyhq.com/fr/developers)
[![Start free](https://img.shields.io/badge/Solo-start%20free-16a34a?style=flat-square)](https://pathlyhq.com/fr/login?mode=signup)

> **Démarrage en un clic.** Créez un compte gratuit sur [Pathly](https://pathlyhq.com) ([inscription](https://pathlyhq.com/fr/login?mode=signup)), générez une clé API dans la console, puis exportez `PATHLY_API_TOKEN`. Ce dépôt est le pont officiel vers [la surveillance Pathly](https://pathlyhq.com) — contrôles HTTP et parcours navigateur (panier, connexion, disponibilité), données hébergées dans l’UE. Référence API : [pathlyhq.com/fr/developers](https://pathlyhq.com/fr/developers).

Action GitHub prête marketplace pour brancher le monitoring synthétique [Pathly](https://pathlyhq.com) dans votre CI.

[Développeurs (FR)](https://pathlyhq.com/fr/developers) · [Developers (EN)](https://pathlyhq.com/en/developers) · [pathlyhq.com](https://pathlyhq.com)

> La version anglaise ([`README.md`](README.md)) fait référence.

**Auteur :** Simon Raynaud / keyral · **Société :** [Pathly](https://pathlyhq.com)

## Rôle

`pathlyhq/pathly-action` vérifie votre jeton d’API Pathly (`sp_…`) contre `https://api.pathlyhq.com`, puis peut :

- créer ou garantir un scénario HTTP
- lister les scénarios
- créer un webhook sortant signé
- upsert un objectif de disponibilité (SLA)
- vérifier le dernier statut d’un scénario, sans lancer de run
- lancer un scénario et faire échouer le job si le run n’est pas `ok`

Utile en porte de déploiement, smoke post-merge, ou Pathly-as-code depuis Actions.

Docs : [développeurs Pathly](https://pathlyhq.com/fr/developers) · produit : [monitoring Pathly](https://pathlyhq.com).

## Démarrage rapide

```yaml
- name: Vérifier le jeton Pathly
  uses: pathlyhq/pathly-action@v1
  with:
    api_token: ${{ secrets.PATHLY_API_TOKEN }}
    operation: ping
```

Garantir un scénario HTTP après déploiement :

```yaml
- name: Garantir le contrôle panier
  uses: pathlyhq/pathly-action@v1
  with:
    api_token: ${{ secrets.PATHLY_API_TOKEN }}
    operation: ensure-scenario
    scenario_json: |
      {
        "name": "Checkout",
        "url": "https://boutique.exemple.fr/panier",
        "intervalSec": 300,
        "severity": "major"
      }
```

Vérifier le dernier statut d’un scénario après le job de tests (la CI passe au rouge s’il n’est pas `ok`) :

```yaml
pathly:
  needs: test
  runs-on: ubuntu-latest
  steps:
    - name: Vérifier que le panier est vert
      uses: pathlyhq/pathly-action@v1
      with:
        api_token: ${{ secrets.PATHLY_API_TOKEN }}
        operation: assert-scenario
        scenario_id: ${{ vars.PATHLY_CHECKOUT_SCENARIO_ID }}
```

`assert-scenario` lit le scénario (`GET /v1/scenarios/{id}`) et fait échouer le job si son dernier statut n’est pas `ok`. Il ne lance aucun run. Il ne consomme donc aucune exécution de votre offre, et la clé n’a besoin que de la portée `scenarios:read`. `run-scenario` lance un nouveau run et attend son résultat. Utilisez-le après un déploiement, quand il vous faut un résultat sur la version que vous venez de livrer. Sa clé demande les portées `runs:trigger` et `runs:read`.

Exemple complet : [`examples/workflow.yml`](./examples/workflow.yml).

## Entrées

| Entrée | Obligatoire | Défaut | Description |
|--------|-------------|--------|-------------|
| `api_token` | oui | — | Jeton Pathly (`sp_…`). À stocker dans les Secrets GitHub. |
| `api_url` | non | `https://api.pathlyhq.com` | Base de l’API |
| `operation` | non | `ping` | `ping` \| `create-scenario` \| `ensure-scenario` \| `list-scenarios` \| `create-webhook` \| `upsert-sla` \| `assert-scenario` \| `run-scenario` \| `run-and-wait` |
| `scenario_json` | scénarios | — | JSON avec au moins `name` et `url` |
| `webhook_json` | webhook | — | JSON avec `url` et `events` |
| `sla_json` | SLA | — | JSON avec `objectivePct` et `windowDays` |
| `scenario_id` | `assert-scenario`, `run-scenario`, `run-and-wait` | — | UUID du scénario à vérifier ou à lancer |
| `timeout_sec` | non | `120` | Délai d’attente d’un statut terminal (`ok` / `fail` / `error`) |

## Sorties

| Sortie | Quand |
|--------|-------|
| `ok`, `plan_id` | `ping` |
| `scenario_id`, `created` | opérations scénario |
| `count`, `scenarios_json` | `list-scenarios` |
| `webhook_id`, `webhook_secret` | `create-webhook` (secret une seule fois) |
| `sla_id` | `upsert-sla` |
| `scenario_id`, `run_status`, `ok` | `assert-scenario` (`run_status` est le dernier statut, `unknown` si le scénario n’a jamais tourné) |
| `run_id`, `run_status`, `ok` | `run-scenario` / `run-and-wait`. Écrites avant l’échec du job : sur un run `fail` ou `error`, une étape suivante en `if: failure()` peut les lire. Sur un délai dépassé, `ok` vaut `false` et `run_id` est écrit si le run avait démarré |

## Sécurité

- Ne jamais committer de jetons `sp_`. Utiliser `secrets.PATHLY_API_TOKEN`.
- Moindre privilège : `scenarios:read`, `scenarios:write`, `runs:trigger` + `runs:read`, `alerting:write`, `sla:write` selon le besoin.
- `assert-scenario` ne demande que la portée `scenarios:read`. Il lit le scénario et ne lance aucun run.
- `ping` appelle `GET /v1/usage`. Un HTTP `403` est un succès (jeton valide, portée `org:read` absente).
- Les créations portent un en-tête `Idempotency-Key`.
- Le jeton est masqué dans les journaux du job dès sa lecture, même s'il ne vient pas de `secrets.*`. La sortie `webhook_secret` est masquée aussi.
- L'action écrit un avertissement dans le journal quand `api_url` pointe hors de `pathlyhq.com` (sauf `localhost`), car le jeton part vers cet hôte.

## Versions

- `@v1` suit la dernière version publiée (versions 0.x comprises). Il n'avance qu'à la publication d'une version.
- `@vX.Y.Z` (par exemple `@v0.1.5`) ne change jamais. Les nouvelles versions sont publiées en [versions immuables](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) GitHub : leur tag ne peut être ni déplacé ni supprimé. Les versions publiées avant ce réglage (v0.1.4 et antérieures) ne sont pas verrouillées par GitHub.
- Pour l'épinglage le plus sûr, utilisez le SHA du commit d'une version : `uses: pathlyhq/pathly-action@<sha-du-commit> # vX.Y.Z`.
- Chaque version a ses notes, tirées de [CHANGELOG.md](./CHANGELOG.md). Vérifiez une version avec `gh release verify vX.Y.Z -R pathlyhq/pathly-action`.
- `dist/` est le code exécuté par le runner. La CI le reconstruit depuis `src/` et échoue s'il diffère des fichiers versionnés.

## Développement local

```bash
npm ci
npm test    # vitest, couverture 100 % sur src/api.ts
npm run build
```


## Packages associés

| Package | Role |
|---|---|
| [pathly-gitlab-ci](https://github.com/pathlyhq/pathly-gitlab-ci) | GitLab CI templates |
| [pathly-sdk-typescript](https://github.com/pathlyhq/pathly-sdk-typescript) | @pathly/sdk |
| [pathly-sdk-python](https://github.com/pathlyhq/pathly-sdk-python) | Python SDK |
| [pathly-postman](https://github.com/pathlyhq/pathly-postman) | Postman collection |
| [Pathly product](https://pathlyhq.com) | [Pathly monitoring](https://pathlyhq.com) |
## À propos de Pathly

[Pathly](https://pathlyhq.com) surveille les parcours clients des agences et e-commerçants : rejoue le tunnel, détecte un checkout cassé avant l’appel du client, et joint la preuve (capture, étape, consigne) à la facture de maintenance. Produit : [pathlyhq.com](https://pathlyhq.com) · Développeurs : [pathlyhq.com/fr/developers](https://pathlyhq.com/fr/developers) · Tarifs : [pathlyhq.com/fr/pricing](https://pathlyhq.com/fr/pricing).

## Auteur

Société : [Pathly](https://pathlyhq.com)  
Auteur : Simon Raynaud / keyral  

Voir [AUTHORS](./AUTHORS), [NOTICE](./NOTICE), [CHANGELOG](./CHANGELOG.md).

## Licence

Apache License 2.0 — voir [LICENSE](./LICENSE).

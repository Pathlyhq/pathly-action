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

`pathlyhq/setup-pathly` vérifie votre jeton d’API Pathly (`sp_…`) contre `https://api.pathlyhq.com`, puis peut :

- créer ou garantir un scénario HTTP
- lister les scénarios
- créer un webhook sortant signé
- upsert un objectif de disponibilité (SLA)

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

Exemple complet : [`examples/workflow.yml`](./examples/workflow.yml).

## Entrées

| Entrée | Obligatoire | Défaut | Description |
|--------|-------------|--------|-------------|
| `api_token` | oui | — | Jeton Pathly (`sp_…`). À stocker dans les Secrets GitHub. |
| `api_url` | non | `https://api.pathlyhq.com` | Base de l’API |
| `operation` | non | `ping` | `ping` \| `create-scenario` \| `ensure-scenario` \| `list-scenarios` \| `create-webhook` \| `upsert-sla` |
| `scenario_json` | scénarios | — | JSON avec au moins `name` et `url` |
| `webhook_json` | webhook | — | JSON avec `url` et `events` |
| `sla_json` | SLA | — | JSON avec `objectivePct` et `windowDays` |

## Sorties

| Sortie | Quand |
|--------|-------|
| `ok`, `plan_id` | `ping` |
| `scenario_id`, `created` | opérations scénario |
| `count`, `scenarios_json` | `list-scenarios` |
| `webhook_id`, `webhook_secret` | `create-webhook` (secret une seule fois) |
| `sla_id` | `upsert-sla` |

## Sécurité

- Ne jamais committer de jetons `sp_`. Utiliser `secrets.PATHLY_API_TOKEN`.
- Moindre privilège : `scenarios:read`, `scenarios:write`, `alerting:write`, `sla:write` selon le besoin.
- `ping` appelle `GET /v1/usage`. Un HTTP `403` est un succès (jeton valide, portée `org:read` absente).
- Les créations portent un en-tête `Idempotency-Key`.

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
| [pathly-sdk-typescript](https://github.com/pathlyhq/pathly-sdk-typescript) | @pathlyhq/sdk |
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

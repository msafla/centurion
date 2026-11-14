# CENTURION

[![check](https://github.com/msafla/centurion/actions/workflows/check.yml/badge.svg)](https://github.com/msafla/centurion/actions/workflows/check.yml)

CENTURION is a local-first, single-user app for tracking an annual cyber/IT
control plan: audited completions, evidence uploads, multi-year trends,
CSV/PDF exports, backups and restore, plus a read-only-by-default MCP stdio
server. Built with TypeScript, Fastify, SQLite and React/Vite. Runs on Linux
via a hardened Docker image.

Documentation is in French.

Application locale mono-utilisateur de suivi d'un plan annuel de contrôles cyber
et IT : occurrences récurrentes, réalisations auditées, import CSV/XLSX revu,
reporting, tendances multi-années, mapping manuel de clauses, justificatifs
uploadés, sauvegardes/restauration et un adaptateur MCP stdio à capacités
limitées.

CENTURION est un projet indépendant. Ses exemples ISO 27001 et ISAE 3402 servent
à illustrer le suivi et la traçabilité ; ils ne constituent ni une évaluation de
conformité ni une opinion d'assurance.

> **[Notice d'utilisation illustrée](docs/NOTICE.md)** — installation, tour des
> écrans avec captures, workflows du quotidien et connexion MCP. Version page
> web autonome : [docs/notice.html](docs/notice.html).

## Captures d'écran

Captures réelles sur le jeu de démonstration (plan 2028) — régénérables via `npm run capture` :

![Synthèse](docs/screenshots/synthese.png)
![Plan annuel](docs/screenshots/plan-annuel.png)
![Tendances](docs/screenshots/tendances.png)

## Plateforme supportée

**Linux, via Docker** (image distroless, non-root, système de fichiers en
lecture seule). Windows et macOS ne sont pas supportés nativement.

Aucun accès réseau n'est requis au runtime ; aucune télémétrie, aucun CDN.

## Installation et lancement

```bash
docker compose up -d --build
```

Ouvrez <http://127.0.0.1:4317> dans votre navigateur. Le port 4317 n'est publié
que sur `127.0.0.1` de l'hôte.

### Développement (contributeurs, Linux, Node 24)

Prérequis : Node.js 24 LTS (`>=24 <25`) et npm 11.

```bash
npm ci
npm run dev          # backend + Vite sur 5173, données privées ordinaires
npm run dev:demo     # démo reproductible (dataDir data/demo, horloge fixe 2028-04-15, plan 2028)
npm run demo:reset -- --confirm   # remet la démo à l'état déterministe
npm run build
npm run start        # UI compilée + API sur http://127.0.0.1:4317
```

`demo:reset` refuse toute cible hors de `data/demo` et toute instance active.

### Durcissement du conteneur

- Image `gcr.io/distroless/nodejs24-debian12:nonroot` : pas de shell, pas de
  gestionnaire de paquets ; exécution sous l'UID 65532 (non-root).
- Système de fichiers racine en lecture seule (`read_only: true`) avec
  `tmpfs /tmp` ; `cap_drop: [ALL]` ; `no-new-privileges:true` ;
  `pids_limit: 128` ; `mem_limit: 512m`.
- Port publié uniquement sur `127.0.0.1:4317:4317`.
- `HEALTHCHECK` en Node (forme exec, sans shell) sur `GET /health`.
- Scan Trivy (sévérité CRITICAL) de l'image dans la CI GitHub.

## Stockage, sauvegardes, restauration

Dans Docker, le `dataDir` est le volume nommé `centurion-data` monté sur
`/data` (`CENTURION_DATA_DIR=/data` dans l'image). Hors Docker
(développement), c'est `CENTURION_DATA_DIR` ou `~/.local/share/centurion` sous
Linux. Un seul processus possède SQLite et
les fichiers d'instance ; un verrou exclusif empêche une seconde instance.

- Sauvegardes cohérentes (`better-sqlite3.backup()`), catalogue externe durable,
  rétention 20 automatiques + tous les manuels.
- Restauration journalisée et récupérable après arrêt, avec aperçu 15 min,
  `pre_restore` conservé et nouvel `engine_epoch`.
- Imports/artefacts temporaires nettoyés au démarrage et périodiquement.

## MCP

Voir [`docs/MCP.md`](docs/MCP.md). En résumé : `docker compose up -d --build`
puis `docker exec -i centurion /nodejs/bin/node dist/mcp/server.js`.
Lecture seule par défaut (dix outils) ; les écritures sont désactivées sauf
double flag (`CENTURION_MCP_WRITE=1` backend **et** adaptateur) et ne modifient
rien avant une approbation explicite dans l'UI CENTURION.

## MCP — connexion agnostique (tout hôte stdio)

CENTURION expose un serveur MCP via `stdio`, indépendamment de l’hôte. Les
exemples Claude Code/Codex/Claude Desktop dans `docs/MCP.md` sont des
illustrations ; le protocole et les variables d’environnement sont les mêmes
pour tout harness compatible MCP.

1. Démarrer le backend propriétaire dans Docker :

```bash
docker compose up -d --build
```

2. Configurer l’hôte MCP pour lancer l’adaptateur dans le conteneur en stdio :

```bash
docker exec -i centurion /nodejs/bin/node dist/mcp/server.js
```

3. Configuration générique `.mcp.json` (OpenCode, Codex, VS Code, etc.) :

```json
{
  "mcpServers": {
    "centurion": {
      "type": "stdio",
      "command": "docker",
      "args": ["exec", "-i", "centurion", "/nodejs/bin/node", "dist/mcp/server.js"]
    }
  }
}
```

En mode développement (hors Docker, Linux + Node 24), le lanceur
`scripts/mcp-stdio.sh` reste disponible :

```bash
env CENTURION_DATA_DIR="$PWD/data/demo" "$PWD/scripts/mcp-stdio.sh"
```

4. Vérifier que l’hôte liste les outils disponibles. En lecture seule par
défaut : `list_plans`, `get_plan`, `list_controls`, `get_control`,
`list_occurrences`, `get_summary`, `get_trends`, `list_clauses`, `export_controls_csv`, `generate_report_pdf`.
Les écritures ne s’activent que via Paramètres → Permissions MCP.

Voir [`docs/MCP.md`](docs/MCP.md) pour les détails Claude Desktop, Codex,
limites, jeton runtime et frontière de confiance.

## Qualité

```bash
npm run check          # typecheck + lint + tests unitaires/intégration/sécurité/MCP
npm run test:e2e       # Playwright Chromium contre un build de production
npm run audit:deps     # npm audit --omit=dev --audit-level=high (réseau requis)
```

## Limites et hors périmètre

- Mono-utilisateur, sans compte ni SSO ; le MVP protège les requêtes du
  navigateur, pas les autres processus du même poste.
- Aucune notion automatique de retard/SLA, aucun chiffrement applicatif, aucune
  inviolabilité de l'audit. Les justificatifs sont bornés et typés, mais ne
  sont pas scannés par antivirus.
- MCP stdio uniquement (pas de transport réseau) ; les données renvoyées à un
  host IA peuvent être transmises par ce host à son fournisseur.
- Voir `docs/process/EXECUTION.md` pour l'état exact, les preuves et les sous-points
  restant à couvrir.

## Licence

Code MIT (`LICENSE`). Police Poppins sous SIL Open Font License 1.1
(`licences/Poppins-OFL.txt`).

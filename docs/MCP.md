# CENTURION — adaptateur MCP (stdio)

Le transport vers le client IA est **stdio**. Aucun serveur MCP HTTP/SSE n'est
exposé. L'adaptateur ne possède **aucune** connexion SQLite : il transmet des
opérations bornées au processus propriétaire par un appel REST local authentifié.

## Lancement

1. Démarrer le backend propriétaire : `docker compose up -d --build` (conteneur
   `centurion`, écoute sur `http://127.0.0.1:4317` publié sur l'hôte). Il écrit
   `runtime/mcp-token` (privé) et `runtime/backend.json` (`origin`, `epoch`,
   `policy`) dans le volume `/data`.
2. Lancer l'adaptateur : `docker exec -i centurion /nodejs/bin/node dist/mcp/server.js`
   (Node `dist/mcp/server.js`, stdio). L'adaptateur lit ces fichiers ; il
   n'accepte jamais une URL fournie par un outil.

En développement (hors Docker, Linux + Node 24) : `npm run start` puis
`npm run mcp` (ou `scripts/mcp-stdio.sh`, voir ci-dessous).

Le backend doit tourner **avant** que l'hôte MCP n'appelle un outil, et sur le
**même `dataDir`** que l'adaptateur (sinon `backend_unavailable`).

SDK : `@modelcontextprotocol/server@2.3.0` (`serveStdio`), protocole
`2026-07-28` ; les clients legacy sont pris en charge par le shim du SDK.
`stdout` est réservé au protocole, les logs vont sur `stderr`.

## Outils en lecture seule (défaut)

Exactement dix outils, sans mutation métier :

| Outil | Arguments | Route API sous-jacente |
| --- | --- | --- |
| `list_plans` | `{page?,page_size?}` | `GET /api/plans` |
| `get_plan` | `{plan_id}` | `GET /api/plans/:id` |
| `list_controls` | `{plan_id,filters?,page?,page_size?}` | `GET /api/plans/:id/controls` |
| `get_control` | `{plan_id,control_id}` | `GET /api/plans/:id/controls/:controlId` |
| `list_occurrences` | `{plan_id,filters?,page?,page_size?}` | `GET /api/plans/:id/occurrences` |
| `get_summary` | `{plan_id,filters?}` | `GET /api/plans/:id/summary` |
| `get_trends` | `{filters?}` | `GET /api/trends` |
| `list_clauses` | `{referential?}` | `GET /api/clauses` |
| `export_controls_csv` | `{plan_id,filters?}` | artefact CSV borné |
| `generate_report_pdf` | `{plan_id,filters?}` | artefact PDF borné |

Les deux exports écrivent un fichier borné sous `dataDir/exports` et renvoient
`{export_id, filename, mime_type, size_bytes, expires_at}` (TTL 24 h, quotas
20 artefacts / 128 MiB). Ils ne sont pas marqués `readOnlyHint=true`. Un UUID
connu est récupérable par `GET /exports/:exportId/download` depuis l'UI.

Les listes renvoient des **résumés** (`id`, `code`, `title`, `referentials`,
`automated`, `status` ; `fait`/`conformite` pour les occurrences). Les longs
textes ne sont obtenus que par `get_control`. Résultat JSON plafonné à 512 KiB.

Chaque résultat porte `{status:'ok', data_origin:'centurion_data',
trust:'untrusted_data', data, sanitized_fields?}`. La projection retire C0/C1/DEL,
la catégorie Unicode Cf, les variation selectors et les tags, et remplace LF/CR/TAB
par des espaces ; les données canoniques restent inchangées.

## Frontière de confiance

- `POST /internal/mcp/dispatch` accepte seulement `{tool, arguments}` avec le
  jeton `x-centurion-mcp-token`, sans `Origin` navigateur ni `Sec-Fetch-*`.
- L'adaptateur appelle le backend via `node:http` (pas `fetch`, qui injecterait
  `sec-fetch-mode`).
- Le backend réapplique allowlist, validation et limites, puis exécute les mêmes
  routes `/api` par `app.inject()` avec un contexte privé `AsyncLocalStorage`
  (`source=mcp`) impossible à forger par un en-tête ou un corps. Aucun en-tête
  public `source` n'est accepté.
- Limites backend : 120 appels/min, 30 propositions/min, 5 exports/min, 4 appels
  en cours, 1 job lourd ; circuit ouvert 10 s après 10 erreurs 5xx consécutives.
  L'adaptateur ajoute ses propres limites, sans les substituer.

## Permissions MCP (Paramètres)

Les permissions sont choisies dans l'UI CENTURION (Paramètres → Permissions MCP)
et persistées en base. Elles remplacent les anciens flags d'environnement.

| Permission | Outils |
| --- | --- |
| Lecture | `list_plans`, `get_plan`, `list_controls`, `get_control`, `list_occurrences`, `get_summary`, `get_trends`, `list_clauses` |
| Exports | `export_controls_csv`, `generate_report_pdf` |
| Écriture — créer un contrôle | `create_control` |
| Écriture — modifier un contrôle | `update_control_metadata` |
| Écriture — réalisation | `set_occurrence` |

Lecture et exports sont actifs par défaut ; les écritures sont désactivées par
défaut. Le backend revalide chaque appel contre la politique persistée
(`403 mcp_tool_disabled` sinon) et réécrit `runtime/backend.json` à chaque
changement : l'adaptateur n'expose que les outils autorisés au moment de la
connexion. `GET/PUT /api/mcp-policy` portent ces permissions (routes UI, non
dispatchables par MCP).

Un appel d'écriture autorisé ne modifie aucune donnée : il crée une proposition
confirmée dans l'UI CENTURION.

## Lancer l'adaptateur depuis un hôte MCP (Claude, Codex…)

L'adaptateur est un serveur **stdio** : l'hôte le lance comme sous-processus.
Plateforme supportée : **Linux via Docker** — l'hôte lance l'adaptateur dans le
conteneur `centurion` avec `docker exec -i centurion /nodejs/bin/node dist/mcp/server.js`.

### Depuis Docker (recommandé)

Prérequis : `docker compose up -d --build` (le backend tourne dans le
conteneur `centurion`, les fichiers runtime sont lus dans le volume `/data`).

#### Claude Code (CLI)

```bash
claude mcp add --transport stdio centurion -- \
  docker exec -i centurion /nodejs/bin/node dist/mcp/server.js
```

Ou dans `.mcp.json` à la racine du projet :

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

#### Claude Desktop

`claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "centurion": {
      "command": "docker",
      "args": ["exec", "-i", "centurion", "/nodejs/bin/node", "dist/mcp/server.js"]
    }
  }
}
```

#### Codex

`~/.codex/config.toml` (ou `codex mcp add`) :

```toml
[mcp_servers.centurion]
command = "docker"
args = ["exec", "-i", "centurion", "/nodejs/bin/node", "dist/mcp/server.js"]
enabled = true
```

```bash
codex mcp add centurion -- docker exec -i centurion /nodejs/bin/node dist/mcp/server.js
```

#### `.mcp.json` générique (OpenCode, VS Code, etc.)

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

### En développement (hors Docker, Linux + Node 24)

Le script `scripts/mcp-stdio.sh` sert de lanceur portable : il résout la racine
du dépôt, choisit Node 24 et fixe `CENTURION_DATA_DIR` (démo par défaut, sinon
`$CENTURION_DATA_DIR`). Prérequis : `npm run start`.

```bash
claude mcp add --transport stdio centurion \
  --env CENTURION_DATA_DIR=/chemin/vers/CENTURION/data/demo \
  -- /chemin/vers/CENTURION/scripts/mcp-stdio.sh
```

```json
{
  "mcpServers": {
    "centurion": {
      "type": "stdio",
      "command": "/chemin/vers/CENTURION/scripts/mcp-stdio.sh",
      "env": { "CENTURION_DATA_DIR": "/chemin/vers/CENTURION/data/demo" }
    }
  }
}
```

### Remarques

- Les permissions se règlent dans l'UI (Paramètres → Permissions MCP). Après un
  changement, rechargez/reconnectez le serveur MCP dans l'hôte pour que la liste
  d'outils soit recalculée.
- `stdout` est réservé au protocole ; les logs de l'adaptateur vont sur `stderr`.
- Aucun jeton n'est transmis à l'hôte : il reste dans `runtime/mcp-token`, lu par
  l'adaptateur seulement.

# CENTURION — journal d'exécution

Ce fichier consigne, tâche par tâche, l'état réel vérifié : commandes exécutées,
résultats observés, commit local, limites et prochaine action. Aucune case n'est
cochée sans preuve d'exécution.

## T0 — Verrouiller les dépendances et démontrer les risques techniques

État : terminé et vérifié le 3 octobre 2026.

### Produit

- Dépôt Git local initialisé sur `main`, sans remote ni push.
- `package.json` / `package-lock.json` avec versions exactes, scripts de la
  section 11, `engines` Node 24.
- `.npmrc` (`save-exact`, `engine-strict`), `.node-version`, `.gitignore`,
  `.gitattributes`, `LICENSE` MIT.
- `tsconfig.base.json`, `tsconfig.node.json`, `tsconfig.web.json`,
  `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `biome.json`.
- Sources pdfcn vendored sous `src/server/reports/` (imports rendus relatifs),
  composants shadcn sous `src/web/components/ui/`.
- Police Poppins locale (`public/fonts/Poppins-*.ttf`) et licence
  (`licences/Poppins-OFL.txt`).
- Squelettes d'entrée minimaux (`src/server/index.ts`, `src/mcp/server.ts`,
  `src/web/main.tsx`, `src/web/App.tsx`) pour franchir le gate build ; ils
  seront remplacés par les implémentations testées de T1/T10/T12.
- `scripts/dev.ts` ; `scripts/seed-demo.ts` et `scripts/reset-demo.ts` sont des
  placeholders explicites (implémentation en T12).
- `tests/integration/dependency-smoke.test.ts` et fixtures
  (`tests/fixtures/pdf-smoke.mjs`, `tests/fixtures/mcp-smoke-server.mjs`).
- `docs/DEPENDENCIES.md`.

### Commandes et résultats

| Commande | Résultat |
| --- | --- |
| `node --version` (Node 24.21.0 installé sous `/opt/node24`) | v24.21.0 |
| `npm ci` | 632 paquets installés, aucune erreur |
| `npm run typecheck` | OK (TS 7.0.2) |
| `npm run lint` | OK (Biome 2.5.15, 15 fichiers, aucune erreur) |
| `npm run test -- tests/integration/dependency-smoke.test.ts` | 3/3 passés |
| `npm run build` | Vite 123 modules + esbuild serveur/MCP, OK |
| `npm run audit:deps` | 2 modérées (exceljs→uuid), aucune haute/critique |

Détail du smoke :

1. **SQLite** : base WAL avec FK, `db.backup()` vers un fichier, réouverture
   en lecture, `integrity_check = ok`, `foreign_key_check` vide, ligne présente.
2. **PDF** : `takumi-pdf` rend 4 pages A4 paysage avec Poppins locale ;
   `unpdf` extrait le titre `CENTURION` et les accents `éàçüö`.
3. **MCP** : un processus enfant `serveStdio` réel est joint par un client
   `@modelcontextprotocol/client` en mode legacy (défaut) et modern
   (`versionNegotiation: { mode: 'auto' }`) ; `echo` répond correctement dans
   les deux cas.

### Risques traités

- Voir `docs/DEPENDENCIES.md` : TypeScript 7 vs `typescript-eslint` (Biome
  retenu), suppression de `baseUrl`, noms réels des paquets SDK MCP v2 et du
  moteur PDF, scripts npm bloqués couverts par les prebuilds.

### Limites

- Seule la plateforme Linux/WSL2 x86_64 est testée. Windows natif n'est pas
  exercé ici ; aucun test Windows n'est revendiqué.
- `scripts/seed-demo.ts` et `scripts/reset-demo.ts` ne sont pas encore
  fonctionnels (T12).
- Les squelettes serveur/MCP/UI ne portent aucune règle métier.

### Prochaine action

T1 — écrire d'abord `tests/security/http.test.ts` et `tests/unit/schemas.test.ts`
(frontière HTTP, schémas stricts, protections navigateur), constater l'échec,
puis implémenter `buildApp`, `Clock`, DTO/`ErrorBody` et le shell UI.

### Commit

`b85cafd chore: lock compatible toolchain`.

## T1 — API locale, contrats et protections navigateur

État : terminé et vérifié le 3 octobre 2026.

### Produit

- `src/shared/schemas.ts` : dates civiles (sans `new Date('YYYY-MM-DD')`), normalisation
  NFC/trim, politique C0/C1/DEL, bornes en code points, enums fermés, `Schedule`
  discriminé strict, `ControlMetadata`, `CreateControlInput`, `UpdateMetadataInput`,
  `StatusInput` (FAIT Non force N/A + preuve nulle), `FilterInput`, `ControlListFilter`,
  `PageInput`, `ErrorBody`, `ImportMappingInput`, règles d'URL GitHub (HTTPS, hôte exact,
  sans userinfo/port/fragment, ≥2 segments).
- `src/server/config.ts` : `dataDir` par plateforme, mode production/development/demo,
  origines et hôtes autorisés, limite de corps 64 KiB.
- `src/server/clock.ts` : `Clock` avec `todayParis()` via `Intl.DateTimeFormat`
  `Europe/Paris` ; horloge fixe pour les tests.
- `src/server/http/errors.ts` : `AppError`, `parseInput` (Zod → 422 avec champs),
  gestionnaire d'erreurs génériques (400/413/415/4xx/500 sans fuite), 405 + `Allow`
  via `hasRoute`, 404 JSON.
- `src/server/http/guards.ts` : Host exact, refus cross-site/Origin étranger, mutations
  `/api` exigeant Origin + `X-Centurion-Request: 1` + JSON/multipart.
- `src/server/http/headers.ts` : nosniff, no-referrer, DENY, Permissions-Policy,
  no-store API/downloads, CSP production (self, sans unsafe-eval/script-inline).
- `src/server/storage/paths.ts` : `canonicalDataDir`, dossiers privés 0700,
  `resolveManagedFile` (UUID obligatoire, pas de chemin client).
- `src/server/app.ts` / `index.ts` : `buildApp(deps)` sans listen implicite, statics
  `dist/web`, `/health`.
- Shell UI (`src/web/App.tsx`) avec Poppins locale et dialogue shadcn.
- Tests : `tests/unit/schemas.test.ts`, `tests/unit/paths.test.ts`,
  `tests/security/http.test.ts`, `tests/e2e/shell.spec.ts`.

### Commandes et résultats

| Commande | Résultat |
| --- | --- |
| `npm run test -- tests/security/http.test.ts tests/unit/schemas.test.ts tests/unit/paths.test.ts` | 34/34 passés (4 fichiers) |
| `npm run test:e2e` | 1/1 passé (shell production, focus dialogue, aucun CDN, zéro erreur console) |
| `npm run check` | typecheck + lint + tests OK |
| `npm run build` | Vite + esbuild OK |

Vérifications de frontière observées :

- Host hostile → 403 ; mutation sans Origin / Origin étranger / Origin `null` → 403 ;
  `Sec-Fetch-Site: cross-site` → 403 ; absence de `X-Centurion-Request` → 403 ;
  `text/plain` → 415 ; JSON illisible → 400 ; champ inconnu → 422 ; corps > 64 KiB → 413 ;
  `PUT /health` → 405 avec `Allow: GET, HEAD` ; `/api/unknown` → 404 JSON ; 500 sans
  stack/chemin/payload.
- Listener réel : `127.0.0.1` répond, l'adresse LAN est refusée.
- Build production servi : en-têtes de sécurité et CSP présents, `index.html` ne
  référence que `/assets/*` et `/fonts/*`, police locale servie (200).

### Limites

- Le shell UI est un squelette de vérification ; les pages métier arrivent en T7.
- Pas de fallback SPA profond à ce stade (l'API inconnue reste en 404 JSON, jamais
  servie comme SPA) ; le routage UI complet est ajouté en T7.
- `storage/paths.ts` couvre la canonicalisation et l'identifiant ; le verrou, les
  quotas et le catalogue arrivent en T2/T3.

### Prochaine action

T2 — écrire les tests SQLite/scoping/audit/verrou, constater l'échec, puis implémenter
`database.ts`, `migrate.ts`, `001_initial.sql`, `scoping.ts`, `audit.ts`,
`instance-lock.ts`, `operation-gate.ts`.

### Commit

`383404e feat: establish local API boundary`.

## T2 — SQLite, scoping, audit et propriétaire unique

État : terminé et vérifié le 3 octobre 2026.

### Produit

- `src/server/db/migrations/001_initial.sql` : schéma STRICT complet (plans, controls,
  occurrences, realizations, schedule_previews, import_runs, restore_previews,
  mcp_proposals, audit_events), FK RESTRICT, index partiel unique sur les occurrences
  actives, contraintes d'enums/dates/forme de planning, triggers append-only et
  invariants de réalisation.
- `src/server/db/migrate.ts` : migration transactionnelle idempotente via
  `PRAGMA user_version`.
- `src/server/db/database.ts` : `openDatabase` (WAL, FK ON, busy_timeout 5000),
  `DatabaseHandle`, types de lignes, `DomainTx`, `withPlanMutation` (révision
  incrémentée une seule fois, seulement si changement réel).
- `src/server/db/audit.ts` : `insertAudit` avec snapshots bornés à 64 KiB.
- `src/server/db/scoping.ts` : `planInScope`, `controlInPlan`, `occurrenceInPlan` (404).
- `src/server/storage/instance-lock.ts` : verrou `proper-lockfile` (stale 30 s,
  update 5 s, retries 0, détection de compromission).
- `src/server/storage/operation-gate.ts` : mutations exclusives, fenêtre de
  maintenance, lectures refusées 503 pendant l'installation.
- `src/server/domain/plans.ts` : bootstrap du plan de l'année Paris courante
  uniquement si aucun plan n'existe.
- `scripts/copy-assets.mjs` : copie des migrations dans `dist/server/migrations`
  pour le bundle de production.

### Commandes et résultats

| Commande | Résultat |
| --- | --- |
| `npm run test -- tests/integration/database.test.ts tests/integration/instance-lock.test.ts` | 15/15 passés |
| `npm run check` | 49/49 tests, typecheck et lint OK |
| `npm run build` | Vite + esbuild + copie des migrations OK |
| Démarrage production (`node dist/server/index.js`, dataDir temporaire) | `/health` 200, `user_version=1`, plan `2026` créé, verrou libéré au SIGTERM (second démarrage 200) |

Points couverts : migration rejouée, WAL/FK/busy_timeout, index partiel (un actif +
un superseded même date, deux actifs refusés), code unique, SQL hostile stocké inerte,
réalisation → occurrence `completed`, refus sur `superseded`, refus de quitter
`completed`/de compléter sans réalisation, DELETE réalisation interdit, audit
UPDATE/DELETE interdits, rollback mutation+audit, révision une seule fois et no-op,
bootstrap à la frontière d'année Paris (22:30 UTC → 2027, 23:30 UTC → 2028), verrou
sur deux processus réels.

### Limites

- `AppDeps` porte encore `db`/`gate`/`engineEpoch` en optionnel ; ils deviendront
  obligatoires quand les routes métier les consommeront (T4+).
- `files` (gestion des fichiers d'instance) arrive en T3.
- Aucune route métier n'est encore exposée ; l'API reste `/health`.

### Prochaine action

T3 — écrire les tests sauvegarde/restauration (WAL, intégrité, panne par phase du
journal), implémenter `backups/{catalog,backup,restore,recovery}.ts` et les routes,
puis prouver la reprise après arrêt réel.

### Commit

`c5f6695 feat: secure SQLite lifecycle and audit`.

## T3 — Sauvegarde et restauration récupérable

État : terminé et vérifié le 3 octobre 2026.

### Produit

- `src/server/backups/catalog.ts` : catalogue externe (fichiers `.sqlite` +
  manifestes JSON versionnés), `sha256File`, `verifySqliteFile`
  (intégrité/FK/schéma), `listManifests`, `applyRetention` (tous les manuels +
  dernier `pre_restore` + 20 automatiques).
- `src/server/backups/backup.ts` : `createBackup` via `better-sqlite3.backup()`,
  vérification puis manifeste écrit en temp+rename.
- `src/server/backups/restore.ts` : aperçu 15 min (hash, révisions globales,
  epoch, pertes), `restoreBackup` avec sauvegarde `pre_restore`, candidate
  vérifiée/migrée/nettoyée, checkpoint WAL, journal par phase, nouvel epoch et
  audit `restore_completed`.
- `src/server/backups/recovery.ts` : journal durable fsync, `recoverOnStartup`
  déterministe (original, rollback ou nouvelle base), idempotent.
- `src/server/runtime.ts` : handle de base et epoch mutables après restauration.
- `src/server/routes/backups.ts` : `GET/POST /api/backups`,
  `restore-preview`, `restore`.
- `docs/API.md` : section sauvegarde/restauration.

### Commandes et résultats

| Commande | Résultat |
| --- | --- |
| `npm run test -- tests/integration/backup-restore.test.ts` | 10/10 passés |
| `npm run check` | 59/59 tests, typecheck et lint OK |
| `npm run build` | OK |
| Vérification HTTP (serveur de production) | `POST /api/backups` sans Origin → 403 ; création/liste/aperçu/restore OK, nouvel `engine_epoch` retourné |

Cas couverts : commits encore dans le WAL inclus dans la sauvegarde, SHA/hash,
source inconnue/altérée/schéma futur refusés, échec de sauvegarde bloquant,
`pre_restore` encore listé après restauration, aperçu périmé après changement de
révision, 503 pendant la maintenance, arrêt après `prepared`/`old_moved`/
`new_installed` (rollback vers la base ancienne complète) et après `committed`
(nouvelle base conservée), seconde récupération = `none` (idempotence).

### Limites

- L'injection d'arrêt est simulée par une exception sur le hook de phase après
  chaque écriture de journal durable ; la reprise est ensuite exercée sur un
  runtime neuf, ce qui reproduit un redémarrage. Aucun arrêt OS réel n'est
  revendiqué.
- Le jeton runtime (`runtime/mcp-token`) et `backend.json` sont créés en T10 ;
  la restauration renouvelle déjà l'`engine_epoch`.
- `tests/fixtures/backups/` n'est pas encore peuplé (les fixtures sont générées
  par les tests).

### Prochaine action

T4 — calendrier (`generateDates`, `translateDefinitionDates`), création,
duplication et année suivante, avec les tests d'API correspondants.

### Commit

`9110954 feat: add recoverable local backups`.

## T4 — Calendrier, création, duplication et année suivante

État : terminé et vérifié le 3 octobre 2026.

### Produit

- `src/server/domain/civil-date.ts` : parsing/formatage, `addMonthsClamped`,
  comparaison, `translateCivilDate` (29/02 → 28/02).
- `src/server/domain/schedule.ts` : `generateDates` (ponctuel, mensuel/
  trimestriel/semestriel à partir de l'ancre, annuel, explicite trié/dédupliqué,
  fenêtre inclusive, pas de backfill), `translateSchedule`,
  `translateDefinitionDates`.
- `src/shared/limits.ts`, DTO `PlanDto`/`ControlDto`/`RealizationDto`/
  `OccurrenceDto` dans `src/shared/schemas.ts`.
- `src/server/domain/controls.ts` : création, PATCH de métadonnées, duplication,
  comptage/plafond 100 000, validation d'année de définition.
- `src/server/domain/plans.ts` : DTO, liste, création, PATCH, `cloneYear`
  (contrôles actifs traduits, occurrences régénérées, `year_exists`/
  `year_out_of_range`).
- `src/server/routes/{plans,controls}.ts` et enregistrement dans `buildApp`.

### Commandes et résultats

| Commande | Résultat |
| --- | --- |
| `npm run test -- tests/unit/calendar.test.ts tests/integration/controls.test.ts` | 20/20 passés |
| `npm run check` | 79/79 tests, typecheck et lint OK |
| `npm run build` | OK |

Cas couverts : trimestriel 31/03→31/03,30/06,30/09,31/12 ; mensuel 31/01→29/02→
31/03 ; annuel 29/02 cloné 2029→28/02 ; explicite tri/dédup ; fenêtre inclusive ;
pas de backfill ; date hors année → 422 ; zéro occurrence valide ; création 201 ;
plan inconnu 404 ; collision de code normalisé 409 ; URL interdite si
`automated=false` 422 ; URL invalide (http, userinfo, port, lookalike, un seul
segment) 422 **sans appel réseau** ; clone d'année existante 409 ; 100 000
occurrences admises / 100 001 refusées sans écriture ; duplication sans
réalisation ni audit d'origine.

### Limites

- L'archivage, les aperçus de planning et la saisie de réalisations arrivent en
  T5/T6 ; `PATCH` ne touche ni code, ni planning, ni statut.
- La liste des contrôles filtre par définition et statut ; les filtres
  d'occurrences/reporting arrivent en T7.

### Prochaine action

T5 — aperçus de planning (`schedule-preview`/`schedule-apply`) avec delta,
TTL 15 min, révision de base et sauvegarde préalable.

### Commit

`feat: create annual control schedules` (voir `git log`).

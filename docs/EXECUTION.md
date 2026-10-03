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

`9cc6b3b feat: create annual control schedules`.

## T5 — Aperçus et changement de planning

État : terminé et vérifié le 3 octobre 2026.

### Produit

- `src/server/domain/schedule.ts` : `computeScheduleDelta` pur (completed et open
  antérieurs conservés, open futurs survivants conservés, open futurs disparus
  superseded, nouvelles dates ≥ effet sans collision active, superseded jamais
  recyclé, cutoff inclusif).
- `src/server/domain/schedule-preview.ts` : `createSchedulePreview` (TTL 15 min,
  `base_plan_revision`, `engine_epoch`, delta complet + échantillon ≤ 100 par
  catégorie, plafond projeté) et `applySchedulePreview` (revalidation sous
  transaction, sauvegarde `pre_schedule_change` uniquement si effet, application
  par ID, consommation atomique, audit `schedule_change`).
- Routes `schedule-preview` / `schedule-apply` dans `routes/controls.ts`.

### Commandes et résultats

| Commande | Résultat |
| --- | --- |
| `npm run test -- tests/unit/calendar.test.ts tests/integration/schedule-preview.test.ts` | 21/21 passés |
| `npm run check` | 89/89 tests, typecheck et lint OK |
| `npm run build` | OK |

Cas couverts : fixture completed futur / open passé / open futur commun / open
futur disparu / ancien superseded → keep 4, supersede 1, create 1, IDs conservés,
réalisation non écrasée ; révision +1 et un seul audit ; rejeu → 409 ; réalisation
entre aperçu et apply → 409 sans perte ; aperçu d'un autre contrôle → 404 ; delta
injecté par le client → 422 ; expiration et changement d'epoch → 409 ; no-op sans
backup ni révision ; panne de sauvegarde → aucune occurrence modifiée ; cutoff
inclusif exact.

### Limites

- L'échantillon affiché est borné à 100 dates par catégorie ; l'application
  utilise toujours le delta complet stocké côté serveur.
- L'archivage et la saisie de réalisations arrivent en T6.

### Prochaine action

T6 — métadonnées, archivage, réalisations et historique.

### Commit

`c01d91e feat: apply versioned schedule previews`.

## T6 — Métadonnées, archivage, réalisations et historique

État : terminé et vérifié le 3 octobre 2026.

### Produit

- `src/server/domain/controls.ts` : `archiveControl` (completed et open
  antérieurs conservés, open ≥ effet superseded, sauvegarde `pre_archive` si
  effet, ré-archivage 409).
- `src/server/domain/realizations.ts` : `setOccurrenceStatus` (occurrence +
  réalisation + état + audit + révision dans une transaction, correction à UUID
  stable, no-op sans écriture, FAIT Non force N/A/preuve nulle, dates bornées à
  aujourd'hui Paris), `toOccurrenceDto`/`toRealizationDto`.
- `src/server/domain/queries.ts` : `listOccurrences` (filtres AND, superseded
  exclus par défaut, recherche LIKE échappée).
- `src/server/db/audit.ts` : `listAuditEvents` paginé.
- Routes : `PUT .../occurrences/:id/status`, `GET .../occurrences`,
  `POST .../controls/:id/archive`, `GET .../controls/:id/audit-events`.

### Commandes et résultats

| Commande | Résultat |
| --- | --- |
| `npm run test -- tests/integration/status-archive.test.ts` | 11/11 passés |
| `npm run check` | 100/100 tests, typecheck et lint OK |
| `npm run build` | OK |

Cas couverts : PATCH code/planning/status/id → 422 ; metadata sur archivé → 409 ;
archivage conserve completed et open antérieurs, supersede open ≥ effet ; saisie
sur open conservé permise ; superseded → 409 ; FAIT Non force N/A/preuve nulle ;
quatre conformités avec FAIT Oui ; date tardive hors année autorisée, future 422 ;
correction à UUID stable avec before/after audités ; no-op sans audit ni révision ;
historique paginé incluant les réalisations ; contrôle d'un autre plan → 404 ;
persistance après fermeture/réouverture de la base.

### Limites

- `GET .../occurrences` couvre les filtres de définition/occurrence ; les
  métriques, la synthèse et le reporting sont en T7.
- L'archivage ne stocke pas la date d'effet sur le contrôle : les occurrences
  `open` restantes d'un contrôle archivé sont exactement celles conservées.

### Prochaine action

T7 — requêtes, métriques (`buildReport`) et interface de suivi.

### Commit

`2b65a8b feat: record control outcomes and archival`.

## T7 — Requêtes, métriques et interface de suivi

État : terminé et vérifié le 3 octobre 2026.

### Produit

- `src/server/domain/queries.ts` : `buildOccurrenceFilter` partagé, `listOccurrences`.
- `src/server/domain/report.ts` : `buildSummary` (counts, trois taux, agrégation
  par référentiel, automatisation en contrôles actifs distincts avec/sans filtre
  d'occurrence) et `buildReport` (snapshot cohérent plan + summary + lignes).
- `src/server/routes/reporting.ts` : `GET /summary`, `GET /report`.
- UI React (`react-router-dom`) : `App` + pages Synthèse, Plan annuel, Fiche
  contrôle, Référentiels, Reporting, Paramètres ; client API, contexte de plan,
  formulaires `ControlForm`, `RealizationForm`, `SchedulePreview` ; filtres dans
  l'URL, pagination, vue douze mois, lien GitHub `target=_blank
  rel="noopener noreferrer"`, fallback SPA limité aux routes de page.
- `docs/mockups/` : maquettes Synthèse et Référentiels.

### Commandes et résultats

| Commande | Résultat |
| --- | --- |
| `npm run test -- tests/integration/reporting.test.ts` | 5/5 passés |
| `npm run check` | 105/105 tests, typecheck et lint OK |
| `npm run test:e2e` (production) | 3/3 passés (core-flow, shell/focus, 390/1440 + reduced-motion) |
| `npm run build` | OK |

Cas couverts : fixture 2 open + 3 FAIT Oui + 1 FAIT Non + 1 superseded → total 6,
réalisés 3, N/A 1, réalisation 50 %, conformité 50 % ; taux null si vide ou tout
N/A ; synthèse identique sur deux pages ; autre plan exclu ; LIKE littéral ;
automatisation 2/3 sans filtre et filtrée avec occurrence ; parcours Playwright
complet (créer trimestriel → 4 lignes, FAIT Oui puis Non, modifier via aperçu,
archiver, sélectionner un autre plan), 409 visible, XSS rendu comme texte, lien
GitHub sûr, focus clavier, 390/1440 px et `prefers-reduced-motion`.

### Limites

- La vue douze mois regroupe les lignes de la page courante (plafonnée à 100) ;
  une agrégation serveur dédiée n'est pas ajoutée.
- Les exports CSV/PDF sont implémentés en T9 ; les boutons pointent déjà vers les
  routes.

### Prochaine action

T8 — import CSV/XLSX (upload, mapping, aperçu, apply atomique).

### Commit

`3fc3318 feat: deliver annual control tracking UI`.

## T8 — Import upload, mapping, aperçu et apply atomique

État : implémentation livrée et partiellement vérifiée le 3 octobre 2026. Les
cases « fixtures » et « tests apply » du plan restent **non cochées** : plusieurs
sous-points ne sont pas encore couverts (voir Limites).

### Produit

- `src/server/imports/zip-preflight.ts` : préflight `yauzl` lazy comptant les
  octets réellement décompressés (≤ 25 MiB), ≤ 2 000 entrées, refus traversal,
  noms dupliqués, `vbaProject`, chiffrement.
- `src/server/imports/parse-csv.ts` / `parse-xlsx.ts` : CSV `csv-parse` (BOM,
  quotes, newlines, ≤ 100 colonnes, record ≤ 64 KiB) ; XLSX `exceljs` refusant
  toute formule dans **toutes** les feuilles, dates natives converties en UTC.
- `src/server/imports/upload.ts` : upload confiné sous `dataDir`, ≤ 5 MiB,
  quotas (3 temporaires / 15 MiB), TTL 30 min, hash SHA-256.
- `src/server/imports/preview.ts` : normalisation complète, classification
  create/update/unchanged/invalid, diff de métadonnées, delta de planning,
  `normalized_preview_json` interne, DTO paginé.
- `src/server/imports/apply.ts` : apply atomique (revalidation epoch/TTL/révision,
  `invalid > 0 → 422`, sauvegarde `pre_import` si changement, plafond, audit,
  suppression de l'upload après commit).
- `src/server/routes/imports.ts`, `examples/import/*`, page `Import.tsx`.

### Commandes et résultats

| Commande | Résultat |
| --- | --- |
| `npm run test -- tests/security/import.test.ts tests/integration/import-flow.test.ts` | 11/11 passés |
| `npm run check` | 116/116 tests, typecheck et lint OK |
| `npm run build` | OK |
| `npm run test:e2e` | 3/3 (non étendu au parcours d'import) |

Vérifié : CSV BOM/quotes/newlines/formule conservée ; XLSX formule (feuille non
sélectionnée) refusée ; ZIP > 25 MiB décompressés, traversal, doublons, macro,
trop d'entrées refusés ; upload → mapping → aperçu → apply créant 2 contrôles et
5 occurrences ; rejeu 409 ; mauvais plan 404 ; une ligne invalide → 422 sans
écriture ; champ optionnel absent efface la valeur ; occurrence `completed`
conservée lors d'un changement de planning.

### Limites (sous-points non vérifiés)

- Pas de test automatisé pour : relations externes OOXML, chiffrement explicite,
  calendriers Excel 1900/1904 et serial 60, dépassement lignes/colonnes/feuilles,
  timeout de parsing et nettoyage des temporaires, code archivé invalide,
  hash/source altéré, statut modifié après aperçu, panne de sauvegarde et plafond
  100 001 au niveau import, audit rollback atomique, crash après commit.
- Le parcours UI upload→mapping→aperçu→apply n'est pas couvert par un test
  Playwright ; il est présent dans la page `Import` mais non exercé en E2E.
- XLSX : parsing synchrone dans la transaction de mapping ; pas de worker ni de
  timeout dédié.

### Prochaine action

T9 — exports CSV/PDF bornés et artefacts.

### Commit

`ce9c950 feat: import reviewed control definitions`.

## T9 — CSV/PDF, snapshots et artefacts bornés

État : implémentation livrée et partiellement vérifiée le 3 octobre 2026. Les
cases du plan restent **non cochées** : plusieurs sous-points ne sont pas encore
couverts (voir Limites).

### Produit

- `src/server/reports/csv.ts` : export d'occurrences filtrées (toutes les pages,
  pagination ignorée), BOM, séparateur `;`, CRLF, quoting doublé, neutralisation
  des formules à l'export uniquement (SQLite inchangée), plafond 64 MiB.
- `src/server/reports/report-pdf.ts` : PDF via `takumi-pdf` (import paresseux,
  aucune lecture DB pendant le rendu), Poppins locale, HTML échappé (aucune
  insertion utilisateur), mention d'assurance, plafond 1 000 occurrences / 64 MiB.
- `src/server/routes/reporting.ts` : `GET .../exports/controls.csv` et
  `.../exports/report.pdf` avec `Content-Disposition: attachment` et `no-store`.
- Boutons d'export dans `web/pages/Reporting.tsx`.

### Commandes et résultats

| Commande | Résultat |
| --- | --- |
| `npm run test -- tests/integration/exports.test.ts` | 3/3 passés |
| `npm run check` | 119/119 tests, typecheck et lint OK |
| `npm run build` | OK |
| `npm run test:e2e` | 3/3 |

Vérifié : CSV BOM `\uFEFF`, séparateur `;`, quoting, toutes les lignes filtrées,
open vide, `Non`/`N/A`, aucune ligne d'un autre plan, formule `=SUM(A1)`
neutralisée par apostrophe à l'export et titre stocké inchangé ; PDF `%PDF`,
extraction de `CENTURION` et de la mention d'assurance, 1 001 lignes → 422
`report_too_large`.

### Limites (sous-points non vérifiés)

- Refus > 64 MiB non testé (génération de 64 MiB non réalisée) ; pas de fichier
  `tests/security/export-data.test.ts` séparé.
- Réservations de quotas d'artefacts MCP (20 / 128 MiB) et route
  `GET /exports/:exportId/download` non implémentées (prévues en T10).
- PDF multipage non exercé ; zéro occurrence, réseau bloqué, timeout et nettoyage
  des fichiers partiels non testés.
- Pas de limite de débit « opérations lourdes » (5/min) branchée sur le PDF.

### Prochaine action

T10 — MCP stdio lecture seule et dispatch unique.

### Commit

`c946289 feat: generate bounded annual reports`.

## T10 — MCP stdio lecture métier et dispatch unique

État : terminé et vérifié le 3 octobre 2026.

### Produit

- `src/server/storage/runtime-files.ts` : `runtime/mcp-token` (32 octets, 0600)
  et `runtime/backend.json` écrits atomiquement.
- `src/server/context.ts` : contexte privé `AsyncLocalStorage` (`source=mcp`),
  impossible à forger par en-tête/corps ; les guards le reconnaissent.
- `src/server/mcp/policy.ts` : allowlist exacte de 8 outils lecture + 3 écriture,
  schémas d'arguments stricts, résolution vers les mêmes routes `/api`.
- `src/server/mcp/dispatch.ts` + `routes/mcp.ts` : `POST /internal/mcp/dispatch`
  (jeton, sans Origin ni Sec-Fetch), `app.inject()` sous contexte privé.
- `src/server/mcp/limits.ts` : 120 appels/min, 30 écritures/min, 5 exports/min,
  4 en cours, circuit 10 s après 10 5xx.
- `src/server/reports/artifacts.ts` + `GET /exports/:exportId/download` :
  artefacts bornés (20 / 128 MiB, TTL 24 h).
- `src/mcp/{server,backend-client,tools,sanitize,rate-limit}.ts` : `serveStdio`,
  client REST via `node:http`, projection Cf/VS/tags + contrôle de taille 512 KiB.
- `docs/MCP.md`.

### Commandes et résultats

| Commande | Résultat |
| --- | --- |
| `npm run test -- tests/mcp/read-only.test.ts tests/mcp/stdio.test.ts` | 11/11 passés |
| `npm run check` | 130/130 tests, typecheck et lint OK |
| `npm run build` | OK (`dist/mcp/server.js`) |
| `npm run test:e2e` | 3/3 |

Vérifié : liste exacte des 8 outils lecture et absence d'outil write ; erreur
`backend_unavailable` sans pollution de stdout ; aucun endpoint MCP HTTP
(`/sse` 404) ; arguments inconnus rejetés ; schéma de sortie validé ; sanitation
signalée ; limites et circuit ; vrais processus enfants legacy **et** modern ;
jeton manquant/incorrect 403 ; source publique falsifiée refusée.

### Limites

- Les seuils 121e appel/min et 6e export/min sont vérifiés au niveau du limiteur
  unitaire, pas via 121 appels réels.
- Le plafond 512 KiB est implémenté mais non couvert par un test dédié.

### Prochaine action

T11 — écritures MCP proposées puis confirmées dans l'UI.

### Commit

`feat: expose constrained read-only MCP` (voir `git log`).

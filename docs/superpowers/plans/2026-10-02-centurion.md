# CENTURION — plan de développement V1

> **Pour les agents d'exécution :** utiliser `superpowers:executing-plans`. Suivre les tâches dans l'ordre et cocher chaque étape au fur et à mesure.

**Objectif :** livrer dans `/mnt/c/Workspace/CENTURION` une application locale complète de gestion d'un plan annuel de contrôles cyber/IT, une démo rejouable avec données fictives et un dépôt GitHub public prêt à présenter.

**Architecture arrêtée :** interface React/Vite en TypeScript, composants shadcn/ui, Tailwind CSS v4 et thème CENTURION ; API Fastify en TypeScript ; SQLite et fichiers locaux ; accès limité à `127.0.0.1`. L'application gère plusieurs plans annuels sur une même instance. Deux personnes disposent chacune d'un compte local. Aucune fonction SSO ou hébergement réseau dans la V1.

**Technologies :** Node.js 22.12+, npm, React 19, Vite 8, Fastify 5, `better-sqlite3`, `@fastify/multipart`, ExcelJS, Zod, `@fastify/cookie`, `fflate`, `cross-env`, `concurrently`, Tailwind CSS v4, shadcn/ui base-nova, Vitest, Testing Library, Playwright, Poppins OFL. Épingler toutes les dépendances directes sans `^`/`~` et versionner `package-lock.json`. Lancer `npm view <paquet> version` pour figer les correctifs stables au moment de l'installation ; ne pas prendre de versions alpha/beta/canary. Node minimum Vite 8 : `22.12` ([support Node officiel](https://vite.dev/blog/announcing-vite8)).

**Conception :** `docs/superpowers/specs/2026-10-02-centurion-design.md`

## Décisions fermées

Les tâches ci-dessous exécutent ces choix. Ne pas rouvrir l'architecture ni ajouter une bibliothèque ou une fonction sans nécessité relevée dans la conception.

1. **Utilisateur :** une petite équipe de 1 à 2 personnes, sur l'ordinateur où le serveur local tourne. Données d'une seule organisation. Pas de multi-tenant.
2. **Comptes :** mode `demo` livré avec deux comptes et données factices ; mode `local` vierge crée le premier administrateur au premier lancement et permet d'ajouter un deuxième compte. Comptes locaux par email/mot de passe. SSO, invitation email et réinitialisation email hors V1.
3. **Plans :** un plan par année civile et par instance. L'utilisateur peut cloner un plan vers l'année suivante : les contrôles et mappings sont clonés avec de nouveaux identifiants ; réalisations, anomalies et fichiers ne le sont pas.
4. **Période :** 1er janvier inclus au 1er janvier de l'année suivante exclu ; fuseau du plan `Europe/Paris`. Les échéances restent des dates sans heure.
5. **Fréquences :** ponctuelle, intervalle tous les N jours/semaines/mois, ou liste explicite de dates. `N` entier de 1 à 366. Pas d'ajustement weekend/jour férié.
6. **Récurrence mensuelle :** calculée depuis l'ancre initiale, jamais depuis la dernière réalisation. Si le jour d'ancre n'existe pas, prendre le dernier jour du mois ; revenir au jour d'ancre initial le mois suivant. Le 31 janvier mensuel donne 28/29 février puis 31 mars. Le 31 mars trimestriel donne 30 juin, 30 septembre, 31 décembre.
7. **Retard :** une réalisation après échéance ne change jamais les occurrences ultérieures.
8. **Changement de fréquence :** prévisualiser les occurrences conservées, supprimées du calendrier futur et créées. À confirmation, superséder uniquement les occurrences ouvertes à partir de la date d'effet et créer les nouvelles dans une seule transaction. Historique et réalisations restent inchangés.
9. **Résultat :** une occurrence possède zéro ou une réalisation courante ; correction = nouvelle version d'historique. Résultats : `satisfactory`, `anomaly`, `inconclusive`. Une anomalie clôt l'exécution et crée une action de suivi ouverte.
10. **Justificatif :** fichier local jusqu'à 10 MiB ou URL HTTP(S), commentaire facultatif. Formats fichier : PDF, PNG, JPEG, TXT, CSV. Fichiers servis uniquement en téléchargement.
11. **Référentiels :** ISO/IEC 27001:2022, amendement 1:2024, et objectifs ISAE 3402 définis par l'organisation. Seed ISO : identifiants de référence seulement avec libellés rédactionnels CENTURION ; aucun texte ISO reproduit. Seed ISAE : objectifs inventés et identifiés comme exemples, pas comme clauses normatives. ISO confirme cette édition et son amendement ([fiche officielle](https://www.iso.org/standard/27001)).
12. **Mapping :** liens plusieurs-à-plusieurs créés/modifiés dans la matrice, jamais inférés par texte. Chaque item actif est `unmapped`, `partial`, `full` ou explicitement `out_of_scope`. Toute liaison inclut portée, justification, auteur et date.
13. **Import :** fichiers `.csv` et `.xlsx` ; les `.xls` sont refusés. CSV UTF-8 (BOM admis), séparateur virgule ou point-virgule. Dates acceptées : ISO `YYYY-MM-DD`, numéro de date Excel ou format choisi explicitement dans l'assistant. Aucune formule n'est évaluée.
14. **Suppression :** contrôle utilisé = archivage. Un brouillon inutilisé peut être supprimé avec confirmation. Une occurrence réalisée ou un mapping ayant des événements n'est jamais supprimé.
15. **Vitrine :** interface et contenu produit en français ; captures desktop 1440×1000. Sources et code en anglais permis. Licence du code MIT ; police Poppins sous sa licence OFL.
16. **Aucun ajout V1 :** calendrier externe, emails, boîte de notifications, SSO, signature auditeur, chart library, application hébergée, mode hors ligne, import en masse des mappings, permissions avancées.

## Critères terminaux mesurables

- Un clone neuf du dépôt démarre par `npm ci && npm run dev:demo`; la page d'accueil affiche la synthèse avec les données seed en moins d'une minute, sans clé/API cloud.
- `npm run dev` ouvre Vite sur `127.0.0.1:5173` et proxifie `/api` vers Fastify `127.0.0.1:3333`. La production `npm run build && npm start` sert UI et API sur `127.0.0.1:3333`.
- Deux comptes voient les mêmes écritures ; l'historique attribue chaque changement au compte courant.
- Un contrôle trimestriel daté du 31 mars, réalisé le 15 avril, conserve son occurrence suivante au 30 juin.
- L'import fournit un aperçu avant écriture ; annuler laisse la base inchangée ; confirmer applique les seules lignes valides, dans une transaction.
- Chaque indicateur du reporting montre numérateur, dénominateur et période. Une anomalie n'est jamais comptée comme résultat satisfaisant.
- Export CSV et archive complète restaurent les informations et les fichiers fictifs ; une archive invalide ne modifie pas la base courante.
- Les cinq captures proviennent de l'application exécutée. Aucune capture maquette, donnée client ou information de Skaleet n'est publiée.
- `npm run check` et `npm run build` réussissent ; le parcours Playwright ci-dessous réussit sur Chromium.

## Interfaces et schéma gelés

### Données SQLite

Dates stockées en texte `YYYY-MM-DD`, instants en texte ISO UTC. Clés primaires UUID v4 générées par le serveur. Foreign keys activées. WAL activé. Toutes les écritures métier et leur événement d'historique sont transactionnels.

- `schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`.
- `users(id, email UNIQUE COLLATE NOCASE, display_name, password_hash, role CHECK admin/member, active CHECK 0/1, created_at, updated_at)`.
- `sessions(token_hash PRIMARY KEY, user_id REFERENCES users, expires_at, created_at)` ; seul le hash SHA-256 du cookie aléatoire est persisté.
- `plans(id, year UNIQUE CHECK 2000..2100, name, perimeter, timezone CHECK='Europe/Paris', status CHECK draft/active/closed, version INTEGER, created_at, updated_at, created_by, updated_by)`.
- `controls(id, plan_id REFERENCES plans, code, title, objective, domain CHECK cyber/it, category, owner_name NULLABLE, method, expected_evidence, active_from, active_to NULLABLE, schedule_json, status CHECK draft/active/archived, version INTEGER, created_at, updated_at, created_by, updated_by, UNIQUE(plan_id, code))`.
- `control_versions(id, control_id REFERENCES controls, version, snapshot_json, changed_at, actor_id REFERENCES users, UNIQUE(control_id, version))`. Créer version 1 avec le contrôle ; créer une nouvelle ligne avant toute modification de définition.
- `occurrences(id, control_id REFERENCES controls, control_version, due_date, original_due_date, state CHECK open/completed/excluded/superseded, due_date_override_reason NULLABLE, created_at, FOREIGN KEY(control_id,control_version) REFERENCES control_versions(control_id,version))`. Index partiel unique sur `(control_id,due_date)` pour `state IN ('open','completed','excluded')`. Plusieurs anciennes occurrences superseded peuvent partager la date après recalcul.
- `realizations(id, occurrence_id REFERENCES occurrences, revision, completed_date, result CHECK satisfactory/anomaly/inconclusive, comment, actor_id REFERENCES users, created_at, supersedes_id NULLABLE REFERENCES realizations, UNIQUE(occurrence_id, revision), UNIQUE(supersedes_id))`. Une correction pointe vers la révision remplacée ; résultat courant = révision de numéro maximal.
- `findings(id, realization_id REFERENCES realizations, title, action, owner_name NULLABLE, due_date NULLABLE, state CHECK open/closed, closure_note NULLABLE, created_at, closed_at NULLABLE)`.
- `evidence(id, realization_id REFERENCES realizations, kind CHECK file/link, storage_name NULLABLE UNIQUE, original_name NULLABLE, mime_type NULLABLE, size_bytes NULLABLE, sha256 NULLABLE, url NULLABLE, comment NULLABLE, added_at, added_by REFERENCES users, deleted_at NULLABLE)`. Suppression logique uniquement.
- `framework_releases(id, key, name, edition, release_date, source, fictional CHECK 0/1, created_at, UNIQUE(key,edition))`.
- `framework_items(id, release_id REFERENCES framework_releases, item_key, editorial_title, scope_note NULLABLE, active CHECK 0/1, UNIQUE(release_id,item_key))`.
- `mappings(id, control_id REFERENCES controls, control_version, item_id REFERENCES framework_items, scope, coverage CHECK partial/full/out_of_scope, rationale, reviewed_on, actor_id REFERENCES users, created_at, state CHECK active/replaced, supersedes_id NULLABLE REFERENCES mappings)`. Index unique partiel sur `(control_id,control_version,item_id) WHERE state='active'`.
- `audit_events(id, entity_type, entity_id, action, actor_id REFERENCES users, at_utc, before_json NULLABLE, after_json NULLABLE, reason NULLABLE)`. Interface sans édition/suppression ; action de correction ajoutée comme nouvel événement. Ne jamais inscrire hash de mot de passe, cookie, jeton ou secret dans les snapshots.
- `import_runs(id, plan_id REFERENCES plans, actor_id REFERENCES users, plan_version, state CHECK preview/applied/cancelled/expired, preview_json, created_at, expires_at, applied_at NULLABLE)` ; aperçu expire après 30 minutes, données importées supprimées à l'expiration.

Domaines fixes affichés : `Gouvernance`, `Identités et accès`, `Configuration et changements`, `Vulnérabilités`, `Sauvegardes et continuité`, `Journalisation`, `Protection des données`, `Tiers`, `Autre`. Le champ `domain` sépare `cyber` et `it`.

### Contrats API

Préfixe `/api`, JSON UTF-8, erreur `{ "error": { "code": string, "message": string, "fields"?: Record<string,string> } }`. Zod valide toutes les entrées ; réponses JSON ont des types partagés sous `src/shared/`. Les routes d'écriture requièrent une session, sauf l'installation initiale et le mode démo local.

| Méthode et route | Contrat/résultat |
| --- | --- |
| `GET /api/health` | `{status:"ok",version}` |
| `GET /api/session` | utilisateur courant ou `401` |
| `POST /api/setup` | crée l'administrateur si `users` est vide ; sinon `409` |
| `POST /api/session` | `{email,password}` ; cookie `HttpOnly; SameSite=Strict; Path=/`, TTL 7 jours |
| `DELETE /api/session` | invalide la session et efface le cookie |
| `GET /api/plans?year=YYYY` | plan ou `404` |
| `POST /api/plans` | `{year,name,perimeter}` ; `409` si année existante |
| `POST /api/plans/:id/clone` | `{targetYear}` ; clone définitions/mappings seulement |
| `GET /api/controls?planId=&q=&domain=&status=` | définitions filtrées |
| `POST /api/controls` | définition complète et fréquence ; crée version 1 et occurrences actives du plan |
| `GET /api/controls/:id` | définition courante, versions et occurrences |
| `PATCH /api/controls/:id` | `{expectedVersion,effectiveFrom,patch,previewHash?}` ; `409` si version ou preview périmée ; nouvelle version |
| `DELETE /api/controls/:id` | brouillon inutilisé uniquement ; sinon `409` |
| `POST /api/controls/:id/archive` | `{effectiveFrom,reason,openOccurrences:"keep"|"exclude"}` |
| `POST /api/controls/:id/schedule-preview` | `{expectedVersion,rule,effectiveFrom}` ; aperçu `{kept,superseded,added,previewHash}` sans mutation |
| `POST /api/controls/:id/schedule-apply` | `{rule,effectiveFrom,expectedVersion,previewHash,decisions}` ; recalcule le preview et son hash côté serveur ; erreur 409 si différence ; commit en transaction sinon |
| `PATCH /api/occurrences/:id/due-date` | `{expectedVersion,newDueDate,reason}` ; conserve date d'origine |
| `POST /api/occurrences/:id/realizations` | `{completedDate,result,comment,evidence[]}` ; une réalisation initiale |
| `PATCH /api/realizations/:id` | `{expectedRevision,completedDate,result,comment,reason}` ; ajoute révision |
| `POST /api/occurrences/:id/exclude` | `{reason}` obligatoire |
| `POST /api/findings/:id/close` | `{closureNote}` obligatoire ; ferme l'action sans modifier le résultat d'origine |
| `POST /api/realizations/:id/evidence` | multipart ou JSON lien ; taille limite 10 MiB |
| `DELETE /api/evidence/:id` | `{reason}` ; suppression logique auditée |
| `GET /api/frameworks` | versions de référentiels actives |
| `GET /api/mappings?planId=&releaseId=` | éléments avec couverture et contrôles liés |
| `PUT /api/mappings` | crée un lien/version ; schéma mapping défini ci-dessus |
| `DELETE /api/mappings/:id` | clôt le lien par événement, ne supprime aucune ligne |
| `POST /api/imports/preview` | multipart fichier, `planId`, feuille/date/separateur facultatifs ; retourne ID/écart ligne par ligne |
| `POST /api/imports/:id/apply` | `{expectedPlanVersion}` ; confirme le preview en transaction |
| `DELETE /api/imports/:id` | annule l'aperçu temporaire |
| `GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | plage civile inclusive de 1 à 366 jours, même si elle traverse deux plans ; résultats avec numérateurs/dénominateurs |
| `GET /api/exports/controls.csv?planId=` | export définitions et échéances filtrées |
| `GET /api/exports/report.html?planId=` | rapport imprimable |
| `GET /api/backup` | télécharge archive ZIP versionnée |
| `POST /api/backup/restore` | multipart ZIP, validation complète puis remplacement confirmé |
| `GET /api/users` / `POST /api/users` | admin : liste/crée `{email,displayName,password,role:"member"}` ; pas d'invitation email |
| `PATCH /api/users/:id` | admin active/désactive membre ou renouvelle son mot de passe |
| `GET /api/audit?entityType=&entityId=` | historique filtré, ordre chronologique |

Code HTTP : `400` format invalide, `401` session absente, `403` rôle insuffisant, `404` objet absent, `409` conflit version/règle, `413` taille dépassée, `422` import invalide, `500` erreur générique sans chemin local ni stacktrace.

## Arborescence cible

```text
CENTURION/
  package.json package-lock.json vite.config.ts tsconfig*.json components.json
  index.html README.md LICENSE .gitignore
  src/shared/{contracts.ts,dates.ts,schemas.ts}
  src/server/{app.ts,index.ts,auth.ts,config.ts}
  src/server/db/{database.ts,migrate.ts,migrations/001..006.sql}
  src/server/domain/{schedule,controls,realizations,mappings,imports,reports,backup}.ts
  src/server/routes/{auth,plans,controls,occurrences,realizations,evidence,frameworks,mappings,imports,reports,backup,users,audit}.ts
  src/server/storage/{evidence,archive}.ts
  src/server/seed/{demo.ts,frameworks.ts}
  src/client/{main.tsx,App.tsx,api.ts,router.tsx}
  src/client/pages/{Login,Setup,Dashboard,Plan,Control,Mapping,Import,Report,Settings}.tsx
  src/client/components/{AppShell,ControlForm,RealizationForm,OccurrenceTable,YearGrid,MappingTable,ImportPreview}.tsx
  src/components/ui/  (composants shadcn ajoutés par CLI uniquement)
  src/client/styles/global.css src/lib/utils.ts
  public/fonts/{Poppins-*.woff2,OFL.txt}
  data/demo/{seed.json,evidence/*.txt}
  examples/import/{centurion-controls.csv,centurion-controls.xlsx,invalid-controls.csv}
  scripts/{reset-demo.mjs,capture-demo.mjs}
  docs/{SETUP.md,USER-GUIDE.md,DATA-AND-PRIVACY.md}
  screenshots/{dashboard,annual-plan,control-detail,framework-mapping,import-preview}.png
```

Tests colocés sous `src/**/__tests__/*.test.ts(x)`. `data/instance/`, les sauvegardes, variables d'environnement, captures temporaires, `node_modules/` et `dist/` sont ignorés par Git. Aucun autre workspace du parent n'est inclus dans ce dépôt.

## Tâches d'exécution

Chaque étape ci-dessous est une action vérifiable. Toutes les commandes s'exécutent depuis `/mnt/c/Workspace/CENTURION`. Ajouter les scripts npm dès la tâche 1. Pas de commits avant que Git soit initialisé ; créer le dépôt local dans la tâche 1 et un commit à chaque jalon listé.

### 1. Initialiser dépôt, dépendances, style shadcn et serveur vide

**Fichiers :** configuration npm, Vite, TypeScript, shadcn, `.gitignore`, `LICENSE`, fichiers `health`, `app`, `index`, `main`, `AppShell`, `global.css`, `SETUP.md`, `public/fonts/`.

1. Créer le dépôt Git local, `.gitignore` et MIT `LICENSE`. Vérifier que `git status --short` ne contient que CENTURION.
2. Initialiser React + TypeScript Vite 8, Tailwind CSS v4 par `@tailwindcss/vite`, Fastify 5, TSX dev runner, concurrently, better-sqlite3, ExcelJS, Zod, cookie plugin, fflate, React Router et composants shadcn.
3. Fixer Vite dev `127.0.0.1:5173`, API dev `127.0.0.1:3333`, proxy Vite `/api` vers API ; serveur production sur `127.0.0.1:3333` sert `dist/client` et API.
4. Définir scripts exactement : `dev`, `dev:demo`, `dev:local`, `build`, `start`, `typecheck`, `test`, `test:ui`, `check`, `demo:reset`, `capture:demo`. `check` appelle typecheck et Vitest en run mode ; `build` build UI + API TypeScript.
5. Initialiser shadcn Vite + TypeScript avec style `base-nova`, icônes `lucide`, variables CSS ; ajouter Button, Card, Table, Badge, Input, Field, Select, Tabs, Sheet, Dialog, AlertDialog, Popover, Calendar, Skeleton, Empty uniquement après recherche dans le CLI.
6. Consulter `npx shadcn@latest docs <composants>` pour les composants réellement employés, puis vérifier structure générée et imports. La documentation shadcn confirme la prise en charge React 19/Tailwind 4 et ses variables sémantiques ([Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4), [theming](https://ui.shadcn.com/docs/theming)).
7. Écrire thème CSS exact : Poppins ; `--primary #451DC7`, `--deep #360058`, `--accent #04F06A`, `--background #FFFFFF`, `--foreground #111111`, `--muted #F7F5FC`, `--border #E5E0F0`, `--ring #451DC7`. Accent vert seulement avec texte sombre ; statuts sémantiques avec texte/icône et contraste lisible. Rayon cartes 8px, boutons `rounded-full`. Pas de dark mode.
8. Ajouter Poppins weights 300/400/500/600 et fichier OFL local ; pas de téléchargement de police runtime.
9. Écrire `createApp({dataDir,mode})`, `GET /api/health`, page shell et 404 route ; démarrage serveur avec validation env Zod.
10. Tests nommés : `health.test.ts` vérifie status et version ; `config.test.ts` vérifie refus host non-loopback et port invalide.
11. Vérifier `npm run check`, `npm run build`, `npm run dev:demo`, HTTP 200 sur `/` et réponse exacte `/api/health`; s'assurer que le listener n'est pas joignable sur l'adresse LAN.
12. Commit `chore: scaffold local CENTURION app`.

### 2. Base de données, migrations et comptes locaux

**Fichiers :** `src/server/db/database.ts`, `migrate.ts`, migrations `001-core.sql`, `src/server/auth.ts`, routes auth/users, pages Login/Setup, tests db/auth.

1. Implémenter connexion SQLite : `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`, migrations transactionnelles versionnées, fermeture propre au signal SIGINT/SIGTERM.
2. Créer tables users, sessions, plans, controls, control_versions, occurrences et audit_events selon le schéma gelé ; ajouter index sur année, plan/status, occurrences/date, événements/entité.
3. Faire échouer migration au démarrage avec message sans secret si integrity/version invalide ; ne jamais effacer la base existante.
4. Implémenter mot de passe avec `node:crypto.scrypt` (N=32768,r=8,p=1,keylen=64, sel aléatoire 16 octets), comparaison constant-time ; min 12 caractères, max 128.
5. Session : jeton aléatoire 32 octets, cookie HttpOnly/SameSite Strict/Path `/`/Max-Age 604800 ; HTTPS false uniquement car host loopback HTTP ; DB stocke SHA-256 du jeton, jamais le jeton. Rotation au login/logout.
6. Routes bootstrap/setup, login/logout/current, admin list/create/deactivate/reset password. L'administrateur ne peut pas se désactiver lui-même ni supprimer le dernier admin.
7. Middleware requiert session sur toute API métier ; admin requis pour users et restore ; mode demo autorise l'authentification par les identifiants seed documentés, mais n'active aucun endpoint reset HTTP.
8. Ajouter tests : migration crée les tables ; migration répétée idempotente ; FK invalide rejetée ; setup après premier utilisateur retourne 409 ; hash ne contient pas le mot de passe ; cookie absent retourne 401 ; membre reçoit 403 sur gestion users ; session expire après 7 jours.
9. `npm run check` + build ; vérifier qu'une seconde connexion SQLite voit les mêmes écritures.
10. Commit `feat: add local accounts and SQLite persistence`.

### 3. Année, plan et calcul des échéances

**Fichiers :** `src/shared/dates.ts`, `src/shared/schemas.ts`, `src/server/domain/schedule.ts`, `src/server/routes/plans.ts`, migration `002-plans-occurrences.sql`, tests calendrier/plans.

1. Représenter les dates civiles avec un schéma Zod strict `^\\d{4}-\\d{2}-\\d{2}$` plus aller-retour calendrier ; ne jamais construire `Date` depuis `YYYY-MM-DD` pour l'affichage.
2. Définir `ScheduleRule` exact :

```ts
type ScheduleRule =
 | { kind: "once"; date: LocalDate }
 | { kind: "interval"; unit: "day" | "week" | "month"; every: number; anchor: LocalDate }
 | { kind: "explicit"; dates: LocalDate[] };
```

`every` = entier `1..366`. `dates` triées et uniques, maximum 366.

3. Implémenter `generateOccurrenceDates(rule, activeFrom, activeTo, periodStart, periodEndExclusive)`. Intersection des deux périodes ; périodes de sortie bornées à 366 dates ; règle ponctuelle donne zéro/une date ; liste explicite filtre puis trie.
4. L'intervalle en jours/semaines utilise un index depuis l'ancre (`anchor + k × every × unit`), semaine = 7 jours ; ne saute pas une occurrence quand retard.
5. Intervalle en mois calcule chaque mois cible `anchorMonth + k×every`, puis jour `min(anchorDay,lastDay(targetMonth))`. Ne jamais chaîner le jour clampé précédent.
6. Plan unique par année, intervalle `[YYYY-01-01, (YYYY+1)-01-01)`. Créer occurrence unique par date ; sélectionner `active_from <= due <= active_to` si fin définie.
7. Implémenter preview immuable `{kept:[id/date],superseded:[id/date],added:[date]}` ; conserver une occurrence existante de même date ; ne jamais remplacer occurrence réalisée/exclue ou antérieure à la date d'effet.
8. Application preview exige hash/token retourné, version du contrôle inchangée et confirmation des dates remplacées ; effectuer event + mise à jour occurrences transactionnellement.
9. Route create/list plan, clone plan `source->targetYear` (2000..2100, année cible absente), planner. Clone définitions et mapping seulement ; nouvel ID partout ; garde les règles/ancre et génère dans la période cible.
10. Tests nommés : `validates_real_gregorian_dates`, `generates_monthly_from_original_anchor`, `clamps_jan31_to_feb28_then_restores_mar31`, `handles_feb29_in_non_leap_year`, `interval_week_means_seven_days`, `explicit_dates_are_sorted_and_unique`, `filters_dates_to_plan_period`, `late_completion_does_not_shift_next_due`, `preview_keeps_completed_and_same_dates`, `apply_supersedes_only_open_future_dates`, `stale_preview_returns_409`, `clone_copies_controls_without_realizations`.
11. `npm run check` + build ; test exemple du 31 mars/trimestre exactement conforme aux décisions 5–8.
12. Commit `feat: create annual plans and deterministic schedules`.

### 4. Contrôles versionnés, historique et archivage

**Fichiers :** `src/server/domain/controls.ts`, `src/server/domain/audit.ts`, route controls, migration `003-control-history.sql`, tests controls/audit.

1. `ControlInput` exact : code 1–24 chars `[A-Z0-9][A-Z0-9_-]*`, title 3–120, objective 0–1000, domain enum, category enum fermé, owner_name 0–120, method 0–2000, expected_evidence 0–1000, active_from, nullable active_to >= active_from, schedule.
2. `createControl(planId,input,actorId)` retourne contrôle version 1 et ses occurrences ; refuser code dupliqué plan avec 409.
3. `updateControl(id,{expectedVersion,patch},actorId)` refuse patch vide, incrémente version et stocke snapshot JSON avant/après transaction.
4. Changer seulement texte/owner crée version sans recalculer calendrier ; changer fréquence/active range impose le preview Task 3.
5. Archivage requiert `effectiveFrom` et motif min 8 chars ; confirmation `keep` conserve occurrences ouvertes sans nouvelles générations, `exclude` bascule les occurrences futures en excluded avec motif.
6. Suppression physique autorisée uniquement `status=draft`, jamais d'occurrence ni mapping ni réalisation ni événement métier associé ; sinon 409. UI demande confirmation avec code contrôle.
7. `audit_events` événements exacts : `plan.created`, `plan.cloned`, `control.created`, `control.updated`, `control.archived`, `control.deleted`, `schedule.changed`, `occurrence.due_date_changed`, `occurrence.excluded`, `realization.created`, `realization.corrected`, `finding.closed`, `evidence.added`, `evidence.removed`, `mapping.created`, `mapping.updated`, `mapping.removed`, `import.applied`, `user.created`, `user.deactivated`, `backup.restored`.
8. Tests : un changement écrit version et événement ensemble ; erreur rollback les deux ; doublon 409 ; version stale 409 sans écraser ; archive stoppe génération à la date d'effet ; brouillon utilisé ne peut être effacé ; impossible de muter audit event par API.
9. `npm run check` + build ; commit `feat: version controls and audit edits`.

### 5. Réalisation, anomalie et pièces justificatives

**Fichiers :** migration `004-realizations-evidence.sql`, `src/server/domain/realizations.ts`, `src/server/storage/evidence.ts`, routes réalisations/preuves, tests.

1. Une occurrence `open` passe à `completed` avec exactement une première réalisation ; `completed`/`excluded` refusent une deuxième création et renvoient 409.
2. `completedDate` peut précéder ou suivre `due_date`, mais pas le futur ; l'écart affiché est `max(0,completedDate-due_date)` jours civils.
3. Si `result=anomaly`, exiger titre d'anomalie 3–120 et action 3–1000 ; créer finding `open` même sans owner/échéance. Les autres résultats n'en créent pas.
4. Correction crée `realizations.revision + 1`, l'ancienne est conservée ; résultat courant = ligne avec aucun `supersedes_id` référençant son ID.
5. Ajouter fichier en streaming, plafond 10×1024×1024 octets, MIME basé sur extension autorisée ET détection signature minimale PDF/PNG/JPEG ; TXT/CSV UTF-8 ; sinon 422. Nom disque UUID + extension allowlist. Ne jamais extraire le chemin du client.
6. Upload stocké `data/instance/evidence/<UUID>.<ext>`, metadata en DB transactionnelle ; échec DB supprime fichier temporaire. Lire téléchargement après autorisation, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, sans chemin disque dans la réponse.
7. URL preuve doit être URL absolue HTTP ou HTTPS sans identifiant/mot de passe ; ne jamais la récupérer côté serveur.
8. Retrait preuve = tombstone, motif min 8 chars et event ; ne supprime pas fichier physique.
9. Tests : late completion, rejet futur, reject deuxième réalisation, correction append-only, finding atomique, taille+1 refusée, MIME mismatch, traversal filename, URL `file:` refusée, suppression logique, hash SHA-256 stable.
10. `npm run check` + build ; commit `feat: record results findings and local evidence`.

### 6. ISO/IEC 27001, ISAE 3402 et matrice

**Fichiers :** migration `005-frameworks-mappings.sql`, `src/server/domain/mappings.ts`, routes frameworks/mappings, `src/server/seed/frameworks.ts`, tests.

1. Seed version ISO affichée `ISO/IEC 27001:2022 + Amd 1:2024`, source ISO officielle. Inclure les identifiants `A.5.15`, `A.5.18`, `A.8.13`, `A.8.15`, `A.8.32` et titres rédactionnels CENTURION. Afficher sous le catalogue : « Références illustratives. Intitulés non normatifs ; importez votre catalogue sous licence. »
2. Seed `ISAE 3402 — objectifs illustratifs CENTURION`, `fictional=1`, trois items `SC-ACCESS`, `SC-CHANGE`, `SC-BACKUP` avec libellés originaux et avertissement visible que la norme ne fournit pas ce catalogue cyber.
3. Permettre l'ajout manuel de référentiel utilisateur : nom, édition, source, identifiant/libellé item, inactive/active ; archiver item au lieu de supprimer s'il est lié.
4. `PUT /api/mappings` crée nouvelle version du lien si coverage/scope/rationale changent ; uniqueness du lien courant contrôle-version/item. `none` est rendu par absence de lien, coverage=none interdit en write.
5. Scope obligatoire min 8 caractères ; rationale obligatoire min 12 chars ; `reviewed_on` date valide ; couverture full/partial/out_of_scope.
6. Retirer mapping ajoute event et clôt lien courant ; ne supprime aucune liaison historique.
7. Tests : many-to-many, scope/rationale obligatoires, historique conservé, mapping stale conflict, ISO seed non-normative, catalogue ISAE marqué fictif.
8. `npm run check` + build ; commit `feat: add versioned framework cross-mapping`.

### 7. Import CSV/XLSX transactionnel

**Fichiers :** migration `006-imports.sql`, `src/server/domain/imports.ts`, parsers CSV/XLSX, route imports, assistant React, trois exemples, tests.

1. Colonnes canoniques CSV/XLSX (une ligne = un contrôle) : `code,title,objective,domain,category,owner_name,method,expected_evidence,frequency_kind,frequency_unit,frequency_every,anchor_date,explicit_dates,active_from,active_to`.
2. Fournir template CSV conforme et XLSX 2 feuilles (`Contrôles`, `Instructions`) avec colonnes exactes et une ligne d'exemple fictive.
3. CSV : BOM facultatif ; détecter `,` ou `;` seulement si un séparateur domine l'en-tête ; sinon l'assistant propose ces deux options. Parser les cellules guillemetées et CRLF.
4. XLSX : sélectionner une feuille non vide ; utiliser les valeurs calculées uniquement pour cellule de date native ; rejeter toute cellule formule utilisée dans une colonne mappée avec erreur `FORMULA_CELL`.
5. Assistant 4 étapes : déposer fichier (max 5 MiB/10 000 lignes), choisir feuille/séparateur, associer colonnes (mapping auto par noms canoniques insensibles à casse/accents), inspecter aperçu.
6. Identité de ligne par `code`. Classification preview `create|update|unchanged|invalid`. Colonnes absentes vides deviennent validation selon champs requis ; ligne absente du fichier ne modifie ni n'archive aucun contrôle.
7. Si la même valeur code apparaît deux fois dans fichier, rendre les deux lignes `invalid DUPLICATE_CODE`. Si code existe mais contrôle utilisé, une mise à jour passe par version+preview fréquence et n'affecte aucune réalisation.
8. Dates texte ambiguës : choisir format `DD/MM/YYYY` ou `MM/DD/YYYY`; ISO et dates Excel acceptées sans préférence. Valeur impossible = erreur par cellule.
9. `import_runs.preview_json` expire en 30 minutes ; chaque aperçu retourne ID, plan_version et hash. Apply exige plan_version intact ; stale = 409, nouvelle preview demandée.
10. Si une ligne est invalide, l'interface peut confirmer les seules autres lignes valides après affirmation de case « Appliquer N lignes valides » ; invalides listées, jamais ignorées. Transaction all-or-nothing pour ces N lignes.
11. Annulation/expiration supprime `preview_json`. Historique d'import garde actor, nom du fichier, hash, nombres créés/mis à jour/ignorés/en erreur ; ne stocke pas la source brute.
12. Tests nommés : `parses_csv_bom_comma_and_semicolon`, `parses_quoted_csv_cells`, `reads_xlsx_selected_sheet`, `rejects_formula_cells`, `maps_accents_case_insensitively`, `flags_duplicate_codes`, `ambiguous_dates_require_format`, `missing_rows_do_not_archive`, `stale_preview_cannot_apply`, `invalid_rows_do_not_partially_write`, `valid_subset_applies_atomically`, `expires_import_preview_after_30_minutes`.
13. `npm run check` + build ; commit `feat: preview and apply control plan imports`.

### 8. Interface complète shadcn/Tailwind

**Fichiers :** pages, composants produit, API client, styles, tests UI ; référence visuelle générée depuis `DESIGN.md` avant implementation.

1. Générer une image de référence dashboard et une de matrice via imagegen. Les inspecter et annoter `docs/DESIGN-REFERENCE.md` avec les valeurs ajustées ; ne pas générer de logo/photographie Wavestone ni réutiliser leurs assets. L'identité et le layout produit restent propres à CENTURION.
2. Shell : navigation latérale compacte sur desktop : Synthèse, Plan annuel, Référentiels, Imports, Reporting ; bande haute année active, notifications remplacées par compteur échéances, utilisateur. Mobile : menu shadcn Sheet.
3. Dashboard : titre `Plan de sécurité · 2026`, 4 compteurs cliquables `En retard`, `Sous 30 jours`, `Réalisés`, `Anomalies ouvertes` ; tableau prochaines échéances 8 lignes triées date ascendante ; bloc `Rapprochements à revoir`.
4. Plan annuel : sélecteur d'année, bouton créer/cloner, filtre recherche/code/domaine/responsable/état, résumé 12 mois, Table colonnes code, contrôle, domaine, propriétaire, fréquence, prochaine échéance, état, référentiels. Filtres URL query.
5. Fiche contrôle : onglets `Définition`, `Échéances`, `Rapprochements`, `Historique` ; bouton résultat sur ligne occurrence ; état, résultat/anomalie et preuves.
6. Créer/éditer : Sheet desktop / Drawer mobile, Field shadcn ; règle fréquence sélection unit/every/ancre ou dates ; preview Schedule dialog obligatoire si date/effect futures modifiées.
7. Mapping : sélectionner release, rechercher item, lignes itemKey/titre rédactionnel/couverture/contrôles associés/dernière revue ; Sheet d'édition avec scope+rationale obligatoires. Ne pas rendre une grille 100 colonnes.
8. Import : étapes définies Task 7, tableau preview avec ancienne/nouvelle valeur et cellule invalidée ; boutons annuler/appliquer lignes valides ; progression et nombre sans indiquer de perte.
9. Reporting : période entière de l'année, tableau mensuel (prévu, réalisé, en retard, anomalies), couverture mapping ; cliquer une cellule ouvre liste occurrences filtrée ; résumé texte imprimable.
10. Responsive : breakpoints Tailwind, navigation clavier, titres unique `h1`, noms accessibles, focus visible, statut avec icône+texte ; table scroll dans conteneur ; 390px sans débordement document.
11. Aucun composant UI maison si shadcn couvre le rôle ; styles custom réservés au layout, au thème et aux détails visuels spécifiques. Ajouter `sonner` uniquement pour confirmations non bloquantes, pas pour erreurs de validation.
12. UI tests : auth/route guard, création contrôle et preview fréquence, réalisation anomalie crée finding, formulaire mapping valide obligatoire, import preview/cancel/apply, filtre dashboard, report détail drill-down.
13. Capturer revue locale 1440×1000 et 390×844 ; corriger les écarts de conception ; `npm run test:ui`, `npm run check`, `npm run build`.
14. Commit `feat: build annual security plan interface`.

### 9. Synthèse, exports et sauvegarde/restauration

**Fichiers :** domain reporting/backup, routes, `Settings`, templates HTML, tests.

1. Définir statut occurrence au jour `asOf`: `completed` si résultat existe ; `excluded` si exclusion ; `superseded` invisible par défaut ; sinon `open`, en retard uniquement si `due_date < asOf` (aujourd'hui reste à faire, pas en retard).
2. `GET /api/reports?from=&to=` accepte une plage inclusive de 1–366 dates civiles. Par défaut l'interface propose du 1er janvier au 31 décembre du plan sélectionné ; sélection libre permet un test Type 2 traversant deux années. Expose `occurrencesDue` = completed+open+excluded hors superseded, `completed`, `satisfactory`, `anomaly`, `inconclusive`, `openOverdue`, `excluded`, mapping denominator active/in-scope, mappedFull/mappedPartial/unmapped. Exclure les occurrences `excluded` du dénominateur de complétion. Chaque taux `{numerator,denominator,rate}` ; complétion `completed/(completed+open)`, satisfaction `satisfactory/completed`, couverture `(fullItems+partialItems)/inScopeItems`; taux null si dénominateur zéro. Un item multi-mappé est compté une seule fois.
3. Export CSV UTF-8 BOM ; neutraliser formule en préfixant apostrophe pour chaque cellule commençant après whitespace par `=`, `+`, `-`, `@`. Dates ISO, une ligne par occurrence, contrôler valeurs via code.
4. Rapport HTML en français avec période, périmètre, méthode de calcul, tableaux accessibles ; `window.print` donne format A4 paysage, footer pages/date, pas de graphiques externes.
5. Backup fichier `centurion-backup-<UTC>.zip`; contenu exact `manifest.json`, `database.sqlite`, `evidence/<storage_name>`. Manifest `formatVersion:1`, `appVersion`, `createdAt`, `sha256` par fichier. Exclure sessions et preview imports.
6. `fflate` decode avec rejet >100MiB décompressés, >1000 fichiers, entrées absolues/`..`/liens symboliques, chemins dupliqués, ratio >100 ; hash chaque fichier ; `PRAGMA integrity_check` = `ok`, migrations reconnues.
7. Restore vers staging sibling avec validations, alerter et confirmer exact `REMPLACER`; copier l'instance courante vers backup temporaire avant rename atomique ; rollback rename si remplacement échoue ; invalider sessions après restauration ; event backup.restored dans DB restaurée.
8. Tests : 0 denominator rate=null, anomalie rate separate, due today not overdue, CSV formula protection, export deterministic dates, zip path traversal, zip bomb limits, missing evidence, sha mismatch, schema ahead, DB integrity invalid, restore failure leaves existing DB intact, restore successful roundtrip retains audit+file bytes.
9. `npm run check` + build ; commit `feat: report annual controls and restore local backups`.

### 10. Démo, seed, captures et publication

**Fichiers :** seed, reset/capture scripts, README, docs, screenshots, LICENSE.

1. Mode démo, date de référence fixe `2026-07-01`, plan 2026 `Plan de sécurité — Société exemple (fictive)`, périmètre fictif visible. Cette date rend un contrôle trimestriel du 30 juin et une revue mensuelle du 10 juin réellement en retard.
2. Seed six controls exactly :
   - `IAM-001` revue droits admin trimestrielle, ancre 31-03, occurrence 31-03 réalisée le 03-04 résultat anomaly, finding open, suivante 30-06 overdue depuis un jour.
   - `BCP-002` test restauration mensuel ancre 15-01, occurrences janvier–juin satisfactory, prochaine 15-07 à venir.
   - `VUL-003` revue vulnérabilités mensuelle ancre 10-01, mai satisfactory, 10-06 open/overdue, prochaine 10-07 à venir.
   - `CHG-004` revue changements tous les 2 mois ancre 28-02, suivante 28-08 à venir.
   - `AWR-005` campagne de sensibilisation ponctuelle date 30-09 à venir.
   - `LOG-006` contrôle journalisation dates explicites 05-03/05-06/05-09/05-12 ; 05-06 inconclusive, action open, prochaine 05-09 à venir.
3. Associer liens ISO illustratifs full/partial/out-of-scope, un item sans mapping ; trois objectifs ISAE exemples ; six fichiers .txt synthétiques sans valeur de production.
4. Démo users `admin@centurion.local / Centurion-Demo-2026!` et `analyste@centurion.local / Analyse-Demo-2026!`, documenter qu'ils fonctionnent uniquement en `demo`. Mode `local` seed absent, écran premier administrateur.
5. `npm run demo:reset` refuse sans TTY et demande taper `RESET CENTURION DEMO`; option automation `--yes` autorisée seulement si `CENTURION_MODE=demo`; n'efface que `data/demo-instance`.
6. `scripts/capture-demo.mjs` lance `dev:demo` si port libre, attend /api/health max 30s, Playwright Chromium 1440×1000, connexion admin, capture Dashboard/Plan/Fiche/Mapping/Import dans `screenshots/`, ferme navigateur et processus qu'il a créé. Ne réinitialise pas la base sans appeler `demo:reset` séparément.
7. Configurer test e2e : login; créer contrôle; vérifier occurrences; poster réalisation anomaly avec un TXT fictif; mapping; importer fichier exemple et annuler puis le réimporter/appliquer; annual report montre anomalie; logout/login analyst et visibilité partagée; restaurer fixture backup; screenshot tests.
8. Capturer 5 écrans desktop; vérifier pixels/screenshot lisible, contenu en français, aucune modal ouverte, données fictives et absence overflow. Screens mobile contrôlés séparément sans être publiés si redondants.
9. `README.md` : pitch en 2 paragraphes, problèmes résolus, fonctions, capture hero, stack, prérequis Node/npm, `npm ci`, `npm run dev:demo`, comptes démo, `npm run dev:local`, import template, stockage local, restore, license, limites et lien Wavestone comme inspiration DA sans laisser penser affiliation.
10. `DATA-AND-PRIVACY.md` : paths, données seed, exclusions git, backup, URLs, hash ne certifie pas contenu, limites ISAE/ISO et absence de réseau/cloud.
11. `npm run check`, `npm run build`, scénario Playwright complet, test `npm ci` depuis lock propre, vérification `git status`; rechercher secrets, exemples réalistes sensibles, Aptos/fonts non licenciées, `.env`, fichiers SQLite, screenshots non fictifs.
12. Git remote configuré vers dépôt public `msafla/centurion` uniquement après création via connecteur GitHub disponible ; pousser branche `main` seulement après revue finale du diff public. Si repo distant indisponible, laisser les changements committés localement et donner instructions précises.
13. Commit final `docs: publish CENTURION demo and screenshots`.

## Matrice de couverture vérifiée

| Besoin utilisateur | Tâches | Preuve de fin |
| --- | --- | --- |
| Projet vitrine public, démo locale, screenshots | 1, 10 | clone/run sans cloud, 5 captures réelles, README |
| Contrôles cyber/IT créés/modifiés/archivés | 4, 8 | CRUD, version, historique, clone annuel |
| Fréquence/date ajustable, retard | 3, 4 | cas 31-03/15-04/30-06 + preview |
| Plan annuel et échéances | 3, 8 | plan civil, douze mois, overdue à J+1 |
| ISO/IEC 27001 et ISAE 3402 | 6, 8 | références illustratives, mappings justifiés |
| Import CSV/XLSX | 7 | preview, validation, atomicité, exemple |
| Réalisation et preuves | 5 | résultats, anomaly/finding, upload/link |
| Collaboration 1–2 personnes locale | 2 | comptes, sessions, writes partagées et auteur |
| Reporting/sauvegarde | 9 | dénominateurs visibles, CSV, rapport, backup roundtrip |
| DA proche de Wavestone, shadcn/Tailwind | 1, 8 | tokens relevés, image guide, interface shadcn |

## Note d'exécution

Cette version ferme les choix importants : utilisateur/local, versions, formats,
fréquences, dates, statuts, tableau, routes, schéma, seed et livrables. Si une
contradiction avec le code installé ou un comportement impossible apparaît,
l'exécution s'arrête à la tâche concernée et actualise ce plan avec une décision
et une preuve ; elle ne masque pas le changement derrière une improvisation.

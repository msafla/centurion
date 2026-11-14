# CENTURION — plan MVP consolidé

> **Pour les agents d'exécution :** suivre les tâches dans l'ordre et ne pas déplacer un contrôle de sécurité vers une phase ultérieure. Ce document est l'autorité fonctionnelle, métier, sécurité et de périmètre pour le MVP. `DESIGN.md` est l'autorité visuelle et UX. En cas de conflit, le présent plan prévaut pour le comportement métier et la sécurité ; `DESIGN.md` prévaut pour la direction artistique.

## 1. Objectif

CENTURION est une application locale de suivi d'un plan annuel de contrôles cyber/IT pour une seule organisation et un seul utilisateur local.

Le MVP permet :

- de créer et maintenir des contrôles avec **code**, **titre**, **référentiel**, **référence**, **description**, **domaine**, **responsable**, **méthode**, **preuve attendue**, **automatisation**, **lien GitHub éventuel** et **fréquence** ;
- de générer automatiquement les occurrences du plan annuel ;
- de suivre chaque occurrence sur une ligne ;
- de renseigner **FAIT** et **CONFORMITÉ** ;
- d'ajouter un commentaire et une **référence de preuve effectivement obtenue** ;
- de filtrer, synthétiser, importer, exporter et auditer les changements ;
- de sauvegarder et restaurer la base locale ;
- d'exposer un sous-ensemble strictement maîtrisé des fonctions à un client IA via un serveur **MCP stdio** sécurisé.

Le MVP ne gère pas plusieurs utilisateurs, plusieurs organisations, des comptes, des sessions ou du SSO.

## 2. Architecture figée

- Frontend : React + Vite + TypeScript.
- UI : shadcn/ui + Tailwind CSS v4.
- Backend : Fastify en TypeScript.
- Base : SQLite locale, WAL activé.
- API : REST JSON UTF-8 sous `/api`.
- Production locale : Fastify sert également le frontend compilé afin que l'UI et l'API soient **same-origin**.
- Réseau : écoute sur `127.0.0.1` uniquement.
- MCP : SDK MCP TypeScript v2, transport **stdio uniquement**.
- Exports : CSV UTF-8 BOM et PDF pdfcn/Takumi.
- Police : Poppins intégrée localement selon `DESIGN.md`, aucun chargement CDN au runtime.
- Aucun appel réseau sortant nécessaire au fonctionnement de CENTURION.
- Aucune télémétrie.

Toute logique métier appartient au backend/API. L'interface web consomme les routes REST et le serveur MCP appelle ces mêmes routes en process via Fastify `app.inject()`. Les schémas Zod sont partagés ; aucune règle métier ne doit être réimplémentée indépendamment dans l'UI ou le MCP.

## 3. Autorité de `DESIGN.md` et résolution des ambiguïtés

L'agent doit lire `DESIGN.md` **avant toute maquette ou implémentation UI**.

`DESIGN.md` est la source de vérité pour :

- palette ;
- typographie Poppins ;
- densité, espacements et rayons ;
- boutons en pilule ;
- composition des pages ;
- usage de shadcn/ui ;
- responsive ;
- transitions et `prefers-reduced-motion` ;
- rendu visuel général CENTURION.

Le présent plan reste prioritaire pour le périmètre fonctionnel. Les termes de `DESIGN.md` suivants sont interprétés ainsi pour le MVP :

- **« échéances »** = **prochaines occurrences** ; aucune notion de retard, de SLA ou de contrôle en retard n'est introduite ;
- **« profil »** = **Paramètres locaux** ; aucun compte utilisateur ni profil d'identité ;
- **« Référentiels / matrice »** = vue agrégée par référentiel et contrôles ; la matrice détaillée clause ↔ contrôle reste hors MVP ;
- aucune photographie, illustration, logo ou asset Wavestone n'est repris ; seule la direction artistique décrite dans `DESIGN.md` sert de référence ;
- aucune ressource Wavestone n'est chargée au runtime.

Avant l'implémentation complète de l'interface, produire les maquettes demandées par `DESIGN.md`, puis implémenter à partir de ces maquettes.

## 4. Modèle de menace MVP

CENTURION est une application locale mono-utilisateur. L'absence de login est un **choix de périmètre**, pas un mécanisme de sécurité.

### Menaces prises en compte

- entrées API malformées ou hostiles ;
- injection SQL ;
- mass assignment ;
- accès à un objet via un mauvais plan/contrôle ;
- requêtes navigateur cross-site vers l'API localhost ;
- DNS rebinding / `Host` inattendu ;
- XSS et contenu utilisateur interprété ;
- CSV/Excel formula injection à l'export ;
- fichiers d'import malveillants ou surdimensionnés ;
- zip bomb XLSX ;
- path traversal ;
- dépendances compromises ou non maîtrisées ;
- perte/corruption de la base ;
- actions erronées ou excessives via un client IA/MCP ;
- prompt injection indirecte via des données CENTURION renvoyées à un LLM ;
- boucles ou fan-out excessifs de calls MCP ;
- exfiltration accidentelle par rendu ou fetch automatique d'un contenu renvoyé par le MCP.

### Risques explicitement hors périmètre du MVP

- attaquant disposant déjà d'un accès administrateur/root au poste ;
- malware local pouvant lire la mémoire ou les fichiers du compte utilisateur ;
- compromission physique d'un disque non protégé par les mécanismes du système d'exploitation ;
- isolation entre utilisateurs applicatifs, puisqu'il n'existe qu'un utilisateur local.

La confidentialité au repos repose donc sur les protections du compte utilisateur et du disque de l'OS. CENTURION ne prétend pas fournir un chiffrement applicatif de la base dans le MVP.

## 5. Décisions MVP

1. **Pas de login.** Démarrage direct sur l'application. Aucune table `users` ou `sessions`.

2. **Premier démarrage déterministe.** Si aucune base n'existe, CENTURION crée automatiquement le schéma et un plan pour l'année civile courante `Europe/Paris`, nommé `Plan annuel YYYY`, sans écran de création de compte. Le nom et le périmètre peuvent ensuite être édités dans Paramètres.

3. **Un plan par année civile.** `plans.year` est unique. Aucune occurrence ne traverse deux plans.

4. **Référentiel par contrôle.** Valeurs :
   - `iso_27001` → `ISO 27001` ;
   - `isae_3402_t2` → `ISAE 3402 Type 2` ;
   - `iso_27001_isae_3402_t2` → `ISO 27001 + ISAE 3402 Type 2`.

5. **Référence libre.** Champ `reference`, ex. `A.5.15` ou `Objectif accès`.

6. **Domaine.** Champ texte normalisé et borné, pas d'enum cachée dépendante d'un ancien document. L'UI utilise un combobox suggérant les domaines déjà existants tout en permettant une nouvelle valeur.

7. **Automatisation.** Chaque contrôle possède :
   - `automated = Oui/Non` ;
   - `automation_github_url` nullable.

   Si `automated = Non`, `automation_github_url` doit être `NULL`. Si `automated = Oui`, le lien GitHub reste optionnel, car un contrôle peut être automatisé sans script interne. Lorsqu'il est renseigné, il doit être une URL HTTPS `https://github.com/...`. CENTURION **ne fetch jamais cette URL côté serveur**.

8. **Fréquences autorisées uniquement :** ponctuel, mensuel, trimestriel, semestriel, annuel, dates explicites.

9. **Une ligne par occurrence.** Un contrôle trimestriel génère jusqu'à quatre lignes dans le plan de l'année.

10. **Aucun retard automatique.** Les dates sont des repères et servent aux vues chronologiques. Aucune occurrence ne devient automatiquement « en retard ».

11. **Trois états d'occurrence :**
    - `open` : aucune réalisation n'a encore été enregistrée ; l'UI affiche `À renseigner` ;
    - `completed` : une réalisation existe, que `FAIT` soit Oui ou Non ;
    - `superseded` : ancienne occurrence conservée pour intégrité après changement de planning ou archivage.

12. **Deux statuts métier dans une réalisation :**
    - `FAIT` : Oui / Non ;
    - `CONFORMITÉ` : Conforme / Partiellement conforme / Non conforme / N/A.

13. **Règles de statut :**
    - `FAIT=Non` force `CONFORMITÉ=N/A` côté serveur ;
    - l'UI affiche alors `Non réalisé` ;
    - `FAIT=Non` force également `evidence_ref=NULL` ;
    - `FAIT=Oui` autorise les quatre valeurs de conformité ;
    - une occurrence `open` n'a aucune ligne dans `realizations`.

14. **Preuve attendue vs preuve obtenue.**
    - `controls.expected_evidence` décrit ce qui est attendu ;
    - `realizations.evidence_ref` contient une référence libre vers la preuve réellement obtenue : numéro de ticket, référence documentaire, chemin logique, lien interne, etc. CENTURION ne l'auto-linkifie pas et ne fetch rien à partir de cette valeur.

15. **Changement de fréquence.** Toute modification du planning passe par un aperçu serveur persistant et expirant, puis une application explicite. Les occurrences `completed` sont conservées. Les occurrences `open` futures remplacées deviennent `superseded`. Les occurrences `open` antérieures à la date d'effet restent inchangées.

16. **Archivage.** L'archivage ne supprime rien. Le contrôle passe à `archived`; ses occurrences `open` futures à partir de la date d'effet deviennent `superseded`. Les occurrences passées et toutes les réalisations restent consultables. Un contrôle archivé n'est pas cloné dans l'année suivante.

17. **Pas de suppression destructive de contrôle dans le MVP.** Aucune route `DELETE /controls`.

18. **Duplication d'un contrôle.** La duplication copie la définition, mais exige un nouveau `code`, crée un nouvel UUID et régénère les occurrences ; aucune réalisation ou audit de l'original n'est copié.

19. **Création de l'année suivante.** Le bouton `Créer l'année suivante` :
    - clone uniquement les contrôles `active` ;
    - ne clone jamais réalisations, occurrences, audits ou previews ;
    - régénère les occurrences ;
    - translate les dates de définition vers la nouvelle année en conservant mois/jour ; un 29/02 vers une année non bissextile devient 28/02 ;
    - translate de la même manière les dates explicites ;
    - conserve les métadonnées, `automated` et `automation_github_url`.

20. **Import.** Upsert par `code`. Code connu → mise à jour ; inconnu → création ; ligne absente → ignorée. Aucun import ne supprime ou n'archive implicitement un contrôle.

21. **Valeurs importées canoniques.** Les chaînes importées sont stockées telles qu'elles ont été validées/normalisées, sans préfixe d'apostrophe ajouté pour Excel. Les cellules XLSX de type formule sont refusées. La neutralisation de formules est effectuée **uniquement lors des exports CSV**.

22. **Backup/restore inclus dans le MVP.** Les sauvegardes sont cohérentes SQLite, stockées dans le `dataDir`, vérifiées et restaurables depuis l'UI. Aucune restauration par chemin arbitraire fourni par le client.

23. **Historique.** Historique via `audit_events` avant/après ; pas de table de versions métier et pas de verrou optimiste général. Les écritures en concurrence suivent le principe last-write-wins hors opérations à aperçu, avec WAL et `busy_timeout`.

24. **Tests explicites et verbeux obligatoires**, en priorité sur calendrier, intégrité, import, sauvegarde et sécurité MCP.

## 6. `dataDir` et fichiers locaux

Résolution :

1. si `CENTURION_DATA_DIR` est défini, utiliser ce chemin après résolution canonique ;
2. sinon utiliser un répertoire privé du compte utilisateur :
   - Windows : `%LOCALAPPDATA%/Centurion/` ;
   - Linux : `${XDG_DATA_HOME:-~/.local/share}/centurion/` ;
   - macOS : `~/Library/Application Support/Centurion/`.

Sous-répertoires :

```text
<dataDir>/
  centurion.sqlite
  backups/
  imports/
  exports/
```

Pour `dev:demo` uniquement, le projet peut utiliser `./data/demo/`.

Règles :

- aucun nom de fichier contrôlé par l'utilisateur n'est utilisé comme chemin ;
- noms physiques générés par UUID ;
- chemins résolus et vérifiés sous `dataDir` avant toute écriture ;
- aucune écriture arbitraire hors `dataDir` par API ou MCP ;
- POSIX : répertoires `0700`, fichiers sensibles `0600` lorsque supporté ;
- Windows : utiliser un emplacement sous le profil utilisateur et ne pas placer la base dans un répertoire partagé/public ;
- `.gitignore` exclut toutes les données d'instance, backups, imports temporaires et exports locaux.

## 7. Modèle de données SQLite

Toutes les clés primaires applicatives sont des UUID v4 générés par le serveur. Les UUID réduisent la prédictibilité des identifiants ; **l'isolation des objets est garantie par le scoping relationnel côté serveur, pas par l'UUID lui-même**.

Dates civiles : texte `YYYY-MM-DD`. Instants techniques : ISO 8601 UTC.

### `plans`

```text
plans(
  id,
  year UNIQUE,
  name,
  perimeter,
  created_at,
  updated_at
)
```

### `controls`

```text
controls(
  id,
  plan_id REFERENCES plans(id) ON DELETE RESTRICT,
  code,
  title,
  description,
  referentiel,
  reference,
  domain,
  owner_name,
  method,
  expected_evidence,
  automated CHECK 0/1,
  automation_github_url NULLABLE,
  frequency_kind,
  anchor_date NULLABLE,
  explicit_dates_json NULLABLE,
  active_from NULLABLE,
  active_to NULLABLE,
  status CHECK active/archived,
  created_at,
  updated_at,
  UNIQUE(plan_id, code)
)
```

Contraintes :

- `referentiel` fermé aux trois valeurs prévues ;
- `frequency_kind` fermé à `once/monthly/quarterly/semiannual/annual/explicit` ;
- `automated=0` ⇒ `automation_github_url IS NULL` ;
- `active_to >= active_from` lorsqu'elles sont toutes deux présentes.

### `occurrences`

```text
occurrences(
  id,
  control_id REFERENCES controls(id) ON DELETE RESTRICT,
  occurrence_date,
  state CHECK open/completed/superseded,
  created_at,
  updated_at
)
```

Créer séparément le partial unique index :

```sql
CREATE UNIQUE INDEX ...
ON occurrences(control_id, occurrence_date)
WHERE state IN ('open', 'completed');
```

### `realizations`

```text
realizations(
  id,
  occurrence_id UNIQUE REFERENCES occurrences(id) ON DELETE RESTRICT,
  completed_date,
  fait CHECK 0/1,
  conformite CHECK conforme/partiellement_conforme/non_conforme/non_applicable,
  comment,
  evidence_ref NULLABLE,
  created_at,
  updated_at
)
```

### `schedule_previews`

```text
schedule_previews(
  id,
  plan_id,
  control_id,
  base_control_updated_at,
  requested_schedule_json,
  preview_json,
  expires_at,
  consumed_at NULLABLE,
  created_at
)
```

Le client ne renvoie jamais le contenu métier de l'aperçu pour application ; il renvoie uniquement son `preview_id`. Le serveur applique les données immuables stockées et vérifie `base_control_updated_at`, l'expiration et `consumed_at`.

### `import_runs`

```text
import_runs(
  id,
  plan_id,
  stored_file_id,
  original_filename,
  normalized_preview_json,
  source_hash_sha256,
  status CHECK preview/applied/cancelled/expired,
  expires_at,
  created_at,
  applied_at NULLABLE
)
```

Le fichier physique porte un nom UUID sous `<dataDir>/imports/`. Il est supprimé après application, annulation ou expiration.

### `backups`

```text
backups(
  id,
  stored_file_id UNIQUE,
  reason CHECK manual/pre_import/pre_schedule_change/pre_restore,
  sha256,
  size_bytes,
  schema_version,
  created_at
)
```

### `audit_events`

```text
audit_events(
  id,
  entity_type,
  entity_id,
  action,
  at_utc,
  before_json,
  after_json,
  source CHECK api/mcp/import/system
)
```

- pas de `actor_id` dans le MVP ;
- aucun secret ;
- snapshots bornés ;
- `audit_events` est append-only dans la base courante ;
- triggers SQLite interdisent `UPDATE` et `DELETE` sur `audit_events` ;
- une restauration de backup peut naturellement revenir à un état plus ancien : un backup automatique `pre_restore` est donc créé avant toute restauration, puis un nouvel événement `restore_completed` est écrit dans la base restaurée.

## 8. Fréquences et calendrier

Le schéma API est un discriminated union Zod. Aucune combinaison ambiguë n'est acceptée.

### Ponctuel

```json
{ "kind": "once", "date": "YYYY-MM-DD" }
```

Une occurrence si la date appartient à l'année du plan et à la fenêtre d'activité.

### Mensuel

```json
{ "kind": "monthly", "anchorDate": "YYYY-MM-DD" }
```

Une occurrence par mois à partir du mois d'ancrage, limitée à l'année du plan et à la fenêtre d'activité.

Ancre jour 31 : clamp au dernier jour d'un mois court puis retour au jour 31 dès que possible.

### Trimestriel

```json
{ "kind": "quarterly", "anchorDate": "YYYY-MM-DD" }
```

Tous les 3 mois à partir du mois/jour d'ancrage.

### Semestriel

```json
{ "kind": "semiannual", "anchorDate": "YYYY-MM-DD" }
```

Tous les 6 mois.

### Annuel

```json
{ "kind": "annual", "anchorDate": "YYYY-MM-DD" }
```

Une occurrence annuelle à la date ancrée.

### Dates explicites

```json
{ "kind": "explicit", "dates": ["YYYY-MM-DD", "..."] }
```

- triées côté serveur ;
- dédupliquées ;
- toutes dans l'année du plan ;
- maximum 366 dates.

### Invariants calendrier

- aucune construction `new Date('YYYY-MM-DD')` pour la logique civile ou l'affichage ;
- utiliser des helpers de date civile testés ;
- l'horloge courante `Europe/Paris` est injectée/testable ;
- un retard de saisie ne décale jamais l'occurrence suivante ;
- les occurrences hors `active_from/active_to` ne sont pas générées ;
- maximum **100 000 occurrences actives** par plan ; tout import ou changement qui dépasserait ce plafond est refusé avant écriture.

Tests déterministes : utiliser explicitement une année bissextile, par exemple **2028**, pour vérifier le 29 février.

## 9. API REST

Toutes les entrées sont validées par Zod `.strict()`. Erreur standard :

```json
{ "error": { "code": "...", "message": "...", "fields": {} } }
```

Codes utilisés : `400`, `403`, `404`, `409`, `413`, `415`, `422`, `429`, `500`.

### Santé et plans

```text
GET  /api/health
GET  /api/plans
POST /api/plans
GET  /api/plans/:planId
PATCH /api/plans/:planId
POST /api/plans/:planId/clone
```

Aucune route de suppression de plan dans le MVP.

### Contrôles

```text
GET  /api/plans/:planId/controls
POST /api/plans/:planId/controls
GET  /api/plans/:planId/controls/:controlId
PATCH /api/plans/:planId/controls/:controlId
POST /api/plans/:planId/controls/:controlId/duplicate
POST /api/plans/:planId/controls/:controlId/archive
POST /api/plans/:planId/controls/:controlId/schedule-preview
POST /api/plans/:planId/controls/:controlId/schedule-apply
GET  /api/plans/:planId/controls/:controlId/audit-events
```

Le `PATCH` générique ne modifie pas les champs de fréquence ; toute modification du planning passe par `schedule-preview` puis `schedule-apply`.

### Occurrences et réalisations

```text
GET /api/plans/:planId/occurrences
PUT /api/plans/:planId/occurrences/:occurrenceId/status
```

Filtres : référentiel, domaine, automatisation, FAIT, conformité, état, plage de dates, recherche, pagination.

### Synthèse / reporting / exports

```text
GET /api/plans/:planId/summary
GET /api/plans/:planId/report
GET /api/plans/:planId/exports/controls.csv
GET /api/plans/:planId/exports/report.pdf
```

- `/summary` = métriques JSON ;
- `/report` = modèle JSON canonique utilisé pour le reporting et le PDF ;
- `/exports/report.pdf` = octets PDF ;
- le frontend **ne génère pas un second PDF différent**.

### Imports

```text
POST   /api/plans/:planId/imports/preview
POST   /api/plans/:planId/imports/:importId/apply
DELETE /api/plans/:planId/imports/:importId
```

Le `DELETE` d'un import annule uniquement un import temporaire et supprime son fichier temporaire ; il ne supprime aucune donnée métier.

### Backups

```text
GET  /api/backups
POST /api/backups
POST /api/backups/:backupId/restore-preview
POST /api/backups/:backupId/restore
```

La restauration utilise un `preview_id` expirant créé par `restore-preview`. Le client ne fournit jamais de chemin local.

## 10. Validation et bornes communes

Valeurs recommandées :

- `code` : regex `[A-Z0-9][A-Z0-9_-]*`, 1–24 ;
- `title` : 1–160 ;
- `description` : 1–4000 ;
- `reference` : 1–160 ;
- `domain` : 1–80 ;
- `owner_name` : 0–120 ;
- `method` : 0–2000 ;
- `expected_evidence` : 0–2000 ;
- `automation_github_url` : max 500, HTTPS, hôte exact `github.com` ;
- `comment` : 0–4000 ;
- `evidence_ref` : 0–1000 ;
- `plan.name` : 1–160 ;
- `plan.perimeter` : 0–1000 ;
- recherche : max 200 ;
- pagination : `1..100` éléments par page ;
- caractères de contrôle interdits dans les entrées texte, sauf tabulation/nouvelle ligne dans les champs multiligne où elles sont explicitement autorisées.

`id`, `plan_id`, `control_id`, `created_at`, `updated_at`, `state` technique et autres champs serveur ne sont jamais mass-assignables.

## 11. Invariants de sécurité HTTP/API

### 11.1 Scoping objet

Chaque accès métier est scopé par les relations parentes :

```text
planId -> controlId -> occurrenceId
```

Une ressource qui n'appartient pas au parent demandé renvoie `404` sans fuite d'existence.

### 11.2 SQL et transactions

- requêtes préparées uniquement ;
- aucune concaténation SQL d'entrée utilisateur ;
- `PRAGMA foreign_keys=ON` ;
- WAL ;
- `busy_timeout` configuré ;
- mutations multi-étapes dans des transactions ;
- imports et changements de planning all-or-nothing.

### 11.3 Défense localhost / navigateur

- bind `127.0.0.1` ;
- `trustProxy=false` ;
- allowlist stricte du `Host` attendu ;
- production : UI + API same-origin ;
- CORS désactivé par défaut ;
- développement : si séparation Vite/API nécessaire, allowlist exacte de l'origine locale de dev, jamais `*` ;
- mutations JSON acceptent uniquement `Content-Type: application/json` ;
- imports acceptent uniquement le type multipart attendu ;
- lorsque l'en-tête `Origin` est présent sur une mutation réseau, il doit correspondre à l'origine CENTURION ;
- si `Sec-Fetch-Site: cross-site`, refuser la mutation ;
- les appels internes MCP via `app.inject()` ne dépendent pas d'une décision du modèle pour contourner ces contrôles.

### 11.4 En-têtes

Au minimum :

- `X-Content-Type-Options: nosniff` ;
- `Referrer-Policy: no-referrer` ;
- `X-Frame-Options: DENY` ;
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` ;
- CSP avec `default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, `font-src 'self'`, `img-src 'self' data:`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'self'` ;
- `Cache-Control: no-store` sur réponses API contenant des données métier et téléchargements sensibles.

Ne relâcher `style-src` que si techniquement requis par la stack ; ne jamais autoriser `unsafe-eval`.

### 11.5 Erreurs et logs

- aucune stacktrace ou chemin local dans les réponses ;
- log technique minimal ;
- ne jamais journaliser le contenu complet d'un import, d'un commentaire ou d'une preuve par défaut ;
- pas de secret dans `audit_events` ;
- identifiant de requête/corrélation possible dans les logs sans inclure de donnée sensible.

### 11.6 Dépendances / supply chain

- versions de dépendances exactes ;
- `package-lock.json` versionné ;
- `npm ci` obligatoire ;
- `npm audit --omit=dev --audit-level=high` dans le contrôle de sécurité ;
- aucune installation dynamique au runtime ;
- éviter `npx ...@latest` dans les scripts reproductibles ;
- composants shadcn/pdfcn générés ou importés une fois, revus et commités ;
- aucune dépendance suggérée par l'agent n'est ajoutée sans vérifier qu'elle existe réellement, qu'elle est maintenue et qu'elle est nécessaire.

## 12. Synthèse et métriques

Sur le jeu filtré, en excluant par défaut les occurrences `superseded` :

- **Total occurrences** = `open + completed` ;
- **À renseigner** = `state=open` ;
- **Réalisés** = `state=completed AND fait=true` ;
- **Non réalisés** = `state=completed AND fait=false` ;
- **Conformes** = `fait=true AND conformite=conforme` ;
- **Partiellement conformes** = `fait=true AND conformite=partiellement_conforme` ;
- **Non conformes** = `fait=true AND conformite=non_conforme` ;
- **N/A** = `fait=true AND conformite=non_applicable` ; un `FAIT=Non` n'est pas compté une seconde fois dans N/A ;
- **Taux de réalisation** = `FAIT=Oui / total occurrences` ;
- **Taux de conformité** = `Conforme / occurrences avec FAIT=Oui et conformité différente de N/A` ; si le dénominateur est 0, afficher `—` ;
- **Automatisation** = nombre de contrôles actifs automatisés / nombre de contrôles actifs dans le périmètre filtré.

Ventilation possible par référentiel et domaine.

## 13. Tâches

### 1. Socle applicatif, design et durcissement serveur

Créer le dépôt local : `.gitignore`, licence MIT, Vite/React/TS, Tailwind v4, shadcn/ui, Fastify.

Scripts :

```text
npm run dev
npm run dev:demo
npm run build
npm run start
npm run check
npm run demo:reset
npm run mcp
```

Exigences :

- lire `DESIGN.md` avant l'UI ;
- configurer les tokens CENTURION de `DESIGN.md` ;
- intégrer Poppins localement et sa licence OFL ;
- aucun asset CDN au runtime ;
- production Fastify sert `dist/` et `/api` sur la même origine ;
- bind `127.0.0.1` ;
- host allowlist ;
- `trustProxy=false` ;
- `bodyLimit` global raisonnable, surcharge contrôlée uniquement pour l'import ;
- `x-powered-by` absent ;
- handler d'erreurs centralisé ;
- 404 et 405 explicites ;
- headers de sécurité section 11.

Tests :

- `rejects_non_loopback_host` ;
- `rejects_untrusted_origin_on_mutation` ;
- `rejects_cross_site_fetch_metadata` ;
- `rejects_wrong_content_type` ;
- `error_response_hides_stack_and_paths` ;
- `oversized_body_rejected` ;
- `method_not_allowed_405` ;
- `security_headers_present`.

**Preuve :** `npm ci && npm run dev:demo` ouvre le shell ; `GET /api/health` retourne `200` ; le listener n'est pas joignable via l'IP LAN ; `npm run check` passe.

### 2. Base SQLite, migrations, bootstrap et audit append-only

Créer `database.ts` :

- `foreign_keys=ON` ;
- WAL ;
- `busy_timeout` ;
- migrations transactionnelles idempotentes ;
- tables et index du modèle ci-dessus ;
- triggers interdisant update/delete d'`audit_events` ;
- helpers d'accès scopés : `controlInPlan`, `occurrenceInPlan`, etc.

Au premier démarrage, créer automatiquement le plan de l'année courante si aucun plan n'existe.

Tests :

- `migration_idempotent` ;
- `foreign_keys_enabled` ;
- `sql_injection_payload_is_data` ;
- `cross_plan_control_access_denied` ;
- `partial_unique_occurrence_index_enforced` ;
- `audit_events_append_only` ;
- `audit_snapshot_has_no_secret` ;
- `first_run_creates_current_year_plan`.

**Preuve :** deux connexions voient les mêmes données ; un contrôle du plan A n'est pas accessible via le plan B ; update/delete direct d'un audit est refusé.

### 3. Création d'un contrôle et génération du calendrier

Formulaire :

- code ;
- titre ;
- référentiel ;
- référence ;
- description ;
- domaine ;
- responsable ;
- méthode ;
- preuve attendue ;
- automatisation Oui/Non ;
- lien GitHub si pertinent ;
- fréquence ;
- dates d'activité.

À l'enregistrement : générer les occurrences et afficher un résumé, ex. `4 occurrences : 31/03, 30/06, 30/09, 31/12`.

Le serveur applique le discriminated union de la section 8.

Changement de planning :

1. `schedule-preview` calcule et stocke l'aperçu ;
2. expiration 15 min ;
3. l'UI montre dates ajoutées / conservées / superseded ;
4. `schedule-apply` ne reçoit que `preview_id` ;
5. rejet si contrôle modifié depuis l'aperçu ;
6. backup automatique `pre_schedule_change` si l'application modifiera plusieurs occurrences ;
7. transaction atomique.

Tests :

- `rejects_unknown_fields` ;
- `invalid_date_rejected` ;
- `control_create_scoped_to_plan` ;
- `automation_url_requires_automated_true` ;
- `automation_url_requires_github_https` ;
- `github_url_is_never_fetched` ;
- `schedule_apply_rejects_stale_preview` ;
- `schedule_apply_rejects_expired_preview` ;
- `quarterly_anchor_31_03_gives_four_dates` ;
- `monthly_anchor_31_01_2028_gives_29_02_then_restores_31` ;
- `february_29_clones_to_february_28_in_non_leap_year` ;
- `explicit_dates_sorted_and_unique` ;
- `frequency_change_keeps_completed_supersedes_open_future` ;
- `plan_occurrence_cap_enforced`.

**Preuve :** création complète, dates correctes, aperçu lisible, application atomique et tests verts.

### 4. Édition, duplication, archivage et historique

`PATCH` autorise uniquement les métadonnées non liées au planning. `id`, `plan_id`, `code`, `created_at` et champs techniques sont immuables via cette route.

Le `code` ne change pas après création dans le MVP.

Duplication : requiert un nouveau code ; copie la définition et régénère le calendrier.

Archivage : confirmation UI obligatoire ; contrôle `active -> archived` ; futures occurrences ouvertes deviennent `superseded` ; journalisation avant/après.

Historique : endpoint paginé par contrôle, affiché dans l'onglet Historique.

Tests :

- `patch_cannot_change_id_plan_or_code` ;
- `patch_cannot_change_schedule_fields` ;
- `duplicate_requires_unique_code` ;
- `duplicate_does_not_copy_realizations` ;
- `archive_supersedes_future_open_occurrences` ;
- `archive_keeps_completed_occurrences` ;
- `audit_event_on_write` ;
- `audit_history_scoped_to_control_and_plan`.

**Preuve :** édition, duplication et archivage sont visibles dans l'audit ; aucune suppression destructive.

### 5. Réalisation : FAIT / CONFORMITÉ / preuve obtenue

Par occurrence :

- FAIT Oui/Non ;
- CONFORMITÉ ;
- commentaire ;
- date de réalisation ;
- `evidence_ref`.

Règles serveur :

- absence de réalisation = occurrence `open` ;
- première saisie = upsert réalisation + occurrence `completed` ;
- `fait=false` ⇒ `conformite=non_applicable` et `evidence_ref=NULL` ;
- correction = mise à jour de la même réalisation + audit avant/après ;
- aucune suppression de réalisation dans le MVP.

Tests :

- `status_on_foreign_occurrence_denied` ;
- `rejects_unknown_fields` ;
- `invalid_uuid_returns_404` ;
- `fait_false_forces_non_applicable` ;
- `fait_false_clears_evidence_ref` ;
- `fait_true_allows_four_conformite_values` ;
- `open_occurrence_has_no_realization` ;
- `status_write_marks_occurrence_completed` ;
- `correction_writes_audit_before_after`.

**Preuve :** distinction claire `À renseigner` / `Non réalisé` / `Réalisé`, preuve obtenue visible, correction auditée.

### 6. Interface de suivi conforme à `DESIGN.md`

Avant implémentation : maquette de l'écran principal et de la vue Référentiels demandées par `DESIGN.md`.

Navigation MVP :

- CENTURION / accueil ;
- Synthèse ;
- Plan annuel ;
- Référentiels ;
- Reporting ;
- Import ;
- Paramètres.

Aucun « profil » utilisateur.

#### Accueil / Synthèse

- chiffres issus de l'API ;
- taux définis section 12 ;
- prochaines occurrences, jamais « en retard » ;
- indicateur d'automatisation ;
- ventilation référentiels.

#### Plan annuel

Une ligne par occurrence. Colonnes minimales :

- Référentiel ;
- Référence ;
- Code / contrôle ;
- Description ;
- Fréquence ;
- Automatisation ;
- Date ;
- FAIT ;
- CONFORMITÉ.

Le lien GitHub n'est pas affiché en URL brute dans toutes les lignes : lorsqu'il existe, la colonne Automatisation propose une action accessible `Voir le script`.

Filtres : référentiel, domaine, automatisation, FAIT, conformité, état, date, recherche.

Table large : scroll horizontal dans sa propre zone sur petit écran, indications visibles conformément à `DESIGN.md`.

#### Fiche contrôle

Onglets :

- Définition ;
- Calendrier ;
- Réalisations ;
- Historique.

Afficher clairement preuve attendue, automatisation et lien GitHub éventuel.

#### Référentiels

Vue agrégée par référentiel et contrôles. Pas de mapping clause-à-clause dans le MVP.

#### Reporting

Aperçu synthèse + exports CSV/PDF appliquant les filtres actifs.

#### Paramètres

- nom/périmètre du plan ;
- backups ;
- informations de stockage local ;
- pas de compte/session.

Sécurité UI :

- échappement React par défaut ;
- aucun `dangerouslySetInnerHTML` sur contenu utilisateur ;
- aucune auto-conversion de `evidence_ref` en lien ;
- URL GitHub validée côté serveur et rendue avec `target="_blank" rel="noopener noreferrer"` ;
- aucun secret dans le bundle ;
- focus visible ;
- navigation clavier ;
- couleur jamais seule porteuse d'information ;
- objectif WCAG 2.2 AA.

Tests :

- `xss_payload_escaped` ;
- `github_link_has_safe_rel` ;
- tests de composants pour règles FAIT/CONFORMITÉ ;
- smoke test navigation clavier.

**Preuve :** l'application respecte `DESIGN.md`, les données persistent et les filtres fonctionnent.

### 7. Import CSV/XLSX

Assistant 4 étapes :

1. déposer fichier ;
2. choisir feuille/séparateur ;
3. mapper les colonnes ;
4. inspecter l'aperçu.

Colonnes canoniques :

```text
code,title,description,referentiel,reference,domain,owner_name,method,
expected_evidence,automated,automation_github_url,frequency_kind,
anchor_date,explicit_dates,active_from,active_to
```

`automated` accepte à l'import, sans distinction de casse : `oui/non`, `yes/no`, `true/false`, `1/0`, puis est normalisé en booléen.

Formats :

- `.csv` ;
- `.xlsx` ;
- `.xls` et `.xlsm` refusés.

CSV :

- UTF-8, BOM admis ;
- séparateur `,` ou `;` détecté ou choisi ;
- une valeur texte commençant par `=`, `+`, `-` ou `@` est conservée canoniquement en base ; CENTURION ne l'exécute jamais.

XLSX :

- cellules de type formule refusées ;
- aucune macro ;
- parser sans extraction vers un chemin utilisateur ;
- contrôle de signature/structure OOXML, pas seulement extension/MIME.

Bornes :

- 5 MiB compressés ;
- 25 MiB de contenu XML décompressé maximum ;
- 10 000 lignes ;
- 100 colonnes ;
- 20 feuilles ;
- plafond global 100 000 occurrences actives après simulation.

Aperçu par code : `create`, `update`, `unchanged`, `invalid`.

- code dupliqué dans le fichier = `invalid` ;
- ligne absente = aucune action ;
- import invalide = aucune écriture partielle ;
- si une fréquence change, l'aperçu expose aussi l'impact sur occurrences ;
- l'application se fait uniquement depuis le `normalized_preview_json` serveur ; le client ne renvoie pas les lignes normalisées.

Expiration : 30 minutes. Import expiré ou hash source incohérent = refus.

Avant `apply`, créer un backup automatique `pre_import`.

Sécurité :

- allowlist extension + structure réelle ;
- nom client jamais utilisé comme chemin ;
- pas d'évaluation de formule ;
- pas de fetch de l'URL GitHub ;
- parsing fail-closed ;
- transaction all-or-nothing ;
- même validation Zod métier que l'API ;
- nettoyage des fichiers temporaires après apply/cancel/expiration et au démarrage.

Exemples à fournir :

```text
examples/import/centurion-controls.csv
examples/import/centurion-controls.xlsx
examples/import/invalid-controls.csv
```

Tests :

- `csv_import_preserves_formula_like_text` ;
- `xlsx_formula_cell_rejected` ;
- `upload_too_large_rejected` ;
- `xlsx_decompressed_size_cap_enforced` ;
- `unsupported_file_type_rejected` ;
- `traversal_filename_ignored` ;
- `import_apply_wrong_plan_denied` ;
- `stale_or_expired_import_cannot_apply` ;
- `invalid_rows_do_not_partially_write` ;
- `date_invalide_rejetee` ;
- `import_occurrence_cap_enforced` ;
- `import_automation_fields_validated`.

**Preuve :** CSV et XLSX créent/mettent à jour correctement ; données canoniques conservées ; aucune écriture partielle.

### 8. Exports CSV et PDF

Tous les exports sont scopés au plan et aux filtres actifs.

Headers :

- `Content-Disposition: attachment` ;
- `X-Content-Type-Options: nosniff` ;
- `Cache-Control: no-store`.

#### 8a. CSV

Route :

```text
GET /api/plans/:planId/exports/controls.csv
```

Une ligne par occurrence.

Colonnes :

```text
code,title,description,referentiel,reference,domain,owner_name,
expected_evidence,automated,automation_github_url,frequency,date,
fait,conformite,comment,evidence_ref
```

- UTF-8 BOM ;
- séparateur `;` ;
- dates ISO ;
- neutraliser **uniquement à l'export** toute cellule commençant par `=`, `+`, `-`, `@` en préfixant une apostrophe dans le fichier exporté ;
- la base n'est jamais modifiée par cette neutralisation.

Tests :

- `csv_export_neutralizes_formula_cells` ;
- `csv_export_does_not_modify_canonical_value` ;
- `csv_export_scoped_to_plan` ;
- `csv_export_utf8_bom`.

#### 8b. PDF

Le backend est l'unique générateur canonique du PDF.

Utiliser les composants pdfcn/Takumi générés et commités dans le projet. Ne pas exécuter un `npx ...@latest` au runtime ou dans un flux non reproductible.

Thème CENTURION conforme à `DESIGN.md` :

- primary `#451DC7` ;
- accent `#04F06A` ;
- foreground `#111111` ;
- background `#FFFFFF` ;
- muted `#F7F5FC` ;
- border `#E5E0F0` ;
- mutedForeground `#625B70` ;
- success `#1B7F4B` ;
- warning `#B45309` ;
- destructive `#DC2626`.

Document :

- A4 paysage ;
- header CENTURION + année + périmètre + date ;
- synthèse ;
- tableau filtré ;
- indicateur Auto Oui/Non ;
- `evidence_ref` lorsque pertinent ;
- pagination ;
- footer ;
- mention `Document généré par CENTURION — ne constitue pas une opinion d'assurance`.

Le GitHub URL peut être affiché en texte dans la fiche/détail du contrôle, mais le moteur PDF ne fetch aucune ressource externe.

Aucun asset externe, police distante, HTML utilisateur ou requête réseau pendant le rendu.

Tests :

- `pdf_download_headers` ;
- `report_scoped_to_plan` ;
- `pdf_generation_has_no_network_dependency`.

**Preuve :** PDF et CSV cohérents avec les mêmes filtres et le même modèle `/report`.

### 9. Backup / restore

Fonctionnalité MVP obligatoire.

Création :

- utiliser l'API de backup cohérent du driver SQLite ou un mécanisme SQLite équivalent sûr ;
- ne jamais faire une simple copie brute du fichier principal pendant que WAL est actif sans mécanisme SQLite cohérent ;
- calculer SHA-256 ;
- stocker métadonnées dans `backups` ;
- effectuer `PRAGMA integrity_check` sur la sauvegarde avant de la marquer valide.

Types automatiques :

- `pre_import` ;
- `pre_schedule_change` ;
- `pre_restore`.

Backup manuel disponible dans Paramètres.

Restauration :

1. sélectionner un backup connu par son ID ;
2. `restore-preview` affiche date, taille, hash, version schéma et effets ;
3. créer obligatoirement un backup `pre_restore` de l'état courant ;
4. vérifier hash + `integrity_check` ;
5. restaurer de manière atomique avec la base fermée/reconnectée proprement ;
6. relancer migrations idempotentes si nécessaire ;
7. écrire `restore_completed` dans l'audit restauré ;
8. ne jamais accepter un chemin fourni par le client.

Rétention : conserver les 20 sauvegardes automatiques les plus récentes ; les backups manuels ne sont pas supprimés automatiquement dans le MVP.

Le MCP ne peut ni créer arbitrairement un backup vers un chemin choisi ni restaurer une base.

Tests :

- `backup_integrity_check_passes` ;
- `backup_hash_verified` ;
- `restore_unknown_backup_denied` ;
- `restore_rejects_tampered_backup` ;
- `restore_creates_pre_restore_backup` ;
- `restore_preserves_expected_data` ;
- `automatic_backup_retention_enforced`.

**Preuve :** créer des données, backup, modifier les données, restaurer, retrouver l'état attendu sans corruption.

### 10. Démo, README et publication

Seed entièrement fictif : au moins 6 contrôles couvrant les trois référentiels, avec :

- contrôles manuels et automatisés ;
- au moins un contrôle automatisé avec URL GitHub fictive/non sensible ;
- FAIT Oui/Non ;
- quatre valeurs de conformité ;
- cas `À renseigner` ;
- cas `Non réalisé` ;
- `evidence_ref` fictive.

`npm run demo:reset` reproduit exactement le jeu de démonstration.

README :

- pitch ;
- captures réelles ;
- `npm ci` ;
- `npm run dev:demo` ;
- stockage local ;
- backup ;
- limites du modèle de menace ;
- aucune affiliation avec Wavestone, ISO ou les organismes référencés ;
- mention de la référence artistique décrite dans `DESIGN.md` sans reprendre d'asset tiers.

Captures :

- synthèse ;
- plan annuel ;
- fiche contrôle ;
- vue Référentiels ;
- aperçu import.

Avant le premier push public :

- scan secrets ;
- vérifier `.gitignore` ;
- vérifier absence de base réelle, backup, `.env`, export ou donnée client ;
- vérifier les licences des assets/fonts ;
- `npm ci`, `npm run check`, `npm run build`.

### 11. Serveur MCP sécurisé — stdio uniquement

Objectif : permettre à Claude, Cursor, opencode ou un autre client MCP de consulter CENTURION et, uniquement lorsque l'utilisateur l'a explicitement activé, d'effectuer un sous-ensemble limité de mutations.

Fichiers :

```text
src/mcp/server.ts
src/mcp/policy.ts
src/mcp/sanitize.ts
src/shared/schemas.ts
docs/MCP.md
```

Dépendances MCP et Zod épinglées à des versions exactes et verrouillées dans `package-lock.json`.

Le serveur utilise le SDK MCP TypeScript v2 et `serveStdio`. Aucun transport HTTP/SSE MCP dans le MVP.

#### 11.1 Modèle de confiance MCP

Le client IA et ses sorties sont considérés **non fiables**.

Le MCP ne fait jamais confiance :

- à une instruction contenue dans un champ `description`, `comment`, `evidence_ref`, import ou titre ;
- au raisonnement du modèle pour autoriser une action ;
- à un simple `confirm=true` produit par le modèle comme preuve d'une approbation humaine ;
- à une URL renvoyée par une donnée métier ;
- à une chaîne générée par le modèle pour produire SQL, shell, chemin de fichier ou requête réseau.

Toutes les décisions d'autorisation sont déterministes dans `policy.ts`.

#### 11.2 Principe de moindre fonctionnalité

En mode par défaut, le serveur est **lecture seule** et **n'enregistre même pas les outils de mutation**.

Outils toujours disponibles :

```text
list_plans
get_plan
list_controls
get_control
list_occurrences
get_summary
export_controls_csv
generate_report_pdf
```

Les exports écrivent uniquement sous `<dataDir>/exports/` avec un nom serveur et retournent `export_id`, `filename`, `mime_type`, `size_bytes` et, si nécessaire, un chemin **relatif** au `dataDir` ; aucun chemin absolu contenant le profil utilisateur n'est exposé au modèle et aucun chemin n'est fourni par le modèle.

Lorsque `CENTURION_MCP_WRITE=1`, enregistrer uniquement les mutations à impact limité :

```text
create_control
update_control_metadata
set_occurrence
```

`CENTURION_MCP_WRITE=1` **autorise l'exposition** de ces tools mais ne vaut pas approbation d'une mutation. Chaque appel de write nécessite en plus une **confirmation humaine par action** via le mécanisme MCP d'elicitation / `input_required` supporté par le SDK/protocole courant. Le serveur présente l'action exacte, en texte plat et borné, avant exécution. Si le client MCP n'annonce pas la capacité nécessaire ou ne renvoie pas une acceptation explicite, aucune mutation n'est exécutée et le tool renvoie `human_confirmation_required`.

Le mode write ne doit être activé qu'avec un host qui présente réellement cette elicitation à l'utilisateur ; une auto-acceptation par le host ne doit pas être considérée comme une garantie de présence humaine.

Restrictions :

- `update_control_metadata` ne modifie ni fréquence, ni code, ni statut d'archive ;
- `set_occurrence` applique les mêmes règles FAIT/CONFORMITÉ/preuve que l'API ;
- `create_control` utilise le générateur de calendrier normal et respecte les plafonds ;
- la confirmation affiche les identifiants métier pertinents et un diff avant/après lorsque disponible ;
- les valeurs utilisateur affichées dans la confirmation sont neutralisées pour les caractères de contrôle et rendues comme données, jamais comme Markdown actif.

**Ne pas exposer dans le MCP MVP :**

- restauration de backup ;
- suppression ;
- archivage ;
- changement de fréquence d'un contrôle existant ;
- `import_apply` ;
- création d'une année suivante ;
- exécution shell ;
- lecture/écriture de fichier arbitraire ;
- fetch URL ;
- appels GitHub ;
- outils génériques SQL.

Le MCP peut exposer `import_preview` en lecture/analyse si nécessaire, mais l'application de l'import doit être confirmée dans l'UI CENTURION.

#### 11.3 Médiation complète

Chaque tool call :

1. valide les arguments via Zod `.strict()` ;
2. passe par `policy.ts` ;
3. vérifie le plan et la chaîne de parenté ;
4. pour une mutation, exige l'activation write **et** l'acceptation de l'elicitation humaine liée à cette action ;
5. appelle le backend exclusivement via Fastify `app.inject()` sur les mêmes routes REST que l'UI ;
6. valide aussi la structure de sortie avant de la rendre au client MCP ;
7. écrit un audit `source=mcp` pour chaque mutation ;
8. ne fait aucune décision de permission avec un LLM.

Aucun `eval`, `exec`, shell, SQL généré, chemin généré par le modèle ou URL fetchée.

#### 11.4 Défense contre prompt injection indirecte

Les champs stockés dans CENTURION sont des **données**, jamais des instructions.

Avant de rendre des données au client MCP :

- conserver la valeur canonique en base ;
- produire une projection MCP distincte ;
- supprimer/encoder dans cette projection les caractères de contrôle terminal et les caractères Unicode invisibles utilisés comme canaux d'instruction/exfiltration, notamment tag block, variation selectors et zero-width ciblés par la politique ;
- indiquer dans la réponse structurée que le contenu provient de `centurion_data` et doit être traité comme `untrusted_data` ;
- ne jamais transformer automatiquement une chaîne en Markdown actif, image, iframe, aperçu de lien ou ressource distante ;
- ne jamais charger une URL GitHub ou `evidence_ref` pour enrichir le résultat ;
- limiter les champs renvoyés à ceux nécessaires au tool.

Toute transformation MCP est une **vue de sortie** ; elle ne modifie pas les données canoniques en SQLite.

#### 11.5 Output handling

- résultats de tools structurés et schématisés ;
- aucune sortie utilisée ensuite comme SQL, HTML, shell ou chemin ;
- pas d'ANSI/OSC ou caractères de contrôle dans les messages textuels du serveur ;
- erreurs génériques sans stacktrace ;
- aucune donnée sensible ou snapshot complet dans les logs MCP ;
- les descriptions de tools sont des littéraux statiques revus dans le code, jamais générées depuis la base.

#### 11.6 Supply chain MCP

- aucune découverte dynamique de serveur MCP tiers ;
- aucun chargement de tool package au runtime ;
- versions exactes + lockfile ;
- `npm ci` ;
- vérifier les changements de tool descriptions lors des upgrades ;
- documenter dans `docs/MCP.md` les versions et outils exposés ;
- un upgrade MCP doit passer par revue de diff et tests avant publication.

#### 11.7 Limites de consommation et circuit breakers

Bornes par process MCP :

- maximum 100 objets par réponse de liste ;
- pagination obligatoire ;
- maximum 120 tool calls/minute au total ;
- maximum 30 mutations/minute lorsque le mode write est activé ;
- maximum 5 générations d'exports/minute ;
- un dépassement renvoie une erreur structurée `rate_limited` ;
- une série d'erreurs répétées peut ouvrir un circuit breaker court plutôt que boucler indéfiniment.

Ces limites protègent contre les boucles agentiques et le fan-out accidentel ; elles ne sont pas un mécanisme d'authentification.

#### 11.8 Documentation MCP

`docs/MCP.md` doit contenir :

- installation ;
- lancement ;
- exemple de configuration client ;
- mode lecture seule par défaut ;
- activation explicite du write ;
- exigence de confirmation humaine par action via elicitation / `input_required`, et comportement fail-closed si le host ne la supporte pas ;
- liste exacte des tools disponibles selon le mode ;
- actions volontairement absentes ;
- modèle de menace ;
- avertissement prompt injection : données de contrôles/imports/comments = contenu non fiable ;
- absence de fetch URL, shell et SQL générique ;
- localisation du `dataDir` ;
- journaux/audit ;
- limites de débit ;
- procédure d'upgrade des dépendances MCP.

Tests MCP :

- `mcp_read_only_does_not_register_write_tools` ;
- `mcp_write_tools_require_flag` ;
- `mcp_write_requires_human_elicitation_acceptance` ;
- `mcp_write_rejected_when_client_has_no_elicitation_capability` ;
- `mcp_write_rejected_on_elicitation_decline_or_cancel` ;
- `mcp_tool_rejects_unknown_args` ;
- `mcp_cannot_access_foreign_plan_object` ;
- `mcp_update_cannot_change_schedule` ;
- `mcp_has_no_shell_or_url_fetch_tool` ;
- `mcp_output_schema_is_validated` ;
- `mcp_output_strips_invisible_instruction_channels` ;
- `mcp_canonical_db_value_is_not_modified_by_output_sanitization` ;
- `mcp_tool_descriptions_are_static` ;
- `mcp_rate_limit_enforced` ;
- `mcp_export_path_is_confined_to_datadir` ;
- `mcp_mutation_writes_audit_source_mcp` ;
- `mcp_import_apply_not_exposed` ;
- `mcp_backup_restore_not_exposed`.

**Preuve :**

- en mode normal, un client voit uniquement les tools read-only ;
- avec `CENTURION_MCP_WRITE=1`, seuls les trois outils de mutation limités apparaissent et chacun exige une confirmation humaine par action ;
- un client sans elicitation compatible, ou un refus/annulation, ne peut provoquer aucune mutation ;
- un texte stocké contenant une fausse instruction ne devient jamais une directive serveur ;
- aucun tool ne permet shell, URL fetch, SQL libre, chemin arbitraire, restore ou import apply ;
- `set_occurrence` produit le même résultat métier que l'UI et écrit `source=mcp` ;
- rate limiting et scoping sont testés ;
- `npm run check` + `npm run build` passent.

## 14. Mapping de sécurité attendu

### OWASP Top 10 Web 2025

- Broken Access Control : scoping relationnel, nested routes, refus cross-plan, host/origin/fetch-metadata ;
- Security Misconfiguration : headers, erreurs génériques, no CDN, bind loopback ;
- Software Supply Chain : lockfile, versions exactes, composants reviewés ;
- Cryptographic Failures : aucun secret embarqué ; confidentialité au repos explicitement déléguée à l'OS pour le MVP ;
- Injection : prepared statements, React escaping, CSV neutralization à l'export ;
- Insecure Design : previews, caps, modèle de menace, backup ;
- Authentication Failures : **non applicable fonctionnellement au MVP**, aucune identité applicative ; le bind loopback n'est pas présenté comme une authentification ;
- Software/Data Integrity : transactions, hash backups/import, audit append-only ;
- Logging/Alerting : audit applicatif et logs minimisés ;
- Exceptional Conditions : erreurs fail-closed, limites, tests dates/import/backups.

### OWASP GenAI / LLM 2026 appliqué au MCP

- **LLM01 Prompt Injection** : modèle considéré potentiellement compromis ; données CENTURION marquées non fiables ; capacités restreintes ; aucune URL/shell ; sortie MCP nettoyée sans modifier le canon ;
- **LLM02 Sensitive Information Disclosure** : minimisation des champs, pas de secrets/contextes cachés, logs minimaux, pas d'appel externe ;
- **LLM03 Excessive Agency** : read-only par défaut, write explicite, confirmation humaine par action, outils de mutation minimaux, fonctions à fort impact non exposées, médiation déterministe ;
- **LLM04 Supply Chain** : dépendances verrouillées, pas de plugin/tool dynamique, revue des descriptions d'outils ;
- **LLM06 Unbounded Consumption** : pagination, caps, rate limits, circuit breakers ;
- **LLM08 Hidden Context Exposure** : aucune permission ou secret ne repose sur un system prompt ;
- **LLM10 Improper Output Handling** : sortie schématisée, sanitation des caractères de contrôle/invisibles, aucun rendu/fetch externe automatique, aucune sortie LLM exécutée.

Le principe est : **supposer qu'un modèle peut être trompé et limiter les conséquences au niveau applicatif**, plutôt que tenter de faire de la détection de prompt injection l'unique barrière.

## 15. Definition of Done globale

Le MVP n'est terminé que si :

- toutes les tâches ci-dessus sont implémentées ;
- `DESIGN.md` est respecté ;
- aucune ambiguïté fonctionnelle connue n'est laissée à une décision implicite de l'agent ;
- `npm ci` fonctionne depuis un clone propre ;
- `npm run check` passe ;
- `npm run build` passe ;
- la démo est reproductible ;
- les imports CSV/XLSX sont transactionnels et bornés ;
- les valeurs canoniques ne sont pas altérées par les protections Excel/MCP ;
- le PDF est généré par un chemin backend unique ;
- backup + restore ont été réellement testés ;
- l'API n'est pas joignable depuis le LAN ;
- les protections Origin/Fetch-Metadata sont testées ;
- aucune donnée réelle ou secret n'est dans le dépôt ;
- le MCP est read-only par défaut, sans shell, URL fetch, SQL libre, import apply ou restore ;
- les mutations MCP ne passent qu'avec write activé + confirmation humaine par action ;
- les mutations MCP autorisées réutilisent exactement les règles métier de l'API via `app.inject()` ;
- les captures README sont issues de l'application réellement exécutée.

## 16. Hors MVP — phase 2

- comptes/login ;
- multi-utilisateurs ;
- SSO ;
- plusieurs organisations/tenants ;
- matrice détaillée clause ↔ contrôle ;
- upload de pièces justificatives ;
- chiffrement applicatif dédié de la base ;
- notifications/rappels ;
- workflow d'approbation ;
- historique métier versionné au-delà d'`audit_events` ;
- analytics avancés ;
- transports MCP réseau ;
- outils MCP à fort impact avec interaction humaine/approval protocol dédiée ;
- intégrations externes GitHub/Confluence/Jira ;
- e2e exhaustif multi-navigateurs.

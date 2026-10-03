# CENTURION — plan d'implémentation du MVP

> **Pour l'agent codeur :** exécuter les tâches T0 à T12 dans cet ordre. Utiliser `superpowers:executing-plans` si cette compétence est disponible. Cocher uniquement les étapes réellement vérifiées ; consigner la commande, le résultat et le commit dans `docs/EXECUTION.md`. L'agent chargé de cette revue ne développe pas l'application.

**Objectif :** livrer une application locale mono-utilisateur de suivi de contrôles annuels, avec import revu, reporting, sauvegarde/restauration et MCP stdio à capacités limitées.

**Architecture :** un seul processus Fastify possède SQLite et les fichiers d'instance. React consomme son API ; l'adaptateur MCP stdio ne possède aucune connexion SQLite et transmet des opérations bornées au processus propriétaire. Ce dernier utilise `app.inject()` sur les mêmes routes métier que l'UI et attribue lui-même la source d'audit.

**Stack :** Node.js 24 LTS, TypeScript strict, React/Vite, Tailwind CSS v4, shadcn/ui, Fastify, Zod v4, better-sqlite3, CSV/XLSX, pdfcn/Takumi, SDK MCP TypeScript v2, Vitest et Playwright. Les versions exactes et la compatibilité Windows sont vérifiées et verrouillées en T0, avant les travaux métier.

**Références :** [DESIGN.md](../../../DESIGN.md), [conception historique](../specs/2026-10-02-centurion-design.md), [revue et décisions](../reviews/2026-10-03-centurion-mvp-grilling.md). Révision technique du 3 octobre 2026 ; original conservé dans [l'archive](../reviews/2026-10-03-centurion-mvp.original.md).

**Autorité :** ce plan remplace les choix de la conception historique concernant comptes, retard, mapping clause-à-clause, upload de justificatifs, fréquences libres et versions métier. `DESIGN.md` reste l'autorité visuelle ; ses mentions « profil », « échéances » et « matrice » deviennent respectivement Paramètres locaux, prochaines occurrences et agrégation par référentiel. La revue distingue les décisions explicites du plan original des corrections techniques proposées ici.

## Contraintes globales

- Une organisation, un utilisateur local ; aucun login, compte, session applicative ou SSO.
- Un plan par année civile ; année de référence `Europe/Paris` ; dates métier `YYYY-MM-DD`, instants techniques UTC.
- Écoute HTTP sur `127.0.0.1` seulement ; origine canonique `http://127.0.0.1:4317`.
- Aucun appel externe requis au runtime, aucune télémétrie, aucun CDN ; seules les communications internes sur loopback sont permises.
- Poppins embarquée et licence OFL ; aucun asset, logo ou texte propriétaire Wavestone/ISO redistribué.
- Aucune suppression de plan, contrôle ou réalisation ; archivage et audit préservent l'historique.
- Aucune notion automatique de retard, SLA ou anomalie distincte.
- Toute règle métier est appliquée côté serveur, avec schémas partagés stricts ; UI et MCP ne possèdent pas de règles concurrentes.
- Tous les fichiers API/MCP restent sous `dataDir`, avec identifiants et noms physiques générés côté serveur.
- Les occurrences `completed` sont conservées lors de tout recalcul ; aucun import ne remplace leurs réalisations.
- Pas de publication, push public, invitation, déploiement ni compte cloud pendant l'exécution sans autorisation explicite distincte.

## Points de revue prioritaires

| Condition | Comportement attendu | Vérification propriétaire |
| --- | --- | --- |
| Saisie d'une réalisation après création d'un aperçu | L'application de l'aperçu est refusée, sans modification partielle. | T5, T8, T11 : conflit de révision dans la transaction. |
| Arrêt du processus pendant une restauration | Redémarrage sur une base ancienne ou nouvelle complète ; aucune combinaison de fichiers WAL incompatible. | T3 : injection de panne à chaque phase du journal. |
| Création répétée/rejeu d'une application | Un seul changement et un seul audit ; un ID consommé ne redéclenche rien. | T5, T8, T11 : consommation atomique. |
| Donnée importée hostile ou archive expansive | Pas de fetch, formule exécutée, extraction arbitraire ni dépassement des plafonds réels. | T8, T9, T11 : fixtures malveillantes et compteurs effectifs. |
| Deux lanceurs ou un client IA aux capacités excessives | Un propriétaire SQLite ; outils absents/refusés selon le mode, source d'audit non falsifiable. | T2, T10, T11 : verrou exclusif, allowlist et tests de transport réel. |

## 1. Périmètre métier et décisions closes

### Plans et définitions

Au démarrage, si `plans` est vide, créer `Plan annuel YYYY` pour l'année courante Paris, périmètre vide. Si un plan ancien existe déjà, ne pas créer silencieusement une nouvelle année. L'UI sélectionne l'année courante si elle existe, sinon l'année disponible la plus récente.

`year` est un entier entre 2000 et 2100, unique et immuable. Un plan contient des contrôles avec `code`, `title`, `description`, `referentiel`, `reference`, `domain`, `owner_name`, `method`, `expected_evidence`, `automated`, `automation_github_url`, `schedule`, `active_from`, `active_to` et `status`.

Le code est unique dans le plan et immuable après création. La définition affichée dans un rapport historique est la définition courante ; ses états précédents sont consultables dans l'audit. Il n'existe pas de version métier figée par occurrence.

Référentiels fermés : `iso_27001`, `isae_3402_t2`, `iso_27001_isae_3402_t2`. Libellés : `ISO 27001`, `ISAE 3402 Type 2`, `ISO 27001 + ISAE 3402 Type 2`. L'agrégation présente trois catégories distinctes, sans prétendre calculer une couverture de clauses.

`domain` est un texte libre NFC ; les suggestions utilisent les valeurs distinctes existantes, sensibles à la casse. Aucun enum métier caché.

`automated=false` impose une URL nulle. Une URL fournie lorsque false est refusée `422`, puis l'UI permet de décocher en envoyant explicitement null. Lorsque true, l'URL est facultative. Une URL renseignée doit être HTTPS, hôte exact `github.com`, sans userinfo, port explicite, fragment ni caractères de contrôle, et contenir au moins deux segments de chemin non vides. Pas de fetch côté serveur ; lien externe uniquement sur clic humain dans l'UI.

### Occurrences et réalisations

- `open` : aucune réalisation ; libellé `À renseigner`.
- `completed` : une réalisation existe, même lorsque `fait=false`.
- `superseded` : occurrence conservée mais exclue du suivi courant ; aucune nouvelle réalisation n'y est autorisée (`409 occurrence_superseded`).

Une réalisation contient `fait`, `conformite`, `completed_date`, `comment`, `evidence_ref`. Valeurs conformité : `conforme`, `partiellement_conforme`, `non_conforme`, `non_applicable`.

`fait=false` force côté serveur `non_applicable` et preuve nulle ; libellé `Non réalisé`. La date est alors la date de saisie du constat « non réalisé », présentée ainsi dans l'UI. `fait=true` accepte les quatre conformités ; la preuve obtenue reste facultative. Aucun lien n'est automatiquement créé à partir d'`evidence_ref`.

`completed_date` est une date civile valide entre `2000-01-01` et aujourd'hui Paris inclus. Elle peut se trouver hors de l'année du plan pour permettre la saisie tardive. Une correction conserve l'UUID de la réalisation ; même état normalisé renvoyé = no-op sans nouvel audit ni révision. Pas de retour à `open` et pas de suppression.

Un contrôle archivé n'accepte plus édition, nouveau planning, duplication ou import. Ses occurrences `open` conservées avant la date d'effet peuvent encore être renseignées ; les réalisations existantes peuvent être corrigées.

### Duplication, archivage et année suivante

La duplication exige uniquement `new_code`, copie la définition d'un contrôle actif dans le même plan, crée de nouveaux UUID et régénère les occurrences ; ni réalisation ni audit d'origine n'est copié.

Archivage : `effective_date` obligatoire dans l'année du plan, confirmation UI avec nombre d'occurrences affectées. Conserver les occurrences `completed` et les `open` strictement antérieures ; passer les autres `open` à `superseded`. Répéter l'archivage d'un contrôle déjà archivé = `409 control_archived`. Pas de réactivation MVP.

Création de l'année suivante : cible exactement `source.year + 1`, refus `409 year_exists` si elle existe et `422 year_out_of_range` après 2100. Cloner uniquement les contrôles actifs. Traduire toutes les dates de définition (ancre, dates explicites, bornes d'activité) vers l'année cible par mois/jour, 29/02 → 28/02 si nécessaire ; dédupliquer les dates explicites après translation. Régénérer toutes les occurrences dans une transaction ; aucun autre historique n'est copié. Nom `Plan annuel YYYY`, périmètre copié.

## 2. Calendrier et recalcul

Interface partagée exacte :

```ts
type CivilDate = string; // validée par CivilDateSchema avant tout usage

type Schedule =
  | { kind: 'once'; date: CivilDate }
  | { kind: 'monthly' | 'quarterly' | 'semiannual' | 'annual'; anchorDate: CivilDate }
  | { kind: 'explicit'; dates: CivilDate[] };

type ActivityWindow = { active_from: CivilDate | null; active_to: CivilDate | null };

generateDates(year: number, schedule: Schedule, window: ActivityWindow): CivilDate[];
translateDefinitionDates(input: ControlDefinition, targetYear: number): ControlDefinition;
computeScheduleDelta(input: ScheduleDeltaInput): ScheduleDelta;
```

Chaque branche Zod est stricte. Toutes les dates de définition sont dans l'année du plan ; `active_from <= active_to` si les deux existent. Le mode explicit exige 1..366 dates avant déduplication, triées et uniques après normalisation. Les bornes sont inclusives ; une fenêtre qui ne contient aucune date est valide et produit zéro occurrence, signalé dans l'UI.

Ponctuel : une date. Mensuel/trimestriel/semestriel : partir de l'ancre exacte, puis ajouter respectivement 1/3/6 mois jusqu'au 31/12, avec jour d'origine conservé et clamp au dernier jour du mois cible. Pas de backfill avant l'ancre. Annuel : une date dans l'année du plan. La réalisation ne modifie jamais ces calculs.

Helpers de date civile arithmétiques ; aucune construction `new Date('YYYY-MM-DD')`. `Clock` injectée : `nowUtc(): string`, `todayParis(): CivilDate`, `monotonicMs(): number`. Utiliser `Intl.DateTimeFormat` avec `timeZone: 'Europe/Paris'` pour la date courante, pas le fuseau implicite du poste.

Planning = `schedule` + les deux bornes d'activité. Aucun de ces champs n'est accepté par `PATCH` de métadonnées.

Aperçu de planning : stocker nouvelle définition, `effective_date`, delta, `base_plan_revision`, `engine_epoch`, expiration 15 minutes et état de consommation. Appliquer exclusivement par `preview_id`, dans le plan et contrôle qui ont créé cet aperçu.

Le delta à partir de la date d'effet : conserver tous les completed, tous les open antérieurs et les open futurs dont la date existe encore dans le nouveau calendrier ; remplacer seulement les open futurs disparus par superseded ; créer uniquement les nouvelles dates >= effet qui ne sont pas déjà couvertes par une occurrence open/completed. Les IDs des lignes conservées restent inchangés. Ne jamais modifier ni recycler un ancien superseded.

Le serveur invalide l'application si toute donnée métier du plan a changé depuis l'aperçu, y compris une réalisation. Le contrôle et les occurrences sont rechargés dans la transaction de vérification ; `updated_at` seul n'est pas utilisé comme verrou.

Maximum 100 000 occurrences `open + completed` par plan, contrôles archivés compris. Les superseded ne consomment pas ce plafond. Toute création, duplication, année suivante, import ou recalcul vérifie l'état projeté avant écriture. Pas de troncature pour rentrer dans le plafond.

## 3. Processus, stockage et sauvegardes

### Propriétaire unique

`npm run start` lance le backend et sert le build UI. `npm run dev` lance ce même backend + Vite. `npm run mcp` lance uniquement un adaptateur stdio vers un backend déjà démarré ; il ne lance ni serveur HTTP supplémentaire ni migration, seed, restauration ou connexion SQLite.

Backend : verrou exclusif `proper-lockfile` sur le `dataDir` canonique, heartbeat 5 s, stale 30 s, retries 0. Acquérir avant toute ouverture de base ; une deuxième instance échoue avec `instance_already_running`, sans écriture. Perte du verrou = arrêt des nouvelles opérations, fermeture propre puis arrêt du processus. SIGTERM attend les opérations en cours et libère le verrou. Le test couvre deux processus réels, pas deux objets dans le même test.

Le MVP protège les requêtes de navigateur et limite les opérations MCP ; il n'isole pas les autres processus du même poste. Un processus local peut forger des headers HTTP. Malware du compte, accès administrateur, disque non protégé et host disposant déjà d'accès shell/fichiers hors CENTURION restent hors modèle de menace ; aucun chiffrement applicatif ni inviolabilité de l'audit ne sont revendiqués. Les données retournées à un host IA peuvent être transmises par ce host à son fournisseur : aucune confidentialité vis-à-vis du host destinataire n'est garantie.

Un jeton aléatoire de 32 octets est créé à chaque démarrage sous `runtime/mcp-token`, fichier privé, exclu du dépôt et jamais renvoyé à un modèle. `runtime/backend.json` contient origine, epoch et mcp_write_enabled pour l'adaptateur, écrits atomiquement. L'adaptateur accepte seulement l'origine canonique locale configurée par le serveur, jamais une URL fournie par un outil. Son appel HTTP interne n'est pas un transport MCP réseau.

`POST /internal/mcp/dispatch` accepte seulement `{ tool, arguments }` avec le jeton, aucun `Origin` navigateur et aucune métadonnée `Sec-Fetch-*`. Validation, allowlist et limites sont réappliquées dans le backend. Le dispatch appelle les mêmes routes `/api` par `app.inject()` au travers de `trustedInject`, qui porte un contexte privé `AsyncLocalStorage` (source, operation_id et garde déjà acquise). Aucun header/body ne peut créer ce contexte ; tester aussi l'absence de fuite vers une requête publique simultanée. Ce contexte donne `source=mcp`. Les routes réseau publiques ne peuvent pas forger ce contexte. Aucun champ/header public `source` n'est accepté.

### dataDir

`CENTURION_DATA_DIR` si présent, sinon Windows `%LOCALAPPDATA%/Centurion`, Linux `${XDG_DATA_HOME:-~/.local/share}/centurion`, macOS `~/Library/Application Support/Centurion`. Canonicaliser et vérifier le chemin après création ; refuser les composants symboliques/reparse dans les sous-dossiers gérés. POSIX dossiers 0700/fichiers sensibles 0600 ; Windows profil privé, hors dossier partagé.

```text
<dataDir>/
  centurion.sqlite
  backups/<uuid>.sqlite + <uuid>.json
  imports/<uuid>.upload
  exports/<uuid>.csv ou .pdf + <uuid>.json
  restores/<uuid>.candidate.sqlite ou .previous.sqlite
  runtime/mcp-token, backend.json
  restore-journal.json                  # uniquement pendant une restauration
```

Nom client = métadonnée d'affichage bornée à 255 caractères, jamais chemin. UUID v4 générés serveur. `resolveManagedFile(kind, id)` reçoit un enum interne et un UUID, pas un chemin client ; lstat/realpath et contrôle du parent avant accès. Aucune route de lecture générique de fichier.

Imports : 30 min, au plus 3 temporaires et 15 MiB uploadés conservés au total. Exports MCP : 24 h, au plus 20 artefacts et 128 MiB au total, réservation avant génération ; quota dépassé → `429 artifact_quota_exceeded`, sans supprimer de fichier encore référencé pour contourner le plafond. Nettoyage périodique toutes les 5 min et au démarrage ; fichiers orphelins contrôlés supprimés après 24 h. Les artefacts UI sont téléchargés directement, sans copie persistante obligatoire.

### Backup cohérent et catalogue durable

Choisir `better-sqlite3.backup()` ; ne jamais copier directement une base ouverte en WAL. Backups = fichier SQLite + manifeste JSON externe versionné (`format_version=1`, id, reason, hash SHA-256, taille, schema_version, created_at). **Le catalogue autoritaire est hors de la base restaurée** : pas de table backups SQLite autoritaire qui perdrait le dernier pre_restore lors d'un retour en arrière.

Motifs : manual, pre_import, pre_schedule_change, pre_archive, pre_restore. Une modification de planning/archivage ayant au moins un effet sur les occurrences crée un backup ; un import avec changements aussi. Un no-op ne crée pas de backup.

Geler les mutations via une file exclusive pendant snapshot + opération dépendante. Lire le snapshot de manière isolée ; vérifier `integrity_check=ok`, `foreign_key_check` vide, schéma attendu, hash et taille. Écrire manifeste temporaire puis rename ; un backup sans manifeste valide n'est pas listé. Échec de backup = opération métier annulée, aucune révision ni audit métier écrit. Rétention : 20 derniers automatiques, manuels conservés, pre_restore courant protégé jusqu'à issue de restauration.

### Restauration et reprise après arrêt

`restore-preview` → aperçu 15 min contenant backup_id, hash, schema_version, résumé des pertes, engine_epoch et révision globale des données. `restore` reçoit seulement `{ preview_id }`. Refuser un schéma plus récent ; migrations vers schéma courant avant installation. Aucune restauration depuis un fichier arbitraire ou upload dans le MVP.

Séquence exclusive (bloquer aussi les lectures métier pendant installation, `503 maintenance_in_progress`, `Retry-After: 2`) :

1. Revalider aperçu, source et révisions ; créer pre_restore vérifié.
2. Préparer candidate dans restores ; vérifier intégrité, FK, invariants métier, migrer, vérifier de nouveau. Effacer les previews/imports/propositions MCP de la candidate.
3. Drainer les lectures, exécuter le checkpoint WAL TRUNCATE puis fermer toutes les connexions ; calculer le hash du fichier précédent fermé et écrire/synchroniser le journal `prepared` avec IDs et hashes. Aucun worker/adapter ne possède une connexion indépendante. Un arrêt avant le journal laisse la base d'origine utilisable.
4. Renommer la base courante vers previous, puis candidate vers centurion.sqlite ; journaliser `old_moved` puis `new_installed`. Les paths sont reconstruits depuis les IDs serveur.
5. Rouvrir, vérifier, écrire `restore_completed` dans l'audit restauré, créer nouvel epoch et jeton runtime, écrire journal `committed` durablement, puis répondre succès.
6. Nettoyer previous/journal après commit ; retention après succès.

Au démarrage, avant ouverture ordinaire : journal non committed → rétablir previous si le déplacement a commencé, sinon garder la base d'origine ; journal committed → garder nouvelle base vérifiée. Reprise idempotente, avec contrôle des hashes de snapshot/previous et des chemins. En rollback, écarter les fichiers WAL/SHM de la candidate avant de réinstaller previous ; ne jamais les attacher à la base précédente. Après committed, les vérifications portent sur la base et son WAL SQLite cohérents, pas sur une égalité au hash de candidate antérieur au nouvel audit. En cas d'état inconnu, démarrage refusé avec message de récupération ; aucun fichier n'est deviné ou écrasé. Ce protocole rend l'opération récupérable ; deux renames ne sont pas présentés comme un échange atomique garanti par le filesystem.

Le backend redémarré invalide tous les aperçus/propositions par nouvel epoch. Une restauration invalide aussi le cache UI (recharger plans/selection) et oblige les adaptateurs MCP à relire le jeton.

## 4. Modèle SQLite et intégrité

Créer une migration initiale transactionnelle, `PRAGMA user_version=1`, tables STRICT, FK ON, journal WAL, `busy_timeout=5000`. `plans.data_revision INTEGER NOT NULL DEFAULT 0` est incrémentée une seule fois par transaction qui change une donnée métier de ce plan ; previews, catalogues de fichiers et requêtes de lecture ne l'incrémentent pas. Un import multiple incrémente une fois. Restore utilise aussi le nouvel epoch ; les timestamps UTC ne servent pas de versions.

| Table | Champs spécifiques (en plus de id UUID et timestamps) |
| --- | --- |
| plans | year UNIQUE, name, perimeter, data_revision |
| controls | plan_id FK RESTRICT, code, title, description, referentiel, reference, domain, owner_name, method, expected_evidence, automated 0/1, automation_github_url nullable, frequency_kind, anchor_date nullable, explicit_dates_json nullable, active_from/to nullable, status active/archived ; UNIQUE(plan_id,code) |
| occurrences | control_id FK RESTRICT, occurrence_date, state open/completed/superseded |
| realizations | occurrence_id UNIQUE FK RESTRICT, completed_date, fait 0/1, conformite enum, comment, evidence_ref nullable |
| schedule_previews | plan_id/control_id FK RESTRICT, base_plan_revision, engine_epoch, requested_schedule_json, delta_json, expires_at, consumed_at nullable |
| import_runs | plan_id FK RESTRICT, stored_file_id, original_filename, source_hash_sha256, mapping_json nullable, normalized_preview_json nullable, base_plan_revision nullable, engine_epoch, status uploaded/preview/applied/cancelled/expired, expires_at, applied_at nullable |
| restore_previews | backup_id (UUID du catalogue externe), base_global_revisions_json, source_hash_sha256, engine_epoch, expires_at, consumed_at nullable |
| mcp_proposals | plan_id FK RESTRICT, tool enum, normalized_arguments_json, diff_json, base_plan_revision, arguments_hash, engine_epoch, state pending/applied/rejected/expired, expires_at, result_json nullable |
| audit_events | entity_type, entity_id, plan_id FK RESTRICT nullable pour restore global, control_id FK RESTRICT nullable, action, at_utc, before_json nullable, after_json nullable, source api/mcp/import/system |

`mcp_proposals` et les routes d'approbation sont requises pour la confirmation dans CENTURION, définie en section 9. Les clés techniques sont immuables et non mass-assignables.

Contraintes SQLite : enums fermés ; dates de même format ; `automated=0 → URL NULL` ; `fait=0 → non_applicable AND evidence_ref NULL` ; fenêtre cohérente ; formes de schedule cohérentes avec frequency_kind ; JSON valide pour les champs JSON. La validité calendaire fine est vérifiée par le backend.

Partial unique index sur occurrences(control_id,occurrence_date) WHERE state IN ('open','completed'). Index : controls(plan_id,status,code), occurrences(control_id,state,occurrence_date), audit_events(plan_id,control_id,at_utc,id), previews expiration. L'UUID ne dispense jamais du scoping relationnel.

Invariant réalisations : INSERT réalisation uniquement si occurrence open/completed ; trigger marque occurrence completed ; trigger interdit de quitter completed tant qu'une réalisation existe ; DELETE réalisation interdit. Un trigger BEFORE UPDATE refuse aussi un passage direct à completed sans réalisation ; seul l'INSERT de réalisation suivi de son trigger de synchronisation permet ce passage. Une transaction création/correction+audit+révision est indivisible. Les tests d'intégrité vérifient aussi `open/superseded → aucune réalisation` et `completed → exactement une`.

Audit append-only via triggers refusant UPDATE/DELETE ; chaque écriture métier réelle inclut son audit dans la même transaction. Snapshots par entité max 64 KiB UTF-8 ; un import n'inscrit pas tout le fichier dans un événement, mais événements par contrôle + bilan borné. Pour une réalisation, renseigner plan_id/control_id pour l'historique du contrôle. Aucun secret runtime ni donnée de jeton dans les audits/logs.

## 5. Contrats partagés et HTTP

### Normalisation et limites obligatoires

Toutes les bornes ci-dessous sont obligatoires, pas « recommandées ». Chaînes normalisées NFC et trim (début/fin), jamais préfixées pour Excel dans SQLite. Code trim + uppercase ASCII avant regex ; doublons testés après normalisation. Chaînes optionnelles vides → `''`, URL/preuve obtenue vides → null.

| Champ | Borne |
| --- | --- |
| code | 1..24, `^[A-Z0-9][A-Z0-9_-]*$` |
| title / reference / plan.name | 1..160 |
| description | 1..4000 |
| domain | 1..80 |
| owner_name | 0..120 |
| method / expected_evidence | 0..2000 |
| automation_github_url | null ou 1..500 et règles section 1 |
| comment | 0..4000 |
| evidence_ref / plan.perimeter | null ou 0..1000 pour preuve ; 0..1000 pour périmètre |
| search | 0..200 |
| pagination | page >=1 ; page_size 1..100, défaut 50 |

Mesurer les longueurs en code points Unicode. Une définition complète normalisée est limitée à 48 KiB UTF-8 (422 definition_too_large) afin de rester auditable sans troncature ; vérifier cette borne aussi à l'import et après fusion PATCH. Refuser C0/C1/DEL ; autoriser LF/CRLF normalisés LF et TAB uniquement dans description, method, expected_evidence, comment, perimeter. Refuser contrôles dans tous les autres champs. Ne pas appliquer la projection MCP aux données canoniques.

UUID mal formé en paramètre de ressource → 404, sans détail. Schéma/body/query invalide → 422. JSON illisible →400. Champs inconnus body/query rejetés. Date syntaxiquement valide mais inexistante →422. `base_*`, `source`, `id`, `status`, `state`, timestamps et parent IDs ne sont jamais modifiables par un payload.

DTO dans `src/shared/schemas.ts`, types inférés et résultats de sortie validés. DTO techniques camel/snake : tous les champs de l'API sont snake_case sauf la union Schedule (`anchorDate`) fixée section 2. Le serializer transforme storage en DTO ; ne jamais renvoyer SELECT *.

```ts
type CreateControlInput = ControlMetadata & {
  code: string; schedule: Schedule; active_from: CivilDate | null; active_to: CivilDate | null;
};
type UpdateMetadataInput = Partial<ControlMetadata>; // au moins un champ ; sans code/planning/status
type StatusInput = { fait: boolean; conformite: Conformite; completed_date: CivilDate;
  comment: string; evidence_ref: string | null };
type FilterInput = { referentiel?: Referentiel; domain?: string; owner_name?: string;
  automated?: boolean; fait?: 'yes'|'no'|'unset'; conformite?: Conformite;
  state?: OccurrenceState; date_from?: CivilDate; date_to?: CivilDate; search?: string };
type Page<T> = { items: T[]; page: number; page_size: number; total: number };
type ErrorBody = { error: { code: string; message: string; fields: Record<string,string[]> } };
```

`ImportMappingInput={sheet?:string, separator?:','|';', columns:Partial<Record<ImportColumn,number>>, effective_date:CivilDate}`. Les indices de columns sont des positions 0..99 dans l'en-tête de la feuille choisie ; clés canoniques strictes, champs requis tous mappés, une colonne source ne peut alimenter deux champs. sheet obligatoire pour XLSX, absent pour CSV ; separator uniquement CSV. Le serveur valide ces références par rapport au fichier conservé.

`ControlMetadata` comprend exactement title, description, referentiel, reference, domain, owner_name, method, expected_evidence, automated, automation_github_url. Champs complets obligatoires à la création, y compris chaînes vides/null explicites. PATCH fusionne avant validation des règles interdépendantes.

Filtres combinés par AND ; recherche substring insensible à la casse ASCII sur code/title/description, LIKE préparé avec `%`, `_` et échappement traités littéralement. Référentiel exact parmi trois catégories. Domaine/responsable exact après normalisation. `fait=unset` cible open ; `fait=no` cible completed+false ; filtre conformité cible seulement completed+true (N/A n'inclut pas Non réalisé). Par défaut exclure superseded ; `state=superseded` explicite les inclut seules. `date_from/to` inclusives, éventuellement hors année mais dates valides ; inversées →422. Combinaison incompatible donne liste vide, pas comportement implicite.

Pagination obligatoire pour listes ; ordre contrôles code,id, plans year DESC,id, occurrences date,code,id, audits at_utc DESC,id. Pas de tri arbitraire utilisateur. `/report` a des paramètres page/page_size pour l'aperçu ; synthèse = totalité du périmètre filtré, lignes = page demandée. Exports ignorent la pagination et prennent toutes les lignes filtrées dans leurs plafonds propres. Ne pas calculer de métrique sur la seule page affichée.

### DTO de sortie

Schémas complets dans shared/schemas, versions identiques API/MCP avant projection :

- PlanDto : id, year, name, perimeter, created_at, updated_at ; data_revision reste interne.
- ControlDto : id, plan_id, code, tous les ControlMetadata, schedule, active_from, active_to, status, created_at, updated_at ; pas de colonnes de stockage anchor_date/explicit_dates_json.
- RealizationDto : id, occurrence_id, completed_date, fait booléen, conformite, comment, evidence_ref, created_at, updated_at.
- OccurrenceDto : id, control_id, occurrence_date, state, created_at, updated_at, control:ControlDto, realization:RealizationDto|null. Projection MCP de liste = id/control_id/date/state + code/title/referentiel/automated/fait/conformite ; les longs textes sont obtenus par get_control uniquement.
- SummaryDto : counts `{total,open,fait_true,fait_false,conforme,partiellement_conforme,non_conforme,non_applicable}`, trois taux `{numerator,denominator,value:number|null}` nommés realization_rate, conformity_rate, automation_rate ; by_referentiel = trois catégories avec mêmes counts et taux réalisation/conformité. value est un ratio 0..1, pas un pourcentage déjà arrondi.
- BackupDto : id, reason, created_at, sha256, size_bytes, schema_version ; aucun chemin/stored_file_id exposé.
- AuditDto : id, entity_type, entity_id, action, at_utc, source, before, after ; before/after sont snapshots métier normalisés, aucun champ secret. Liste paginée.
- ImportPreviewDto : import_id, expires_at, counts `{create,update,unchanged,invalid}`, can_apply, rows:Page<ImportRowDto>. Une ligne contient row_number, code, action, field_errors, metadata_diff et schedule_delta_counts. Le normalized_preview_json complet reste interne.
- ProposalDto : id, tool, plan_id, target_id nullable pour create, state, expires_at, diff `{before,after}`, result nullable ; jamais token ou chemins. Le diff affiché comprend les effets de calendrier de create_control (nombre et dates échantillonnées signalées).

Aucun DTO ne renvoie de SELECT* non filtré. Les dates et booléens restent canoniques ; traductions françaises seulement dans UI/CSV/PDF.

### Routes publiques et payloads

Toutes les routes métier sont `/api`. Routes nested refusent 404 lorsque l'objet n'appartient pas au plan, y compris imports, previews et audits.

| Route | Entrée et réponse |
| --- | --- |
| GET /health | `{status:'ok',schema_version:1}` sans path ni secret |
| GET /plans | `Page<PlanDto>` |
| POST /plans | `{year,name,perimeter}` →201 PlanDto ; doublon409 |
| GET /plans/:planId | PlanDto |
| PATCH /plans/:planId | `{name?,perimeter?}`, au moins un champ →PlanDto |
| POST /plans/:planId/clone | body `{}` →201 `{plan,controls_created,occurrences_created}` |
| GET /plans/:planId/controls | pagination, `status=active|archived|all` défaut active, filtres de définition →Page<ControlDto> |
| POST /plans/:planId/controls | CreateControlInput →201 `{control,occurrences_generated}` |
| GET /plans/:planId/controls/:controlId | ControlDto |
| PATCH /plans/:planId/controls/:controlId | UpdateMetadataInput →ControlDto |
| POST .../:controlId/duplicate | `{new_code}` →201 `{control,occurrences_generated}` |
| POST .../:controlId/archive | `{effective_date}` →`{control,occurrences_superseded}` |
| POST .../:controlId/schedule-preview | `{schedule,active_from,active_to,effective_date}` →201 aperçu paginé |
| POST .../:controlId/schedule-apply | `{preview_id}` →`{control,delta_counts}` |
| GET .../:controlId/audit-events | pagination →Page<AuditDto> incluant réalisations |
| GET /plans/:planId/occurrences | FilterInput + pagination →Page<OccurrenceDto> avec réalisation nullable |
| PUT /plans/:planId/occurrences/:occurrenceId/status | StatusInput →OccurrenceDto ; no-op200 |
| GET /plans/:planId/summary | FilterInput →SummaryDto |
| GET /plans/:planId/report | FilterInput + pagination →ReportDto |
| GET /plans/:planId/exports/controls.csv | FilterInput →CSV attachment |
| GET /plans/:planId/exports/report.pdf | FilterInput →PDF attachment ou422 report_too_large |
| POST /plans/:planId/imports | un fichier multipart `file` →201 `{import_id,expires_at,sheets,headers,sample_rows}` |
| PUT /plans/:planId/imports/:importId/mapping | `{sheet?,separator?,columns,effective_date}` →aperçu persistant |
| GET /plans/:planId/imports/:importId/preview | pagination →résumé et Page<ImportRowDto> |
| POST /plans/:planId/imports/:importId/apply | body `{}` →bilan ; consommé/obsolète409 |
| DELETE /plans/:planId/imports/:importId | annulation temporaire →204, jamais contrôle supprimé |
| GET /backups | Page<BackupDto> issu des manifests |
| POST /backups | body `{}` →201 BackupDto |
| POST /backups/:backupId/restore-preview | body `{}` →201 aperçu |
| POST /backups/:backupId/restore | `{preview_id}` →`{restored:true,engine_epoch}` |
| GET /exports/:exportId/download | artefact connu valide →attachment ; UUID inconnu/expiré404 |

Les listes `/controls` acceptent referentiel,domain,owner_name,automated,search,status seulement. Les occurrences/reporting acceptent FilterInput entier. L'aperçu de planning stocke tout le delta serveur ; première réponse contient comptes et au plus 100 dates de chaque catégorie avec `truncated` explicite ; application utilise le delta complet, jamais l'échantillon.

Erreurs : 403 origine/host/policy ; 404 scoping ; 409 collision, preview consommé/expiré/stale ; 413 taille upload/body ; 415 type ; 422 règles métier/date/plafond occurrence/report ; 429 débit/quota ; 503 maintenance/verrou DB occupé ; 500 panne inattendue. Réponses génériques, aucun chemin, stack ou contenu d'import. Les erreurs de champs nomment uniquement les champs et règles, jamais leurs valeurs sensibles. Log request_id/code/action et durées, pas payloads ni snapshots.

### Protection navigateur et limits

Host exact `127.0.0.1:4317`, `trustProxy=false`, pas de CORS en production. Développement : Vite `127.0.0.1:5173`, proxy `/api` vers4317 ; backend autorise Origin dev exacte uniquement en mode dev. Host Vite également restreint. Pas d'écoute IPv6/LAN implicite.

Toute mutation réseau requiert Origin canonique UI (dev admise seulement en dev), `X-Centurion-Request: 1` et JSON UTF-8 ou multipart attendu. Refuser Origin absent/null, origine étrangère, `Sec-Fetch-Site: cross-site`, Content-Type form-urlencoded/text/plain. Les tests CLI ajoutent les headers, pas de bypass « absence d'Origin ». Les requêtes GET cross-site sont refusées via Origin si présent et Fetch Metadata ; un GET ne change jamais une donnée métier.

Timeout réception de body 15 s ; keep-alive 5 s ; cancellation de job si le client abandonne avant toute phase de commit. Une opération déjà engagée dans son commit métier finit atomiquement, sans prétendre que la déconnexion est un rollback. Body JSON max 64 KiB ; mapping/import-preview normalisé stocké côté serveur et jamais transmis entier par le client. Upload file max 5 MiB, multipart overhead total <=6 MiB, un fichier, champs max16KiB. Les contrôles in-process sont contournés uniquement par un contexte backend privé, jamais un header public appris par un modèle.

Headers : nosniff, no-referrer, DENY, Permissions-Policy camera/microphone/geolocation=(), API et downloads no-store. CSP production : default/script/connect/font-src self, img-src self data:, object-src none, base-uri none, frame-ancestors none, form-action self ; style-src self et style-src-attr unsafe-inline pour les styles inline nécessaires à Radix, sans unsafe-eval ni script-inline. Dev a sa CSP HMR séparée et ne sert pas de preuve de CSP production. Vérifier dialogs/menus en build production.

Méthode connue mais non autorisée →405+Allow ; route API inconnue→404JSON, jamais fallback SPA. Downloads attachment filename serveur ASCII, nosniff/no-store. Rate limits HTTP : 300 requêtes/min par instance pour API, 60 mutations/min, 5 opérations lourdes/min (import parsing, PDF, backup) ; horloge monotone, Retry-After. Les limites internes MCP sont comptabilisées en plus, pas substituées.

## 6. Métriques et reporting

Sur toutes les occurrences du filtre, hors superseded par défaut : total=open+completed ; à renseigner=open ; réalisés=completed+fait=true ; non réalisés=completed+fait=false. Conformités calculées seulement lorsque fait=true. N/A = fait=true+non_applicable, jamais fait=false une deuxième fois.

Taux réalisation = réalisés/total ; taux conformité = conformes/(réalisés hors N/A). Dénominateur nul →null dans JSON, `—` UI/PDF. Afficher pourcentage à une décimale fr-FR, sans l'arrondir avant calcul.

Automatisation = nombre de contrôles actifs distincts automatisés / nombre de contrôles actifs distincts dans le périmètre. Avec filtre d'occurrence, seuls les contrôles actifs ayant une occurrence correspondante comptent ; sans filtre d'occurrence, tous les contrôles actifs des filtres de définition comptent, y compris zéro occurrence. Les contrôles archivés contribuent encore aux réalisations/occurrences filtrées, jamais au ratio automatisation actif. Afficher numérateur et dénominateur.

`ReportDto={plan,filters,generated_at,summary,rows:Page<OccurrenceDto>}` ; un seul service `buildReport()` pour report, CSV/PDF et MCP. Chaque réponse/report export est construit sur un snapshot SQLite cohérent ; métriques et lignes ne proviennent pas de deux états différents. PDF embarque ce snapshot DTO puis libère la lecture DB avant le rendu.

## 7. Import, formats et sécurité des fichiers

Assistant : upload → feuille/séparateur → mapping → aperçu paginé + diff → application explicite. La route upload ne peut pas deviner un mapping définitif ni modifier des contrôles. Re-mapping possible avant application, avec recalcul de l'aperçu et nouvelle base_plan_revision ; expiration initiale 30 min non prolongée.

Colonnes canoniques : code,title,description,referentiel,reference,domain,owner_name,method,expected_evidence,automated,automation_github_url,frequency_kind,anchor_date,explicit_dates,active_from,active_to. Mapper les champs requis code,title,description,referentiel,reference,domain,frequency_kind ; les autres prennent leurs valeurs vides/null ou automated=false lorsqu'absents. L'import est une **définition complète** : champ optionnel absent/vide efface l'ancienne valeur correspondante, annoncé dans le diff et le modèle d'exemple. Aucun patch partiel implicite.

`once` utilise anchor_date comme date ponctuelle dans le fichier ; périodiques aussi ; `explicit` utilise dates ISO séparées par `|`, anchor_date vide. Référentiel et fréquence = enums canoniques, pas traduction heuristique. automated accepte oui/non,yes/no,true/false,1/0 insensible à la casse. Code normalisé avant upsert ; doublon dans fichier invalide les lignes dupliquées. Ligne totalement vide ignorée ; en-tête ambigu/dupliqué rejeté ; fichier sans ligne métier invalide.

CSV UTF-8 strict avec/sans BOM, séparateur comma/semicolon ; si détection ambiguë, choix utilisateur requis. Parser `csv-parse` avec quoting/newlines standard, 100 colonnes, record max64KiB. Valeurs commençant par =,+,-,@ conservées en base, jamais évaluées.

XLSX uniquement ; .xls/.xlsm/encrypted refusés. Préflight ZIP avec `yauzl` lazy entries, aucun extract sur disque ; compter **octets réellement décompressés de toutes les entrées**, pas seulement header/XML ; total 25 MiB, maximum 2 000 entrées, 20 feuilles, 100 colonnes, 10 000 lignes de données dans la feuille choisie. Refuser les noms absolus ou traversant les parents, les entrées dupliquées, vbaProject, OOXML incohérent, relations externes. Contrôler structure avant `exceljs` ; scan des formules dans toutes les feuilles, même non sélectionnées, et refuser les types formula/sharedFormula. Ne pas se fier au seul MIME ou suffixe.

Dates import : texte ISO exact seulement ; dates natives Excel converties en civil selon calendar1900/1904, serial60 du système1900 rejeté, parties fractionnaires/time refusées. Un nombre nu dans cellule non typée date n'est pas interprété comme date. Pas de formats texte ambigus DD/MM/YY dans le MVP. Fixtures pour les deux systèmes, TZ Windows/UTC/Paris. Helpers isolés sans convertir la date civile via un fuseau local implicite.

Parsing et PDF dans workers contrôlés : un job lourd à la fois, timeout parsing15s/PDF60s, heap JS256MiB ; size caps avant travail. Un crash/timeout supprime les temporaires partiels et renvoie erreur bornée ; ces limites JS ne constituent pas une garantie de mémoire native absolue. Résultats normalisés max16MiB stockés serveur ; preview paginé max100, erreurs affichées max1000 avec total exact. Toutes les lignes sont validées même si l'affichage est échantillonné.

À l'aperçu : create/update/unchanged/invalid ; code archivé = invalid, jamais réactivation. Simuler metadata/planning complet avec effective_date unique dans année et conserver completed selon section 2 ; plafond 100 000 vérifié sur l'état final. Stocker plans d'actions et révision du plan. Apply : revalider epoch/expiration/révision/source_hash_sha256, créer pre_import si changements, puis revalider sous garde exclusive et transaction ; uniquement normalized_preview_json immuable. invalid > 0 →422 import_invalid ; aucune application partielle. No-op →applied avec bilan, sans révision ni backup. Consommer et supprimer upload après commit ; cleanup au démarrage si arrêt entre commit et suppression.

## 8. Exports

CSV : une ligne par occurrence filtrée, jusqu'au plafond plan de 100 000, UTF-8 BOM, séparateur `;`, CRLF et quoting doublé des guillemets. Colonnes code,title,description,referentiel,reference,domain,owner_name,method,expected_evidence,automated,automation_github_url,frequency,date,fait,conformite,comment,evidence_ref. Open : fait/conformite/comment/preuve vides ; completed false : Non/N/A/preuve vide. Dates ISO. C'est un export d'occurrences, **pas** un fichier de définitions réimportable ; fournir les templates d'import séparément.

Neutralisation des cellules texte à l'export seulement : si premier caractère significatif après espaces/TAB/CR/LF vaut =,+,-,@, ou si premier caractère est TAB/CR/LF, préfixer la cellule entière d'une apostrophe avant quoting. Ne pas modifier SQLite. Tests sur =,+,-,@,espaces,tabulations,nouvelles lignes,quote,semicolon,Unicode. CSV max 64 MiB : calculer la taille exacte des cellules échappées sur le snapshot avant d'envoyer les headers ; dépassement →422 export_too_large avec demande de filtrer. Puis streaming du même snapshot, erreur de flux fermant le téléchargement sans faux succès.

PDF canonique backend, composants pdfcn/Takumi vendored et revus. A4 paysage, thème DESIGN, Poppins locale, synthèse, tableau filtré (code/titre,référentiel,date,Auto,FAIT,conformité), notes/commentaires/preuves dans blocs de détail identifiés par code+date, pagination/footer et mention `Document généré par CENTURION — ne constitue pas une opinion d'assurance`. Aucune insertion de HTML utilisateur ou ressource distante. Pas d'URL fetch/preview ; URL éventuelle en texte.

PDF : maximum 1 000 occurrences, 250 pages, 64 MiB de fichier et 60 s de rendu. Si dépassement →422 report_too_large (ou503 render_timeout), message demandant de filtrer ou prendre CSV ; jamais omission silencieuse. Texte long se poursuit dans des blocs de détail paginés ; aucune donnée déclarée présente n'est coupée sans indication. PDF vide valide « Aucune occurrence pour ces filtres » ; les chiffres gardent leur dénominateur réel. Tester 1 000 et 1 001 lignes, longs textes/Unicode et document multipage avec extraction de texte.

pdfcn/Takumi faisabilité Windows et Linux démontrée en T0 sur deux pages avec Poppins, avant métier. Si échec, arrêter uniquement la tâche dépendante avec diagnostic précis et proposition explicite ; ne pas changer discrètement de moteur.

## 9. MCP et confirmation d'une action

### Surface et confiance

SDK v2 officiel, `serveStdio` ; aucun endpoint/transport MCP HTTP/SSE. Support protocole 2026-07-28 et clients legacy compatibles via shim SDK, prouvé par clients de test ; pas de test modern uniquement avec InMemoryTransport legacy. stdout exclusivement protocole, logs bornés sur stderr.

Lecture seule par défaut = aucune mutation métier exposée. Tools fixes : list_plans,get_plan,list_controls,get_control,list_occurrences,get_summary,export_controls_csv,generate_report_pdf. Les deux exports créent des artefacts confinés : ne pas les annoter abusivement readOnlyHint=true ; leur effet disque est documenté. Réponse artefact : export_id,filename,mime_type,size_bytes,expires_at ; pas de profil/path absolu, données binaires ni URL distante. UUID connu récupérable via UI download.

Write activé uniquement si flag backend **et** adapter `CENTURION_MCP_WRITE=1`. Tools supplémentaires create_control,update_control_metadata,set_occurrence ; schémas identiques API, code/fréquence/archive interdits update. Aucune suppression, archivage, modification de planning, clonage d'année, import, backup/restore, SQL libre, shell, fichier arbitraire ou fetch URL/GitHub. `import_preview` optionnel du plan original est exclu pour fermer la surface MVP.

### Arguments et résultat des tools

Schémas partagés stricts, parent IDs fournis explicitement ; pagination par défaut identique à l'API :

| Tool | Arguments |
| --- | --- |
| list_plans | `{page?,page_size?}` |
| get_plan | `{plan_id}` |
| list_controls | `{plan_id,filters?:ControlListFilter,page?,page_size?}` |
| get_control | `{plan_id,control_id}` |
| list_occurrences | `{plan_id,filters?:FilterInput,page?,page_size?}` |
| get_summary / export_controls_csv / generate_report_pdf | `{plan_id,filters?:FilterInput}` |
| create_control | `{plan_id,input:CreateControlInput}` ou `{proposal_id}` pour consulter sa proposition |
| update_control_metadata | `{plan_id,control_id,input:UpdateMetadataInput}` ou `{proposal_id}` |
| set_occurrence | `{plan_id,occurrence_id,input:StatusInput}` ou `{proposal_id}` |

ControlListFilter contient exactement les filtres de définition et status de la route controls. Une consultation proposal_id doit correspondre au tool d'origine ; sinon 404. Le backend convertit ces formes en routes API, jamais en URL arbitraire.

Structured output : `{status:'ok',data_origin:'centurion_data',trust:'untrusted_data',data,sanitized_fields?:string[]}` ; proposition : même enveloppe avec `status:'human_confirmation_required'`, data `{proposal_id,state,expires_at,diff}`. Erreur : `{status:'error',error:{code,message}}` sans data ni stack, avec isError SDK. Pending n'est pas une mutation exécutée et ne produit pas isError=true. Valider le DTO de sortie avant livraison au host.

**Décision technique de cette révision : validation dans l'UI CENTURION.** Ce choix recommandé est pris faute d'autre préférence pendant la revue ; il est consigné comme décision de revue, sans prétendre à une approbation utilisateur supplémentaire. L'elicitation d'un host ne prouve pas à elle seule la présence d'un humain si ce host est lui-même non fiable. Les outils gardent des noms métier, mais leur premier appel write ne modifie aucune donnée de contrôle : il prépare une proposition exacte.

### Confirmation dans CENTURION — chemin recommandé

Tool write valide/scopé → proposition serveur pending, diff normalisé complet, base_plan_revision, hash SHA-256 des arguments normalisés, epoch, TTL15min ; réponse `human_confirmation_required` + proposal_id et résumé de données non fiables. Aucun champ confirm/approved fourni par le tool n'est accepté.

Routes UI, non dispatchables par MCP :

- GET /api/mcp-proposals : Page<ProposalDto> sans jeton runtime ;
- POST /api/mcp-proposals/:proposalId/approve : body{} ;
- POST /api/mcp-proposals/:proposalId/reject : body{}.

Afficher dans Paramètres un badge d'actions en attente et un dialogue de diff avant/après, identifiants de plan/contrôle/occurrence, conséquence exacte. Valeurs échappées React, pas Markdown actif. Un clic Approuver applique la proposition immuable dans une transaction, après vérification epoch/TTL/révision/scoping/hash et plafonds ; consommation+mutation+révision+audit source=mcp indivisibles. Refus/expiration/stale ne modifient pas le métier. Répéter la même proposition appliquée renvoie son résultat mémorisé, sans deuxième mutation ; propositions pending identiques (tool/hash/plan/revision/epoch) sont dédupliquées. Maximum 20 propositions pending par instance ; quota →429.

Application de la proposition : la route UI d'approbation acquiert la garde, puis attend `trustedInject` hors de toute transaction SQLite. Le contexte privé transporte proposal_id et source=mcp. La route métier cible exécute dans **sa transaction synchrone unique** la vérification de proposition/révision, sa mutation, l'audit et l'enregistrement du résultat consommé. Aucun `await app.inject()` dans une transaction ouverte ; aucune consommation préalable suivie d'une seconde transaction métier. Les tests injectent une panne juste avant consommation/commit pour prouver leur indivisibilité. Une approbation qui modifie le plan rend les autres propositions de ce plan obsolètes ; l'UI affiche cette règle et demande de reproposer.

Les tools métier peuvent accepter `proposal_id` dans une branche de schéma de consultation de leur propre proposition, sans nouveau payload métier ; résultat currentstate/result borné. Ils ne peuvent approuver ni rejeter. Un client déconnecté n'empêche pas la validation dans l'UI.

### Projection, sorties et limites

Descriptions de tools littérales statiques. Inputs/outputs Zod stricts. Chaque résultat porte `data_origin:'centurion_data', trust:'untrusted_data'` ; cette étiquette aide le host, sans garantir l'absence de prompt injection. Ne jamais utiliser un texte stocké comme instruction/policy, SQL, shell, HTML ou chemin.

Projection MCP distincte : retirer C0/C1/DEL, Unicode catégorie Cf, variation selectors FE00..FE0F/E0100..E01EF et tags E0000..E007F ; remplacer LF/CR/TAB par espace dans les extraits texte. Ajouter sanitized_fields lorsque la projection a changé ; conserver les données originales en SQLite/UI/export. Une instruction visible malveillante peut rester du texte non fiable ; aucune capacité serveur n'en dépend.

Listes : maximum 100 objets, pagination obligatoire, listes de contrôles/occurrences en DTO résumé sans longs commentaires ni preuves ; détails renvoyés seulement par get ciblé. Résultat JSON maximum 512 KiB, pas de troncature non signalée ; débordement propose pagination ou outil détail. Aucun rendu Markdown actif, image, iframe, aperçu ni fetch externe.

Limites centralisées backend pour tous les adaptateurs : 120 appels/min, 30 propositions write/min, 5 exports/min ; fenêtre glissante de 60 s et horloge monotone ; maximum 4 appels en cours et 1 job lourd. Après 10 erreurs serveur consécutives, ouvrir le circuit pendant 10 s ; seules les erreurs backend 5xx/timeouts comptent, pas les erreurs de validation ; un succès remet le compteur à zéro. Erreurs structurées rate_limited/backend_unavailable, pas de retries infinis. Mode read-only et flags write ne sont pas des authentifications utilisateur.

## 10. Interface et démonstration

Navigation : Synthèse, Plan annuel, Référentiels, Reporting, Import, Paramètres ; choix du plan commun. L'accueil ouvre la Synthèse.

Avant l'interface complète, produire les maquettes Synthèse et Référentiels dans `docs/mockups/`, puis suivre `DESIGN.md`. Prévoir les états chargement, vide, erreur, hors ligne, maintenance et conflit 409. Une erreur d'aperçu obsolète invite à recalculer ; le serveur n'applique pas silencieusement un nouveau delta.

Plan annuel : une ligne par occurrence, colonnes Référentiel, Référence, Code/titre, Description, Fréquence, Auto, Date, FAIT, CONFORMITÉ ; pagination serveur ; filtres dans l'URL et bouton Réinitialiser. Les vues tableau et douze mois utilisent le même périmètre. Ne pas charger 100 000 lignes dans le navigateur.

Prochaines occurrences = cinq premières occurrences `open` dont date >= aujourd'hui Paris, dans l'ordre chronologique. Les occurrences passées ouvertes restent consultables dans le plan ; aucun libellé de retard.

Fiche contrôle : Définition, Calendrier, Réalisations, Historique. Preuve attendue et preuve obtenue sont distinctes. GitHub : « Voir le script », clic explicite, target blank et rel noopener noreferrer. La preuve obtenue reste du texte. FAIT est un choix obligatoire ; Non force N/A et efface la preuve, avec information visible avant sauvegarde. Chaque sauvegarde exige une action explicite.

Référentiels : trois catégories, agrégation de contrôles et résultats ; libellé « suivi, pas couverture certifiée ». Reporting expose les mêmes filtres et indique les plafonds d'export. Paramètres : nom/périmètre, création d'année suivante avec nombres projetés, sauvegardes, restauration avec effets affichés, informations de stockage et approbations MCP. Aucun secret runtime dans l'UI.

Composants shadcn accessibles, labels et erreurs liés, focus visible, dialogues utilisables au clavier et focus restauré. Couleur + texte/icône pour les statuts ; tableau défilant dans sa propre zone. Vérifier 390 et 1440 px, prefers-reduced-motion et parcours clavier ; objectif WCAG 2.2 AA, sans prétendre à un audit exhaustif. Données utilisateur en texte React, aucun dangerouslySetInnerHTML.

Démo isolée : `dataDir=./data/demo`, horloge `2028-04-15T10:00:00Z`, plan 2028 et IDs fictifs déterministes. Au moins six contrôles couvrent les trois référentiels, les six fréquences, automatisation avec/sans URL, FAIT Oui/Non, quatre conformités, open/superseded et preuves fictives. Le mode ordinaire ignore l'horloge démo. Le reset refuse toute cible hors du répertoire démo et toute instance active, exige `--confirm`, et reproduit exactement le même état.

## 11. Arborescence et interfaces de l'agent codeur

Arborescence cible ; ajouter des helpers locaux si nécessaires, en conservant ces responsabilités :

```text
src/shared/{schemas,types,limits}.ts
src/server/{app,index,config,clock}.ts
src/server/http/{guards,errors,headers}.ts
src/server/storage/{paths,instance-lock,runtime-files,operation-gate}.ts
src/server/db/{database,migrate,scoping,audit}.ts
src/server/db/migrations/001_initial.sql
src/server/domain/{civil-date,schedule,controls,realizations,plans,queries,report}.ts
src/server/backups/{catalog,backup,restore,recovery}.ts
src/server/imports/{upload,zip-preflight,parse-csv,parse-xlsx,preview,apply}.ts
src/server/reports/{csv,pdf-worker}.ts
src/server/reports/report-pdf.tsx
src/server/routes/{plans,controls,occurrences,reporting,imports,backups,mcp}.ts
src/server/mcp/{dispatch,proposals,policy}.ts
src/mcp/{server,backend-client,tools,sanitize,rate-limit}.ts
src/web/{main,App}.tsx
src/web/lib/{api,filters}.ts
src/web/pages/{Summary,AnnualPlan,ControlDetail,References,Reporting,Import,Settings}.tsx
src/web/components/{ControlForm,RealizationForm,SchedulePreview,RestoreDialog,McpProposalDialog}.tsx
src/web/components/ui/                    # sources shadcn vendored
src/web/styles.css
src/server/reports/components/pdf/        # sources pdfcn vendored
public/fonts/ + licences/Poppins-OFL.txt
scripts/{seed-demo,reset-demo}.ts
examples/import/{centurion-controls.csv,centurion-controls.xlsx,invalid-controls.csv}
tests/{unit,integration,security,mcp,e2e,fixtures}/
docs/{DEPENDENCIES,API,MCP,EXECUTION}.md
docs/mockups/ + docs/screenshots/
```

Interfaces définies dans les tâches propriétaires et importées par leurs consommateurs :

```ts
type AppDeps = { config: Config; clock: Clock; db: DatabaseHandle;
  files: ManagedFiles; gate: OperationGate; engine_epoch: string };
buildApp(deps: AppDeps): Promise<FastifyInstance>; // aucun listen ou seed implicite
openDatabase(path: string): DatabaseHandle;
withPlanMutation<T>(planId: string, source: AuditSource, fn: (tx: DomainTx) => T): T;
controlInPlan(tx: DomainTx, planId: string, controlId: string): ControlRow;
occurrenceInPlan(tx: DomainTx, planId: string, occurrenceId: string): OccurrenceRow;
createBackup(reason: BackupReason): Promise<BackupDto>;
restoreBackup(previewId: string): Promise<RestoreResult>;
buildReport(planId: string, filter: FilterInput, page: PageInput): ReportDto;
previewImport(importId: string, mapping: ImportMappingInput): Promise<ImportPreviewDto>;
applyImport(planId: string, importId: string): Promise<ImportApplyResult>;
dispatchMcp(tool: McpToolName, args: unknown): Promise<McpOutput>;
projectMcpOutput(input: unknown, schema: OutputSchema): McpOutput;
```

Types de driver confinés à db/storage ; aucun singleton SQLite importé par frontend/MCP. `DomainTx` représente une transaction synchrone et les helpers de mutation/audit ; son callback ne peut renvoyer une Promise.

`OperationGate` fournit lecture, mutation exclusive et maintenance exclusive. Une opération avec backup acquiert la garde, attend le backup hors transaction SQLite, puis exécute la transaction métier synchrone avec revalidation. Aucune mutation ne peut s'intercaler entre snapshot et commit. Éviter une seconde acquisition du même gate dans les helpers internes appelés sous garde : transmettre explicitement un contexte d'opération.

Scripts obligatoires :

| Script | Effet |
| --- | --- |
| npm run dev | Backend 4317 + Vite 5173, données privées ordinaires. |
| npm run dev:demo | Serveurs identiques, dataDir/horloge démo ; seed si vide, aucun reset implicite. |
| npm run build | Typecheck ; Vite →dist/web ; backend et MCP →dist/server et dist/mcp ; assets locaux inclus. |
| npm run start | Node dist/server/index.js ; UI compilée et API sur 4317. |
| npm run demo:reset -- --confirm | Reset exclusivement de la démo, instance arrêtée. |
| npm run mcp | Node dist/mcp/server.js, stdio ; backend déjà démarré. |
| npm run test -- tests/... | Vitest run, reporter verbose. |
| npm run test:e2e | Playwright Chromium contre un build de production et une instance temporaire. |
| npm run typecheck / lint | TypeScript strict et lint. |
| npm run check | Typecheck, lint, tests unitaires/intégration/sécurité/MCP ; aucun réseau externe. |
| npm run audit:deps | npm audit --omit=dev --audit-level=high ; gate publication distinct, registre accessible. |

`npm ci`, build et checks utilisent le lockfile. Installation et audit peuvent nécessiter le réseau ; fonctionnement produit et checks ordinaires restent hors ligne. CI Windows 11/Node 24 et Linux/Node 24 pour les tests du driver et du PDF ; parcours Chromium sur Linux. Ne déclarer une plateforme testée qu'avec une preuve réelle.

## 12. Tâches d'exécution ordonnées

À chaque tâche métier : écrire le test critique, constater son échec, implémenter, passer le test puis les gates de la tâche. Les essais de compatibilité et les documents n'exigent pas de tests qui recopient leur contenu. Consigner les résultats dans `docs/EXECUTION.md` et créer un commit local par livrable si le dépôt est initialisé ; aucune publication automatique.

### T0 — Verrouiller les dépendances et démontrer les risques techniques

**Fichiers :** package.json, package-lock.json, .npmrc, .node-version, .gitignore, LICENSE, tsconfig*.json, vite.config.ts, vitest.config.ts, docs/DEPENDENCIES.md, tests/integration/dependency-smoke.test.ts et fixtures PDF.

**Produit :** versions exactes et scripts ; backup réel better-sqlite3, PDF multipage avec police locale et handshake MCP modern/legacy. Toutes les tâches en dépendent.

- [x] Initialiser Git local sur main si absent, sans remote ni push ; licence du code MIT comme dans le plan original. Ignorer node_modules, dist, fichiers .env, data/demo, données d'instance, DB/WAL/SHM, backups, runtime tokens et captures temporaires ; conserver templates fictifs et licences tierces.
- [x] Vérifier dans leurs registres/docs les paquets Fastify et plugins compatibles, React/Vite, TypeScript, Tailwind/shadcn, Zod 4, better-sqlite3, csv-parse, ExcelJS, yauzl, proper-lockfile, renderer pdfcn/Takumi, MCP server/client v2, Vitest, Playwright. Commande `npm view <package>@<version> version engines dist.integrity`. Choisir une stable compatible, sans alpha/rc ; save-exact=true ; documenter versions, licences, sources et éventuelles vulnérabilités bloquantes.
- [x] Installer une fois les composants shadcn/pdfcn via CLI épinglée ; relire les sources et dépendances, commiter code/lockfile. Le code vendored devient l'autorité, pas une commande de registre mutable au runtime.
- [x] Écrire/exécuter le smoke : SQLite WAL→backup→intégrité/FK ; PDF deux pages avec Poppins et accents, extraction de texte/page count ; child MCP `serveStdio` avec un client modern et legacy, outils visibles et stdout réservé au protocole.
- [x] Configurer les scripts section 11 ; passer `npm ci`, smoke, typecheck et build. Consigner la plateforme réellement testée. Échec d'une dépendance → diagnostic et blocage de sa tâche dépendante ; aucun moteur alternatif adopté silencieusement.
- [x] Enregistrer les preuves et commit `chore: lock compatible toolchain`.

### T1 — API locale, contrats et protections navigateur

**Fichiers :** shared/*, server/{app,index,config,clock}.ts, http/*, storage/paths.ts, web/{main,App}.tsx, tests/security/http.test.ts, tests/unit/schemas.test.ts.

**Consomme :** T0. **Produit :** buildApp, Clock, DTO/ErrorBody, frontière HTTP et shell UI avec Poppins.

- [x] Écrire les assertions : Host hostile403 ; Origin mutation étranger/absent/null403 ; Fetch cross-site403 ; champ inconnu422 ; JSON illisible400 ; Content-Type interdit415 ; JSON>64KiB413 ; méthode connue405+Allow ; API inconnue404JSON ; erreur sans stack/path ni payload.
- [x] Implémenter guards, headers, erreurs et schémas/normalisation ; proxy Vite en dev, statics dist/web en production. Le shell UI sert uniquement à vérifier assets locaux et composants accessibles.
- [x] Exécuter `npm run test -- tests/security/http.test.ts tests/unit/schemas.test.ts`. Vérifier le listener réel sur 127.0.0.1, et l'échec d'accès par l'IP LAN ; pas uniquement l'objet de configuration.
- [x] Ouvrir le build production et un dialogue shadcn : CSP, focus et absence de CDN. Consigner et commit `feat: establish local API boundary`.

### T2 — SQLite, scoping, audit et propriétaire unique

**Fichiers :** db/*, migrations/001_initial.sql, storage/{instance-lock,runtime-files,operation-gate}.ts, tests/integration/database.test.ts, tests/integration/instance-lock.test.ts.

**Consomme :** DTO/config/Clock T1. **Produit :** DatabaseHandle, DomainTx, scopes, révisions et exclusivité pour T3+.

- [x] Écrire les tests : migrations répétées idempotentes ; FK/WAL/busy_timeout ; index partiel autorisant ancien superseded mais refusant deux dates actives identiques ; code unique après normalisation ; SQL hostile conservé comme donnée ; invariants réalisation/état ; audit UPDATE/DELETE refusés ; rollback audit annule mutation ; bootstrap à frontière d'année Paris.
- [x] Implémenter section 4, withPlanMutation et accès nested404 ; gate, verrou exclusif et lifecycle propre. Un no-op n'incrémente pas la révision.
- [x] Exécuter `npm run test -- tests/integration/database.test.ts tests/integration/instance-lock.test.ts`. Le test de verrou lance deux processus réels sur un dataDir temporaire : un propriétaire, second refusé sans écriture. Couvrir perte de verrou et arrêt propre.
- [x] Consigner et commit `feat: secure SQLite lifecycle and audit`.

### T3 — Sauvegarde et restauration récupérable

**Fichiers :** backups/*, routes/backups.ts, tests/integration/backup-restore.test.ts, tests/fixtures/backups/, section backup de docs/API.md.

**Consomme :** gate/db T2. **Produit :** createBackup, restoreBackup, catalogue durable et routes, requis en T5/T6/T8.

- [ ] Écrire les tests : backup avec commits encore dans WAL ; SHA/intégrité/FK ; source altérée/inconnue/schéma futur refusés ; pre_restore encore listé après restauration ; échec backup bloque opération ; réalisation après preview rend restore stale ; requêtes pendant installation503.
- [ ] Implémenter catalogue externe, rétention 20 automatiques + tous manuels, TTL15min et séquence de récupération section 3.
- [ ] Injecter des arrêts du processus après prepared, old_moved, new_installed, audit avant committed, puis committed avant cleanup. Relancer : base ancienne ou nouvelle complète selon phase, audit cohérent, WAL compatible, anciens previews invalides et jeton renouvelé. Refaire une récupération pour prouver l'idempotence.
- [ ] Exécuter `npm run test -- tests/integration/backup-restore.test.ts` puis `npm run check`. Consigner et commit `feat: add recoverable local backups`.

### T4 — Calendrier, création, duplication et année suivante

**Fichiers :** domain/{civil-date,schedule,controls,plans}.ts, routes/{plans,controls}.ts, tests/unit/calendar.test.ts, tests/integration/controls.test.ts.

**Consomme :** DTO et DomainTx. **Produit :** generateDates/translateDefinitionDates et contrôles calendaires, utilisés en T5/T8.

- [ ] Assertions calendrier : trimestriel31/03/2028→31/03,30/06,30/09,31/12 ; mensuel31/01/2028→29/02 puis31/03 ; annuel29/02 cloné2029→28/02 ; explicit tri/dédup ; fenêtre inclusive ; aucun backfill avant ancre ; date inexistante/out-of-year422 ; zéro occurrence valide.
- [ ] Implémenter helpers civils, validation URL sans fetch et transactions création/duplication/clone. Traduire aussi bornes d'activité et dates explicites du clone.
- [ ] Tests API : création201, mauvais plan404, code collision409, URL interdite lorsque automated=false422, true sans URL valide ; userinfo/domain lookalike refusés et zéro fetch. Clone année existante409 ; 100000 occurrences admises,100001 refusées sans écriture ; duplication sans réalisation/audit source copiés.
- [ ] Exécuter `npm run test -- tests/unit/calendar.test.ts tests/integration/controls.test.ts`. Consigner et commit `feat: create annual control schedules`.

### T5 — Aperçus et changement de planning

**Fichiers :** domain/schedule.ts, routes/controls.ts, tests/integration/schedule-preview.test.ts.

**Consomme :** calendrier T4, backup T3 et révisions T2. **Produit :** preview immuable et apply transactionnel.

- [ ] Fixture : completed futur, open passé, open futur commun, open futur disparu, ancien superseded. Assertions : IDs conservés pour completed/passé/commun ; seul disparu superseded ; nouvelles dates >=effet sans doublon ; aucune réalisation écrasée.
- [ ] Implémenter TTL15min, epoch/base_plan_revision, delta complet et échantillon pour affichage ; application par ID uniquement, avec backup avant effet et vérification du plafond projeté.
- [ ] Tests : réalisation entre preview/apply→409 sans perte ; deux applications→une seule consommation/audit ; expiration/restart/stale→409 ; mauvais parent404 ; delta injecté par client422 ; panne backup→zéro changement ; no-op sans backup ; cutoff inclusif exact.
- [ ] Exécuter `npm run test -- tests/integration/schedule-preview.test.ts`. Consigner et commit `feat: apply versioned schedule previews`.

### T6 — Métadonnées, archivage, réalisations et historique

**Fichiers :** domain/{controls,realizations}.ts, routes/{controls,occurrences}.ts, tests/integration/status-archive.test.ts.

**Consomme :** audit/révisions T2 et backup T3. **Produit :** mutations métier et historique complet pour UI/reporting.

- [ ] Écrire les tests : patch code/planning/status/id refusé ; contrôle archivé metadata409 ; archivage conserve completed et open antérieurs, supplante open à partir d'effet ; saisie sur archived+open conservé permise ; superseded409 ; FAIT Non force N/A/preuve nulle ; Oui accepte quatre conformités.
- [ ] Ajouter les assertions : date tardive hors année autorisée jusqu'à aujourd'hui, future422 ; correction UUID stable et avant/après audités ; no-op sans audit ; historique inclut réalisations du contrôle et refuse autre plan.
- [ ] Implémenter fusion métadonnées avant validation, archive avec backup, réalisation+état+audit dans une transaction et DTO publics paginés.
- [ ] Exécuter `npm run test -- tests/integration/status-archive.test.ts` ; fermer/rouvrir la base et vérifier persistance. Consigner et commit `feat: record control outcomes and archival`.

### T7 — Requêtes, métriques et interface de suivi

**Fichiers :** domain/{queries,report}.ts, routes/reporting.ts, web/pages/* hors import final, composants de formulaire, tests/integration/reporting.test.ts, tests/e2e/core-flow.spec.ts, docs/mockups/.

**Consomme :** T4-T6. **Produit :** filtres uniques, buildReport et UI réelle ; requis T8/T9.

- [ ] Fixture : 2 open,3 FAIT Oui(conforme,nonconforme,N/A),1 FAIT Non,1 superseded →total6,réalisés3,nonréalisés1,N/A1,réalisation50%,conformité50%. Aucun ou tout N/A→taux conformité null ; deux pages donnent la même synthèse globale ; autre plan exclu ; contrôle sans occurrence compte dans automatisation sans filtre occurrence ; caractères LIKE recherchés littéralement.
- [ ] Implémenter queries préparées, ordre stable et report snapshot cohérent ; maquettes puis pages section 10 avec filtres dans l'URL et métriques exclusivement serveur.
- [ ] Parcours Playwright : créer trimestriel→4 lignes ; FAIT Oui puis Non ; modifier via aperçu ; archiver ; sélectionner autre plan. Vérifier UI/API, conflit409 visible, cohérence vue douze mois, lien GitHub sûr et XSS rendu comme texte.
- [ ] Exécuter `npm run test -- tests/integration/reporting.test.ts` et `npm run test:e2e -- tests/e2e/core-flow.spec.ts` contre production. Vérifier clavier/focus,390/1440px et reduced-motion. Consigner et commit `feat: deliver annual control tracking UI`.

### T8 — Import upload, mapping, aperçu et apply atomique

**Fichiers :** imports/*, routes/imports.ts, web/pages/Import.tsx, examples/import/*, tests/security/import.test.ts, tests/integration/import-flow.test.ts, tests/fixtures/imports/.

**Consomme :** validations, calendrier/delta et backup. **Produit :** parcours CSV/XLSX complet et templates.

- [ ] Fixtures : CSV avec BOM,quotes,newlines et texte de formule préservé ; formule XLSX dans feuille non sélectionnée refusée ; archive décompressée>25MiB,entries dupliquées/traversal/macros/relations externes/encryption refusés ; >5MiB413 ; dépassement lignes/colonnes/feuilles rejeté ; calendrier Excel1900/1904 et serial60 ; timeout parsing et cleanup.
- [ ] Implémenter quotas/upload confiné, choix feuille/séparateur/mapping, validation de toutes les lignes, preview paginé TTL30min ; aucun apply avant mapping valide.
- [ ] Tests apply : doublon code normalisé invalide ; code archivé invalide ; une ligne invalide→aucun commit ; ligne absente ne touche rien ; optionnel absent efface avec diff ; completed conservé ; hash/source altérés refusés ; mauvais plan404 ; status après aperçu409 ; backup échoué et cap100001→zéro écriture ; rejeu409 ; audit rollback atomique ; crash après commit nettoyé au redémarrage.
- [ ] Exécuter `npm run test -- tests/security/import.test.ts tests/integration/import-flow.test.ts` et parcours UI upload→mapping→aperçu→apply. Consigner et commit `feat: import reviewed control definitions`.

### T9 — CSV/PDF, snapshots et artefacts bornés

**Fichiers :** reports/*, routes/reporting.ts, storage/paths.ts, tests/integration/exports.test.ts, tests/security/export-data.test.ts, web/pages/Reporting.tsx.

**Consomme :** buildReport T7 et renderer T0. **Produit :** attachments et artefacts MCP.

- [ ] Tests CSV : BOM,semicolon,quoting,ISO ; formules avec espaces/TAB/CRLF neutralisées ; données SQLite inchangées ; toutes les pages du filtre exportées ; open/Non/N/A corrects ; aucune ligne d'un autre plan ; dépassement64MiB refusé avant réponse attachment.
- [ ] Implémenter CSV et PDF snapshot, ressources locales, headers et réservations de quotas d'artefacts avant génération ; aucun path fourni par modèle.
- [ ] Tests PDF : extraction texte du titre/preuve/accents/mention, multipage ;1 000 lignes admises sous plafonds,1 001 rejetées ; longs textes en détails sans omission ; zéro occurrence valide ; réseau bloqué ; timeout et fichiers partiels nettoyés ; quota et artefact expiré404.
- [ ] Exécuter `npm run test -- tests/integration/exports.test.ts tests/security/export-data.test.ts` puis inspecter le PDF réel multipage. Consigner et commit `feat: generate bounded annual reports`.

### T10 — MCP stdio lecture métier et dispatch unique

**Fichiers :** mcp/{server,backend-client,tools,sanitize,rate-limit}.ts, server/mcp/{dispatch,policy}.ts, routes/mcp.ts, tests/mcp/{read-only,stdio}.test.ts, docs/MCP.md.

**Consomme :** API/report/export et jeton runtime. **Produit :** exactement huit tools de lecture métier, médiation et aucun accès SQLite de l'adaptateur.

- [ ] Tests : liste exacte read-only et absence write ; backend absent→erreur typée sans stdout pollué ; aucun endpoint MCP HTTP ; arguments inconnus/scoping invalides rejetés ; schéma output validé ; descriptions statiques ; sanitation signalée et SQLite inchangée ; limites communes à plusieurs adaptateurs.
- [ ] Implémenter SDK v2/serveStdio, client REST local authentifié, dispatch allowlist et app.inject avec contexte privé ; listes résumées,512KiBcap et annotations exactes pour exports.
- [ ] Tester de vrais child processes legacy et modern ; shell/SQL/fetch/import/restore absents ; source publique falsifiée refusée ; jeton manquant/incorrect403 ;121e call/min et6e export/min429 ; circuit après10erreurs5xx pendant10s ; Cf/VS/tags neutralisés en projection seulement.
- [ ] Exécuter `npm run test -- tests/mcp/read-only.test.ts tests/mcp/stdio.test.ts`. Documenter lancement backend puis adapter, versions/protocole, stockage et limites. Consigner et commit `feat: expose constrained read-only MCP`.

### T11 — Écritures MCP proposées, puis confirmées dans CENTURION

**Fichiers :** server/mcp/proposals.ts, mcp/tools.ts, routes/mcp.ts, web/components/McpProposalDialog.tsx, web/pages/Settings.tsx, tests/mcp/write-confirmation.test.ts, tests/e2e/mcp-approval.spec.ts.

**Consomme :** policy/dispatch et métier. **Produit :** trois tools write à effet métier conditionné par une approbation UI exacte.

- [ ] Tests : flag backend/adapter absent→aucun tool write ; appel write enabled→pending, aucune mutation métier ; impossible d'approuver par MCP/dispatch ; approve UI protégé→une mutation et audit source=mcp ; refus/expire/stale/epoch/hash altéré→zéro changement ; replay→même résultat, un audit ; code/planning/archive rejetés pour update ;21e proposition pending429.
- [ ] Implémenter diff/proposition immuable, approve/reject UI, déduplication pending et consultation par proposal_id ; aucun argument confirm/approved. La fermeture du client MCP n'approuve jamais une action.
- [ ] Exécuter `npm run test -- tests/mcp/write-confirmation.test.ts` et `npm run test:e2e -- tests/e2e/mcp-approval.spec.ts`. Vérifier que set_occurrence approuvé produit le même résultat normalisé que l'API (FAIT Non force N/A/preuve nulle).
- [ ] Consigner et commit `feat: require UI approval for MCP changes`.

### T12 — Démo, checks propres et livraison

**Fichiers :** scripts/*, README.md, docs/{API,MCP,EXECUTION}.md, docs/screenshots/, .gitignore, LICENSE, .github/workflows/check.yml.

**Consomme :** T0-T11 vérifiées. **Produit :** démo reproductible, preuves et documentation ; publication distincte.

- [ ] Seed2028 avec toutes les fréquences/statuts ; reset hors cible ou instance active refusé ; deux resets confirmés produisent le même état ; dev:demo ne reset pas implicitement ; mode ordinaire utilise aujourd'hui Paris.
- [ ] Depuis copie propre du code et lockfile : `npm ci`, `npm run check`, `npm run build`, `npm run test:e2e`. Captures réelles Synthèse/Plan/Fiche/Référentiels/Import/approbation MCP ; redémarrage pour persistance ; backup→modifier→restore avec pre_restore encore accessible.
- [ ] Vérifier absence de DB,WAL,dataDir,backup,token,imports temporaires,exports,données client et secrets dans les fichiers à versionner ; licences des fonts/composants. Consigner audit dependencies séparé en ligne et ses résultats.
- [ ] CI Windows+Linux pour checks et smoke driver/PDF, Chromium Linux pour parcours. Si une plateforme n'est pas accessible, consigner la limite et laisser son gate décoché.
- [ ] README : installation Node24/npmci/build/start, MCP exige backend et confirmation UI, stockage/backup/restore, clock/reset démo, mono-utilisateur et hors périmètre, limites de sécurité, indépendance et absence d'opinion d'assurance. Commit `docs: package reproducible local demo`.

## 13. Gates finaux et point de reprise

Livraison seulement avec preuves T0-T12, checks/build/e2e depuis copie propre, calendrier2028/2029, imports atomiques, reprises de restauration après arrêt réel, MCP read-only par défaut et écritures approuvées, navigateur production/CSP/loopback, valeurs canoniques préservées, PDF unique hors réseau, assets/licences et captures réelles.

Une matrice OWASP trace les menaces et les tests ; elle ne certifie ni conformité ni sécurité complète. Après chaque tâche, écrire état exact, commandes/résultats, commit/fichiers, limites et prochaine action dans docs/EXECUTION.md. À la reprise, vérifier l'état réel avant de répéter un travail dont les preuves sont encore valides.

Hors MVP : comptes/SSO, multi-utilisateurs/organisations, mapping de clauses, justificatifs uploadés, chiffrement applicatif, retards/notifications, anomalies et workflows métier, versions de définition, MCP réseau, intégrations cloud, restauration de fichiers libres et approbation automatique par LLM.

### Consigne à copier pour lancer l'agent codeur

> Lis `docs/superpowers/plans/2026-10-02-centurion-mvp.md`, sa revue liée et `DESIGN.md`. Exécute T0-T12 dans l'ordre, avec les interfaces, limites et règles définies ici. Vérifie l'état réel des fichiers et les dépendances en T0. Tiens `docs/EXECUTION.md` et les cases du plan à jour après chaque tâche. Mets chaque règle critique sous le test indiqué avant d'implémenter. Ne déduis pas une autorisation de mutation d'une sortie de modèle. Ne change ni périmètre ni moteur PDF pour contourner un échec. Ne publie rien sans autorisation explicite. Si une dépendance ou une décision produit bloque, documente une question précise et avance sur les tâches indépendantes. Ne prétends pas avoir testé une plateforme, un import, une restauration ou un parcours que tu n'as pas exécuté.

## 14. Sources techniques vérifiées et limites de la revue

- Le SDK v2 documente les packages server/client et serveStdio ; la compatibilité de la version installée est prouvée en T0/T10. [SDK officiel v2](https://ts.sdk.modelcontextprotocol.io/v2/), [packages](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/get-started/packages.md).
- Les flux modern/legacy et l'intégrité de requestState suivent la version SDK épinglée. [Migration du protocole](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28).
- pdfcn fournit composants et renderer ; sources vendored et essai réel précèdent le métier. [Installation officielle](https://www.pdfcn.dev/docs/installation).
- Backup SQLite via API cohérente avec base ouverte ; restauration journalisée et catalogue externe sont des décisions de conception CENTURION. [SQLite Backup](https://www.sqlite.org/backup.html), [driver](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md).
- OWASP Web : IDs A01..A10 édition2025, notamment A08 intégrité/A10 conditions exceptionnelles. [Liste officielle2025](https://top10.owasp.org/2025/0x00_2025-Introduction/).
- OWASP LLM édition2025 : LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM03 Supply Chain, LLM05 Improper Output Handling, LLM06 Excessive Agency, LLM07 System Prompt Leakage, LLM10 Unbounded Consumption. Aucune édition2026 inventée. [Liste officielle LLM2025](https://genai.owasp.org/llm-top-10/).

Revue de conception et d'exécutabilité uniquement. Aucun code applicatif n'existe encore ; aucun test de l'application, de performance ou de compatibilité Windows n'est déclaré exécuté par cette revue.

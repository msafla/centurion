# CENTURION — API HTTP locale

Base : `http://127.0.0.1:4317`. Toutes les routes métier sont sous `/api`.
Mutations : `Origin` canonique + en-tête `X-Centurion-Request: 1` +
`Content-Type: application/json` (ou `multipart/form-data` pour l'import).

## Santé

| Route | Réponse |
| --- | --- |
| `GET /health` | `{ "status": "ok", "schema_version": 1 }` |

## Référentiels dynamiques

Les référentiels forment un catalogue ouvert (pas d'enum figé). Un contrôle peut
en relever de plusieurs : `ControlDto.referentials` est une liste de slugs.

| Route | Réponse |
| --- | --- |
| `GET /api/referentials` | `ReferentialDto[]` (`id`, `slug`, `label`), triés par libellé |

Le catalogue initial contient `iso_27001`, `isae_3402_t2`, `pci_dss`, `soc_2`.
À l'import, la colonne `referentiel` accepte plusieurs valeurs séparées par `|`,
`+`, `,` ou `;` (ex. `ISO 27001 + PCI DSS`) : chaque valeur est normalisée en
slug, les valeurs connues sont réutilisées, les inconnues sont créées
automatiquement. L'agrégation `/summary` (`by_referentiel`) et le filtre
`referentiel` portent sur ce catalogue.

## Plans, contrôles, occurrences

| Route | Entrée | Réponse |
| --- | --- | --- |
| `GET /api/plans` | `page`, `page_size` | `Page<PlanDto>` |
| `POST /api/plans` | `{year,name,perimeter}` | `201 PlanDto` (409 si l'année existe) |
| `GET /api/plans/:planId` | — | `PlanDto` |
| `PATCH /api/plans/:planId` | `{name?,perimeter?}` | `PlanDto` |
| `POST /api/plans/:planId/clone` | `{}` | `201 {plan,controls_created,occurrences_created}` |
| `GET /api/plans/:planId/controls` | `page`,`page_size`,`status`,`referentiel`,`domain`,`owner_name`,`automated`,`search` | `Page<ControlDto>` |
| `POST /api/plans/:planId/controls` | `CreateControlInput` | `201 {control,occurrences_generated}` |
| `GET/PATCH /api/plans/:planId/controls/:controlId` | `UpdateMetadataInput` | `ControlDto` |
| `POST .../duplicate` | `{new_code}` | `201 {control,occurrences_generated}` |
| `POST .../archive` | `{effective_date}` | `{control,occurrences_superseded}` |
| `POST .../schedule-preview` | `{schedule,active_from,active_to,effective_date}` | `201` aperçu |
| `POST .../schedule-apply` | `{preview_id}` | `{control,delta_counts}` |
| `GET .../audit-events` | `page`,`page_size` | `Page<AuditDto>` |
| `GET /api/plans/:planId/occurrences` | `FilterInput` + pagination | `Page<OccurrenceDto>` |
| `PUT /api/plans/:planId/occurrences/:occurrenceId/status` | `StatusInput` | `OccurrenceDto` (no-op 200) |
| `GET /api/plans/:planId/summary` | `FilterInput` | `SummaryDto` |
| `GET /api/plans/:planId/report` | `FilterInput` + pagination | `ReportDto` |
| `GET /api/plans/:planId/exports/controls.csv` | `FilterInput` | CSV (`attachment`) |
| `GET /api/plans/:planId/exports/report.pdf` | `FilterInput` | PDF (`attachment`) ou 422 |

## Import

| Route | Entrée | Réponse |
| --- | --- | --- |
| `POST /api/plans/:planId/imports` | multipart `file` | `201 {import_id,expires_at,sheets,headers,sample_rows}` |
| `PUT /api/plans/:planId/imports/:importId/mapping` | `ImportMappingInput` | aperçu persistant |
| `GET /api/plans/:planId/imports/:importId/preview` | pagination | `ImportPreviewDto` |
| `POST /api/plans/:planId/imports/:importId/apply` | `{}` | bilan (409 si consommé/obsolète) |
| `DELETE /api/plans/:planId/imports/:importId` | — | `204` |

## Propositions MCP (UI uniquement)

| Route | Entrée | Réponse |
| --- | --- | --- |
| `GET /api/mcp-proposals` | pagination | `Page<ProposalDto>` |
| `POST /api/mcp-proposals/:proposalId/approve` | `{}` | résultat appliqué |
| `POST /api/mcp-proposals/:proposalId/reject` | `{}` | proposition refusée |

Ces trois routes ne sont **pas** dispatchables par MCP. L'approbation applique la
proposition par injection interne sous contexte privé `source=mcp`.

## Artefacts

`GET /exports/:exportId/download` sert un artefact connu et non expiré
(`attachment`), 404 sinon.

## Sauvegardes (T3)

Catalogue autoritaire externe : fichiers `backups/<uuid>.sqlite` + manifeste
`backups/<uuid>.json` (`format_version=1`). Aucun chemin n'est exposé.

| Route | Entrée | Réponse |
| --- | --- | --- |
| `GET /api/backups` | `page`, `page_size` | `Page<BackupDto>` |
| `POST /api/backups` | `{}` | `201 BackupDto` |
| `POST /api/backups/:backupId/restore-preview` | `{}` | `201` aperçu (TTL 15 min) |
| `POST /api/backups/:backupId/restore` | `{ "preview_id": "<uuid>" }` | `{ "restored": true, "engine_epoch": "<uuid>" }` |

`BackupDto` : `id`, `reason`, `created_at`, `sha256`, `size_bytes`,
`schema_version`. Motifs : `manual`, `pre_import`, `pre_schedule_change`,
`pre_archive`, `pre_restore`.

### Restauration

`restore-preview` enregistre un aperçu (backup_id, hash, révisions globales des
plans, epoch, expiration 15 min). `restore` exige `preview_id` et :

1. revalide l'aperçu, l'epoch, l'expiration, le hash source et les révisions ;
2. crée une sauvegarde `pre_restore` vérifiée ;
3. prépare une candidate vérifiée (intégrité, FK, invariants), migrée, en
   effaçant aperçus/imports/propositions MCP ;
4. draine, checkpoint WAL TRUNCATE, ferme, journalise `prepared` ;
5. renomme l'ancienne base puis la candidate, journalise `old_moved` /
   `new_installed` ;
6. rouvre, écrit `restore_completed` dans l'audit, crée un nouvel epoch,
   journalise `committed`, nettoie.

Pendant l'installation, les lectures refusent avec
`503 maintenance_in_progress` (`Retry-After: 2`).

### Reprise après arrêt

Au démarrage, avant d'ouvrir la base :

- journal absent : rien à faire ;
- `prepared` : l'original est intact, la candidate est supprimée ;
- `old_moved` / `new_installed` : retour à la base précédente (les fichiers
  WAL/SHM de la candidate ne sont jamais rattachés) ;
- `committed` : la nouvelle base vérifiée est conservée ;
- phase inconnue ou fichier précédent manquant : démarrage refusé.

### Erreurs

`403` origine/host, `404` backup/aperçu inconnu, `409` aperçu consommé/expiré/
périmé, `422` schéma trop récent ou sauvegarde corrompue, `503` maintenance.

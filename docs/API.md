# CENTURION — API HTTP locale

Base : `http://127.0.0.1:4317`. Toutes les routes métier sont sous `/api`.
Mutations : `Origin` canonique + en-tête `X-Centurion-Request: 1` +
`Content-Type: application/json` (ou `multipart/form-data` pour l'import).

## Santé

| Route | Réponse |
| --- | --- |
| `GET /health` | `{ "status": "ok", "schema_version": 1 }` |

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

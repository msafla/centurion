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

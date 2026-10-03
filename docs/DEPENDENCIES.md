# CENTURION — dépendances verrouillées (T0)

Relevé : 3 octobre 2026. Toutes les versions sont exactes (`save-exact=true`),
vérifiées dans le registre npm et installées depuis `package-lock.json`.

## Environnement vérifié

| Élément | Valeur |
| --- | --- |
| Node.js | 24.21.0 (LTS v24, `engines: >=24 <25`) |
| npm | 11.19.0 |
| Plateforme réellement testée | Linux x86_64 (WSL2, noyau 6.18) |
| Plateforme non testée à ce stade | Windows 11 natif (binaire Windows de Node 24.19.0 présent, non exercé) |

Le poste fournit un binaire Windows `node.exe` 24.19.0 mais l'exécution des
tests de ce dépôt a eu lieu sous Linux/WSL2. Aucune plateforme n'est déclarée
testée sans preuve d'exécution.

## Dépendances d'exécution

| Paquet | Version | Licence | Rôle |
| --- | --- | --- | --- |
| fastify | 5.12.5 | MIT | Serveur HTTP propriétaire |
| @fastify/static | 10.1.5 | MIT | Service du build UI |
| @fastify/multipart | 10.1.2 | MIT | Upload d'import |
| @fastify/rate-limit | 11.2.0 | MIT | Limites de débit |
| @modelcontextprotocol/server | 2.3.0 | Apache-2.0 | SDK MCP v2 (serveur, `serveStdio`) |
| @modelcontextprotocol/client | 2.3.0 | Apache-2.0 | SDK MCP v2 (client de test, négociation legacy/modern) |
| @modelcontextprotocol/server-legacy | 2.3.0 | Apache-2.0 | Shim clients legacy (protocole pré-2026) |
| better-sqlite3 | 13.0.3 | MIT | SQLite synchrone, API `backup()` |
| takumi-pdf | 0.15.0 | MIT OR Apache-2.0 | Rendu PDF paginé (WASM), moteur pdfcn/Takumi |
| @takumi-rs/helpers | 2.14.0 | MIT OR Apache-2.0 | Arbres de nœuds, chargement de polices |
| csv-parse | 7.0.3 | MIT | Parsing CSV strict |
| exceljs | 4.4.0 | MIT | Lecture XLSX après préflight ZIP |
| yauzl | 3.4.0 | MIT | Préflight ZIP lazy (octets réellement décompressés) |
| proper-lockfile | 4.1.2 | MIT | Verrou exclusif du `dataDir` |
| zod | 4.6.5 | MIT | Schémas stricts partagés |
| react / react-dom | 19.3.0 | MIT | UI |
| react-router-dom | 7.18.4 | MIT | Navigation UI |
| radix-ui | 1.6.7 | MIT | Primitives shadcn |
| class-variance-authority | 0.7.1 | Apache-2.0 | Variantes de composants |
| clsx | 2.1.1 | MIT | Fusion de classes |
| cn | 0.4.0 | MIT | Utilitaire officiel shadcn (ex-`@/lib/utils`) |
| tailwind-merge | 3.7.0 | MIT | Fusion Tailwind |
| lucide-react | 1.50.0 | ISC | Icônes |

## Dépendances de développement

| Paquet | Version | Licence | Rôle |
| --- | --- | --- | --- |
| typescript | 7.0.2 | Apache-2.0 | Compilateur strict (typecheck) |
| vite | 8.3.2 | MIT | Build UI |
| @vitejs/plugin-react | 6.1.1 | MIT | Intégration React |
| tailwindcss / @tailwindcss/vite | 4.3.3 | MIT | Tailwind v4 |
| vitest | 5.0.3 | MIT | Tests unitaires/intégration |
| @playwright/test | 1.63.0 | Apache-2.0 | Tests E2E |
| esbuild | 0.28.2 | MIT | Bundle serveur et adaptateur MCP |
| tsx | 4.23.15 | MIT | Exécution TS en développement |
| shadcn | 4.21.1 | MIT | CLI épinglée (composants UI et pdfcn) |
| @biomejs/biome | 2.5.15 | MIT OR Apache-2.0 | Lint et format |
| unpdf | 1.8.1 | MIT | Extraction de texte PDF (tests) |
| @types/* | voir `package.json` | MIT | Types |

## Décisions de compatibilité

- **TypeScript 7 + Biome.** `typescript-eslint` déclare `typescript >=4.8.4
  <6.1.0` ; il est incompatible avec TypeScript 7.0.2. Le lint est donc confié
  à Biome 2.5.15, qui ne dépend pas du compilateur TypeScript. Vérifié par
  `npm view typescript-eslint peerDependencies`.
- **TypeScript 7 supprime `baseUrl`.** `tsconfig.json` définit `paths` de façon
  relative au fichier de configuration, sans `baseUrl` (`error TS5102` corrigé).
- **SDK MCP v2.** Les paquets v2 sont `@modelcontextprotocol/server`,
  `@modelcontextprotocol/client` et `@modelcontextprotocol/server-legacy`
  (version 2.3.0). L'ancien nom `@modelcontextprotocol/sdk` (1.32.0) est la
  ligne v1 et n'est pas utilisé.
- **PDF.** Le moteur est `takumi-pdf` 0.15.0 (WASM, sans navigateur), pas
  `takumi-js` (rendu d'images OG uniquement). Les composants pdfcn s'installent
  via la CLI shadcn épinglée avec le registre
  `"@pdfcn": "https://pdfcn.dev/r/{name}.json"`.
- **npm 11 et scripts d'installation.** npm 11.19 bloque les scripts de cycle
  de vie non approuvés (`better-sqlite3`, `esbuild`). Aucun n'est nécessaire :
  `better-sqlite3` 13.0.3 embarque des prebuilds pour toutes les plateformes
  (dont `win32-x64`), et `esbuild` fournit son binaire via ses dépendances
  optionnelles. `npm ci` puis les tests confirment le fonctionnement.

## Audit des dépendances

`npm audit --omit=dev --audit-level=high` : 2 vulnérabilités **modérées**,
aucune haute ou critique. Origine : `exceljs@4.4.0` → `uuid@8.x` (avis
GHSA-w5hq-g745-h8pq, contrôle de bornes de buffer en v3/v5/v6). Le correctif
automatique rétrograderait `exceljs` (changement majeur) ; il n'est pas
appliqué. Risque accepté et documenté, à réévaluer si un correctif amont sort.

## Preuves de faisabilité T0

- `npm ci` depuis le lockfile : OK (632 paquets).
- `tests/integration/dependency-smoke.test.ts` : 3 tests passés —
  sauvegarde SQLite WAL + `integrity_check`/`foreign_key_check`, PDF multipage
  (4 pages) avec Poppins locale et extraction d'accents, handshake MCP stdio
  réel en client legacy **et** modern.
- `npm run typecheck`, `npm run lint`, `npm run build` : OK.

## Licences tierces conservées

- `licences/Poppins-OFL.txt` — police Poppins (SIL Open Font License 1.1).
- `public/fonts/Poppins-*.ttf` — cinq graisses (Light, Regular, Medium,
  SemiBold, Bold) issues de `google/fonts` (`ofl/poppins`).

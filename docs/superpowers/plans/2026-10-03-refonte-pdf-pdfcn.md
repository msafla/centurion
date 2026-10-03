# Refonte du rapport PDF avec pdfcn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Améliorer le rapport PDF produit par CENTURION en remplaçant le HTML assemblé en chaîne par les composants PDF pdfcn déjà vendus dans le dépôt, avec une mise en page professionnelle, multipage et vérifiée visuellement.

**Architecture:** Garder `ReportDto` comme snapshot métier et `buildReportPdf(report)` comme frontière du rendu. Construire un document React avec les composants pdfcn locaux, le thème CENTURION, Takumi et les polices locales existantes. Le tableau récapitulatif et les détails seront explicitement paginables, sans chargement réseau ni concaténation de données utilisateur en HTML.

**Tech Stack:** TypeScript/TSX, React, composants pdfcn vendored sous `src/server/reports/components/pdf/`, `takumi-pdf`, `unpdf`, Poppins locale, Vitest.

**Spec:** `docs/superpowers/plans/2026-10-02-centurion-mvp.md` sections PDF, reporting et sécurité des exports ; identité visuelle dans `DESIGN.md` ; renderer actuel dans `src/server/reports/report-pdf.ts`.

## Global Constraints

- Conserver `buildReportPdf(report: ReportDto): Promise<Uint8Array>` et `PDF_MAX_ROWS = 1_000`, limite 64 MiB et erreurs 422 existantes.
- Conserver format A4 paysage, textes français, snapshot cohérent du `ReportDto` et mention « Document généré par CENTURION — ne constitue pas une opinion d'assurance. ».
- Utiliser les composants pdfcn locaux et `takumi-pdf`; ne pas installer de moteur PDF ou de dépendances de rendu supplémentaires.
- Utiliser les polices Poppins disponibles localement dans `public/fonts/` ou `dist/web/fonts/`. Aucun CDN, image distante ou ressource récupérée à partir des données utilisateur.
- Les valeurs issues du rapport restent du texte React échappé ; aucune interpolation de données utilisateur dans du HTML.
- Respecter les plafonds existants : maximum 1 000 occurrences et 64 MiB de PDF ; aucun résultat tronqué silencieusement.

## Review Focus

- Zéro occurrence et filtres sans résultat : PDF valide, mention de vacuité lisible et totaux cohérents.
- Commentaires, références de preuve et titres très longs ou Unicode : rendu complet, césure/pagination compréhensible, aucun chevauchement ni omission.
- Résultat conforme, partiellement conforme, non conforme, non applicable et non réalisé : libellés textuels distincts, contrastés, lisibles en impression monochrome.
- Rapport multipage et limite : numéros de page exacts, entête cohérent, 1 000 lignes admises si sous les limites d’octets, 1 001 refusées avant rendu.
- Injection et réseau : texte comme `<script>` reste inerte, aucune URL externe n’est sollicitée, preuves pouvant contenir caractères HTML sont restituées littéralement.

---

### Task 1: Définir le thème PDF CENTURION et sa structure documentaire

**Files:**
- Create: `src/server/reports/lib/pdf-themes/centurion.ts`
- Create: `src/server/reports/components/pdf/report/report-document.tsx`
- Create: `src/server/reports/components/pdf/report/report-header.tsx`
- Create: `src/server/reports/components/pdf/report/report-summary.tsx`
- Create: `src/server/reports/components/pdf/report/report-table.tsx`
- Create: `src/server/reports/components/pdf/report/report-details.tsx`
- Test: `tests/unit/reports/pdf-theme.test.ts` (ou test de contrat existant si le dépôt en possède un)

**Interfaces:**
- Consumes: `ReportDto` de `src/server/domain/report.ts`; `PdfcnThemeProvider`, `Text`, `PageNumber`, composants de table existants.
- Produces: `CenturionReportDocument({ report }: { report: ReportDto })` comme arbre React de rendu ; thème exporté `centurionPdfTheme`.

- [ ] **Step 1: Écrire les tests de contrat du thème et de la structure**

Tester les tokens PDF attendus (`#451DC7`, `#360058`, `#04F06A`, fond blanc, texte `#111111`, bordure `#E5E0F0`), thème A4 paysage, et fonction de présentation des valeurs canoniques par libellé français sans altérer leur valeur source. Ajouter une vérification que le document reçoit un snapshot `ReportDto` sans accéder à la base.

- [ ] **Step 2: Exécuter le test ciblé et vérifier son échec**

Run: `npm run test -- tests/unit/reports/pdf-theme.test.ts`
Expected: FAIL tant que le thème et le mapper ne sont pas présents.

- [ ] **Step 3: Implémenter le thème et séparer les responsabilités TSX**

Créer `centurionPdfTheme` en adaptant `professionalTheme` et `defaultPrimitives`, en gardant Poppins comme famille body/titres (polices réellement fournies au renderer). Implémenter les composants ciblés : entête/titre et métadonnées ; synthèse chiffrée ; tableau récapitulatif ; blocs de détail identifiés par code et date. Consommer les composants locaux `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `Text`, `PageNumber` au lieu de recréer leurs primitives.

- [ ] **Step 4: Faire passer les tests de thème et vérifier le typecheck**

Run: `npm run test -- tests/unit/reports/pdf-theme.test.ts` puis `npm run typecheck`.
Expected: PASS ; TSX PDF typé dans le projet serveur (mettre à jour les exclusions TypeScript seulement si nécessaire et sans étendre la compilation à des sources pdfcn non concernées).

---

### Task 2: Brancher le rendu pdfcn/Takumi à l’export existant

**Files:**
- Modify: `src/server/reports/report-pdf.ts`
- Modify: `src/server/reports/components/pdf/report/report-document.tsx`
- Test: `tests/integration/exports.test.ts`

**Interfaces:**
- Consumes: `CenturionReportDocument` et `centurionPdfTheme` de Task 1.
- Produces: signature publique inchangée `buildReportPdf(report: ReportDto): Promise<Uint8Array>` et réponse HTTP inchangée.

- [ ] **Step 1: Ajouter des assertions ciblées au test d’export existant**

Dans `tests/integration/exports.test.ts`, contrôler via `unpdf` : titre, nom du plan, période/filtres utiles, entêtes de colonnes, libellés lisibles de conformité, commentaire et preuve, mention juridique, accents, résumé, pagination `Page n / total`; conserver test `%PDF`, mime type et dépassement 1 000 lignes. Inclure les chaînes HTML inertes de la fixture et vérifier qu’elles sont extraites comme texte, non interprétées.

- [ ] **Step 2: Exécuter le test ciblé et noter les assertions manquantes**

Run: `npm run test -- tests/integration/exports.test.ts -t "PDF export"`
Expected: les nouvelles assertions échouent contre le rendu actuel pour les éléments visuels/structurels absents.

- [ ] **Step 3: Remplacer l’assemblage HTML par le document React pdfcn**

Dans `report-pdf.ts`, supprimer `escapeHtml`, `tableRows`, `details` et la construction du HTML. Garder le contrôle `PDF_MAX_ROWS`, chargement paresseux de Takumi, résolution des polices locales et contrôle post-rendu 64 MiB. Fournir l’arbre React au chemin de rendu pris en charge par la version épinglée de `takumi-pdf`, dans `<PdfcnThemeProvider theme={centurionPdfTheme}>`. Ne pas modifier les routes ni le DTO.

- [ ] **Step 4: Ajouter résumé, détails et pagination complète**

Le récapitulatif indique le plan, la date de génération, les filtres actifs, les nombres pertinents (total, fait, conformité, non applicable selon le DTO), puis le tableau des occurrences. Ajouter des blocs de détails pour commentaires/preuves. Afficher code + date pour rattacher chaque bloc. Ajouter le pied de page fixe avec mention légale et `Page {page} / {total}`. Une valeur longue doit pouvoir se poursuivre sur des pages supplémentaires ; elle ne doit pas être coupée par une hauteur fixe.

- [ ] **Step 5: Exécuter les tests PDF ciblés**

Run: `npm run test -- tests/integration/exports.test.ts -t "PDF export"`
Expected: PASS, PDF lisible par `unpdf`, valeurs attendues extraites et limite 1 001 lignes toujours rejetée avant rendu.

---

### Task 3: Vérifier les cas limites, la fidélité visuelle et le build

**Files:**
- Modify: `tests/integration/exports.test.ts`
- Modify: `tests/fixtures/pdf-smoke.mjs` si le fixture est partagé par un invariant du build
- Create: `docs/EXECUTION.md` entrée de validation PDF si le comportement validé change
- Artifacts: captures PNG de pages représentatives sous `docs/presentation/pdf-preview/` ou artefact temporaire documenté

**Interfaces:**
- Consumes: `buildReportPdf()` et limites du produit inchangées.
- Produces: preuve d’extraction multipage et inspection visuelle locale du PDF.

- [ ] **Step 1: Ajouter les tests de cas limites avant d’étendre le style**

Tester PDF vide, texte long (au moins 2 000 caractères), caractères accentués/emoji/Unicode, caractères `<>&`, plusieurs pages et 1 000/1 001 occurrences. Valider le contenu extrait, page count, absence de dépassement de 64 MiB et conservation exacte des preuves/commentaires.

- [ ] **Step 2: Exécuter les tests de cas limites et corriger le rendu minimalement**

Run: `npm run test -- tests/integration/exports.test.ts -t "PDF export"`
Expected: PASS pour vide, longs textes, Unicode, multipage et limites ; aucun texte perdu.

- [ ] **Step 3: Générer puis inspecter visuellement un PDF réel**

Générer un rapport contenant au moins trois pages, une variété de statuts et plusieurs détails longs. Rendre les pages 1, 2 et dernière en PNG avec Chromium ou le renderer local disponible. Vérifier contraste, marges A4 paysage, alignement de tableau, répétition de l’entête/pied de page, absence de collisions et taille lisible des notes. Corriger les écarts observés puis regénérer les images.

- [ ] **Step 4: Vérifier l’absence d’accès réseau et l’intégrité de l’export**

Intercepter ou désactiver les requêtes sortantes pendant le test PDF. Attester qu’aucune ressource distante n’est appelée et que les valeurs malicieuses s’affichent en texte. Vérifier `%PDF`, MIME, `unpdf` et mention requise.

- [ ] **Step 5: Exécuter les portes finales**

Run: `npm run check`, `npm run build`, `npm run test -- tests/integration/exports.test.ts` et `npm run smoke`.
Expected: tous les checks passent, export réel multipage inspecté ; ne déclarer que les plateformes réellement exécutées.


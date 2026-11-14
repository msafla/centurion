# Correctifs UI validés par Playwright — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger la pagination du plan annuel et son débordement mobile, avec des régressions vérifiées dans Chromium/Playwright.

**Architecture:** Conserver `AnnualPlan` et les paramètres d’URL comme source d’état. Une navigation de page conserve les filtres, tandis qu’une modification de filtre remet la page à 1. Réorganiser seulement la barre d’actions pour les écrans étroits ; garder le défilement horizontal limité au tableau.

**Tech Stack:** React, React Router, Tailwind CSS v4, composants shadcn/ui locaux, Playwright.

**Spec:** Défauts reproduits et mesures dans `docs/presentation/VALIDATION.md`; exigences responsive et de navigation clavier dans `DESIGN.md`.

## Global Constraints

- Taille d’une page du plan annuel : 50 occurrences (`PAGE_SIZE` dans `src/web/pages/AnnualPlan.tsx`).
- Les filtres `search`, `referentiel` et `state` doivent repartir de la page 1 ; précédent/suivant ne doivent modifier que `page`.
- Le tableau conserve son conteneur de défilement propre, y compris sur mobile.
- Pas de modification du contrat d’API ni ajout de dépendance.
- L’URL reste partageable et le bouton précédent/suivant du navigateur doit continuer à refléter l’état des filtres.

## Review Focus

- Navigation vers la page suivante avec filtres actifs : vérifier que filtres et numéro de page restent synchronisés avec l’URL et les lignes affichées.
- Changement de filtre depuis une page tardive : vérifier retour à la page 1 même si le nouveau filtre ne comporte qu’une page.
- Dernière page et première page : vérifier les états désactivés de Suivant/Précédent et l’absence de pages vides accessibles par erreur.
- Viewport étroit : vérifier que le titre, les boutons de vue et « Nouveau contrôle » restent visibles, sans scroll horizontal du document.
- Largeur bureau et retour navigateur : vérifier que le correctif mobile ne dégrade pas le layout et que l’URL restaurée reconstitue l’écran.

---

### Task 1: Corriger la navigation et la remise à zéro des filtres

**Files:**
- Modify: `src/web/pages/AnnualPlan.tsx`
- Test: `tests/e2e/annual-plan.spec.ts`

**Interfaces:**
- Consumes: `useSearchParams()` et `filters.page`, déjà utilisés par la page.
- Produces: navigation avec query params cohérents pour les filtres et la pagination ; aucun changement d’API.

- [ ] **Step 1: Ajouter le test Playwright qui échoue sur le défaut actuel**

Créer `tests/e2e/annual-plan.spec.ts`. Créer un contrôle avec 51 occurrences (par exemple une programmation mensuelle répartie sur plusieurs années, si le formulaire accepte l’intervalle) ou utiliser le fixture API de test pour garantir au moins 51 occurrences. Ouvrir `/plan`, cliquer « Suivant », vérifier `Page 2 · 51 occurrences`, vérifier que l’URL contient `page=2` et que la première ligne diffère de la première page.

- [ ] **Step 2: Exécuter le test seul et vérifier son échec actuel**

Run: `npm run test:e2e -- tests/e2e/annual-plan.spec.ts`
Expected: FAIL car le clic « Suivant » supprime actuellement `page` et reste page 1.

- [ ] **Step 3: Distinguer changement de filtre et changement de page dans `AnnualPlan`**

Dans `src/web/pages/AnnualPlan.tsx`, modifier `updateFilter(key, value)` pour supprimer `page` seulement si `key !== 'page'`. Garder la suppression de la clé si `value` est vide. Les clics précédent/suivant doivent donc préserver `search`, `referentiel` et `state`; les filtres/remise à zéro doivent ramener à la première page.

- [ ] **Step 4: Ajouter les assertions de transitions**

Dans le même fichier E2E, ajouter ces vérifications : page 2 → changer le filtre de statut → retour page 1 ; page 2 avec un filtre actif → page 3 conserve le filtre ; page finale désactive « Suivant » ; retour page 1 désactive « Précédent ». Vérifier une modification de query params par le bouton retour du navigateur.

- [ ] **Step 5: Vérifier les tests Playwright du plan**

Run: `npm run test:e2e -- tests/e2e/annual-plan.spec.ts`
Expected: PASS pour la navigation et les transitions de filtres ci-dessus.

---

### Task 2: Rendre l’en-tête et les actions utilisables sur mobile

**Files:**
- Modify: `src/web/pages/AnnualPlan.tsx`
- Test: `tests/e2e/annual-plan.spec.ts`

**Interfaces:**
- Consumes: `Button` shadcn local et le conteneur d’en-tête existant.
- Produces: en-tête qui s’enroule proprement à 390 px, sans masquer les actions ; tableau toujours scrollable dans son conteneur.

- [ ] **Step 1: Ajouter un test Playwright mobile qui reproduit le débordement**

Créer un contexte à `390 × 844`, ouvrir `/plan`, vérifier que « Nouveau contrôle », « Tableau » et « Douze mois » sont visibles et activables, que `document.documentElement.scrollWidth <= window.innerWidth`, et que le conteneur du tableau garde son propre scroll horizontal lorsqu’il est nécessaire.

- [ ] **Step 2: Exécuter le test et vérifier l’échec sur le layout actuel**

Run: `npm run test:e2e -- tests/e2e/annual-plan.spec.ts --grep mobile`
Expected: FAIL car les actions d’en-tête dépassent actuellement le viewport.

- [ ] **Step 3: Adapter les classes responsive de l’en-tête**

Dans `AnnualPlan.tsx`, autoriser le groupe d’actions à prendre la largeur disponible et à revenir à la ligne sur mobile ; aligner les boutons à gauche en petit écran et à droite à partir du breakpoint bureau. Empêcher chaque bouton de se comprimer au point de couper son libellé. Garder le titre sur une largeur disponible et ne pas enlever le `overflow-x-auto` autour du tableau.

- [ ] **Step 4: Vérifier les dimensions bureau et mobile**

Étendre les assertions aux viewports `390 × 844` et `1440 × 900`. À 390 px, toutes les actions doivent rester atteignables et le document ne doit pas déborder ; à 1440 px, le groupe d’actions reste aligné à droite et sur une ligne. Capturer les deux viewports comme pièces de preuve Playwright.

- [ ] **Step 5: Exécuter les portes de validation**

Run: `npm run test:e2e -- tests/e2e/annual-plan.spec.ts` puis `npm run check`.
Expected: tests ciblés verts, TypeScript/lint/tests du projet verts. Si le port E2E configuré est occupé, isoler le serveur de test sur un port libre via configuration explicite ; ne pas arrêter un processus inconnu.


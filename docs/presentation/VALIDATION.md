# Validation CENTURION avec Chromium / Playwright

Date d’exécution : 3 octobre 2026. Les parcours d’écriture ont été exécutés sur une base SQLite temporaire, distincte des données de l’instance déjà présente sur le port 4317. Le serveur de démonstration utilisé pour les captures répondait sur le port 4319. Les captures dans `assets/` proviennent de cette démonstration.

## Résultat

- 14 groupes de parcours Playwright réussis sur l’interface.
- 136 tests unitaires, d’intégration, de sécurité et MCP réussis ; vérifications TypeScript et lint réussies.
- Build de production réussi.
- Tests ciblés supplémentaires réussis : import réel, sauvegarde/restauration, cycle de vie des contrôles et approbation humaine des trois outils MCP d’écriture.
- Aucune exception JavaScript inattendue pendant les parcours. Les erreurs HTTP observées étaient les réponses attendues aux saisies invalides testées.
- Tentative d’exécution de `npm run test:e2e` bloquée parce que le port 4317 était déjà utilisé. L’instance existante renvoyait 200 sur `/health`, mais 404 sur `/`. Elle n’a pas été arrêtée ; les tests ont été isolés sur un port et une base temporaires.

## Couverture Playwright

Navigation des six pages ; filtres, recherche, remise à zéro et vues tableau/calendrier ; création et annulation avec les six fréquences ; validation code dupliqué et URL GitHub ; validation/annulation de réalisation ; quatre résultats de conformité ; dates futures ; règle « fait/non fait » et nettoyage de la preuve ; quatre onglets de détail ; aperçu, application et archivage de programmation ; filtres et exports de reporting ; correspondance, aperçu et application d’import ; paramètres, sauvegarde, restauration et clonage annuel ; approbation ou rejet des propositions MCP ; test de pagination ; test mobile à 390 × 844 ; test d’échappement HTML et d’attributs de lien externes.

## Défauts reproductibles

### Pagination du plan annuel — P2

1. Ouvrir le plan annuel.
2. Afficher plus d’occurrences que la taille d’une page (la démonstration en a 53).
3. Cliquer sur « Suivant ».

Résultat observé : l’indicateur reste sur « Page 1 » et les mêmes lignes restent visibles. En ouvrant directement `?page=2`, la page 2 s’affiche correctement. Cause repérée dans `src/web/pages/AnnualPlan.tsx` : `updateFilter()` supprime le paramètre `page` après sa mise à jour, alors que les boutons de pagination appellent cette fonction.

### Débordement mobile du plan annuel — P2

À 390 × 844 sur `/plan`, le document dépasse 25 px en largeur (415 px mesurés). Le groupe d’actions de l’en-tête dépasse du viewport et le bouton « Nouveau contrôle » est coupé. Le groupe utilise `ml-auto flex items-center gap-2` sans retour à la ligne.

## Limites de couverture

L’interface et l’API n’exposent pas de suppression physique de contrôle. Le parcours de retrait disponible est l’archivage, qui a été testé. Les tests d’écriture ont utilisé des données jetables et n’ont pas modifié de données utilisateur.

## Captures

Les captures PNG de synthèse, plan annuel, référentiels, reporting, import, paramètres et fiche de contrôle sont dans `assets/`. La présentation PDF se génère avec `node docs/presentation/build-pdf.mjs` depuis la racine du dépôt.

# Marque CENTURION

Signe retenu : **piste A — le cimier**. Douze barres verticales en arc de cercle
posées sur une ligne de base : les douze mois du plan annuel, pleins quand le
mois est réalisé, en contour quand il est à venir. La ligne de base évoque le
cimier transversal du centurion, sans casque ni attribut militaire. Le logotype
« CENTURION » est vectorisé en Poppins Light (300) avec un espacement légèrement
ouvert ; aucune police externe n'est embarquée dans les SVG.

## Fichiers

| Fichier | Usage |
| --- | --- |
| `centurion-mark.svg` | Symbole seul, carré (viewBox 64×64) |
| `centurion-logo.svg` | Symbole + logotype, pour fond clair |
| `centurion-logo-dark.svg` | Symbole + logotype, pour fond sombre (accent vert sur la ligne de base) |
| `favicon.svg` | Version simplifiée (6 barres), lisible à 16 px |
| `explorations/piste-a-cimier.svg` | Piste A — cimier à 12 barres (retenue) |
| `explorations/piste-b-anneau.svg` | Piste B — anneau de 12 segments avec coche (non retenue) |
| `explorations/piste-c-ligne.svg` | Piste C — ligne du plan annuel avec coche (non retenue) |
| `preview.html` | Planche autonome : explorations et déclinaisons, fonds clair/sombre, 16/32/64/128 px |

## Couleurs

| Rôle | Valeur | Usage |
| --- | --- | --- |
| Violet principal | `#451DC7` | Symbole et logotype sur fond clair |
| Violet profond | `#360058` | Fonds sombres (bandeaux, pied de page) |
| Vert vif | `#04F06A` | Accent réservé aux fonds sombres (ligne de base du symbole en version dark) |
| Encre | `#111111` | Logotype sur fond clair |
| Blanc | `#FFFFFF` | Logotype et symbole sur fond sombre |

Ne jamais utiliser le vert vif sur fond clair, et ne jamais introduire d'autre
teinte : les barres « à venir » restent en contour du violet principal.

## Zone de protection et tailles minimales

- Zone de protection : ménager autour du logo un espace égal à la hauteur de
  la ligne de base du symbole (5 unités sur la grille 64), soit 1/12 de la
  hauteur du symbole. Aucun texte, filet ou autre signe dans cette zone.
- Taille minimale du symbole : 24 px à l'écran (16 px uniquement via
  `favicon.svg`), 8 mm en impression.
- Taille minimale du logo complet : 140 px de large à l'écran, 40 mm en
  impression.
- Ne pas déformer, incliner, ombrer ou changer les couleurs du logo ; ne pas
  séparer le symbole du logotype.

## Usages

- En-tête du dépôt (README) et profil GitHub : `centurion-logo.svg` sur fond
  clair, `centurion-logo-dark.svg` sur fond sombre (bascule via
  `prefers-color-scheme` quand le rendu le permet).
- Application web : `favicon.svg` en favicon, `centurion-mark.svg` dans
  l'en-tête de navigation à côté du nom « CENTURION ».
- Le symbole seul sert d'avatar, d'icône d'onglet et de pictogramme dans les
  communications courtes.

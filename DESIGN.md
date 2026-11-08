# CENTURION — direction artistique

État : proposition pour revue.

## Référence

Famille typographique géométrique, violet principal, accent vert vif, titres
fins, grands espaces blancs, boutons en pilule et aplats colorés.

## Palette et typographie

| Élément | Valeur |
| --- | --- |
| Police | Poppins |
| Violet principal | `#451DC7`, variable `--blue-vibrant` |
| Vert vif | `#04F06A`, variable `--energy-green` |
| Texte courant | `#111111` |
| Fond courant | `#FFFFFF` |
| Titres du bandeau principal | Poppins 300, 50 px / 60 px, espacement −2,5 px |
| Grands titres de section | Poppins 300, 140 px / 140 px, espacement −5,6 px |
| Titres secondaires | Poppins 400, 26 px / 30 px |
| Actions principales | Texte blanc sur violet, extrémités complètement arrondies |
| Navigation | Bandeau blanc, liens noirs, violet pour la sélection |
| Pied de page | Dégradé radial violet `#451DC7` vers `#360058` |

Les visuels abstraits violets accompagnent des panneaux sombres ; les pages
alternent surfaces blanches et blocs violets. Les titres sont légers et les
mises en page aérées ; les ombres sont discrètes.

## Traduction proposée pour l'application

| Token CENTURION | Valeur proposée | Usage |
| --- | --- | --- |
| `brand-primary` | `#451DC7` | Actions, liens, sélection, identité |
| `brand-deep` | `#360058` | Bandeau de synthèse, couverture du rapport |
| `brand-accent` | `#04F06A` | Repères graphiques sur fond sombre |
| `ink` | `#111111` | Texte principal |
| `surface` | `#FFFFFF` | Fond de travail |
| `surface-soft` | `#F7F5FC` | Séparation de zones |
| `border` | `#E5E0F0` | Lignes des tableaux et séparateurs |
| `text-secondary` | `#625B70` | Métadonnées |

Les trois derniers tokens sont des ajouts proposés pour CENTURION.
Les statuts métier utilisent également des couleurs sémantiques accompagnées
d'un libellé et d'une icône : la couleur seule ne transmet pas une information.
Le vert vif est réservé aux accents et aux surfaces sombres ; les petits
libellés de réussite sur fond blanc utilisent un vert plus sombre.

- Poppins 300 pour les titres, 400 pour le texte, 500/600 pour les actions.
- Utiliser les composants shadcn/ui avec Tailwind CSS v4 pour l'interface,
  puis configurer leurs variables sémantiques aux couleurs CENTURION ci-dessus.
- Reprendre un composant accessible shadcn avant d'écrire un composant maison ;
  garder les nouvelles dépendances d'interface au strict nécessaire.
- Titres de page de 40 à 48 px sur ordinateur et 28 à 32 px sur mobile.
- Texte et données de 14 à 16 px, chiffres avec alignement tabulaire si disponible.
- Navigation supérieure blanche : CENTURION, Synthèse, Plan annuel,
  Référentiels, Reporting ; import et profil accessibles depuis ce bandeau.
- Accueil : titre ample, synthèse violette compacte et échéances directement
  visibles dans un tableau. Les chiffres correspondent à des données réelles.
- Plan annuel : tableau lisible, filtres, vue des douze mois, boutons en pilule.
- Référentiels : matrice et panneau de justification, légende de couverture.
- Fiche contrôle : définition, calendrier, réalisations et historique dans des
  onglets ; édition dans un panneau latéral ou une page selon l'espace disponible.
- Grille d'espacement par multiples de 8 px ; séparateurs fins, surfaces plates,
  rayon de 8 px pour les panneaux et rayon complet pour les actions.
- Transitions brèves de 150–200 ms, respect de la préférence de mouvement réduit.
- Sur mobile, les actions et fiches restent utilisables ; un tableau large défile
  dans sa propre zone avec des indications visibles.

## Livrables visuels attendus

Une maquette de l'écran principal et de la matrice précède l'implémentation.
Les captures du README montrent ensuite l'application exécutée, avec un jeu
de données fictif reproductible : synthèse, plan annuel, fiche contrôle,
rapprochement de référentiels et aperçu d'import.

La police sera intégrée localement depuis une distribution Poppins avec sa
[licence OFL](https://github.com/google/fonts/blob/main/ofl/poppins/OFL.txt).
Les illustrations, le signe CENTURION et les contenus seront propres au projet.

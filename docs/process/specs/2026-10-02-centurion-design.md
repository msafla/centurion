# CENTURION — conception produit

État : conception validée par l'utilisateur le 2 octobre 2026.

## Intention confirmée

CENTURION signifie Contrôles, Efficacité, Normalisation, Traçabilité,
Utilisation, Reporting, Implémentation, Observance, Notification.

Créer un projet vitrine public démontrant une expertise cyber/IT et GRC par
un outil réellement utilisable. Le livrable est un dépôt public, une démo locale
complète, des données fictives et des captures de l'application. La direction
artistique doit se rapprocher explicitement du site Wavestone : voir
[DESIGN.md](../../../DESIGN.md).

Un ou deux utilisateurs entretiennent un plan annuel de sécurité : importer des
contrôles Excel/CSV, en créer ou modifier, suivre les échéances et rapprocher
les contrôles de plusieurs référentiels. ISO 27001 et ISAE 3402 Type 2 sont
les premières cibles. Toute personne autorisée peut enregistrer une réalisation.
Un contrôle récurrent possède plusieurs occurrences distinctes. Sa fréquence
et ses dates sont personnalisables.

## Choix proposés

Trois approches ont été considérées :

| Approche | Intérêt | Limite |
| --- | --- | --- |
| Application navigateur et stockage IndexedDB | Installation minimale, hors ligne | Partage et sauvegarde à organiser, identité peu robuste |
| Application web locale avec API et SQLite | Données durables, fichiers locaux, règles métier testables, évolution vers deux utilisateurs | Nécessite un processus serveur local |
| Service hébergé avec identité externe | Collaboration à distance et SSO | Exploitation et dépendances supplémentaires pour une démo |

Recommandation : application web locale avec API et SQLite. Interface React,
Vite et TypeScript ; API Node.js en TypeScript. Les bibliothèques exactes et
versions seront arrêtées dans le plan d'implémentation après vérification de
leur documentation et de leur maintenance.

Le démarrage et l'usage de la démo ne nécessitent aucun compte cloud. Après
installation, les assets et polices sont servis localement. Les données restent
sur la machine qui exécute le serveur. Le serveur écoute localhost par défaut.

Interface : React/Vite, Tailwind CSS v4 et composants shadcn/ui sélectionnés au
besoin. Utiliser les composants accessibles pour formulaires, tableaux, filtres,
badges, panneaux et dialogues ; employer les variables de couleur sémantiques
pour adapter le thème inspiré de Wavestone. Éviter une couche de composants
maison lorsqu'un composant shadcn couvre déjà le besoin.

Proposition pour l'identité : comptes locaux et sessions, avec deux comptes
de démonstration documentés. L'auteur des actions vient de la session.
Une identité OpenID Connect pourra être ajoutée ensuite ; le SSO est une
extension envisagée, pas une fonction annoncée comme présente dans la V1.

## Valeur démontrée

Le parcours vitrine doit pouvoir montrer en quelques minutes : importer un
plan, calculer des échéances, réaliser un contrôle avec un résultat et une
justification, réutiliser cette réalisation dans plusieurs rapprochements,
puis produire un bilan annuel.

Les différences utiles par rapport à un tableur sont le calendrier calculé,
les occurrences historisées, les rapprochements justifiés et les imports
revus avant application. Le nombre de contrôles réalisés et la qualité des
résultats sont affichés séparément.

## Périmètre de la première version

1. Synthèse : échéances en retard, à venir sous 30 jours, réalisations de la
   période, anomalies ouvertes et rapprochements à examiner.
2. Plan annuel : recherche, filtres par responsable/domaine/statut, vue tableau
   et calendrier annuel, accès à la fiche et aux réalisations.
3. Contrôles : création, édition, archivage, propriétaire, domaine, description,
   méthode, preuve attendue, fréquence, dates et période d'activité.
4. Réalisation : auteur, date réelle, commentaire, résultat satisfaisant,
   anomalie ou indéterminé, justificatifs et action de suivi si nécessaire.
5. Référentiels : entrées versionnées et modifiables, liens multiples avec
   portée, justification, auteur et date de revue.
6. Import CSV/XLSX : choix de feuille, correspondance des colonnes, aperçu,
   validation et comparaison avec le plan existant avant confirmation.
7. Reporting : bilan filtré par période, exports CSV, rapport imprimable et
   sauvegarde/restauration complète des données et justificatifs locaux.
8. Historique : événements de création, édition, réalisation, report de date,
   archivage, import et changement de rapprochement.
9. Les échéances sont visibles dans la synthèse et le plan annuel ; aucun système
   de notification séparé n'est nécessaire à la V1.

Les justificatifs peuvent être ajoutés comme fichiers locaux ou liens, avec
commentaire et résultat.

## Règles du calendrier

- Les échéances sont des dates civiles `YYYY-MM-DD` ; les événements
  techniques ont un horodatage UTC. Le calendrier n'utilise pas une conversion
  implicite de date en UTC qui pourrait changer le jour affiché.
- Modes : ponctuel, toutes les N semaines ou tous les N mois à partir d'une
  date d'ancrage, et liste de dates explicites. Mensuel, trimestriel,
  semestriel et annuel sont des préréglages du mode mensuel.
- Une ancre au 31 produit le dernier jour des mois plus courts ; le prochain
  mois revient au jour d'ancrage. Une ancre au 29 février produit le dernier
  jour de février pour les années non bissextiles.
- Un contrôle trimestriel ancré au 31 mars produit les échéances du 31 mars,
  30 juin, 30 septembre et 31 décembre dans le plan civil correspondant.
- La réalisation tardive du 31 mars le 15 avril conserve l'échéance suivante
  du 30 juin et garde l'information du retard.
- Une date manuelle peut remplacer une échéance particulière, avec motif,
  date initiale et historique. Elle ne change pas les autres occurrences.
- Une modification de fréquence indique une date d'effet et affiche une
  comparaison avant application. Seules les occurrences ouvertes à compter
  de cette date sont recalculées. Les occurrences réalisées, exclues ou
  antérieures à la date d'effet sont conservées.
- Les occurrences ouvertes remplacées sont marquées comme remplacées et
  restent dans l'historique. Les nouvelles occurrences ont un identifiant
  distinct. L'application ne doit pas créer de doublons lors d'un recalcul.
- Une occurrence sans réalisation est en retard après son échéance.
  Une exclusion nécessite un motif et figure dans le rapport.
- L'archivage arrête les prochaines générations à une date d'effet et
  conserve l'historique. Les occurrences ouvertes concernées demandent une
  décision explicite de conservation ou d'annulation motivée.
- La V1 ne déplace pas automatiquement une date en fonction des jours fériés.

## Définition et réalisation

Un contrôle décrit une activité : par exemple, revue des habilitations.
Une occurrence représente une attente datée. Une réalisation indique ce qui
a été fait et le résultat constaté. Réaliser un contrôle avec une anomalie
termine son exécution mais conserve une anomalie ouverte distincte.

Toute modification d'une définition crée une version. Une occurrence garde
la version de contrôle applicable à sa création. Une correction de réalisation
garde l'ancien état dans l'historique. La revue par une seconde personne est
facultative ; elle n'est pas nécessaire pour enregistrer le résultat.

Les identifiants internes sont stables ; le code visible d'un contrôle est
unique dans le plan. Un contrôle utilisé est archivé. Un brouillon sans
occurrence ni réalisation peut être supprimé après confirmation.

## Rapprochement de référentiels

La relation est plusieurs-à-plusieurs : un contrôle peut couvrir plusieurs
entrées et une entrée peut être couverte par plusieurs contrôles. Un lien
contient : version du référentiel, identifiant de l'entrée, portée, niveau
déclaré de couverture (partielle ou complète), justification, auteur et date.
En V1, les liens se créent dans l'interface. L'import en masse des mappings
pourra être ajouté plus tard si un usage le justifie.

La couverture est une appréciation documentée du périmètre sélectionné.
Une entrée sans lien est non rapprochée ; cela ne suffit pas à conclure à une
non-conformité. Une réalisation satisfaisante ne certifie pas une organisation.
Les éventuels taux présentent leur dénominateur et leur portée.

ISO 27001 : édition identifiée, références de clauses ou mesures et descriptions
rédigées pour le projet. Les textes des mesures soumis à licence ne sont pas
redistribués ; l'utilisateur peut importer son catalogue autorisé.

ISAE 3402 : standard d'assurance relatif aux contrôles d'une organisation
prestataire pertinents pour le contrôle interne des clients en matière
d'information financière. Il ne constitue pas un catalogue cyber universel.
CENTURION relie donc des contrôles cyber/IT à des objectifs de contrôle du
périmètre choisi par l'organisation. Les objectifs de démonstration sont
explicitement fictifs et ne sont pas présentés comme des clauses de la norme.

Le suivi des occurrences sur la période aide à organiser des éléments de
préparation à un examen Type 2. L'outil ne produit pas une opinion d'assurance
et n'exécute pas les procédures d'un auditeur.

Source primaire de cadrage : [présentation IAASB d'ISAE 3402](https://www.iaasb.org/publications/staff-overview-international-standard-assurance-engagements-isae-3402-assurance-reports-controls).

## Import et sauvegarde

Un modèle d'import décrit un contrôle par ligne : `code`, `titre`,
`description`, `domaine`, `responsable`, `mode_frequence`, `intervalle`,
`date_ancrage`, `dates_explicites`, `actif_du`, `actif_au`, `preuve_attendue`.
Les dates explicites sont séparées par `|`. Le fichier importe les contrôles ;
les rapprochements sont créés dans l'interface en V1.

L'assistant peut faire correspondre d'autres noms de colonnes. Les dates
ambiguës demandent un format choisi ; les dates Excel natives sont converties
en dates civiles. Les CSV acceptent virgule ou point-virgule et UTF-8 avec
ou sans BOM. Les formules Excel ne sont pas exécutées.

Un réimport utilise le code du contrôle et affiche créations, modifications,
inchangés et erreurs. Les lignes absentes ne suppriment aucun contrôle.
L'import des définitions ne réécrit pas des réalisations historiques.
Les changements de fréquence passent par la règle de recalcul ci-dessus.
Un import invalide n'applique pas partiellement des données à l'insu de l'utilisateur.

La sauvegarde complète utilise un format versionné comprenant données et
fichiers locaux. La restauration valide le format et demande confirmation
avant remplacement. Les exports CSV neutralisent les cellules pouvant être
interprétées comme formules par un tableur.

## Stockage et traçabilité

Entités proposées : utilisateur, plan, contrôle, version de contrôle,
règle de planification, occurrence, réalisation, justificatif, anomalie,
référentiel, entrée, rapprochement, import et événement d'historique.

SQLite assure les écritures transactionnelles. Une édition concurrente
vérifie la version de la donnée ; un conflit est signalé plutôt qu'écrasé.
Les fichiers sont stockés sous des noms internes générés, avec taille,
empreinte SHA-256, date d'ajout et nom d'origine en métadonnées. Les chemins
fournis par un utilisateur ne permettent pas de sortir du stockage prévu.

L'historique est ajouté par l'application et n'est pas modifiable depuis
l'interface ordinaire. La personne ayant accès au disque et à la base garde
la capacité de les modifier : aucune inviolabilité n'est revendiquée.
L'empreinte vérifie l'intégrité d'un fichier enregistré, pas la validité de
son contenu ni la bonne réalisation du contrôle.

## Démonstration et critères de livraison

Le jeu de données original contient des contrôles cyber/IT fictifs : revue
des habilitations, restauration de sauvegarde, traitement des vulnérabilités,
revue de journalisation et gestion des changements. Il inclut des contrôles
ponctuels/récurrents, échéances passées/futures, résultats variés et des
rapprochements partiels/complets avec justification.

Un mode de démonstration documente la date de référence utilisée pour rendre
les captures reproductibles. Le fonctionnement ordinaire utilise la date
courante. La réinitialisation de la démo demande confirmation.

La livraison exige :

- installation et lancement locaux documentés et vérifiés ;
- conservation des données après redémarrage ;
- import Excel et CSV vérifié sur exemples fournis ;
- création/édition/archivage et réalisation utilisables de bout en bout ;
- calendrier testé sur fin de mois, année bissextile, retard et recalcul ;
- rapprochements versionnés et justifiés, sans équivalence automatique ;
- export, sauvegarde et restauration vérifiés ;
- navigation clavier, libellés de formulaire et rendu mobile vérifiés ;
- captures réelles et README expliquant le cas métier et les limites ;
- dépôt contenant uniquement le code propre au projet et les données fictives.

## Choix confirmés pour le premier plan

- API locale et SQLite plutôt que stockage navigateur seul.
- Comptes locaux en V1 et extension SSO OpenID Connect ensuite.
- Justificatifs locaux et liens, avec commentaire et résultat.
- Licence du code et création du dépôt distant : à arrêter avant publication.

La proposition ne contient pas encore de code applicatif ni de plan technique
approuvé. La prochaine étape est la revue de cette conception, puis le plan
de développement avec la première maquette.

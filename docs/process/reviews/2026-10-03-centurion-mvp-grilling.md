# CENTURION — revue du plan par questionnement critique

Date : 3 octobre 2026. Objet : fermer les décisions et rendre le plan exécutable par un agent codeur, sans développer l'application.

Plan revu : [2026-10-02-centurion-mvp.md](../plans/2026-10-02-centurion-mvp.md). Version initiale conservée : [archive originale](2026-10-03-centurion-mvp.original.md).

## Méthode et état réel

Aucune compétence installée nommée `grilling` n'a été trouvée dans les catalogues et dossiers de compétences accessibles. La méthode appliquée est un questionnement critique : pour chaque règle, identifier qui décide, quel état est lu, ce qui peut changer entre aperçu et application, et quelle preuve distingue succès, refus et panne. La compétence `superpowers:writing-plans` a servi pour les interfaces, tâches et critères de vérification ; aucun sous-agent n'a été utilisé.

Le dossier ne contient pas encore de code applicatif ni de dépôt Git. Le plan original était un bon inventaire de règles, mais ne constituait pas un chemin d'exécution fermé : sauvegardes placées après leurs consommateurs, peu de signatures/fichiers, source produit historique contradictoire et plusieurs transitions importantes non définies.

Les décisions ci-dessous sont des **corrections/propositions de revue technique**, pas des préférences utilisateur prétendument confirmées. Le périmètre métier explicite du plan original demeure : mono-utilisateur, sans compte, sans retard, sans pièces jointes et sans mapping de clauses.

Une question a été envoyée sur le lieu de confirmation des écritures IA. Sans autre préférence pendant la revue, la révision retient le choix recommandé : validation dans CENTURION. Le plan contient un seul mécanisme, pas deux branches à choisir par le codeur. Si l'utilisateur choisit ensuite l'elicitation du host, mettre à jour G05 et T11 avant l'exécution ; le host devient alors explicitement une partie de confiance.

## Passe 1 — Peut-on confier ce document à un codeur sans inventer le produit ?

| ID | Question qui met la règle à l'épreuve | Réponse fermée dans la révision | Propriétaire |
| --- | --- | --- | --- |
| G01 | La conception validée exige des comptes, des retards et du mapping ; quel document gouverne ? | Le plan MVP reçu gouverne le comportement ; la conception est historique, DESIGN gouverne l'apparence. Les écarts sont énumérés, sans réintroduire des fonctions hors MVP. | En-tête, §1, T7/T12 |
| G02 | Que fait le démarrage quand une ancienne année existe, mais pas l'année courante ? | Créer automatiquement seulement si plans vide ; sélectionner année courante si présente, sinon la plus récente. Année suivante explicitement créée, cible source+1 unique. | §1, T2/T4 |
| G03 | Les bibliothèques v2 et PDF existent-elles et fonctionnent-elles sur Windows ? | SDK v2/serveStdio vérifiés dans la documentation officielle. Driver/PDF/versions exactes et plateforme démontrés en T0 avant métier ; aucun test Windows n'est inventé. | T0 |
| G04 | « Tests verbeux » décrit-il une commande, une assertion et une sortie de succès ? | Chaque tâche a fichiers, interface produite, commandes et cas observables ; les checks ordinaires sont hors réseau, l'audit de dépendances est une commande distincte. | §11/12 |

## Passe 2 — Qui peut réellement autoriser l'IA et accéder à la base ?

| ID | Question | Réponse de la révision | Propriétaire |
| --- | --- | --- | --- |
| G05 | Un client considéré non fiable peut-il certifier lui-même qu'un humain a confirmé ? | Non garanti par une réponse elicitation seule. L'IA crée une proposition immuable ; un clic dans CENTURION applique le diff, sans tool approve et sans confirm=true. Ce choix change le mécanisme de confirmation original, il ne constitue pas une garantie contre malware/host ayant accès shell hors application. | §9, T11 |
| G06 | Deux processus chacun avec app.inject/SQLite, puis un restore : qui ferme les connexions ? | Un backend propriétaire verrouillé par dataDir. L'adaptateur stdio n'ouvre pas SQLite ; il appelle un dispatcher loopback authentifié, qui utilise app.inject dans le processus propriétaire. | §3, T2/T10 |
| G07 | Le modèle ou un header peut-il forger source=mcp ou accéder aux routes d'approbation ? | Non : allowlist backend, contexte privé AsyncLocalStorage, jeton runtime jamais renvoyé, approbations réservées aux routes UI. Tester aussi l'absence de fuite du contexte vers une requête publique simultanée. | §3/5/9, T10/T11 |
| G08 | Une API locale sans login résiste-t-elle à un navigateur hostile même sans Origin ? | Mutations publiques exigent Origin exacte et header custom, Content-Type contrôlé ; absence/null/cross-site refusés. Cela protège le navigateur, pas les processus locaux capables de forger des headers. | §5, T1 |
| G09 | Read-only signifie-t-il réellement aucun effet disque pour les exports ? | Read-only métier uniquement : deux tools génèrent des artefacts bornés et ont des annotations honnêtes. Aucune mutation métier, aucune écriture arbitraire. | §8/9, T9/T10 |
| G10 | Supprimer les invisibles suffit-il à éliminer la prompt injection ? | Non. Projection distincte et signalée ; les textes restent des données non fiables. La défense repose sur capacités limitées, policy et confirmation, pas sur une promesse de détection. | §9, T10/T11 |

## Passe 3 — Un aperçu peut-il appliquer ce que l'utilisateur n'a pas vu ?

| ID | Question | Réponse de la révision | Propriétaire |
| --- | --- | --- | --- |
| G11 | Une réalisation intervient après un aperçu : updated_at du contrôle suffit-il ? | Non. base_plan_revision inclut toutes les mutations métier du plan, avec epoch de démarrage/restauration. Revalidation sous transaction ; conflit409 sans écriture. | §2/4, T5/T8/T11 |
| G12 | Deux applications du même aperçu créent-elles deux jeux de dates/audits ? | Consommation atomique. Planning/import :409 au rejeu ; approbation MCP appliquée : résultat mémorisé sans mutation supplémentaire. | T5/T8/T11 |
| G13 | Faut-il remplacer aussi une date qui reste commune à deux plannings ? | Non : IDs completed, open antérieurs et open communs conservés ; seuls futurs open disparus superseded ; nouveaux uniquement >=date d'effet sans collision active. | §2, T5 |
| G14 | Les bornes d'activité sont-elles des métadonnées ordinaires ou du planning ? | Planning : aucune modification par PATCH générique ; preview+apply obligatoire avec schedule et bornes. Date d'effet explicite dans l'année, inclusive. | §2/5, T5/T6 |
| G15 | Que se passe-t-il pour un contrôle archivé dans un import ou une réalisation ? | Import/édition/planning/duplication refusés ; réalisation passée conservée et correction autorisées, jamais sur superseded ; pas de réactivation implicite. | §1/7, T6/T8 |

## Passe 4 — Peut-on perdre les données en « réussissant » une sauvegarde ?

| ID | Question | Réponse de la révision | Propriétaire |
| --- | --- | --- | --- |
| G16 | Restaurer une base contenant la table backups fait-il disparaître le dernier pre_restore ? | Catalogue externe durable, manifests vérifiés. pre_restore encore visible après retour en arrière ; pas de table SQLite autoritaire auto-restaurée. | §3/4, T3 |
| G17 | Deux renames Windows sont-ils un remplacement atomique garanti après coupure ? | Non. Candidate + journal durable + previous + recovery déterministe ; refus de démarrage si état incohérent. Arrêts réels entre phases testés. | §3, T3 |
| G18 | Si le backup obligatoire échoue, l'import/planning peut-il quand même passer ? | Non : garde exclusive, backup hors TX puis transaction métier ; aucune mutation intercalée. Panne→refus sans révision/audit métier. Backup implémenté avant tâches dépendantes. | T3/T5/T6/T8 |
| G19 | Une restauration peut-elle réactiver un ancien preview consommé ou un fichier temporaire disparu ? | Non : nouvel epoch, previews/imports/propositions invalidés, fichiers temporaires contrôlés au redémarrage, adaptateurs relisent le jeton. | §3, T3 |

## Passe 5 — Les formats et chiffres ont-ils une seule interprétation ?

| ID | Question | Réponse de la révision | Propriétaire |
| --- | --- | --- | --- |
| G20 | FAIT Non possède-t-il une date de réalisation fictive ? | La date est celle du constat « non réalisé », explicitement libellée. FAIT Oui peut être enregistré hors année pour une saisie tardive, mais pas dans le futur. | §1, T6 |
| G21 | Un import incomplet conserve-t-il ou efface-t-il les anciens champs ? | Définition complète : optionnels absents/vide effacent avec diff ; requis mappés, code normalisé, absence de ligne sans effet. Aucun patch partiel implicite. | §7, T8 |
| G22 | Une route preview seule permet-elle réellement upload→feuille→mapping→diff ? | Contrats distincts upload, mapping, preview paginé et apply par ID ; fichier/normalisé conservés côté serveur. Date d'effet et colonnes indexées définies. | §5/7, T8 |
| G23 | Le ZIP respecte sa taille annoncée mais décompresse des gigaoctets ? | Compter les octets réellement décompressés de toutes les entrées avant parsing, scanner les formules de toutes feuilles ; workers, quotas et cleanup. | §7, T8 |
| G24 | Dates Excel1900/1904, serial60 et texte ambigu donnent-ils des jours différents ? | Deux calendriers natifs pris en charge, serial60 invalide, fractional/time rejetés, texte ISO seulement, pas de timezone implicite. | §7, T8 |
| G25 | La neutralisation CSV modifie-t-elle le texte canonique ou ignore-t-elle des espaces avant '=' ? | Export seulement, détection de premier caractère significatif et tabulations/newlines ; quoting/BOM explicités. Export d'occurrences distinct des templates d'import. | §8, T9 |
| G26 | Un PDF de 100000 lignes est-il silencieusement tronqué ? | PDF1000occurrences/250pages/64MiB/60s ; CSV64MiB ; dépassement explicite, aucune omission ; export complet des filtres hors pagination. | §8, T9 |
| G27 | Les métriques changent-elles lorsqu'on passe à la page2 ou compte-t-on FAIT Non dans N/A ? | Synthèse globale du filtre et dénominateurs explicites ; FAIT Non jamais doublé dans N/A ; zéro dénominateur null/— ; automatisation en contrôles actifs distincts. | §6, T7 |
| G28 | La table occurrence peut-elle être completed sans réalisation, et l'historique manquer ses corrections ? | Contraintes/triggers et transaction d'audit ; référence plan/contrôle aussi dans audits de réalisations. Tests d'intégrité et de scope. | §4, T2/T6 |
| G29 | Les numéros OWASP du document sont-ils vérifiables ? | IDs de l'édition LLM2025 corrigés : LLM03SupplyChain,LLM05OutputHandling,LLM06ExcessiveAgency,LLM07PromptLeakage,LLM10Consumption. ÉditionWeb2025 conservée ; aucune certification revendiquée. | §14 |

## Changements structurants à comprendre avant exécution

- Le transport vers le client IA reste stdio. Seul l'adaptateur utilise REST local vers le backend propriétaire ; aucun serveur MCP HTTP n'est ajouté.
- La confirmation est déplacée du host vers CENTURION. Les tools write préparent une proposition ; le métier change au clic d'approbation dans l'UI, audit source=mcp.
- Catalogue backups externe à la base restaurée ; ajout de restore_previews et mcp_proposals, et d'une révision métier par plan.
- Les tâches backups précèdent leurs consommateurs ; versions réelles et risques Windows/PDF/MCP sont prouvés en T0.
- Les limites opérationnelles ajoutées (exports, quotas temporaires, parsing, proposition pending) produisent des refus explicites. Le codeur ne peut pas tronquer silencieusement.

## Auto-revue finale et vérifications documentaires

Couverture : calendriers, états, CRUD sans delete, archivage, duplication, année suivante, import, métriques, reporting, sauvegarde/restauration, MCP, UI, démo et publication séparée possèdent chacun leur tâche.

Dépendances : T0→T1→T2→T3 ; calendrier T4 puis recalcul T5/réalisations T6 ; report/UI T7 ; import T8 ; exports T9 ; MCP T10 puis confirmation T11 ; packaging T12. Aucune tâche n'exige une fonction backup repoussée à une étape ultérieure.

Interfaces : shapes de création/status/planning/mapping, contextes, source d'audit, ordre/pagination, erreurs et dates définis. Les versions de paquets restent une preuve à produire en T0, pas une version fictive figée aujourd'hui.

Vérifications documentaires exécutées par un script Python le 3 octobre 2026 : 13 tâches T0-T12 dans l'ordre, 55 étapes à cocher, 29 points G01-G29, liens locaux résolus, fences Markdown équilibrés, absence d'espaces de fin, choix de confirmation MCP unique et règle interdisant await app.inject dans une transaction ouverte. Résultat : PASS, exit code 0. L'archive originale contient 1 440 lignes, SHA-256 `3062e404773a5bbd35c83fdaa67929c4798cc53ff6f5f625de8f23827c9c4bd5`. Ce contrôle documentaire ne démontre pas la sécurité ou le fonctionnement de l'application ; aucun code applicatif n'a été exécuté.

Les sources officielles sont liées près des assertions dans la section14 du plan. L'original est conservé et n'est pas un second plan à exécuter.

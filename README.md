# PSN Trophy Tracker

Tracker automatisé des trophées PlayStation du compte **AkinatorII**.

Le dépôt est conçu pour être lu directement par ChatGPT via le connecteur GitHub afin de suivre la progression des trophées entre plusieurs conversations, sans avoir à recopier manuellement les données.

## Objectif

Le workflow GitHub Actions interroge régulièrement le PSN, met à jour les données de progression et les publie dans le dossier `data/`.

ChatGPT doit utiliser ce dépôt comme source de vérité pour répondre aux questions du type :

- « Où j’en suis sur Vampire Survivors ? »
- « Quels trophées me restent sur Anno 117 ? »
- « Qu’est-ce que j’ai débloqué depuis hier ? »
- « Quel est le prochain objectif le plus logique pour le platine ? »
- « Est-ce que mon tracker PSN est à jour ? »

## Fichiers à lire en priorité

### `data/status.json`

État de santé du tracker.

À consulter en premier lorsqu’une réponse dépend de données récentes.

Champs importants :

- `healthy` : `true` si la dernière synchronisation connue est saine.
- `checkedAt` : dernier contrôle de santé publié.
- `lastSuccessfulSync` : dernière synchronisation PSN réussie.
- `totalGames` : nombre de listes de trophées détectées sur le compte.
- `detailedGames` : nombre de jeux dont le détail complet est déjà disponible.
- `lastError` : dernière erreur connue, ou `null`.

Si `healthy` vaut `false`, signaler clairement que les données peuvent être périmées avant de donner une progression précise.

### `data/index.json`

Index global de tous les jeux PSN détectés.

C’est le fichier à utiliser pour :

- trouver un jeu par son nom ;
- connaître sa progression globale ;
- connaître le nombre de trophées bronze, argent, or et platine gagnés ;
- récupérer son `npCommunicationId` ;
- savoir si son détail complet est disponible via `detailsPath`.

Champs utiles pour chaque jeu :

- `name`
- `platform`
- `progress`
- `definedTrophies`
- `earnedTrophies`
- `lastUpdatedDateTime`
- `detailsPath`

`detailsPath: null` signifie que le détail complet n’a pas encore été backfillé. La progression globale reste malgré tout disponible dans l’index.

### `data/games/<NPWR...>.json`

Détail complet des trophées d’un jeu.

Chaque trophée contient notamment :

- `id`
- `name`
- `description`
- `type`
- `group`
- `earned`
- `earnedDateTime`

C’est la source à utiliser pour déterminer exactement quels trophées sont obtenus ou manquants et pour construire une feuille de route de platine personnalisée.

Exemple :

`data/games/NPWR42963_00.json` correspond à **Vampire Survivors PS5**.

### `data/activity.json`

Historique récent des trophées obtenus, toutes listes détaillées confondues.

Les entrées sont triées de la plus récente à la plus ancienne et contiennent :

- `earnedDateTime`
- le jeu concerné ;
- le trophée obtenu ;
- son type et sa description.

À utiliser pour répondre aux questions comme :

- « Quels trophées ai-je gagnés récemment ? »
- « Qu’est-ce qui a changé depuis notre dernière session ? »
- « Quels trophées ai-je obtenus aujourd’hui ? »

L’historique conserve actuellement jusqu’à **250 obtentions récentes** parmi les jeux déjà détaillés.

## Règles recommandées pour ChatGPT

Lorsqu’une conversation demande une progression PSN :

1. Lire `data/status.json` pour vérifier la fraîcheur et la santé du tracker.
2. Lire `data/index.json` pour identifier le jeu demandé.
3. Si `detailsPath` existe, lire le fichier détaillé du jeu avant de conseiller les prochaines étapes.
4. Utiliser `data/activity.json` lorsqu’il faut comparer l’activité récente ou identifier les dernières obtentions.
5. Ne pas supposer qu’un trophée est obtenu à partir d’un ancien échange : les fichiers du dépôt sont la source de vérité la plus récente.
6. Si un jeu a `detailsPath: null`, utiliser uniquement les données globales de l’index et préciser que son backfill détaillé n’est pas encore terminé.
7. Pour une feuille de route de platine, croiser les trophées manquants avec un guide actuel si nécessaire, puis adapter l’ordre des objectifs aux trophées réellement déjà obtenus.

## Synchronisation automatique

Workflow : `.github/workflows/sync-trophies.yml`

Le tracker tente une synchronisation environ toutes les **5 minutes**.

Comportement :

- aucune progression et aucun changement utile → aucun commit inutile ;
- nouveau trophée ou changement de progression → données mises à jour ;
- jeux sans détail → backfill progressif de quelques jeux par run ;
- erreur PSN → `status.json` est mis à jour avec l’état d’erreur avant l’échec du workflow ;
- état sain stable → heartbeat du fichier de santé environ toutes les 12 heures, afin d’éviter de spammer l’historique Git.

## Backfill des jeux

Tous les jeux sont visibles immédiatement dans `data/index.json`, mais leur détail complet est généré progressivement afin de ne pas marteler l’API PSN.

`detailedGames` et `backfillRemaining` dans `data/index.json` permettent de suivre cette initialisation.

Lorsqu’un jeu non encore détaillé voit sa progression changer, il est prioritaire et son détail est synchronisé automatiquement.

## Exécution locale

Pré-requis : Node.js 24+.

Installer les dépendances :

```bash
npm ci
```

Puis exécuter :

```bash
PSN_NPSSO="..." npm run sync
```

Le NPSSO doit rester secret. Il ne doit jamais être commité dans ce dépôt.

## Sécurité

Le secret GitHub Actions utilisé par le workflow est :

`PSN_NPSSO`

Ne jamais écrire sa valeur dans :

- le code ;
- le README ;
- un fichier JSON publié ;
- un commit ;
- une conversation publique.

## Résumé pour un nouveau chat ChatGPT

Si l’utilisateur mentionne **« mon tracker PSN »**, **« mes trophées »**, **« mon platine »** ou demande sa progression sur un jeu PlayStation, utiliser le dépôt :

`AkinatorIV/psn-trophy-tracker`

Ordre de lecture conseillé :

`data/status.json` → `data/index.json` → fichier `data/games/...` du jeu → `data/activity.json` si nécessaire.

Le but est de toujours raisonner à partir de la progression PSN réellement synchronisée, puis d’adapter les conseils de trophées à cette progression.

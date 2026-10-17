# Bastion

Jeu de conquête mondiale pour **3 à 6 humains**, en français et en anglais. Salons privés sans compte, carte originale en SVG, combats Blitz instantanés, cartes progressives, chat public et messages privés.

Bastion est le premier jeu du hub **Tablée** : la racine `/` présente la ludothèque, et chaque jeu disponible a sa propre route (`/mappa`, `/pioche` pour le jeu de cartes de défausse). Dans chaque jeu, le bouton « Tous les jeux » (icône grille, en haut à droite) ramène au hub. Les anciens liens d’invitation `/?room=CODE` sont redirigés vers `/mappa?room=CODE`.

Anciennement nommé Mappa, Bastion conserve l'identifiant technique `mappa`, sa route, les jetons de session et les réglages existants. Son nom affiché est défini dans `games/registry.ts`.

## Lancer

Node.js 24 recommandé.

```sh
npm ci
cp .env.example .env.local
# Renseigner les cinq variables décrites ci-dessous.
npm run dev
```

Production locale : `npm run build`, puis `npm start`.

## Apparence

Le menu « Apparence » (soleil ou lune) du hub et de chaque jeu propose Clair, Sombre et Système. Le choix est partagé entre les jeux et mémorisé dans le navigateur ; par défaut, il suit le système. Le décor Arcade ou Bistrot de Pioche reste un choix indépendant.

Les composants, tailles et états communs sont décrits dans [le design system](docs/design-system.md).

## Configuration

| Variable | Usage |
| --- | --- |
| `SUPABASE_URL` | URL du projet dédié |
| `SUPABASE_PUBLISHABLE_KEY` | Clé publiable, utilisée aussi par le serveur |
| `MAPPA_STORE_SECRET` | Secret aléatoire de 32 octets minimum, exclusivement serveur |
| `NEXT_PUBLIC_SUPABASE_URL` | Même URL pour les notifications Realtime |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publiable pour les notifications Realtime |

Ne jamais préfixer `MAPPA_STORE_SECRET` par `NEXT_PUBLIC_`. `.env.local` est ignoré par Git. L’identité de chaque joueur est un jeton aléatoire de 256 bits conservé dans son navigateur ; seule son empreinte SHA-256 est stockée dans la partie. Effacer les données du navigateur fait perdre cette identité.

## Base de données

Projet Supabase dédié `Mappa`, région Europe (Irlande), organisation Free validée. Les fichiers `docs/schema.sql` et `docs/retention.sql` décrivent le schéma déployé. Pour une nouvelle installation, remplacer l’empreinte dans `schema.sql` par le SHA-256 de son propre `MAPPA_STORE_SECRET`, puis appliquer les deux fichiers au nouveau projet.

Les états sont dans un schéma privé, sans privilèges pour `anon` ou `authenticated`, avec RLS activée. Les quatre fonctions RPC exposées sont des points d’entrée serveur intentionnels : chaque appel vérifie le secret serveur avant tout accès. Elles restent inaccessibles avec la seule clé publiable. Les fonctions `SECURITY DEFINER` ont un `search_path` vide et des références SQL qualifiées.

Chaque mutation compare atomiquement la révision en base ; en cas de concurrence le serveur recharge, revalide et réessaie. Les commandes ont un identifiant pour éviter leur répétition. Les événements Realtime ne contiennent qu’un numéro de révision, sur un canal aléatoire propre au salon. Les cartes adverses, les jetons et les messages privés d’autrui sont retirés de chaque réponse API.

Les navigateurs maintiennent leur présence toutes les 10 secondes. Les échéances sont décidées et validées côté serveur ; les clients connectés déclenchent leur traitement, quel que soit l’hôte. Si tous les clients sont absents, le retour provoque une pause pour déconnexion avant le traitement du chronomètre. Une courte latence réseau reste possible à l’affichage. Les parties sont supprimées après 30 jours sans activité par une tâche quotidienne Supabase Cron.

## Règles retenues

- 42 territoires et six continents, conquête mondiale complète.
- Territoires distribués aléatoirement ; armées initiales : 35/30/25/20 pour 3/4/5/6 joueurs. Placement manuel ou automatique.
- Renforts : minimum 3, territoires divisés par 3 arrondis au plancher, bonus de continents complets.
- Blitz : lancers classiques calculés instantanément, maximum de dés de chaque côté, égalité au défenseur. Une armée reste au départ. Après conquête, déplacement minimal égal au nombre de dés de la dernière attaque.
- Une carte par tour avec conquête ; échanges globaux progressifs 4/6/8/10/12/15 puis +5. Bonus de 2 armées sur un territoire possédé d’une combinaison. Échanges obligatoires à 5 cartes au début du tour ; après élimination à partir de 6 cartes, jusqu’à 4 ou moins.
- Une fortification facultative à travers une chaîne de ses propres territoires.
- Temps facultatif de 2, 3 ou 5 minutes pour tout le tour. À expiration, le serveur termine le transfert minimal, les échanges obligatoires et le placement, puis passe le tour.
- Pause après 60 secondes d’absence du joueur actif, détectée lors du prochain contrôle de présence. Hôte transféré au premier joueur connecté selon l’ordre d’arrivée.
- L’exclusion neutralise les territoires et conserve les armées ; les cartes vont à la défausse. Les neutres ne jouent pas, mais défendent et doivent être conquis.

## Pioche

Jeu de défausse pour **2 à 8 joueurs** sur le paquet classique de 108 cartes : poser une carte de même couleur, même chiffre ou même symbole, et vider sa main le premier. Un joueur à une carte doit crier « Dernière carte ! » avant les autres, sinon il pioche 2 cartes. Le panneau « Règles du jeu » détaille les cartes spéciales et les options.

Options choisies par l’hôte dans la salle d’attente :

- **Cumul des +2 et +4** : répondre à un +2 par un +2, à un +4 par un +4.
- **Piocher jusqu’à pouvoir jouer** : une fois la pioche commencée, on tire carte par carte jusqu’à pouvoir poser.
- **Règle du 7-0** : un 7 échange sa main avec un joueur, un 0 fait tourner toutes les mains.
- **Lots de cartes identiques** : poser d’un coup plusieurs cartes au même chiffre ou au même symbole. La première doit pouvoir se poser, la dernière donne la couleur, et les effets s’additionnent (Passes, +2, +4 ; deux Inversions s’annulent).
- **Temps par tour** : libre, 15, 30 ou 60 secondes.

Chaque joueur choisit son décor de table (Arcade ou Bistrot) ; ce choix ne change rien pour les autres.

## Grand Tour

Jeu d’immobilier autour du monde pour **2 à 6 joueurs**, sur un plateau en 3D de 40 cases : 22 villes en 8 couleurs, 4 aéroports, 2 compagnies, cartes Chance et Trésor. On lance deux dés, on achète, on encaisse des loyers (doublés sur une couleur complète), on construit maisons et hôtels de façon égale, on hypothèque, on échange avec les autres joueurs. Trois doubles d’affilée envoient à la douane. Le dernier joueur qui n’a pas fait faillite gagne. On lance les dés en maintenant le bouton (ou la barre d’espace) puis en le lâchant ; le tour passe tout seul au joueur suivant une fois la case réglée.

Options choisies par l’hôte dans la salle d’attente :

- **Argent de départ** : 1 000, 1 500 ou 2 000.
- **Enchères** : une case refusée part aux enchères ; la meilleure offre l’emporte dix secondes après la dernière mise.
- **Cagnotte de l’Escale** : taxes et amendes s’accumulent sur l’Escale pour qui s’y arrête.

**Mode fun** (règles rapides des jeux de plateau en ligne, toutes activées d’un coup, chacune désactivable) :

- **Construction libre** : on construit sur toute ville achetée, sans avoir la couleur complète ni construire de façon égale.
- **Rachat forcé** : après avoir payé le loyer d’une ville adverse sans hôtel, on peut la racheter à son propriétaire au double de sa valeur (prix et maisons).
- **Tour du monde** : la case Contrôle n’envoie plus à la douane ; on s’envole vers une case libre ou à soi.
- **Festival à l’Escale** : qui s’arrête à l’Escale choisit une de ses villes, dont le loyer double.
- **Victoires éclair** : on gagne aussitôt avec les quatre aéroports, trois couleurs complètes ou toutes les villes d’un côté.

**Durée de la partie** : libre, 20, 30 ou 45 minutes ; à la fin du temps, la plus grosse fortune gagne.

Simplification : la carte « anniversaire » ne met jamais un autre joueur en dette ; il donne ce qu’il a.

## Poker

Texas Hold’em **no-limit pour 2 à 8 joueurs**, avec des jetons fictifs uniquement. Chaque joueur commence avec 1 500 jetons ; pas de recave ni d’entrée après le lancement. Les blindes commencent à 10/20 et progressent entre les mains. Le dernier joueur avec des jetons gagne ; les éliminés restent pour regarder et pour la revanche.

L’hôte choisit dans la salle d’attente le temps de réflexion (15, 30 ou 60 secondes ; 30 par défaut) et la durée des niveaux de blindes (2, 3 ou 5 minutes ; 3 par défaut). Durée visée : 20–30 minutes, sans limite stricte. Le menu des règles détaille les tours de mises, les combinaisons, les tapis, les pots annexes et le partage des égalités. Les relances et l’ordre des blindes suivent les conventions de tournoi de la [Poker TDA](https://www.pokertda.com/view-poker-tda-rules/) ; les absences et abandons ont les règles de salon décrites ci-dessous.

À expiration : parole si possible, sinon coucher. La main suivante démarre automatiquement après le résultat. La reconnexion restaure la place ; après une absence de tous, les horloges sont suspendues. Les mains couchées restent privées, y compris après le tournoi. L’abandon couche la main et retire les jetons non engagés du tournoi ; les mises restent au pot, les cartes hors du paquet.

`games/poker/engine.ts` porte les règles et la projection privée ; `cards.ts` évalue la meilleure combinaison de cinq cartes parmi sept. La brique utilise `platform/useRoom.ts`, les ressorts et la géométrie d’éventail partagés avec Pioche, ainsi que les sons de `games/cards/sound.ts`. Tests : `tests/poker.test.ts` et scénario Poker dans `npm run test:integration`.

## Échecs et Dames

Deux jeux à **deux joueurs** sur le même socle (`games/duel/`) : pendule réglable par l’hôte (libre, 3, 5, 10 ou 15 minutes, avec 0, 2 ou 5 secondes ajoutées par coup), proposition de nulle, abandon, revanche avec couleurs inversées. Les couleurs sont tirées au sort au premier lancement.

- **Échecs** : règles complètes (roque, prise en passant, promotion, pat, triple répétition, cinquante coups, matériel insuffisant ; une chute au temps face à un matériel qui ne peut pas mater est nulle). Le plateau suit les conventions des grands sites d’échecs : glisser-déposer ou deux clics, points des coups possibles, flèches et marques au clic droit, historique navigable aux flèches du clavier, prémoves (des coups préparés pendant le tour adverse, reprises comprises), sons.
- **Dames** : règles internationales sur 10 × 10 (prise obligatoire et majoritaire, dames volantes, promotion seulement en fin de coup sur la dernière rangée, nulle après 25 coups de dames sans prise de chaque côté), sur la même table et le même plateau que les échecs.

## Vérifier

```sh
npm test
npm run typecheck
npm run build
# Avec le serveur local lancé :
npm run test:integration
# Ou contre une URL déployée :
MAPPA_TEST_URL=https://votre-domaine.vercel.app npm run test:integration
```

L’intégration crée des salons de test nommés QA et vérifie 3 et 6 joueurs, les accès, les commandes simultanées, la confidentialité, les combats, la reconnexion et les commandes de l’hôte. Elle crée aussi une table Pioche pour vérifier le routage, la confidentialité des mains, la donne et la pioche, une table Grand Tour pour le routage, l’ordre caché des cartes, un lancer de dés et la confidentialité des échanges, et une table d’échecs et de dames pour le routage, les deux places et la légalité des coups. Elle vérifie aussi une table Poker : confidentialité, options, mises, déduplication, reconnexion et abandon. Elle n’envoie rien à des personnes réelles. Les données de test expirent avec la rétention normale.

## Déploiement

Projet Vercel dédié `mappa`, équipe `pierre-teodoresco's projects`, plan Hobby. Les cinq variables sont configurées en production et preview. Les fonctions sont en région `cdg1`.

Le projet est connecté au dépôt GitHub `pierre-teodoresco/risk`. Chaque push sur `main` déclenche un déploiement en production ; les autres branches et les pull requests génèrent des déploiements de prévisualisation via l’intégration GitHub de Vercel.

Pour inspecter le projet ou déclencher un déploiement manuel :

```sh
npx vercel project inspect --non-interactive
npx vercel deploy --prod
```

Les tarifs retenus sont **0 €** : Vercel Hobby + Supabase Free. Aucun abonnement payant ni nom de domaine acheté. Les limites gratuites s’appliquent : Supabase peut mettre le projet en pause après une semaine sans activité ; le réactiver dans le tableau de bord si nécessaire. Une montée de plan exige une autorisation séparée.

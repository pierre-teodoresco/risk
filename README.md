# Mappa

Jeu de conquête mondiale pour **3 à 6 humains**, en français et en anglais. Salons privés sans compte, carte originale en SVG, combats Blitz instantanés, cartes progressives, chat public et messages privés.

Mappa est le premier jeu du hub **Tablée** : la racine `/` présente la ludothèque, et chaque jeu disponible a sa propre route (`/mappa`, `/pioche` pour le jeu de cartes de défausse). Dans chaque jeu, le bouton « Tous les jeux » (icône grille, en haut à droite) ramène au hub. Les anciens liens d’invitation `/?room=CODE` sont redirigés vers `/mappa?room=CODE`.

## Lancer

Node.js 24 recommandé.

```sh
npm ci
cp .env.example .env.local
# Renseigner les cinq variables décrites ci-dessous.
npm run dev
```

Production locale : `npm run build`, puis `npm start`.

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

Jeu de défausse pour **2 à 8 joueurs** sur le paquet classique de 108 cartes : poser une carte de même couleur, même chiffre ou même symbole, et vider sa main le premier. Un joueur à une carte doit crier « Pioche ! » avant les autres, sinon il pioche 2 cartes. Le panneau « Règles du jeu » détaille les cartes spéciales et les options.

Options choisies par l’hôte dans la salle d’attente :

- **Cumul des +2 et +4** : répondre à un +2 par un +2, à un +4 par un +4.
- **Piocher jusqu’à pouvoir jouer** : une fois la pioche commencée, on tire carte par carte jusqu’à pouvoir poser.
- **Règle du 7-0** : un 7 échange sa main avec un joueur, un 0 fait tourner toutes les mains.
- **Lots de cartes identiques** : poser d’un coup plusieurs cartes au même chiffre ou au même symbole. La première doit pouvoir se poser, la dernière donne la couleur, et les effets s’additionnent (Passes, +2, +4 ; deux Inversions s’annulent).
- **Temps par tour** : libre, 15, 30 ou 60 secondes.

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

L’intégration crée des salons de test nommés QA et vérifie 3 et 6 joueurs, les accès, les commandes simultanées, la confidentialité, les combats, la reconnexion et les commandes de l’hôte. Elle crée aussi une table Pioche pour vérifier le routage, la confidentialité des mains, la donne et la pioche. Elle n’envoie rien à des personnes réelles. Les données de test expirent avec la rétention normale.

## Déploiement

Projet Vercel dédié `mappa`, équipe `pierre-teodoresco's projects`, plan Hobby. Les cinq variables sont configurées en production et preview. Les fonctions sont en région `cdg1`.

Le projet est connecté au dépôt GitHub `pierre-teodoresco/risk`. Chaque push sur `main` déclenche un déploiement en production ; les autres branches et les pull requests génèrent des déploiements de prévisualisation via l’intégration GitHub de Vercel.

Pour inspecter le projet ou déclencher un déploiement manuel :

```sh
npx vercel project inspect --non-interactive
npx vercel deploy --prod
```

Les tarifs retenus sont **0 €** : Vercel Hobby + Supabase Free. Aucun abonnement payant ni nom de domaine acheté. Les limites gratuites s’appliquent : Supabase peut mettre le projet en pause après une semaine sans activité ; le réactiver dans le tableau de bord si nécessaire. Une montée de plan exige une autorisation séparée.

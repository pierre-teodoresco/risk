# Consignes pour les agents

Ces consignes s’appliquent à tout le dépôt. Le projet s’appelle **Mappa** ; le nom du dépôt GitHub est `risk`.

## Avant de modifier

- Pour l’installation, la configuration ou les règles du jeu, consulter [README.md](README.md).
- Pour une intervention sur le stockage, lire aussi [docs/schema.sql](docs/schema.sql) et [docs/retention.sql](docs/retention.sql). Le schéma contient une empreinte de secret propre à l’installation existante ; suivre le README pour une nouvelle installation.
- Pour une vérification de déploiement, consulter [docs/verification.md](docs/verification.md). Ce document rapporte des contrôles datés, pas l’état actuel des services.

## Répartition des responsabilités

- `lib/game.ts` porte les règles, les transitions et la projection `publicGame`. Conserver le moteur indépendant du réseau et du stockage, avec le temps et l’aléatoire injectables pour les tests.
- `lib/store.ts` est exclusivement serveur : identité des joueurs, appels RPC, quotas et persistance. Les routes `app/api/rooms/` valident les requêtes et passent par cette couche.
- `components/Mappa.tsx` orchestre la session navigateur, la synchronisation et les commandes ; `components/Board.tsx` affiche la carte SVG. Le serveur décide de la légalité des actions et des échéances.
- `lib/world.ts` définit les territoires et leurs voisinages. Pour modifier la carte, maintenir la cohérence entre les identifiants, les voisins réciproques, les continents et le rendu.
- `lib/i18n.ts` centralise les textes français et anglais. Ajouter les deux traductions, y compris les libellés accessibles et les nouvelles erreurs métier.

## Invariants multijoueurs

- Toute réponse contenant un état de partie doit utiliser `publicGame` pour le joueur authentifié. La prévisualisation sans identité conserve sa liste explicite de champs publics.
- Préserver la confidentialité des cartes adverses, du paquet, des empreintes de jetons et des messages privés. Les notifications Realtime annoncent une révision ; elles ne transportent pas l’état complet.
- Les mutations utilisent la comparaison atomique de révision et revalident l’action après un conflit. Préserver la déduplication par `requestId` et le rejet des révisions anciennes côté client.
- Lors d’un changement de présence ou de chronomètre, couvrir la reconnexion après absence de tous les joueurs et le transfert d’hôte selon l’ordre d’arrivée.
- L’identité d’une place repose sur le jeton conservé dans le navigateur. Préserver sa restauration et sa séparation par salon.

## Interface

- Conserver les choix explicites du joueur lors des rafraîchissements de l’état : sélection, quantité d’armées et cartes.
- Vérifier les interactions de carte au clavier et au pointeur, ainsi que les états sélectionné, désactivé et en attente.
- Pour une modification de mise en page, contrôler un ordinateur et une tablette en portrait, avec carte utilisable et sans débordement horizontal.

## Validation selon le changement

- **Moteur :** ajouter un test de régression dans `tests/game.test.ts` pour une règle ou un bug, puis lancer `npm test` et `npm run typecheck`.
- **Code applicatif :** lancer `npm run typecheck` et `npm run build` ; ajouter `npm test` si le changement touche le moteur ou ses contrats.
- **API, stockage ou synchronisation :** lancer aussi `npm run test:integration` contre un serveur configuré. La cible est locale par défaut ; `MAPPA_TEST_URL` permet de la choisir. Le script crée de vraies parties QA dans la base de la cible.
- **Interface :** compléter les contrôles de code par un essai du parcours modifié dans les deux langues. Pour la synchronisation, utiliser plusieurs sessions navigateur indépendantes.
- **Documentation seule :** contrôler les chemins, les commandes citées et `git diff --check` ; une suite applicative n’est pas nécessaire.
- Indiquer les contrôles réellement exécutés et leurs limites. Un test bloqué par une configuration manquante reste non exécuté.

## Secrets et opérations

- Garder `MAPPA_STORE_SECRET` exclusivement côté serveur et les valeurs locales dans les fichiers d’environnement ignorés. `.env.example` contient uniquement les noms et des valeurs factices.
- Préserver les contrôles de secret des RPC et les restrictions d’accès aux tables privées lors d’une évolution SQL.
- `scripts/sync-env.mjs` écrit dans les environnements Vercel **production et preview** du projet configuré dans le script. Le réserver aux tâches de configuration explicitement demandées.
- Pour déployer ou modifier une infrastructure, vérifier la cible et les instructions du README. Le budget prévu est gratuit ; tout passage à une offre payante exige une autorisation explicite.

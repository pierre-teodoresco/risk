# Consignes pour les agents

Ces consignes s’appliquent à tout le dépôt. Le projet s’appelle **Mappa** ; le nom du dépôt GitHub est `risk`.

## Avant de modifier

- Pour l’installation, la configuration ou les règles du jeu, consulter [README.md](README.md).
- Pour une intervention sur le stockage, lire aussi [docs/schema.sql](docs/schema.sql) et [docs/retention.sql](docs/retention.sql). Le schéma contient une empreinte de secret propre à l’installation existante ; suivre le README pour une nouvelle installation.
- Pour une vérification de déploiement, consulter [docs/verification.md](docs/verification.md). Ce document rapporte des contrôles datés, pas l’état actuel des services.

## Hub et briques de jeu

- Le site est un hub de jeux, **Tablée**. `games/registry.ts` est l’unique liste des jeux : nom, statut (`live` ou `soon`), joueurs, durée, textes FR/EN et couleur d’accent. Le nom du hub est la constante `HUB_NAME`.
- Ajouter une brique : une entrée dans le registre, son illustration dans `components/hub/art.tsx` (même `id`), puis, quand elle passe en `live`, une page `app/<id>/page.tsx`. Un jeu `soon` reste visible sans lien.
- `components/hub/Hub.tsx` affiche la ludothèque ; ses textes sont `hallTexts` dans `lib/i18n.ts`, ses styles sont limités à `.hall` dans `app/hub.css`. Les illustrations sont rendues côté serveur : ne pas importer `components/hub/art.tsx` depuis un composant client.
- La langue est partagée entre le hub et les jeux par `LANG_KEY`.

## Plateforme

- `platform/` porte ce qui est commun aux jeux : `contract.ts` (le type `GameModule` qu’une brique implémente), `store.ts` (identité, RPC, quotas, sauvegarde atomique, déduplication par `requestId`, notifications) et `modules.ts` (la liste serveur des briques jouables). Une brique jouable fournit un `module.ts` et s’inscrit dans `platform/modules.ts`.
- Les routes `app/api/rooms/` sont génériques : le client indique le jeu attendu par `?game=<id>` (création : champ `game` du corps). Sans paramètre, c’est Mappa, pour les clients antérieurs au hub. Une salle d’un autre jeu se lit comme introuvable.
- Le champ `game` de l’état identifie la brique ; les salles sans ce champ sont des parties Mappa. Les fonctions SQL gardent leur préfixe `mappa_` : ne pas les renommer sans migration explicitement demandée.

- Côté navigateur, `platform/useRoom.ts` gère jeton, création, adhésion, Realtime, présence et commandes d’une brique ; `platform/spring.ts` fournit les ressorts d’animation sans dépendance. Mappa n’utilise pas encore `useRoom`.

## Pioche

- `games/pioche/engine.ts` porte les règles (108 cartes, 2 à 8 joueurs, options d’hôte) et `publicGame`, qui masque les mains adverses, le paquet et la légalité d’un +4. `playable` sert aussi au client pour éclairer les cartes jouables : le serveur reste juge.
- `games/pioche/ui/` contient l’écran : `Hand.tsx` (éventail, survol, glisser-déposer, clavier) et `Pile.tsx` écrivent leurs transformations dans le DOM depuis une boucle de ressorts, hors du rendu React. Les classes CSS propres à Pioche portent le préfixe `pc-` quand elles risquent d’entrer en collision avec `app/globals.css`.
- Textes et erreurs dans `games/pioche/i18n.ts`, en français et en anglais. Tests : `tests/pioche.test.ts`, et un passage Pioche dans `npm run test:integration`.

## Répartition des responsabilités (Mappa)

- `lib/game.ts` porte les règles, les transitions et la projection `publicGame`. Conserver le moteur indépendant du réseau et du stockage, avec le temps et l’aléatoire injectables pour les tests.
- `games/mappa/module.ts` adapte le moteur `lib/game.ts` au contrat de la plateforme ; le client `components/Mappa.tsx` garde sa propre synchronisation.
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

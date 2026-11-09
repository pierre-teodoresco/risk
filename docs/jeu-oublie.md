# Le jeu de mon enfance que je n'arrive pas à retrouver et qui n'existe plus que dans ma tête

Identifiant : `jeu-oublie` (URL `/jeu-oublie`, clés `localStorage` `jeu-oublie.*`). Le nom long n'apparaît que sur la vignette du hub, le titre de la page et l'écran d'accueil.

Jeu de stratégie en temps réel pour 2 à 4 joueurs, sur un damier isométrique. C'est le seul jeu temps réel du hub : il ne passe **pas** par le modèle « une action = une écriture en base » des autres jeux. Ce document explique pourquoi et comment il marche, pour pouvoir le reprendre.

## Règles

- Chaque joueur part d'un coin du damier (sa base, un bloc de 3 × 3 cases). Ses unités y apparaissent toutes seules.
- Une case sur deux (`(x + y)` pair) est **capturable** : les dalles claires. Les autres sont des chemins neutres. Pas d'obstacle.
- Capture : des unités d'un seul joueur sur une dalle la prennent. Une unité seule met 12 s ; chaque unité en plus accélère de 20 %, jusqu'à 2,4 fois plus vite à 8 unités et plus (5 s). Une case adverse est d'abord neutralisée (même durée), puis capturée. Plusieurs joueurs sur la même case : rien ne bouge (`captureRate` dans `sim.ts`).
- Renforts : une unité toutes les `spawn` secondes (5 s pour l'unité de base, selon la faction). Chaque case **reliée** à la base (chaîne de cases qui se touchent par les coins, depuis l'anneau autour de la base) accélère les renforts de 1 %, plafonné à +30 %. Les cases isolées sont dessinées en pointillés et ne comptent pas.
- Combat automatique : deux unités ennemies à moins de 1 case se rapprochent et se frappent une fois par seconde. Juste après un ordre, une unité ignore les ennemis 0,8 s (`IGNORE_TICKS`, pour pouvoir fuir). Redonner sans arrêt des ordres à des unités en combat les empêche donc de se battre : garder ce délai court.
- Base : 3 000 points de vie, une tourelle qui tire sur l'ennemi le plus proche, réparation quand plus personne ne la menace. Un tir retire 22 % de la vie maximale de la cible (40 au plus) : toute unité tombe en cinq tirs. Des dégâts fixes avantageaient nettement les factions à beaucoup de vie lors des assauts (constaté en simulation). Sous 50 %, une milice de « tontons en pantoufles » sort (4 unités temporaires, une fois par minute). Base détruite : le joueur est éliminé, ses cases redeviennent neutres, ses unités disparaissent. La dernière base debout gagne.
- Caisses : toutes les 45 s, une caisse tombe près du centre. La première unité qui la touche l'ouvre : café (vitesse), soupe (soins), super-poulet (unité géante), renforts (5 unités) ou « mise à jour du plug-in » (ennemis figés 4 s).
- Abandonner : la base tombe pour tout le monde (ordre `rs` dans la simulation) et le serveur note le joueur `resigned`. Il garde sa place pour regarder et pour la revanche.
- Pas de mort subite (refusée par le porteur du projet).

### Factions

Toutes les valeurs sont dans [`games/jeu-oublie/factions.ts`](../games/jeu-oublie/factions.ts), le seul endroit à modifier pour équilibrer. L'unité de base apparaît toutes les 5 s, avance de 1,5 case/s, a 100 points de vie et inflige 10 dégâts par coup. Chaque faction est meilleure dans un domaine (`strength`) et le paie ailleurs ; les autres valeurs servent à équilibrer :

| Faction | Spécialité | Apparition | Vitesse | Vie | Dégâts |
|---|---|---|---|---|---|
| Escargots Turbo | apparaissent plus vite | 4,2 s | 1,5 | 90 | 9 |
| Joggeurs du Dimanche | marchent plus vite | 5 s | 2 | 108 | 9 |
| Armoires Normandes | frappent plus fort | 5 s | 1,5 | 80 | 13 |
| Mamies Indestructibles | plus de vie | 5 s | 1,1 | 115 | 9 |

### Équilibrage

`npx tsx scripts/balance-jeu-oublie.ts 30` joue des manches simulées et affiche les taux de victoire :
- des **duels** : ce que chaque faction produit en 90 s affronte la production de l'autre au centre ;
- des **parties complètes 1 contre 1** entre deux bots identiques (même stratégie : expansion par paires, défense de la base, attaque quand l'armée est 1,3 fois plus grosse), sur les deux places, moitié avec des bots pressés (attaque à 12 unités) et moitié avec des bots patients (25 unités). 30 graines donnent 60 parties par paire et 180 par faction (environ ±4 % de bruit).

Valeurs du 2026-11-09 : Escargots 48 %, Joggeurs 43 %, Armoires 53 %, Mamies 54 %, parties de 7 minutes en moyenne. Les bots exploitent mal la vitesse ; des joueurs humains devraient mieux valoriser les Joggeurs. Les combats se comptent en coups entiers (vie ÷ dégâts, arrondi au supérieur) : un petit changement peut franchir un seuil et déplacer beaucoup les résultats.

Le salon, le livret de règles et le test `each faction is best at its own stat` lisent ce tableau. Une nouvelle faction s'ajoute à `FACTION_IDS` et `FACTIONS`, à son dessin dans `unitBody` (`ui/render.ts`) et à ses textes (nom, devise, description, répliques) dans les deux langues de `i18n.ts`.

## Architecture

```
games/jeu-oublie/
  factions.ts   statistiques des factions et couleurs des places
  sim.ts        simulation déterministe (la bataille), sans réseau ni DOM
  engine.ts     salle côté serveur : salon, factions, départ, abandon, résultat
  module.ts     adaptation au contrat de la plateforme (GameModule)
  net.ts        synchronisation entre navigateurs (lockstep sur Supabase Realtime)
  i18n.ts       textes FR/EN, blagues comprises, et erreurs
  ui/JeuOublie.tsx  coquille : barre du haut, useRoom, écran selon la phase
  ui/Screens.tsx    accueil, salon (choix de faction), résultats
  ui/Battle.tsx     écran de bataille : canvas, entrées, HUD, blagues
  ui/render.ts      dessin isométrique (canvas 2D), unités, effets, mini-carte
  ui/Rules.tsx      livret de règles illustré, une page par thème
  ui/sound.ts       sons synthétisés (Web Audio)
  ui/jeu-oublie.css styles, tous préfixés jo-
app/jeu-oublie/page.tsx
tests/jeu-oublie.test.ts
```

### Pourquoi pas le modèle des autres jeux

Les autres jeux écrivent chaque action en base (`platform/store.ts`) et diffusent un numéro de révision. Pour un jeu temps réel, il faudrait diffuser la position de dizaines d'unités plusieurs fois par seconde : Vercel ne peut pas faire tourner de boucle de jeu, et le quota gratuit de messages Realtime de Supabase serait épuisé en quelques dizaines de parties. On a donc choisi, avec le porteur du projet, **pas d'anti-triche** (jeu entre amis) et une simulation dans les navigateurs.

### Ce que fait le serveur (`engine.ts`)

Uniquement la salle : salon (nom, faction, 2 à 4 joueurs, deux joueurs peuvent avoir la même faction), `start` (tire une graine `seed`, fige le `roster` des places dans l'ordre d'arrivée, incrémente `match`, désigne `simHost`), `resign`, `finish` (résultat rapporté par un navigateur : le premier gagne, les suivants sont acceptés sans effet), `again` (retour au salon), `abort` (l'hôte arrête une bataille bloquée), `kick` et `leave`. Il ne voit jamais la bataille. Tout est public sauf les empreintes de jetons.

### La simulation (`sim.ts`)

- 10 ticks par seconde (`TICK_MS = 100`). Positions en millièmes de case (`M = 1000`), en entiers.
- **Déterminisme** : à graine et ordres identiques, tous les navigateurs calculent exactement la même partie. Règles à respecter dans `sim.ts` :
  - n'utiliser que `+ − × ÷`, `Math.sqrt`, `Math.round`, `Math.floor` et `Math.imul` (pas de `Math.sin`, `pow` ou `hypot`, dont les résultats peuvent varier selon le navigateur) ;
  - le hasard vient seulement de `rand(s)`, dont l'état est dans la simulation ;
  - parcourir des tableaux, jamais l'ordre des clés d'objet ;
  - ne rien lire hors de l'état (ni horloge, ni DOM).
  Le rendu (`ui/`) peut faire ce qu'il veut : il ne modifie jamais la simulation.
- L'état est du JSON pur : un instantané est `JSON.stringify(sim)`, et le recharger continue la partie à l'identique (testé). `ev` est le seul champ transitoire : les événements du dernier tick, pour les sons et l'interface.
- Les ordres (`Cmd`) : `mv` (déplacer des unités ; un clic sur une dalle vise son centre, le groupe se répartit en formation), `ra` (point de ralliement), `rs` (abandon). Ils arrivent du réseau : `applyOrder` ignore tout ordre mal formé ou concernant les unités d'un autre joueur.
- `hash(sim)` donne une empreinte de l'état, comparée entre navigateurs.

### Le réseau (`net.ts`)

Canal Realtime **broadcast** public `jo:<channel>:<match>` (le `channel` aléatoire de la salle n'est donné qu'à ses membres), avec la **présence** Realtime pour savoir qui est connecté.

1. Un joueur donne un ordre : message `o` sur le canal.
2. Le navigateur **hôte** (au départ `simHost`) fait tourner l'horloge. Quatre fois par seconde (et aussitôt qu'un ordre arrive), il diffuse un **tour** `t` : les ordres reçus, chacun daté du tick où tout le monde l'appliquera, et `f` (final), la promesse que tous les ordres des ticks `< f` sont connus. `f = tick de l'hôte + 5`.
3. Chaque navigateur simule jusqu'à `f − 1`, au rythme estimé de l'hôte. Les autres navigateurs ont donc environ la latence réseau de retard sur l'hôte, et un ordre s'applique de 300 à 600 ms après le clic. L'interface réagit tout de suite (anneau, son, réplique).
4. Tous les 50 ticks, l'hôte envoie l'empreinte `hash` de son état. Un navigateur qui ne trouve pas la même, qui voit un trou dans les numéros de tour, ou qui arrive en cours de partie, demande un **instantané** (`q` → `s`) : l'état complet en JSON (quelques dizaines de Ko, sous la limite de 256 Ko).
5. **Relais de l'hôte** : si l'hôte se tait pendant 3 s, le premier joueur du `roster` présent sur le canal (hors hôte muet) prend l'horloge, avec une `epoch` plus grande. Les autres se resynchronisent sur son instantané. Si deux hôtes coexistent, l'`epoch` la plus grande gagne, puis la place la plus basse.
6. Chaque navigateur garde un instantané dans `localStorage` toutes les 4 s (`jeu-oublie.snap.<code>.<match>`). Même si tout le monde recharge en même temps, la partie reprend depuis le plus récent.
7. L'horloge tourne dans un petit Web Worker : un onglet en arrière-plan (par exemple quand on joue contre soi-même dans deux fenêtres) ne ralentit pas la partie.
8. Quand la simulation se termine, chaque navigateur envoie `finish` au serveur ; le premier rapport fait foi.

**Limites connues** : pas d'anti-triche (un joueur qui modifie son navigateur peut tricher) ; si tous les joueurs ferment la page et qu'aucun instantané local n'existe plus, la bataille est perdue (l'hôte peut alors l'arrêter avec `abort`) ; la latence d'un ordre est d'environ un demi-seconde.

**Coût Realtime** : environ 4 messages par seconde de l'hôte, multipliés par le nombre de destinataires, plus les ordres. Une partie de 15 minutes à 4 joueurs consomme de l'ordre de 10 000 à 15 000 messages, soit plus d'une centaine de parties par mois dans le quota gratuit de Supabase (2 millions de messages).

## Interface et commandes

- Souris : clic sur une unité pour la sélectionner (Maj pour ajouter). Zone de sélection : un clic au sol ancre le rectangle, qui suit la souris jusqu'au clic suivant (Échap l'annule). Cliquer-glisser marche aussi, mais certains navigateurs le prennent pour le glisser d'une image : le clic en deux temps est la manière documentée. Clic droit pour envoyer. Clic sur sa base puis clic droit : point de ralliement des renforts. Double-clic sur une unité : toutes les unités visibles. `A` : toutes ses unités, `B` : sa base, `Espace` : centrer sur sa base. Les lettres se lisent par le caractère tapé (`e.key`), pas par la position de la touche (`e.code`), pour les claviers AZERTY. Pas de groupes numérotés (retirés à la demande du porteur du projet). Molette : zoom. Flèches, ou souris collée à un bord de l'écran : déplacer la vue.
- Mini-carte : clic ou glisser pour déplacer la vue, clic droit pour envoyer la sélection (ou placer le ralliement).
- Tactile (écran « pointer: coarse ») : glisser pour déplacer la vue, pincer pour zoomer, toucher une unité pour l'ajouter à la sélection, toucher la carte pour l'envoyer. Barre de boutons : Zone (rectangle de sélection), Toutes, Base, Aucune. Toucher la mini-carte avec une sélection l'y envoie.
- Le HUD (scores, sélection, bannières) est rendu par React quatre fois par seconde ; le canvas est redessiné à chaque image, depuis des refs.

## Livret de règles

`ui/Rules.tsx` affiche un livret à pages (but, damier, capture, renforts, combats, bases, caisses, factions, commandes, bon à savoir), chacune avec un petit dessin. Les nombres viennent des constantes du jeu (`BASE_STATS`, `captureRate`, `BONUS_PER_TILE`…) : le livret suit un rééquilibrage sans retoucher les textes, qui sont dans `booklet` (`i18n.ts`). Il s'ouvre tout seul la première fois qu'un navigateur arrive dans un salon, et reste accessible par le livre de la barre du haut, le bouton du salon et le bouton en bas à droite pendant la bataille.

## Humour

Les blagues font partie du jeu, garder les deux langues drôles :
- faux chargement bloqué à 99 % pendant les 4 premières secondes (`WARMUP`), puis fausse alerte « Le plug-in Flash n'est plus pris en charge » ;
- compteur de visiteurs, badge « NOUVEAU ! » clignotant et « Meilleur affichage en 800 × 600 » sur l'accueil ;
- noms et devises des factions, répliques des unités à la sélection et à l'ordre (bulles), unités qui s'endorment (zZz) après 15 s d'inactivité, onomatopées dans les combats ;
- milice des tontons en pantoufles, super-poulet, caisse « mise à jour du plug-in » ;
- fin de partie : « Tu as gagné. Ta mère t'appelle pour manger. » et tableau des meilleurs scores tenu par `Kevin_du_63`.

## Débogage

- En jeu, `window.__jeuOublie` expose l'objet `Match` : `.sim` (l'état), `.role` (`host` ou `client`), `.status`, `.desyncs`.
- La console affiche `[jeu-oublie] desync at tick …` lors d'une resynchronisation, et `[jeu-oublie] this browser now runs the battle clock` lors d'un relais d'hôte.
- Pour jouer contre soi-même : ouvrir le lien d'invitation dans une fenêtre de navigation privée ou un autre navigateur (un second onglet du même navigateur reprendrait la même place).

## Tests

- `tests/jeu-oublie.test.ts` : factions, carte, durée de capture, tourelle (cinq tirs pour toute faction), **déterminisme** (mêmes ordres ⇒ même empreinte, y compris après un instantané JSON), capture et neutralisation, cases contestées, liaison à la base, renforts, combats et tourelle, élimination et victoire, ralliement, ordres mal formés, caisses, longues parties aléatoires à 4 joueurs, et la salle (salon, départ, abandon, résultat unique, revanche, départ en cours de partie, transfert d'hôte).
- `npm run test:integration` : passage « Jeu oublié » (routage, factions, départ, abandon, résultat rapporté une seule fois, revanche, restauration de la place).
- La synchronisation entre navigateurs (relais d'hôte, rechargement, instantanés) a été essayée le 2026-11-09 avec deux puis trois sessions Chrome indépendantes, dont une tablette tactile en portrait : 0 désynchronisation. Ce contrôle n'est pas automatisé dans le dépôt.

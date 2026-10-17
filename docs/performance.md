# Performances du rendu

Mesures locales du 17 octobre 2026, sur une compilation de production (`npm run build`, puis `npm start -- --port 3001`), dans Chromium avec Playwright, en 1440 × 1000. Les réponses de partie sont remplacées par des projections publiques fixes pour comparer la même scène. Les introductions sont terminées avant un échantillon de quatre secondes, avec le profileur CPU actif.

La comparaison part de `17d729f`. Elle précède l'intégration des changements visuels de Grand Tour de `4eed08e` : les chiffres Grand Tour isolent donc les optimisations sur son ancien rendu. Les parcours sont revérifiés après cette intégration.

Ces chiffres servent à comparer les deux versions sur cette machine. Ils ne mesurent ni la latence Supabase, ni les performances d'un GPU différent, ni le nombre d'images par seconde en production.

| Scène au repos | Temps JavaScript avant / après, sur 4 s | Autre changement mesuré |
| --- | --- | --- |
| Entrée Mappa | 951 / 6 ms | Le décor cesse de demander des images après son introduction. |
| Partie Mappa | 1 051 / 525 ms | 484 mises à jour de buffers deviennent 0 ; 4 contextes WebGL au démarrage deviennent 1. |
| Partie Grand Tour, sans échéance | 654 / 497 ms | Les 16 rafraîchissements du composant à 250 ms deviennent 0. |
| Partie Pioche, sans échéance ni réaction | 88 / 38 ms | Les 17 rafraîchissements du composant à 250 ms deviennent 0. |

## Corrections

- L'océan de Mappa utilise les mêmes fonctions de vagues dans le vertex shader, avec leurs normales calculées analytiquement. Le processeur ne parcourt plus les sommets et ne recalcule plus leurs normales à chaque image.
- Les icônes des trois figurines sont des PNG exportés depuis l'ancien rendu, dans `public/mappa/`. Leur affichage ne crée plus trois renderers supplémentaires. Le helper `figureIcon` permet de les réexporter si les figurines changent.
- Les deux moteurs 3D suspendent leurs images lorsque leur hôte est hors du viewport ou que le document est masqué. Les événements de visibilité relancent le rendu ; la synchronisation réseau reste indépendante. Le décor non interactif de Mappa redessine aussi sur changement de propriétés ou de taille.
- Les géométries propres aux villes de Mappa sont libérées lorsque leur garnison est remplacée ; les géométries communes aux figurines restent partagées.
- Les prévisions Blitz utilisent une programmation dynamique exacte à trois lignes et un cache LRU de 128 résultats. Les tests comparent les quatre sorties à une énumération indépendante des dés et à l'ancien calcul.
- Pioche mesure la largeur des cartes une fois avant les écritures de styles de chaque image. Pioche et Grand Tour ne déclenchent leur horloge React à 250 ms que pour une échéance ou un affichage temporaire.
- La résolution d'un code depuis le hub lance les prévisualisations des jeux ensemble, annule les requêtes restantes au premier succès et borne l'attente à huit secondes.

Pour une prévision de 1 000 attaquants contre 800 défenseurs, la médiane de trois calculs locaux à froid passe de 405 à 9,4 ms sous Node.js 24. Les calculs répétés de la même paire utilisent le cache. Les tests vérifient aussi qu'un appelant ne peut pas modifier une prévision mise en cache.

## Contrôles à conserver

`npm test`, `npm run typecheck` et `npm run build` couvrent le calcul des probabilités, la recherche de salon et la combinaison visibilité du document / intersection du plateau.

Dans le navigateur, vérifier la sélection au clavier et au pointeur, le déplacement et le zoom de la carte, les dés et déplacements de Grand Tour, les cartes de Pioche, les minuteurs et l'expiration des réactions/cartes temporaires. Contrôler les deux langues et les deux thèmes sur ordinateur et tablette en portrait. Après masquage du plateau, vérifier l'arrêt et la reprise des images ; après navigation, vérifier l'absence d'erreur de shader ou de contexte WebGL.

Pour cette intervention : 116 tests passent, ainsi que le contrôle TypeScript et la compilation de production. Douze vues des trois jeux sont contrôlées en français/anglais, clair/sombre et 1440 × 1000 / 820 × 1180, avec des réponses API simulées. L'arrêt/reprise hors écran et le gestionnaire de visibilité masquée (événement simulé) sont contrôlés sur les deux moteurs. Une réaction reçue après une période inactive réveille l'horloge de Pioche, expire, puis la laisse s'arrêter. Après trois allers-retours villes/figurines dans Mappa, 9 072 buffers sont libérés et le nombre restant est stable (716 à chaque cycle). La recherche du hub rejoint aussi le cinquième jeu. Ces essais ne constituent pas une mesure réseau ni un test multijoueur contre la base réelle.

La 3D active garde sa fréquence d'affichage, ses ombres et sa résolution. Si une scène reste lente sur un autre matériel, profiler séparément le temps CPU, les draw calls et le coût GPU avant de modifier la qualité visuelle ou la synchronisation.

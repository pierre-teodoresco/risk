# Interface Tablée

Une base légère pour que le hub et les jeux partagent la même interface. Les plateaux, pièces, cartes, couleurs de joueurs et animations de jeu gardent leur langage propre.

## Sources

- `app/typography.css` : Bricolage Grotesque, servie localement, graisses 400 à 800.
- `app/theme.css` : rôles de couleur clair/sombre (`--app-text`, `--app-panel`, `--app-action`, etc.).
- `app/ui.css` : dimensions, espacements, typographie et composants communs. Les classes historiques des jeux sont des alias de ces composants, pas des variantes graphiques.
- Les styles des écrans organisent la mise en page et les éléments de jeu ; ils ne redéfinissent pas l'apparence des contrôles communs.

## Rythme

| Rôle | Valeur |
| --- | --- |
| Espacements | 4, 8, 12, 16, 20, 24, 32, 48 px (`--space-*`) |
| Texte courant | 15 px, interligne 1,5 |
| Légende / métadonnées | 12 / 13 px |
| Contrôle | 14 px, graisse 700 |
| Titre de panneau | 20 px, graisse 800 |
| Titre de dialogue | 24 px |
| Titre de page | 32 px |
| Titre d'entrée de jeu | 40 à 64 px |
| Contrôle standard / compact / grand | 44 / 36 / 48 px |
| Arrondi contrôle / panneau | 10 / 16 px |
| Panneau normal / compact | marge intérieure de 24 / 16 px |

## Composants

- `.ui-button` : action secondaire neutre ; ajouter `.is-primary` pour l'action principale terracotta, `.is-destructive` pour une confirmation destructive ou `.is-danger` pour un avertissement réversible. Tailles `.is-small` et `.is-large`.
- `.ui-icon-button` : contrôle rond de 44 px, icône de 20 px. Toujours donner un libellé accessible. `.ui-close` est le contrôle de fermeture compact de 32 px.
- `.ui-field` : champ ou sélection natif ; conserver un `label` associé, les aides et `aria-invalid` pour une erreur. Les champs natifs reçoivent déjà ce style.
- `.ui-panel` : surface normale ; `.is-compact` pour les panneaux de jeu denses.
- `.ui-choice` : groupe de boutons avec `aria-pressed` pour le choix actif et un nom accessible pour le groupe.
- `.ui-switch` : bouton à bascule avec `aria-pressed` et un libellé accessible.

Les alias existants (`.btn`, `.gt-btn`, `.cc-btn`, `.orb`, `.gt-orb`, `.seg`, `.gt-seg`, `.switch`, `.gt-switch`, `.panel`, etc.) consomment les mêmes règles. Pour un nouvel écran, utiliser les classes `.ui-*`.

## États et couleurs

Une action principale par groupe ; les autres restent secondaires. Le terracotta indique l'action ou la sélection, le rouge une action destructive, le vert une réussite. Les couleurs des joueurs et des cartes portent les informations du jeu et ne remplacent pas ces rôles.

Les états survolé, sélectionné, désactivé et focus clavier sont définis dans `app/ui.css`. Un contrôle désactivé garde un texte lisible et son attribut natif `disabled`. Le focus utilise un contour de 2 px décalé de 3 px. Les transitions de contrôles durent 140 ms et respectent la préférence de mouvement réduit.

Pour une nouvelle variante, ajouter un rôle partagé et vérifier les deux thèmes, le français et l'anglais, un ordinateur et une tablette en portrait. Ne pas ajouter un correctif de couleur ou de taille propre à un jeu pour un composant commun.

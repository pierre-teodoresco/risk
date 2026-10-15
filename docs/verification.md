# Vérification de Mappa

Vérifié le 15 octobre 2026.

- **Production :** https://mappa-flax.vercel.app — réponse publique HTTP 200, sans connexion Vercel nécessaire sur ce domaine.
- **21 tests moteur réussis** : carte réciproque à 42 territoires, installation à 3/4/5/6 joueurs, cartes, renforts, dés et égalités, transfert après conquête, fortification, confidentialité, chronomètres, pause, exclusion, transfert d’hôte et reconnexion après absence totale. Des parties simulées à 3 et 6 joueurs atteignent la conquête mondiale, avec contrôle des invariants de troupes.
- **Intégration réelle à 3 et 6 joueurs réussie**, en local puis sur la production : API → Supabase → API, arrivées et actions concurrentes, idempotence, autorisations, messages privés invisibles au troisième joueur, Blitz, phases, reprise de l’identité, pause et neutralisation.
- **Interface vérifiée dans deux navigateurs** : création et invitation, français et anglais indépendants, préparation, lancement, installation manuelle et automatique, renforts, Blitz, déplacement après conquête, fin de tour et messages privés. L’état est synchronisé en temps réel.
- **Affichage :** ordinateur à 1440 px et tablette à 1024/768 px, sans débordement horizontal ; carte pleine largeur sur tablette portrait. Les petits téléphones restent secondaires. La carte dispose d’un zoom et d’un déplacement.
- **Entrée par code :** une couleur occupée est remplacée par une couleur libre, vérification réelle dans l’interface ; une identité existante est restaurée.
- **Journaux Vercel :** aucune erreur runtime de production dans la fenêtre de cinq minutes contrôlée après les tests.
- **Build de production et TypeScript :** réussis localement et chez Vercel.
- **Dépendances :** `npm audit` sans vulnérabilité connue lors de la livraison.
- **Coût :** Vercel Hobby et organisation Supabase Free confirmés. Aucun plan payant activé.
- **Rétention :** tâche quotidienne Supabase Cron active pour effacer les parties après 30 jours sans activité et les compteurs expirés.

## Accès à la base

Les tables privées ont RLS activée et aucun accès pour les rôles clients. L’absence de politiques est volontaire : elle interdit l’accès par défaut. Les fonctions RPC contrôlent un secret aléatoire de 256 bits détenu exclusivement par le serveur. Une requête avec la clé publiable et un faux secret est refusée.

Le contrôle Supabase signale donc des fonctions `SECURITY DEFINER` exécutables par `anon` : ces quatre fonctions sont des points d’entrée serveur intentionnels, chacune vérifiant le secret avant toute lecture ou écriture, avec un `search_path` vide. Voir [l’explication du contrôle Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable). Le privilège client inutile sur le déclencheur RLS automatiquement créé par Supabase a été retiré. Voir également [RLS sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Limites opérationnelles connues

- Les offres gratuites ont des quotas. Supabase Free peut mettre le projet en pause après une semaine sans activité ; la reprise se fait dans son tableau de bord.
- La présence est vérifiée toutes les 10 secondes : une pause pour absence est traitée au premier contrôle suivant le seuil de 60 secondes. Les décisions de temps restent côté serveur.
- Le jeton de place vit dans le navigateur. Effacer ses données ou changer de navigateur ne restaure pas automatiquement la même place.
- La vérification automatisée des six participants porte sur l’API réelle ; les essais visuels ont utilisé deux navigateurs et un troisième participant de test via l’API.

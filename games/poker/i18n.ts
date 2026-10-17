import type { Lang } from "@/lib/world";
import { errorText as sharedError } from "@/lib/i18n";
import { SUIT_SYMBOL, rankLabel, type Card } from "./cards";
const fr = {
  tagline: "Deux cartes. Toutes les possibilités.", subtitle: "Texas Hold’em · 2–8 amis · 20–30 min", fictional: "1 500 jetons fictifs chacun. Rien à acheter, tout à jouer.",
  yourName: "Ton pseudo", namePlaceholder: "Comment t’appelle-t-on ?", emblem: "Ton emblème", create: "Créer une table", join: "Rejoindre", or: "ou rejoindre des amis", code: "Code de la table", resume: "Reprendre la table",
  allGames: "Tous les jeux", language: "Langue", sound: "Son", howToPlay: "Règles du jeu", close: "Fermer", loading: "Retour à ta table…",
  lobby: "Salle d’attente", invite: "Copier le lien d’invitation", copied: "Lien copié", players: "Joueurs", host: "Hôte", you: "Toi", kick: "Retirer", rules: "Règles de la table",
  timer: "Temps de réflexion", levelMinutes: "Les blindes augmentent toutes les", minutes: "min", start: "Distribuer les cartes", waitHost: "L’hôte lance le tournoi quand tout le monde est là.", needPlayers: "Il faut au moins deux joueurs pour commencer.",
  format: "Tournoi no-limit", formatHint: "1 500 jetons chacun · sans recave · élimination directe", durationHint: "Un tournoi vise 20–30 minutes, sans limite stricte. Les options sont fixées au lancement.",
  pause: "Mettre en pause", resumeGame: "Reprendre", paused: "Table en pause", offlinePause: "La table reprend au retour d’un joueur.", leave: "Quitter la table", resign: "Abandonner", resignConfirm: "Tu perds tes jetons et quittes le tournoi. Tu gardes ta place pour regarder et pour la revanche.",
  connectionLost: "Connexion interrompue. Reconnexion en cours…", hand: "Main", blinds: "Blindes", level: "Niveau", nextLevel: "Prochain niveau", pot: "Pot", dealer: "Donneur", smallBlind: "Petite blinde", bigBlind: "Grosse blinde", board: "Cartes communes", pocket: "Tes cartes", hidden: "Carte cachée",
  yourTurn: "À toi de jouer", waiting: "À {name} de jouer", eliminated: "Éliminé", spectating: "Tu regardes la fin du tournoi. Ta place est gardée pour la revanche.", folded: "Couché", allIn: "Tapis", offline: "Absent", noAction: "En attente", currentHand: "Ta combinaison actuelle", fold: "Se coucher", check: "Parole", call: "Suivre", bet: "Miser", raise: "Relancer", raiseTo: "Montant total sur ce tour", minRaise: "Minimum", halfPot: "½ pot", fullPot: "Pot", totalHint: "Le montant inclut tes jetons déjà engagés sur ce tour.", raisingClosed: "Ce petit tapis ne rouvre pas la relance.",
  nextHand: "Prochaine donne dans", showdown: "Abattage", uncontested: "Tout le monde s’est couché", wonPot: "{name} remporte {amount}", mainPot: "Pot principal", sidePot: "Pot annexe", tournamentOver: "Tournoi terminé", youWon: "La table est à toi !", champion: "{name} remporte le tournoi", again: "Revanche", waitAgain: "L’hôte peut lancer la revanche.", journal: "Journal de la table", noEvents: "La partie commence ici.", chips: "jetons", suits: { s: "pique", h: "cœur", d: "carreau", c: "trèfle" },
  streets: { preflop: "Préflop", flop: "Flop", turn: "Tournant", river: "Rivière", showdown: "Résultat" },
  actions: { fold: "Couché", check: "Parole", call: "Suit", raise: "Relance", allIn: "Tapis", resigned: "Abandon" },
  categories: ["Carte haute", "Paire", "Deux paires", "Brelan", "Quinte", "Couleur", "Full", "Carré", "Quinte flush"],
  ruleTitle: "Le poker, autour d’une table", ruleIntro: "Un paquet de 52 cartes, deux cartes privées par joueur et cinq cartes communes. Gagne les jetons de tes amis, ou fais-les se coucher.",
  ruleSections: [
    ["Le tournoi", "De 2 à 8 joueurs, 1 500 jetons fictifs chacun, sans recave ni entrée tardive. Les blindes commencent à 10/20 et augmentent entre deux mains selon le rythme choisi. Le dernier joueur avec des jetons gagne ; les éliminés restent spectateurs. La durée de 20–30 minutes est indicative."],
    ["Une main", "Chacun reçoit deux cartes cachées. Après le premier tour de mises viennent le flop (3 cartes), le tournant (1) puis la rivière (1), chacun suivi d’un tour de mises. Une carte est brûlée face cachée avant chaque dévoilement. La grosse blinde avance au prochain joueur encore en jeu. Après une élimination, le bouton peut être sur une place vide et la petite blinde peut manquer."],
    ["Les blindes et la parole", "Les deux joueurs après le donneur paient les blindes. Avant le flop, le joueur après la grosse blinde commence ; ensuite, c’est le premier joueur encore en lice après le donneur. À deux, le donneur paie la petite blinde et parle en premier avant le flop, en dernier ensuite. Une petite grosse blinde à tapis ne réduit pas la mise minimale."],
    ["Miser sans limite", "Parole si personne ne te demande de jetons ; suivre pour égaliser, ou te coucher pour renoncer au pot. Miser ou relancer est possible jusqu’à ton tapis. Le montant saisi est ton total sur le tour. Une relance doit ajouter au moins la dernière mise ou relance complète ; un tapis plus petit reste permis. Un petit tapis ne rouvre pas la relance pour qui a déjà parlé, sauf si plusieurs petits tapis cumulent une relance complète. Après une première mise courte, une relance ajoute au moins une grosse blinde. Une parole préalable ne permet pas de relancer cette mise courte."],
    ["Tapis et pots annexes", "Un joueur à tapis reste en lice pour les sommes qu’il a couvertes. Le reste constitue un ou plusieurs pots annexes disputés par les joueurs éligibles. Une mise non suivie est rendue. Quand plus personne ne peut miser, le tableau se termine automatiquement."],
    ["Qui gagne ?", "À l’abattage, la meilleure combinaison de cinq cartes parmi tes deux cartes et les cinq communes gagne. Tu peux utiliser zéro, une ou deux cartes privées. L’As peut commencer A–2–3–4–5 ou terminer 10–J–Q–K–A. À égalité, le pot est partagé ; un jeton indivisible va au premier gagnant après le donneur. Les enseignes ne départagent jamais."],
    ["Cartes privées", "Les mains encore en lice sont montrées au résultat d’un abattage. Les cartes couchées restent privées, même après le tournoi. Une victoire sans opposition ne révèle pas les cartes du gagnant. Un spectateur ne voit aucune carte privée supplémentaire."],
    ["Rythme, absences et abandon", "À la fin du temps de réflexion : parole si possible, sinon coucher. La donne suivante commence après le résultat. Une déconnexion conserve ta place mais le temps continue si d’autres restent connectés ; après une absence de tous, les horloges sont suspendues jusqu’au retour d’un joueur. L’hôte peut mettre la table en pause. Abandonner couche ta main et retire tes jetons non engagés du tournoi ; tes mises restent au pot et tes cartes ne retournent pas au paquet. La revanche remet tous les joueurs restés à égalité."],
  ],
};
export type PokerTexts = typeof fr;
const en: PokerTexts = {
  tagline: "Two cards. Every possibility.", subtitle: "Texas Hold’em · 2–8 friends · 20–30 min", fictional: "1,500 play chips each. Nothing to buy, everything to play for.",
  yourName: "Your name", namePlaceholder: "What should we call you?", emblem: "Your emblem", create: "Create a table", join: "Join", or: "or join your friends", code: "Table code", resume: "Return to table",
  allGames: "All games", language: "Language", sound: "Sound", howToPlay: "How to play", close: "Close", loading: "Returning to your table…",
  lobby: "Waiting room", invite: "Copy invitation link", copied: "Link copied", players: "Players", host: "Host", you: "You", kick: "Remove", rules: "Table rules",
  timer: "Time to act", levelMinutes: "Blinds increase every", minutes: "min", start: "Deal the cards", waitHost: "The host starts the tournament when everyone is here.", needPlayers: "At least two players are needed to start.",
  format: "No-limit tournament", formatHint: "1,500 chips each · no rebuys · elimination", durationHint: "Aim for 20–30 minutes, with no hard time limit. Settings are locked when the tournament starts.",
  pause: "Pause", resumeGame: "Resume", paused: "Table paused", offlinePause: "The table resumes when a player returns.", leave: "Leave table", resign: "Resign", resignConfirm: "You forfeit your chips and leave the tournament. You keep your seat to watch and play the rematch.",
  connectionLost: "Connection lost. Reconnecting…", hand: "Hand", blinds: "Blinds", level: "Level", nextLevel: "Next level", pot: "Pot", dealer: "Dealer", smallBlind: "Small blind", bigBlind: "Big blind", board: "Community cards", pocket: "Your cards", hidden: "Hidden card",
  yourTurn: "Your turn", waiting: "Waiting for {name}", eliminated: "Eliminated", spectating: "You’re watching the rest of the tournament. Your seat is saved for the rematch.", folded: "Folded", allIn: "All-in", offline: "Away", noAction: "Waiting", currentHand: "Your current hand", fold: "Fold", check: "Check", call: "Call", bet: "Bet", raise: "Raise", raiseTo: "Total bet this round", minRaise: "Minimum", halfPot: "½ pot", fullPot: "Pot", totalHint: "This total includes the chips you have already bet this round.", raisingClosed: "This short all-in does not reopen raising.",
  nextHand: "Next deal in", showdown: "Showdown", uncontested: "Everyone else folded", wonPot: "{name} wins {amount}", mainPot: "Main pot", sidePot: "Side pot", tournamentOver: "Tournament over", youWon: "The table is yours!", champion: "{name} wins the tournament", again: "Rematch", waitAgain: "The host can start a rematch.", journal: "Table history", noEvents: "It all starts here.", chips: "chips", suits: { s: "spades", h: "hearts", d: "diamonds", c: "clubs" },
  streets: { preflop: "Preflop", flop: "Flop", turn: "Turn", river: "River", showdown: "Result" },
  actions: { fold: "Folded", check: "Check", call: "Calls", raise: "Raises", allIn: "All-in", resigned: "Resigned" },
  categories: ["High card", "One pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"],
  ruleTitle: "Poker, around one table", ruleIntro: "A 52-card deck, two private cards each and five community cards. Win your friends’ chips, or make them fold.",
  ruleSections: [
    ["The tournament", "2 to 8 players start with 1,500 play chips each. No rebuys or late entries. Blinds start at 10/20 and increase between hands at the chosen pace. The last player with chips wins; eliminated players can stay and watch. The 20–30 minute duration is an estimate."],
    ["One hand", "Everyone receives two hidden cards. The first betting round is followed by the flop (3 cards), turn (1) and river (1), each followed by betting. One card is burned face down before each reveal. The big blind advances to the next surviving player. After an elimination, the button may occupy an empty seat and the small blind may be absent."],
    ["Blinds and order", "The two players after the dealer post the blinds. Before the flop, action starts after the big blind; later, the first live hand after the dealer acts first. Heads-up, the dealer posts the small blind and acts first preflop, last on later rounds. A short all-in big blind does not lower the minimum bet."],
    ["No-limit betting", "Check when no chips are owed, call to match, or fold to give up the pot. You may bet or raise up to your entire stack. The entered amount is your total for this betting round. A raise must add at least the last full bet or raise, unless you go all-in for less. A short all-in does not reopen raising for players who already acted, unless multiple short all-ins together reach a full raise. After a short opening bet, a raise adds at least one big blind. A player who already checked cannot raise that short bet."],
    ["All-ins and side pots", "An all-in player competes only for contributions they have covered. Extra contributions form side pots for eligible players. Uncalled chips are returned. When no further betting is possible, the board runs out automatically."],
    ["Winning a hand", "At showdown, make your best five-card hand from your two cards and the five community cards. You can use zero, one or both private cards. An ace can start A–2–3–4–5 or end 10–J–Q–K–A. Ties split the pot; any odd chip goes to the first tied winner after the dealer. Suits never break ties."],
    ["Private cards", "Hands still in contention are revealed at a showdown result. Folded cards remain private, even after the tournament. An uncontested winner does not reveal their cards. Spectators see no additional private cards."],
    ["Pace, absences and resigning", "When your timer expires: check if possible, otherwise fold. The next hand starts after the result. Disconnecting preserves your seat, but your timer runs while others remain connected; after everyone has been away, clocks freeze until a player returns. The host can pause the table. Resigning folds your hand and removes your uncommitted chips from the tournament; bets stay in the pot and your cards stay out of the deck. A rematch gives everyone who stayed an equal stack again."],
  ],
};
export const pokerTexts = (lang: Lang) => lang === "fr" ? fr : en;
export const cardLabel = (card: Card, tx: PokerTexts) => `${rankLabel(card.rank)} ${tx.suits[card.suit]}`;
export const cardShort = (card: Card) => `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
export function errorText(code: string, lang: Lang) {
  const errors: Record<string, [string, string]> = {
    emblemTaken: ["Cet emblème vient d’être choisi.", "That emblem is already taken."],
    playerCount: ["Il faut 2 à 8 joueurs.", "You need 2 to 8 players."],
    cannotCheck: ["Il faut suivre ou se coucher.", "Call or fold to continue."],
    cannotRaise: ["La relance n’est pas ouverte.", "Raising is not open."],
    invalidRaise: ["Cette relance est inférieure au minimum.", "That raise is below the minimum."],
  };
  return errors[code]?.[lang === "fr" ? 0 : 1] ?? sharedError(code, lang);
}
export function eventText(key: string, args: string[], tx: PokerTexts) {
  if (key === "dealt") return `${tx.hand} ${args[0]} · ${args[1]}/${args[2]}`;
  if (key === "street") return tx.streets[args[0] as keyof typeof tx.streets] ?? "";
  if (key === "wonPot") return tx.wonPot.replace("{name}", args[0]).replace("{amount}", args[1]);
  if (key === "champion") return tx.champion.replace("{name}", args[0]);
  if (key === "timeout") return `${args[0]} · ⏱`;
  const action = tx.actions[key as keyof typeof tx.actions];
  return action ? `${args[0]} · ${action}${["raise", "call", "allIn"].includes(key) ? ` ${args[1]}` : ""}` : "";
}

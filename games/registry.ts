// The hub's game shelf. Adding a brick starts here: one entry per game, in shelf order.
// A "live" game is served at gamePath(id); a "soon" game is shown on the shelf without a link.
// Box art lives in components/hub/art.tsx, keyed by the same id.
import type { Lang } from "@/lib/world";

export const HUB_NAME = "tablée";

export type GameStatus = "live" | "soon";
export type GameEntry = {
  /** URL segment and storage prefix: lowercase, no spaces. */
  id: string;
  name: string;
  status: GameStatus;
  players: { min: number; max: number };
  minutes: { min: number; max: number };
  tagline: Record<Lang, string>;
  pitch: Record<Lang, string>;
  /** Colour of the box edge, badge and call to action. */
  accent: string;
};

export const GAMES: GameEntry[] = [
  {
    id: "mappa",
    name: "Mappa",
    status: "live",
    players: { min: 3, max: 6 },
    minutes: { min: 60, max: 120 },
    tagline: { fr: "Conquiers le monde. Trahis tes amis.", en: "Conquer the world. Betray your friends." },
    pitch: {
      fr: "Stratégie et diplomatie secrète sur une carte du monde en 3D.",
      en: "Strategy and secret diplomacy on a 3D world map.",
    },
    accent: "#4cbb4f",
  },
  // Working titles: the names of the games they echo are trademarks.
  {
    id: "pioche",
    name: "Pioche",
    status: "soon",
    players: { min: 2, max: 8 },
    minutes: { min: 15, max: 30 },
    tagline: { fr: "Vide ta main avant les autres.", en: "Empty your hand before anyone else." },
    pitch: {
      fr: "Jeu de défausse rapide : couleurs, chiffres et cartes piégées.",
      en: "Fast shedding game: colours, numbers and trick cards.",
    },
    accent: "#ff7a45",
  },
  {
    id: "grand-tour",
    name: "Grand Tour",
    status: "soon",
    players: { min: 2, max: 6 },
    minutes: { min: 30, max: 60 },
    tagline: { fr: "Achète, construis, ruine la table.", en: "Buy, build, bankrupt the table." },
    pitch: {
      fr: "Course à l'immobilier autour du monde, enchères et échanges.",
      en: "A property race around the world, with auctions and trades.",
    },
    accent: "#ffd24d",
  },
  {
    id: "loup-garou",
    name: "Loup-garou",
    status: "soon",
    players: { min: 6, max: 16 },
    minutes: { min: 20, max: 45 },
    tagline: { fr: "La nuit, les loups ont faim.", en: "At night, the wolves get hungry." },
    pitch: {
      fr: "Rôles cachés, votes et accusations jusqu'à l'aube.",
      en: "Hidden roles, votes and accusations until dawn.",
    },
    accent: "#9b8cff",
  },
];

export const gamePath = (id: string) => `/${id}`;

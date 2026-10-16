// Grand Tour's board: 40 squares around the world, from the cheapest cities to the dearest.
// Prices and rents follow the classic property-trading scale; names are this game's own.
export const GROUPS = ["brown", "sky", "pink", "orange", "red", "yellow", "green", "navy"] as const;
export type Group = (typeof GROUPS)[number];

/** Rent with 0–4 houses, then with a hotel. */
export type Rents = [number, number, number, number, number, number];
export type City = { kind: "city"; name: string; group: Group; price: number; house: number; rents: Rents };
export type Airport = { kind: "airport"; name: string; price: number };
export type Utility = { kind: "utility"; name: string; price: number };
export type Property = City | Airport | Utility;
export type Square =
  | Property
  | { kind: "go" }
  | { kind: "jail" }
  | { kind: "parking" }
  | { kind: "toJail" }
  | { kind: "tax"; amount: number; label: "income" | "luxury" }
  | { kind: "chance" }
  | { kind: "chest" };

const city = (name: string, group: Group, price: number, house: number, rents: Rents): City => ({ kind: "city", name, group, price, house, rents });

export const BOARD: Square[] = [
  { kind: "go" },
  city("Le Caire", "brown", 60, 50, [2, 10, 30, 90, 160, 250]),
  { kind: "chest" },
  city("Marrakech", "brown", 60, 50, [4, 20, 60, 180, 320, 450]),
  { kind: "tax", amount: 200, label: "income" },
  { kind: "airport", name: "Aéroport Nord", price: 200 },
  city("Lima", "sky", 100, 50, [6, 30, 90, 270, 400, 550]),
  { kind: "chance" },
  city("Bogotá", "sky", 100, 50, [6, 30, 90, 270, 400, 550]),
  city("Mexico", "sky", 120, 50, [8, 40, 100, 300, 450, 600]),
  { kind: "jail" },
  city("Hanoï", "pink", 140, 100, [10, 50, 150, 450, 625, 750]),
  { kind: "utility", name: "Électricité", price: 150 },
  city("Manille", "pink", 140, 100, [10, 50, 150, 450, 625, 750]),
  city("Bangkok", "pink", 160, 100, [12, 60, 180, 500, 700, 900]),
  { kind: "airport", name: "Aéroport Est", price: 200 },
  city("Athènes", "orange", 180, 100, [14, 70, 200, 550, 750, 950]),
  { kind: "chest" },
  city("Istanbul", "orange", 180, 100, [14, 70, 200, 550, 750, 950]),
  city("Rome", "orange", 200, 100, [16, 80, 220, 600, 800, 1000]),
  { kind: "parking" },
  city("Buenos Aires", "red", 220, 150, [18, 90, 250, 700, 875, 1050]),
  { kind: "chance" },
  city("Rio", "red", 220, 150, [18, 90, 250, 700, 875, 1050]),
  city("Sydney", "red", 240, 150, [20, 100, 300, 750, 925, 1100]),
  { kind: "airport", name: "Aéroport Sud", price: 200 },
  city("Berlin", "yellow", 260, 150, [22, 110, 330, 800, 975, 1150]),
  city("Amsterdam", "yellow", 260, 150, [22, 110, 330, 800, 975, 1150]),
  { kind: "utility", name: "Eaux", price: 150 },
  city("Barcelone", "yellow", 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { kind: "toJail" },
  city("Séoul", "green", 300, 200, [26, 130, 390, 900, 1100, 1275]),
  city("Singapour", "green", 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { kind: "chest" },
  city("Hong Kong", "green", 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  { kind: "airport", name: "Aéroport Ouest", price: 200 },
  { kind: "chance" },
  city("New York", "navy", 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { kind: "tax", amount: 100, label: "luxury" },
  city("Paris", "navy", 400, 200, [50, 200, 600, 1400, 1700, 2000]),
];

export const SQUARES = BOARD.length;
export const JAIL = 10;
export const GO_SALARY = 200;
export const AIRPORT_RENTS = [25, 50, 100, 200];
/** Utilities charge the dice total times 4 (one owned) or 10 (both). */
export const UTILITY_FACTORS = [4, 10];

export const isProperty = (s: Square): s is Property => s.kind === "city" || s.kind === "airport" || s.kind === "utility";
export const property = (i: number) => {
  const s = BOARD[i];
  return s && isProperty(s) ? s : null;
};
export const groupSquares = (group: Group) => BOARD.flatMap((s, i) => (s.kind === "city" && s.group === group ? [i] : []));
export const kindSquares = (kind: "airport" | "utility") => BOARD.flatMap((s, i) => (s.kind === kind ? [i] : []));
/** Mortgage value: half the price. Lifting it costs that plus 10 %. */
export const mortgageValue = (p: Property) => p.price / 2;
export const unmortgageCost = (p: Property) => Math.ceil((p.price / 2) * 1.1);

/** Chance and Treasure cards, by id. `to` moves the token; `cash` is paid (−) or received (+). */
export type CardEffect =
  | { kind: "move"; to: number }
  | { kind: "back"; steps: number }
  | { kind: "airport" }
  | { kind: "jail" }
  | { kind: "jailFree" }
  | { kind: "cash"; amount: number }
  | { kind: "each"; amount: number }
  | { kind: "repairs"; house: number; hotel: number };
export const CHANCE: Record<string, CardEffect> = {
  goStart: { kind: "move", to: 0 },
  goParis: { kind: "move", to: 39 },
  goRome: { kind: "move", to: 19 },
  goBuenosAires: { kind: "move", to: 21 },
  airport: { kind: "airport" },
  back3: { kind: "back", steps: 3 },
  jail: { kind: "jail" },
  jailFree: { kind: "jailFree" },
  dividend: { kind: "cash", amount: 50 },
  speeding: { kind: "cash", amount: -15 },
  chairman: { kind: "each", amount: -50 },
  loan: { kind: "cash", amount: 150 },
  repairs: { kind: "repairs", house: 25, hotel: 100 },
};
export const CHEST: Record<string, CardEffect> = {
  goStart: { kind: "move", to: 0 },
  bankError: { kind: "cash", amount: 200 },
  doctor: { kind: "cash", amount: -50 },
  sale: { kind: "cash", amount: 50 },
  jailFree: { kind: "jailFree" },
  jail: { kind: "jail" },
  birthday: { kind: "each", amount: 10 },
  inheritance: { kind: "cash", amount: 100 },
  hospital: { kind: "cash", amount: -100 },
  consultancy: { kind: "cash", amount: 25 },
  roadworks: { kind: "repairs", house: 40, hotel: 115 },
  contest: { kind: "cash", amount: 10 },
};

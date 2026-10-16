// Grand Tour: a property-trading race around the world. Pure rules, independent of network and
// storage; time and randomness are injected so tests can replay any game.
import type { Action } from "../../platform/contract";
import { fail } from "../../platform/errors";
import {
  AIRPORT_RENTS,
  BOARD,
  CHANCE,
  CHEST,
  GO_SALARY,
  JAIL,
  SQUARES,
  UTILITY_FACTORS,
  groupSquares,
  kindSquares,
  mortgageValue,
  property,
  unmortgageCost,
  type CardEffect,
  type Property,
} from "./board";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const EMBLEM_COUNT = 8;
export const START_CASH = [1000, 1500, 2000] as const;
export const JAIL_FINE = 50;
export const MAX_JAIL_TURNS = 3;
export const HOTEL = 5;
/** An auction closes this long after its last bid. */
export const AUCTION_MS = 10000;
export const MAX_TRADES = 12;
const OFFLINE_MS = 60000;
const KEPT_EVENTS = 80;

/**
 * `parkingPot`: taxes and fines pile up on the Stopover square for whoever lands there.
 * The fast online rules, all optional: `freeBuild` builds without the whole colour or even
 * building; `buyout` lets a player who just paid rent on a city buy it from its owner at twice
 * its worth (not a hotel); `worldTour` turns the Check square into a flight to any free square
 * or one of the player's own; `festival` lets whoever stops at the Stopover double the rent of one
 * of their cities; `quickWins` ends the game at once for a player holding the four airports,
 * three whole colours, or every city on one side; `timeLimit` (minutes, 0 for none) ends it on
 * time and the richest player wins.
 */
export type Options = {
  startCash: number;
  parkingPot: boolean;
  auctions: boolean;
  freeBuild: boolean;
  buyout: boolean;
  worldTour: boolean;
  festival: boolean;
  quickWins: boolean;
  timeLimit: number;
};
export const TIME_LIMITS = [0, 20, 30, 45] as const;
/** What a buyout costs, as a multiple of the city's price and buildings. */
export const BUYOUT_FACTOR = 2;
const FAST_RULES = ["freeBuild", "buyout", "worldTour", "festival", "quickWins"] as const;
/** Options of rooms saved before a rule existed read as off. */
export const opt = (g: Pick<Game, "options">, key: (typeof FAST_RULES)[number]) => g.options[key] === true;
export type Player = {
  id: string;
  name: string;
  emblem: number;
  tokenHash: string;
  lastSeen: number;
  joined: number;
  cash: number;
  pos: number;
  jailed: boolean;
  /** Failed attempts to roll a double out of jail. */
  jailTurns: number;
  jailCards: number;
  bankrupt: boolean;
  left: boolean;
};
export type Holding = { owner: string; houses: number; mortgaged: boolean };
/** What one side of a trade hands over. */
export type Bundle = { cash: number; squares: number[] };
export type Trade = { id: string; from: string; to: string; give: Bundle; want: Bundle; at: number };
/**
 * Where the active player's turn stands:
 * roll — must roll (or leave jail); buy — may buy the square they stand on;
 * auction — everyone may bid for it; debt — must raise cash or go bankrupt; buyout — may buy the
 * opponent's city they just paid rent on; travel — picks where to fly (World Tour); festival —
 * picks a city whose rent doubles; end — the turn is over and passes on.
 */
export type Step = "roll" | "buy" | "auction" | "debt" | "buyout" | "travel" | "festival" | "end";
export type GameEvent = { id: string; key: string; args: string[]; at: number };
export type Phase = "lobby" | "playing" | "finished";
export type Game = {
  game: "grand-tour";
  code: string;
  channel: string;
  revision: number;
  created: number;
  updated: number;
  host: string;
  players: Player[];
  phase: Phase;
  options: Options;
  /** Owned squares by index. */
  holdings: Record<string, Holding>;
  active: string;
  step: Step;
  /** Doubles rolled in a row this turn. */
  doubles: number;
  /** The active player threw a double and plays again once this square is settled. */
  again: boolean;
  dice: [number, number] | null;
  /** The last token move, for the animation: `jump` moves are not walked square by square. */
  lastMove: { by: string; from: number; to: number; jump: boolean; at: number } | null;
  lastCard: { deck: "chance" | "chest"; id: string; by: string; at: number } | null;
  auction: { square: number; bid: number; bidder: string | null } | null;
  debt: { player: string; to: string | null; amount: number } | null;
  trades: Trade[];
  pot: number;
  decks: { chance: string[]; chest: string[] };
  /** Auction close time. */
  deadline: number | null;
  paused: boolean;
  pauseReason: "offline" | "host" | null;
  pausedRemaining: number | null;
  winner: string | null;
  /** How the game was won: "bankrupt", "time", "airports", "colours" or "side". */
  winReason?: string | null;
  /** The city hosting the festival: its rent is doubled. */
  festival?: number | null;
  /** The city the active player may buy out, and its price. */
  offer?: { square: number; price: number } | null;
  /** When a timed game ends. */
  endsAt?: number | null;
  turnNumber: number;
  events: GameEvent[];
  requests?: Record<string, string[]>;
};

const uid = () => crypto.randomUUID();
const name = (v: unknown) =>
  typeof v === "string" && v.trim().length >= 2 && v.trim().length <= 20 ? v.trim() : fail("invalidName");
const integer = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fail("invalidAmount");

export function shuffle<T>(items: T[], random: () => number) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function log(g: Game, key: string, ...args: (string | number)[]) {
  g.events.push({ id: uid(), key, args: args.map(String), at: g.updated });
  g.events = g.events.slice(-KEPT_EVENTS);
}
const byId = (g: Game, id: string) => g.players.find((p) => p.id === id) ?? fail("notMember");
export const inGame = (p: Pick<Player, "bankrupt" | "left">) => !p.bankrupt && !p.left;
const alive = (g: Game) => g.players.filter(inGame);
const holding = (g: Game, i: number) => g.holdings[String(i)] ?? null;
const sq = (i: number) => property(i) ?? fail("invalidSquare");

/** Squares owned by `owner`, in board order. */
export const ownedBy = (g: Pick<Game, "holdings">, owner: string) =>
  Object.entries(g.holdings).flatMap(([i, h]) => (h.owner === owner ? [Number(i)] : [])).sort((a, b) => a - b);
/** Whether `owner` holds every city of the group of square `i`. */
export function fullGroup(g: Pick<Game, "holdings">, i: number, owner: string) {
  const s = property(i);
  if (s?.kind !== "city") return false;
  return groupSquares(s.group).every((j) => g.holdings[String(j)]?.owner === owner);
}
/** Rent due on square `i` for a dice total of `dice`; 0 when unowned or mortgaged. */
export function rent(g: Pick<Game, "holdings"> & { festival?: number | null }, i: number, dice: number) {
  const s = property(i), h = g.holdings[String(i)];
  if (!s || !h || h.mortgaged) return 0;
  const festival = g.festival === i ? 2 : 1;
  if (s.kind === "city") return (h.houses ? s.rents[h.houses] : s.rents[0] * (fullGroup(g, i, h.owner) ? 2 : 1)) * festival;
  const mine = kindSquares(s.kind).filter((j) => g.holdings[String(j)]?.owner === h.owner).length;
  return s.kind === "airport" ? AIRPORT_RENTS[mine - 1] : dice * UTILITY_FACTORS[mine - 1];
}
/** What a city is worth to buy out: twice its price and buildings. */
export function buyoutPrice(g: Pick<Game, "holdings">, i: number) {
  const s = property(i), h = g.holdings[String(i)];
  if (s?.kind !== "city" || !h) return 0;
  return BUYOUT_FACTOR * (s.price + h.houses * s.house);
}
/** A player's fortune: cash, squares at their price (half when mortgaged), buildings at cost. */
export function worth(g: Pick<Game, "holdings" | "players">, id: string) {
  const p = g.players.find((x) => x.id === id);
  return (p?.cash ?? 0) + ownedBy(g, id).reduce((sum, i) => {
    const s = property(i)!, h = g.holdings[String(i)];
    return sum + (h.mortgaged ? mortgageValue(s) : s.price) + (s.kind === "city" ? h.houses * s.house : 0);
  }, 0);
}
/** Cash a player could raise right now by selling every building and mortgaging every square. */
export function liquidity(g: Pick<Game, "holdings">, owner: string) {
  return ownedBy(g, owner).reduce((sum, i) => {
    const s = property(i)!, h = g.holdings[String(i)];
    if (h.mortgaged) return sum;
    return sum + mortgageValue(s) + (s.kind === "city" ? (h.houses * s.house) / 2 : 0);
  }, 0);
}

function newPlayer(input: Record<string, unknown>, hash: string, now: number): Player {
  return {
    id: uid(),
    name: name(input.name),
    emblem: integer(typeof input.emblem === "number" ? input.emblem : 0, 0, EMBLEM_COUNT - 1),
    tokenHash: hash,
    lastSeen: now,
    joined: now,
    cash: 0,
    pos: 0,
    jailed: false,
    jailTurns: 0,
    jailCards: 0,
    bankrupt: false,
    left: false,
  };
}

export function createGame(code: string, input: Record<string, unknown>, hash: string, now: number): Game {
  const p = newPlayer(input, hash, now);
  return {
    game: "grand-tour",
    code,
    channel: uid(),
    revision: 0,
    created: now,
    updated: now,
    host: p.id,
    players: [p],
    phase: "lobby",
    options: { startCash: 1500, parkingPot: false, auctions: true, freeBuild: false, buyout: false, worldTour: false, festival: false, quickWins: false, timeLimit: 0 },
    holdings: {},
    active: p.id,
    step: "roll",
    doubles: 0,
    again: false,
    dice: null,
    lastMove: null,
    lastCard: null,
    auction: null,
    debt: null,
    trades: [],
    pot: 0,
    decks: { chance: [], chest: [] },
    deadline: null,
    paused: false,
    pauseReason: null,
    pausedRemaining: null,
    winner: null,
    turnNumber: 0,
    events: [],
  };
}

export function joinGame(input: Game, data: Record<string, unknown>, hash: string, now: number): Game {
  const g = structuredClone(input);
  if (g.phase !== "lobby") fail("alreadyStarted");
  if (g.players.length >= MAX_PLAYERS) fail("roomFull");
  const p = newPlayer(data, hash, now);
  if (g.players.some((x) => x.emblem === p.emblem)) {
    const free = Array.from({ length: EMBLEM_COUNT }, (_, i) => i).find((i) => !g.players.some((x) => x.emblem === i));
    p.emblem = free ?? fail("roomFull");
  }
  g.players.push(p);
  g.updated = now;
  log(g, "joined", p.name);
  return g;
}

function start(g: Game, random: () => number) {
  g.players = shuffle(g.players, random);
  for (const p of g.players) Object.assign(p, { cash: g.options.startCash, pos: 0, jailed: false, jailTurns: 0, jailCards: 0, bankrupt: false });
  g.holdings = {};
  g.decks = { chance: shuffle(Object.keys(CHANCE), random), chest: shuffle(Object.keys(CHEST), random) };
  g.trades = [];
  g.pot = 0;
  g.winner = null;
  g.winReason = null;
  g.festival = null;
  g.offer = null;
  g.endsAt = g.options.timeLimit ? g.updated + g.options.timeLimit * 60000 : null;
  g.phase = "playing";
  g.turnNumber = 0;
  beginTurn(g, g.players[0].id);
  log(g, "started", g.players[0].name);
}
function beginTurn(g: Game, id: string) {
  g.active = id;
  g.step = "roll";
  g.doubles = 0;
  g.again = false;
  g.debt = null;
  g.auction = null;
  g.offer = null;
  g.deadline = null;
  g.turnNumber++;
}
function nextPlayer(g: Game) {
  const n = g.players.length;
  let i = g.players.findIndex((p) => p.id === g.active);
  do i = (i + 1) % n;
  while (!inGame(g.players[i]));
  beginTurn(g, g.players[i].id);
}
/** Once the square is settled: a double plays again, otherwise the turn may end. */
function settle(g: Game) {
  if (g.debt || ["buy", "auction", "buyout", "travel", "festival"].includes(g.step)) return;
  const p = byId(g, g.active);
  g.step = g.again && !p.jailed && inGame(p) ? "roll" : "end";
}

/** Moves money; a payer short of cash owes the rest as a debt to settle before playing on. */
function pay(g: Game, from: Player, to: Player | null, amount: number) {
  if (amount <= 0) return;
  if (from.cash >= amount) {
    from.cash -= amount;
    if (to) to.cash += amount;
    else if (g.options.parkingPot) g.pot += amount;
    return;
  }
  g.debt = { player: from.id, to: to?.id ?? null, amount };
  g.step = "debt";
  log(g, "debt", from.name, amount);
}
function collect(g: Game, p: Player, amount: number) {
  p.cash += amount;
}

function sendToJail(g: Game, p: Player) {
  g.lastMove = { by: p.id, from: p.pos, to: JAIL, jump: true, at: g.updated };
  p.pos = JAIL;
  p.jailed = true;
  p.jailTurns = 0;
  g.again = false;
  log(g, "jailed", p.name);
}
/** Walks `steps` squares forward (or back when negative), paying the salary when passing Start. */
function walk(g: Game, p: Player, steps: number, dice: number, random: () => number): void {
  const from = p.pos;
  const to = (((from + steps) % SQUARES) + SQUARES) % SQUARES;
  if (steps > 0 && to < from) {
    collect(g, p, GO_SALARY);
    log(g, "salary", p.name, GO_SALARY);
  }
  p.pos = to;
  g.lastMove = { by: p.id, from, to, jump: false, at: g.updated };
  land(g, p, dice, random);
}
/** Jumps straight to `to` (a card), still paying the salary when the way passes Start. */
function jump(g: Game, p: Player, to: number, dice: number, random: () => number, rentFactor = 1): void {
  const from = p.pos;
  if (to < from || to === 0) {
    collect(g, p, GO_SALARY);
    log(g, "salary", p.name, GO_SALARY);
  }
  p.pos = to;
  g.lastMove = { by: p.id, from, to, jump: false, at: g.updated };
  land(g, p, dice, random, rentFactor);
}

function land(g: Game, p: Player, dice: number, random: () => number, rentFactor = 1): void {
  const s = BOARD[p.pos];
  if (s.kind === "toJail") {
    if (!opt(g, "worldTour")) return sendToJail(g, p);
    g.step = "travel";
    log(g, "worldTour", p.name);
    return;
  }
  if (s.kind === "tax") {
    log(g, "tax", p.name, s.amount);
    return pay(g, p, null, s.amount);
  }
  if (s.kind === "parking") {
    if (g.pot) {
      log(g, "pot", p.name, g.pot);
      collect(g, p, g.pot);
      g.pot = 0;
    }
    if (opt(g, "festival") && ownedBy(g, p.id).some((i) => property(i)!.kind === "city" && !holding(g, i)!.mortgaged)) g.step = "festival";
    return;
  }
  if (s.kind === "chance" || s.kind === "chest") return drawCard(g, p, s.kind, dice, random);
  if (s.kind === "go" || s.kind === "jail") return;
  const h = holding(g, p.pos);
  if (!h) {
    g.step = "buy";
    return;
  }
  if (h.owner === p.id || h.mortgaged) return;
  const owner = byId(g, h.owner);
  if (!inGame(owner)) return;
  const due = rent(g, p.pos, dice) * rentFactor;
  log(g, "rent", p.name, owner.name, due, p.pos);
  pay(g, p, owner, due);
  // Rent paid in full on a city without a hotel: the payer may buy it out.
  if (opt(g, "buyout") && !g.debt && BOARD[p.pos].kind === "city" && h.houses < HOTEL) {
    const price = buyoutPrice(g, p.pos);
    if (p.cash >= price) {
      g.offer = { square: p.pos, price };
      g.step = "buyout";
    }
  }
}

function drawCard(g: Game, p: Player, deck: "chance" | "chest", dice: number, random: () => number): void {
  const cards = deck === "chance" ? CHANCE : CHEST;
  if (!g.decks[deck].length) g.decks[deck] = shuffle(Object.keys(cards), random);
  // The "out of jail" card stays with its holder until used; others go back under the pile.
  const id = g.decks[deck].shift()!;
  const effect: CardEffect = cards[id];
  if (effect.kind !== "jailFree") g.decks[deck].push(id);
  g.lastCard = { deck, id, by: p.id, at: g.updated };
  log(g, "card", p.name, deck, id);
  switch (effect.kind) {
    case "move":
      return jump(g, p, effect.to, dice, random);
    case "back":
      p.pos = (p.pos - effect.steps + SQUARES) % SQUARES;
      g.lastMove = { by: p.id, from: (p.pos + effect.steps) % SQUARES, to: p.pos, jump: false, at: g.updated };
      return land(g, p, dice, random);
    case "airport": {
      const next = kindSquares("airport").find((i) => i > p.pos) ?? kindSquares("airport")[0];
      return jump(g, p, next, dice, random, 2);
    }
    case "jail":
      return sendToJail(g, p);
    case "jailFree":
      p.jailCards++;
      return;
    case "cash":
      return effect.amount > 0 ? collect(g, p, effect.amount) : pay(g, p, null, -effect.amount);
    case "each": {
      const others = alive(g).filter((x) => x.id !== p.id);
      if (effect.amount < 0) {
        // The player pays everyone; short of cash, the whole sum becomes one debt to the bank.
        const total = -effect.amount * others.length;
        if (p.cash >= total) for (const x of others) pay(g, p, x, -effect.amount);
        else pay(g, p, null, total);
      } else
        // House simplification: a birthday never pushes another player into debt; they give what they have.
        for (const x of others) {
          const gift = Math.min(x.cash, effect.amount);
          x.cash -= gift;
          p.cash += gift;
        }
      return;
    }
    case "repairs": {
      const cost = ownedBy(g, p.id).reduce((sum, i) => {
        const houses = holding(g, i)!.houses;
        return sum + (houses === HOTEL ? effect.hotel : houses * effect.house);
      }, 0);
      return pay(g, p, null, cost);
    }
  }
}

function roll(g: Game, p: Player, random: () => number) {
  const dice: [number, number] = [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)];
  const total = dice[0] + dice[1], double = dice[0] === dice[1];
  g.dice = dice;
  log(g, "rolled", p.name, dice[0], dice[1]);
  if (p.jailed) {
    if (double) {
      p.jailed = false;
      p.jailTurns = 0;
      log(g, "freed", p.name);
      g.again = false;
      walk(g, p, total, total, random);
      return settle(g);
    }
    p.jailTurns++;
    if (p.jailTurns < MAX_JAIL_TURNS) {
      g.step = "end";
      return;
    }
    // Third miss: pay the fine and move on anyway.
    p.jailed = false;
    p.jailTurns = 0;
    log(g, "fine", p.name, JAIL_FINE);
    pay(g, p, null, JAIL_FINE);
    g.again = false;
    // Short of the fine, the player settles it first and stays put this turn.
    if (g.debt) return;
    walk(g, p, total, total, random);
    return settle(g);
  }
  if (double) g.doubles++;
  if (g.doubles === 3) {
    log(g, "speeding", p.name);
    sendToJail(g, p);
    g.step = "end";
    return;
  }
  g.again = double;
  walk(g, p, total, total, random);
  settle(g);
}

function buy(g: Game, p: Player) {
  const s = sq(p.pos);
  if (p.cash < s.price) fail("notEnoughCash");
  p.cash -= s.price;
  g.holdings[String(p.pos)] = { owner: p.id, houses: 0, mortgaged: false };
  log(g, "bought", p.name, p.pos, s.price);
  g.step = "end";
  settle(g);
}
function decline(g: Game, p: Player, now: number) {
  if (g.options.auctions && alive(g).length > 1) {
    g.auction = { square: p.pos, bid: 0, bidder: null };
    g.deadline = now + AUCTION_MS;
    g.step = "auction";
    log(g, "auction", p.pos);
    return;
  }
  g.step = "end";
  settle(g);
}
function closeAuction(g: Game) {
  const a = g.auction!;
  g.auction = null;
  g.deadline = null;
  if (a.bidder) {
    const winner = byId(g, a.bidder);
    // Bids never exceed the bidder's cash, but a trade may have spent it meanwhile.
    if (inGame(winner) && winner.cash >= a.bid) {
      winner.cash -= a.bid;
      g.holdings[String(a.square)] = { owner: winner.id, houses: 0, mortgaged: false };
      log(g, "auctionWon", winner.name, a.square, a.bid);
    } else log(g, "auctionVoid", a.square);
  } else log(g, "auctionVoid", a.square);
  g.step = "end";
  settle(g);
}

/** Houses go up and down evenly across a group; a hotel counts as a fifth house. */
function build(g: Game, p: Player, i: number) {
  const s = sq(i), h = holding(g, i);
  if (s.kind !== "city" || !h || h.owner !== p.id) fail("notOwner");
  if (h.houses >= HOTEL) fail("maxBuildings");
  if (opt(g, "freeBuild")) {
    if (h.mortgaged) fail("groupMortgaged");
  } else {
    if (!fullGroup(g, i, p.id)) fail("needFullGroup");
    const group = groupSquares(s.group).map((j) => holding(g, j)!);
    if (group.some((x) => x.mortgaged)) fail("groupMortgaged");
    if (h.houses > Math.min(...group.map((x) => x.houses))) fail("buildEvenly");
  }
  if (p.cash < s.house) fail("notEnoughCash");
  p.cash -= s.house;
  h.houses++;
  log(g, "built", p.name, i, h.houses);
}
function sell(g: Game, p: Player, i: number) {
  const s = sq(i), h = holding(g, i);
  if (s.kind !== "city" || !h || h.owner !== p.id) fail("notOwner");
  if (!h.houses) fail("noBuildings");
  if (!opt(g, "freeBuild")) {
    const group = groupSquares(s.group).map((j) => holding(g, j)!);
    if (h.houses < Math.max(...group.map((x) => x.houses))) fail("buildEvenly");
  }
  h.houses--;
  p.cash += s.house / 2;
  log(g, "sold", p.name, i, h.houses);
}
function mortgage(g: Game, p: Player, i: number) {
  const s = sq(i), h = holding(g, i);
  if (!h || h.owner !== p.id) fail("notOwner");
  if (h.mortgaged) fail("alreadyMortgaged");
  if (s.kind === "city" && (opt(g, "freeBuild") ? h.houses : groupSquares(s.group).some((j) => holding(g, j)?.houses))) fail("sellBuildingsFirst");
  h.mortgaged = true;
  p.cash += mortgageValue(s);
  log(g, "mortgaged", p.name, i);
}
function unmortgage(g: Game, p: Player, i: number) {
  const s = sq(i), h = holding(g, i);
  if (!h || h.owner !== p.id) fail("notOwner");
  if (!h.mortgaged) fail("notMortgaged");
  const cost = unmortgageCost(s);
  if (p.cash < cost) fail("notEnoughCash");
  p.cash -= cost;
  h.mortgaged = false;
  log(g, "unmortgaged", p.name, i);
}

/** Hands everything over to the creditor, or back to the bank, and takes the player out. */
function bankrupt(g: Game, p: Player, to: Player | null) {
  for (const i of ownedBy(g, p.id)) {
    const h = holding(g, i)!;
    if (to) {
      // Buildings are sold back to the bank first; the creditor gets the squares as they stand.
      const s = property(i)!;
      if (s.kind === "city") p.cash += (h.houses * s.house) / 2;
      g.holdings[String(i)] = { owner: to.id, houses: 0, mortgaged: h.mortgaged };
    } else delete g.holdings[String(i)];
  }
  if (to) {
    to.cash += p.cash;
    to.jailCards += p.jailCards;
  }
  p.cash = 0;
  p.jailCards = 0;
  p.jailed = false;
  p.bankrupt = true;
  g.trades = g.trades.filter((t) => t.from !== p.id && t.to !== p.id);
  if (g.auction?.bidder === p.id) {
    g.auction.bidder = null;
    g.auction.bid = 0;
  }
  if (g.debt && g.debt.to === p.id) g.debt.to = null;
  log(g, "bankrupt", p.name, to?.name ?? "");
  const rest = alive(g);
  if (rest.length === 1) return finish(g, rest[0]);
  if (g.debt?.player === p.id) g.debt = null;
  if (g.active === p.id) nextPlayer(g);
}
function finish(g: Game, winner: Player, reason = "bankrupt") {
  g.phase = "finished";
  g.winner = winner.id;
  g.winReason = reason;
  g.step = "end";
  g.deadline = null;
  g.auction = null;
  g.debt = null;
  g.paused = false;
  g.pauseReason = null;
  g.offer = null;
  log(g, reason === "bankrupt" ? "won" : "wonBy", winner.name, reason);
}

/** The fast wins: four airports, three whole colours, or every city on one side of the board. */
function quickWin(g: Game) {
  if (!opt(g, "quickWins") || g.phase !== "playing") return;
  const sides = [[1, 9], [11, 19], [21, 29], [31, 39]].map(([a, b]) => BOARD.flatMap((s, i) => (s.kind === "city" && i >= a && i <= b ? [i] : [])));
  const groups = [...new Set(BOARD.flatMap((s) => (s.kind === "city" ? [s.group] : [])))];
  for (const p of alive(g)) {
    const mine = (i: number) => holding(g, i)?.owner === p.id;
    if (kindSquares("airport").every(mine)) return finish(g, p, "airports");
    if (groups.filter((gr) => groupSquares(gr).every(mine)).length >= 3) return finish(g, p, "colours");
    if (sides.some((side) => side.every(mine))) return finish(g, p, "side");
  }
}

function bundle(v: unknown): Bundle {
  const b = (v ?? {}) as { cash?: unknown; squares?: unknown };
  const cash = b.cash === undefined ? 0 : integer(b.cash, 0, 1_000_000);
  const squares = Array.isArray(b.squares) ? b.squares.map((i) => integer(i, 0, SQUARES - 1)) : [];
  if (new Set(squares).size !== squares.length) fail("invalidTrade");
  return { cash, squares };
}
/** Squares can change hands only without buildings anywhere in their group. */
function checkBundle(g: Game, owner: Player, b: Bundle) {
  if (owner.cash < b.cash) fail("notEnoughCash");
  for (const i of b.squares) {
    const s = sq(i), h = holding(g, i);
    if (!h || h.owner !== owner.id) fail("notOwner");
    if (s.kind === "city" && groupSquares(s.group).some((j) => holding(g, j)?.houses)) fail("sellBuildingsFirst");
  }
}
function transfer(g: Game, from: Player, to: Player, b: Bundle) {
  from.cash -= b.cash;
  to.cash += b.cash;
  for (const i of b.squares) holding(g, i)!.owner = to.id;
}

/** A settled turn passes on by itself: nobody has to press "end of turn". */
function advance(g: Game) {
  quickWin(g);
  if (g.phase === "playing" && g.step === "end") nextPlayer(g);
}
/** A timed game ends on time: the richest player still in wins. */
function timeUp(g: Game, now: number) {
  if (g.phase !== "playing" || !g.endsAt || now < g.endsAt) return false;
  const best = alive(g).toSorted((a, b) => worth(g, b.id) - worth(g, a.id))[0];
  log(g, "timeUp");
  finish(g, best, "time");
  return true;
}

export function maintenance(g: Game, now: number) {
  const changed = upkeep(g, now);
  advance(g);
  return changed;
}
function upkeep(g: Game, now: number) {
  let changed = false;
  if (!g.paused && timeUp(g, now)) return true;
  const online = g.players.toSorted((a, b) => a.joined - b.joined).filter((p) => !p.left && now - p.lastSeen < OFFLINE_MS);
  if (!online.some((p) => p.id === g.host) && online.length) {
    g.host = online[0].id;
    log(g, "host", online[0].name);
    changed = true;
  }
  if (g.phase !== "playing" || g.paused) return changed;
  if (g.auction && g.deadline && now >= g.deadline) {
    closeAuction(g);
    changed = true;
  }
  const active = byId(g, g.active);
  if (!g.auction && now - active.lastSeen >= OFFLINE_MS) {
    pause(g, "offline", now);
    changed = true;
  }
  return changed;
}
function pause(g: Game, reason: "offline" | "host", now: number) {
  g.paused = true;
  g.pauseReason = reason;
  g.pausedRemaining = g.deadline ? Math.max(0, g.deadline - now) : null;
  g.deadline = null;
  log(g, "paused");
}
function resume(g: Game, now: number) {
  g.paused = false;
  g.pauseReason = null;
  g.deadline = g.pausedRemaining !== null ? now + g.pausedRemaining : null;
  g.pausedRemaining = null;
  log(g, "resumed");
}

export function applyAction(
  input: Game,
  actor: string,
  action: Action,
  random: () => number = Math.random,
  now = Date.now(),
): Game {
  const g = run(input, actor, action, random, now);
  advance(g);
  return g;
}
function run(input: Game, actor: string, action: Action, random: () => number, now: number): Game {
  const g = structuredClone(input);
  g.updated = now;
  const p = byId(g, actor);
  const type = action.type;
  const hostOnly = () => {
    if (actor !== g.host) fail("hostOnly");
  };
  const playing = () => {
    if (g.phase !== "playing") fail("invalidPhase");
    if (g.paused) fail("paused");
    if (!inGame(p)) fail("eliminated");
  };
  const myTurn = (...steps: Step[]) => {
    playing();
    if (g.active !== actor) fail("notYourTurn");
    if (steps.length && !steps.includes(g.step)) fail("invalidStep");
  };
  const square = () => integer(action.square, 0, SQUARES - 1);

  if (type === "heartbeat") {
    maintenance(g, now);
    p.lastSeen = now;
    if (g.paused && g.pauseReason === "offline" && g.active === actor && g.phase === "playing") resume(g, now);
    return g;
  }
  maintenance(g, now);

  switch (type) {
    case "profile": {
      if (g.phase !== "lobby") fail("alreadyStarted");
      if (action.name !== undefined) p.name = name(action.name);
      if (action.emblem !== undefined) {
        const e = integer(action.emblem, 0, EMBLEM_COUNT - 1);
        if (g.players.some((x) => x.id !== actor && x.emblem === e)) fail("emblemTaken");
        p.emblem = e;
      }
      return g;
    }
    case "options": {
      hostOnly();
      if (g.phase !== "lobby") fail("alreadyStarted");
      if (action.startCash !== undefined) g.options.startCash = START_CASH.find((c) => c === action.startCash) ?? fail("invalidAmount");
      for (const key of ["parkingPot", "auctions", ...FAST_RULES] as const) if (action[key] !== undefined) g.options[key] = action[key] === true;
      if (action.timeLimit !== undefined) g.options.timeLimit = TIME_LIMITS.find((m) => m === action.timeLimit) ?? fail("invalidAmount");
      return g;
    }
    case "start":
    case "again": {
      hostOnly();
      if (type === "start" && g.phase !== "lobby") fail("alreadyStarted");
      if (type === "again") {
        if (g.phase !== "finished") fail("invalidPhase");
        g.players = g.players.filter((x) => !x.left);
      }
      if (g.players.length < MIN_PLAYERS) fail("playerCount");
      start(g, random);
      return g;
    }
    case "pause": {
      hostOnly();
      if (g.phase !== "playing") fail("invalidPhase");
      if (g.paused) {
        resume(g, now);
        for (const x of g.players) if (now - x.lastSeen >= OFFLINE_MS) x.lastSeen = now;
      } else pause(g, "host", now);
      return g;
    }
    case "kick":
    case "leave": {
      if (type === "kick") hostOnly();
      const target = type === "leave" ? p : byId(g, String(action.player));
      if (type === "kick" && target.id === actor) fail("invalidAction");
      if (g.phase === "lobby") {
        g.players = g.players.filter((x) => x.id !== target.id);
        if (g.host === target.id && g.players.length) g.host = g.players[0].id;
        return g;
      }
      if (target.left) fail("eliminated");
      target.left = true;
      log(g, "left", target.name);
      if (g.host === target.id) {
        const next = g.players.toSorted((a, b) => a.joined - b.joined).find((x) => !x.left);
        if (next) g.host = next.id;
      }
      if (g.phase === "playing" && !target.bankrupt) bankrupt(g, target, null);
      return g;
    }

    // Trades: any two players still in, at any moment of the game.
    case "offer": {
      playing();
      const to = byId(g, String(action.to));
      if (to.id === actor || !inGame(to)) fail("invalidTrade");
      const give = bundle(action.give), want = bundle(action.want);
      if (!give.cash && !give.squares.length && !want.cash && !want.squares.length) fail("invalidTrade");
      checkBundle(g, p, give);
      checkBundle(g, to, want);
      if (g.trades.length >= MAX_TRADES) fail("tooManyTrades");
      g.trades.push({ id: uid(), from: actor, to: to.id, give, want, at: now });
      log(g, "offer", p.name, to.name);
      return g;
    }
    case "tradeAnswer": {
      playing();
      const t = g.trades.find((x) => x.id === action.id && x.to === actor) ?? fail("noTrade");
      g.trades = g.trades.filter((x) => x.id !== t.id);
      const from = byId(g, t.from);
      if (action.accept !== true) {
        log(g, "tradeDeclined", p.name, from.name);
        return g;
      }
      if (!inGame(from)) fail("noTrade");
      checkBundle(g, from, t.give);
      checkBundle(g, p, t.want);
      transfer(g, from, p, t.give);
      transfer(g, p, from, t.want);
      // Offers that relied on squares which just changed hands are no longer valid.
      const moved = new Set([...t.give.squares, ...t.want.squares]);
      g.trades = g.trades.filter((x) => ![...x.give.squares, ...x.want.squares].some((i) => moved.has(i)));
      log(g, "traded", from.name, p.name);
      return g;
    }
    case "tradeCancel": {
      const t = g.trades.find((x) => x.id === action.id && x.from === actor) ?? fail("noTrade");
      g.trades = g.trades.filter((x) => x.id !== t.id);
      return g;
    }

    // Building and mortgages: an owner may manage their squares at any moment of the game.
    case "build":
      playing();
      build(g, p, square());
      return g;
    case "sell":
      playing();
      sell(g, p, square());
      return g;
    case "mortgage":
      playing();
      mortgage(g, p, square());
      return g;
    case "unmortgage":
      playing();
      unmortgage(g, p, square());
      return g;

    case "bid": {
      playing();
      if (g.step !== "auction" || !g.auction) fail("noAuction");
      const amount = integer(action.amount, g.auction.bid + 1, 1_000_000);
      if (amount > p.cash) fail("notEnoughCash");
      g.auction.bid = amount;
      g.auction.bidder = actor;
      // Every bid gives the others time to answer.
      g.deadline = Math.max(g.deadline ?? 0, now + AUCTION_MS / 2);
      log(g, "bid", p.name, amount);
      return g;
    }

    case "roll":
      myTurn("roll");
      roll(g, p, random);
      return g;
    case "jailPay":
      myTurn("roll");
      if (!p.jailed) fail("notJailed");
      if (p.cash < JAIL_FINE) fail("notEnoughCash");
      p.cash -= JAIL_FINE;
      if (g.options.parkingPot) g.pot += JAIL_FINE;
      p.jailed = false;
      p.jailTurns = 0;
      log(g, "fine", p.name, JAIL_FINE);
      return g;
    case "jailCard":
      myTurn("roll");
      if (!p.jailed) fail("notJailed");
      if (!p.jailCards) fail("noJailCard");
      p.jailCards--;
      p.jailed = false;
      p.jailTurns = 0;
      // The card goes back under a pile; Chance holds it first.
      if (!g.decks.chance.includes("jailFree")) g.decks.chance.push("jailFree");
      else g.decks.chest.push("jailFree");
      log(g, "jailCardUsed", p.name);
      return g;
    case "buy":
      myTurn("buy");
      buy(g, p);
      return g;
    case "decline":
      myTurn("buy");
      decline(g, p, now);
      return g;
    case "buyout": {
      myTurn("buyout");
      const o = g.offer!, h = holding(g, o.square)!;
      const owner = byId(g, h.owner);
      if (p.cash < o.price) fail("notEnoughCash");
      p.cash -= o.price;
      owner.cash += o.price;
      h.owner = p.id;
      g.trades = g.trades.filter((t) => ![...t.give.squares, ...t.want.squares].includes(o.square));
      log(g, "boughtOut", p.name, owner.name, o.square, o.price);
      g.offer = null;
      g.step = "end";
      settle(g);
      return g;
    }
    case "travel": {
      myTurn("travel");
      const to = integer(action.square, 0, SQUARES - 1);
      if (to === p.pos) fail("invalidSquare");
      const h = holding(g, to);
      if (h && h.owner !== p.id) fail("notFree");
      log(g, "flew", p.name, to);
      g.step = "end";
      jump(g, p, to, g.dice ? g.dice[0] + g.dice[1] : 7, random);
      settle(g);
      return g;
    }
    case "festival": {
      myTurn("festival");
      const i = square(), h = holding(g, i);
      if (property(i)?.kind !== "city" || !h || h.owner !== p.id || h.mortgaged) fail("notOwner");
      g.festival = i;
      log(g, "festival", p.name, i);
      g.step = "end";
      settle(g);
      return g;
    }
    case "skip":
      myTurn("buyout", "travel", "festival");
      g.offer = null;
      g.step = "end";
      settle(g);
      return g;
    case "payDebt": {
      myTurn("debt");
      const d = g.debt!;
      if (p.cash < d.amount) fail("notEnoughCash");
      g.debt = null;
      pay(g, p, d.to ? byId(g, d.to) : null, d.amount);
      log(g, "paid", p.name, d.amount);
      g.step = "end";
      settle(g);
      return g;
    }
    case "bankrupt": {
      myTurn("debt");
      const d = g.debt!;
      bankrupt(g, p, d.to ? byId(g, d.to) : null);
      return g;
    }
  }
  fail("invalidAction");
}

/** Everything `actor` may see: token hashes, request ids and the card order stay hidden. */
export function publicGame(g: Game, actor: string) {
  const { requests: _requests, decks, ...visible } = g;
  return {
    ...visible,
    decks: { chance: decks.chance.length, chest: decks.chest.length },
    // Offers are between two players; the rest of the table only sees that one is pending.
    trades: g.trades.filter((t) => t.from === actor || t.to === actor),
    players: g.players.map(({ tokenHash: _hash, ...p }) => p),
    me: actor,
    serverTime: Date.now(),
  };
}
export type PublicGame = ReturnType<typeof publicGame>;
export type PublicPlayer = PublicGame["players"][number];
export type { Property };

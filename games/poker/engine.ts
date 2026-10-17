// Texas Hold'em tournament. All amounts are integer chips; randomness and time are injected.
import type { Action } from "../../platform/contract";
import { fail } from "../../platform/errors";
import { shuffle } from "../../platform/cards";
import { evaluate, makeDeck, type Card } from "./cards";
export const MIN_PLAYERS = 2, MAX_PLAYERS = 8, STARTING_STACK = 1500;
export const TIMERS = [15, 30, 60] as const;
export const LEVEL_MINUTES = [2, 3, 5] as const;
export const SMALL_BLINDS = [10, 15, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000];
export const RESULT_MS = 6500;
const OFFLINE_MS = 60000;
export type Options = { timer: number; levelMinutes: number };
export type Player = {
  id: string; name: string; emblem: number; tokenHash: string; joined: number; lastSeen: number;
  stack: number; hand: Card[]; bet: number; contributed: number; inHand: boolean; folded: boolean;
  eliminated: boolean; resigned: boolean; left: boolean; lastAction: string;
};
export type Pot = { amount: number; eligible: string[]; winners: string[]; category: number | null };
export type Result = { hand: number; at: number; showdown: boolean; pots: Pot[]; awards: Record<string, number> };
export type Game = {
  game: "poker"; code: string; channel: string; revision: number; created: number; updated: number;
  host: string; players: Player[]; phase: "lobby" | "playing" | "finished"; options: Options;
  street: "preflop" | "flop" | "turn" | "river" | "showdown";
  deck: Card[]; burned: Card[]; board: Card[]; handNumber: number; dealer: string;
  smallBlind: string; bigBlind: string; level: number; startedAt: number;
  currentBet: number; minRaise: number; pending: string[]; acted: Record<string, number>;
  active: string; deadline: number | null; winner: string | null; result: Result | null;
  paused: boolean; pauseReason: "host" | "offline" | null; pausedAt: number | null; pausedRemaining: number | null;
  /** Chips removed when a player abandons the tournament, never handed to an arbitrary opponent. */
  forfeited: number; events: { id: string; key: string; args: string[]; at: number }[];
  requests?: Record<string, string[]>;
};
const uid = () => crypto.randomUUID();
const validName = (v: unknown) => typeof v === "string" && v.trim().length >= 2 && v.trim().length <= 20 ? v.trim() : fail("invalidName");
const integer = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : fail("invalidAmount");
const player = (g: Game, id: string) => g.players.find((p) => p.id === id) ?? fail("notMember");
const survivors = (g: Game) => g.players.filter((p) => !p.left && !p.resigned && !p.eliminated && p.stack > 0);
const contenders = (g: Game) => g.players.filter((p) => p.inHand && !p.folded);
const actors = (g: Game) => contenders(g).filter((p) => p.stack > 0);
function log(g: Game, key: string, ...args: string[]) {
  g.events = [...g.events, { id: uid(), key, args, at: g.updated }].slice(-60);
}
function clockwise(g: Game, from: string, test: (p: Player) => boolean): Player[] {
  const i = g.players.findIndex((p) => p.id === from);
  return Array.from({ length: g.players.length }, (_, n) => g.players[(i + n + 1 + g.players.length) % g.players.length]).filter(test);
}
export const blindAmounts = (level: number) => {
  const small = SMALL_BLINDS[Math.min(level, SMALL_BLINDS.length - 1)];
  return { small, big: small * 2 };
};
function newPlayer(input: Record<string, unknown>, hash: string, now: number): Player {
  return { id: uid(), name: validName(input.name), emblem: integer(input.emblem ?? 0, 0, 7), tokenHash: hash,
    joined: now, lastSeen: now, stack: STARTING_STACK, hand: [], bet: 0, contributed: 0,
    inHand: false, folded: false, eliminated: false, resigned: false, left: false, lastAction: "" };
}
export function createGame(code: string, input: Record<string, unknown>, hash: string, now: number): Game {
  const p = newPlayer(input, hash, now);
  return { game: "poker", code, channel: uid(), revision: 0, created: now, updated: now, host: p.id, players: [p],
    phase: "lobby", options: { timer: 30, levelMinutes: 3 }, street: "preflop", deck: [], burned: [], board: [],
    handNumber: 0, dealer: "", smallBlind: "", bigBlind: "", level: 0, startedAt: 0, currentBet: 0, minRaise: 20,
    pending: [], acted: {}, active: "", deadline: null, winner: null, result: null, paused: false,
    pauseReason: null, pausedAt: null, pausedRemaining: null, forfeited: 0, events: [] };
}
export function joinGame(input: Game, profile: Record<string, unknown>, hash: string, now: number): Game {
  const g = structuredClone(input);
  if (g.phase !== "lobby") fail("alreadyStarted");
  if (g.players.length >= MAX_PLAYERS) fail("roomFull");
  const p = newPlayer(profile, hash, now);
  p.emblem = Array.from({ length: 8 }, (_, i) => (p.emblem + i) % 8).find((e) => !g.players.some((x) => x.emblem === e))!;
  g.players.push(p); g.updated = now;
  return g;
}
function pay(p: Player, amount: number) {
  const paid = Math.min(p.stack, amount);
  p.stack -= paid; p.bet += paid; p.contributed += paid;
}
function turn(g: Game, id: string, now: number) {
  g.active = id; g.deadline = now + g.options.timer * 1000;
}
function finish(g: Game) {
  g.phase = "finished"; g.active = ""; g.deadline = null; g.pending = [];
  g.paused = false; g.pauseReason = null; g.pausedAt = null; g.pausedRemaining = null;
  g.winner = survivors(g)[0]?.id ?? null;
  if (g.winner) log(g, "champion", player(g, g.winner).name);
}
function deal(g: Game, random: () => number, now: number) {
  if (survivors(g).length < 2) { finish(g); return; }
  const previousBig = g.bigBlind;
  const live = survivors(g), ids = new Set(live.map((p) => p.id));
  if (!g.handNumber) {
    g.dealer = live[Math.floor(random() * live.length)].id;
    g.smallBlind = live.length === 2 ? g.dealer : clockwise(g, g.dealer, (p) => ids.has(p.id))[0].id;
    g.bigBlind = clockwise(g, g.smallBlind, (p) => ids.has(p.id))[0].id;
  } else {
    // Dead button: always advance the big blind to the next surviving seat. A busted
    // small/big blind must not let another player dodge their next big blind.
    g.bigBlind = clockwise(g, previousBig, (p) => ids.has(p.id))[0].id;
    if (live.length === 2) {
      g.dealer = live.find((p) => p.id !== g.bigBlind)!.id; g.smallBlind = g.dealer;
    } else {
      g.smallBlind = ids.has(previousBig) ? previousBig : "";
      const previousBigIndex = g.players.findIndex((p) => p.id === previousBig);
      g.dealer = g.players[(previousBigIndex - 1 + g.players.length) % g.players.length].id;
    }
  }
  g.level = Math.max(0, Math.floor((now - g.startedAt) / (g.options.levelMinutes * 60000)));
  g.deck = shuffle(makeDeck(), random); g.burned = []; g.board = []; g.result = null;
  g.street = "preflop"; g.handNumber++; g.phase = "playing"; g.acted = {};
  for (const p of g.players) { p.hand = []; p.bet = p.contributed = 0; p.folded = false; p.inHand = ids.has(p.id); p.lastAction = ""; }
  const order = clockwise(g, g.dealer, (p) => p.inHand);
  for (let n = 0; n < 2; n++) for (const p of order) p.hand.push(g.deck.pop()!);
  const blind = blindAmounts(g.level);
  if (g.smallBlind) pay(player(g, g.smallBlind), blind.small);
  pay(player(g, g.bigBlind), blind.big);
  g.currentBet = blind.big; g.minRaise = blind.big;
  g.pending = clockwise(g, g.bigBlind, (p) => p.inHand && p.stack > 0).map((p) => p.id);
  log(g, "dealt", String(g.handNumber), String(blind.small), String(blind.big));
  advance(g, now);
}
/** Return the unique unmatched part of this street before moving on. */
function refund(g: Game) {
  const paid = g.players.filter((p) => p.bet > 0).sort((a, b) => b.bet - a.bet);
  if (!paid.length) return;
  const excess = paid[0].bet - (paid[1]?.bet ?? 0);
  if (excess <= 0) return;
  const p = paid[0]; p.bet -= excess; p.contributed -= excess;
  if (p.resigned || p.left) g.forfeited += excess; else p.stack += excess;
}
function settle(g: Game, now: number) {
  refund(g);
  const live = contenders(g), showdown = live.length > 1;
  const values = new Map(live.map((p) => [p.id, showdown ? evaluate([...p.hand, ...g.board]) : null]));
  const levels = [...new Set(g.players.map((p) => p.contributed).filter((n) => n > 0))].sort((a, b) => a - b);
  const pots: Pot[] = [], awards: Record<string, number> = {};
  let previous = 0;
  for (const level of levels) {
    const contributors = g.players.filter((p) => p.contributed >= level);
    const amount = (level - previous) * contributors.length; previous = level;
    // Abandonment may leave dead chips above every remaining stack; they still go to a live hand.
    let eligible = live.filter((p) => p.contributed >= level);
    if (!eligible.length) eligible = live;
    if (!eligible.length) { g.forfeited += amount; continue; }
    const best = Math.max(...eligible.map((p) => values.get(p.id)?.score ?? 0));
    const winnerIds = new Set(eligible.filter((p) => (values.get(p.id)?.score ?? 0) === best).map((p) => p.id));
    const winners = clockwise(g, g.dealer, (p) => winnerIds.has(p.id));
    const each = Math.floor(amount / winners.length), odd = amount % winners.length;
    winners.forEach((p, i) => { const chips = each + (i < odd ? 1 : 0); p.stack += chips; awards[p.id] = (awards[p.id] ?? 0) + chips; });
    pots.push({ amount, eligible: eligible.map((p) => p.id), winners: winners.map((p) => p.id), category: values.get(winners[0].id)?.category ?? null });
  }
  g.result = { hand: g.handNumber, at: now, showdown, pots, awards };
  for (const p of g.players) {
    p.bet = p.contributed = 0;
    if (!p.stack || p.resigned || p.left) p.eliminated = true;
  }
  g.street = "showdown"; g.active = ""; g.pending = [];
  g.deadline = now + RESULT_MS;
  for (const [id, amount] of Object.entries(awards)) log(g, "wonPot", player(g, id).name, String(amount));
  if (survivors(g).length < 2) finish(g);
}
function nextStreet(g: Game) {
  g.burned.push(g.deck.pop()!);
  const count = g.street === "preflop" ? 3 : 1;
  for (let n = 0; n < count; n++) g.board.push(g.deck.pop()!);
  g.street = g.street === "preflop" ? "flop" : g.street === "flop" ? "turn" : "river";
  g.currentBet = 0; g.minRaise = blindAmounts(g.level).big; g.acted = {};
  for (const p of g.players) { p.bet = 0; p.lastAction = ""; }
  g.pending = clockwise(g, g.dealer, (p) => p.inHand && !p.folded && p.stack > 0).map((p) => p.id);
  log(g, "street", g.street);
}
function advance(g: Game, now: number) {
  if (contenders(g).length <= 1) { settle(g, now); return; }
  g.pending = g.pending.filter((id) => { const p = player(g, id); return p.inHand && !p.folded && p.stack > 0; });
  const able = actors(g);
  if (able.length <= 1) {
    const p = able[0];
    const otherBet = Math.max(0, ...contenders(g).filter((x) => x.id !== p?.id).map((x) => x.bet));
    if (p && p.bet < otherBet) { g.currentBet = otherBet; g.pending = [p.id]; }
    else g.pending = [];
  }
  if (g.pending.length) { turn(g, g.pending[0], now); return; }
  refund(g);
  if (g.street === "river") { settle(g, now); return; }
  if (actors(g).length <= 1) {
    while (g.board.length < 5) nextStreet(g);
    settle(g, now); return;
  }
  nextStreet(g); advance(g, now);
}
/** Same legal bounds drive server validation and the player's controls. */
export function legalActions(g: Pick<Game, "phase" | "street" | "paused" | "active" | "currentBet" | "minRaise" | "level" | "acted"> & { players: Pick<Player, "id" | "inHand" | "folded" | "stack" | "bet">[] }, id: string) {
  const p = g.players.find((x) => x.id === id);
  if (!p || g.phase !== "playing" || g.street === "showdown" || g.paused || g.active !== id || p.folded || !p.inHand || !p.stack) return null;
  const owed = Math.max(0, g.currentBet - p.bet), max = p.bet + p.stack;
  const last = g.acted[id];
  const reopened = last === undefined || g.currentBet - last >= g.minRaise;
  const opponent = g.players.some((x) => x.id !== id && x.inHand && !x.folded && x.stack > 0);
  const min = g.currentBet + g.minRaise;
  return { call: Math.min(owed, p.stack), check: owed === 0, canRaise: reopened && opponent && max > g.currentBet, min, max };
}
function wager(g: Game, p: Player, action: Action, now: number) {
  const legal = legalActions(g, p.id) ?? fail("notYourTurn");
  let verb = action.type;
  if (verb === "allIn") verb = legal.max > g.currentBet ? "raise" : "call";
  if (verb === "fold") p.folded = true;
  else if (verb === "check") { if (!legal.check) fail("cannotCheck"); }
  else if (verb === "call") { if (legal.check) fail("invalidAction"); pay(p, legal.call); }
  else if (verb === "raise") {
    if (!legal.canRaise) fail("cannotRaise");
    const amount = action.type === "allIn" ? legal.max : integer(action.amount, 1, legal.max);
    if (amount <= g.currentBet || (amount < legal.min && amount !== legal.max)) fail("invalidRaise");
    const increase = amount - g.currentBet;
    const full = amount >= legal.min;
    if (full) g.minRaise = Math.max(blindAmounts(g.level).big, increase);
    pay(p, amount - p.bet); g.currentBet = amount;
    // All players below the new wager must respond, even if a short all-in did not reopen raising.
    g.pending = clockwise(g, p.id, (x) => x.inHand && !x.folded && x.stack > 0 && x.bet < amount).map((x) => x.id);
  } else fail("invalidAction");
  g.acted[p.id] = g.currentBet;
  p.lastAction = p.stack === 0 && !p.folded ? "allIn" : verb;
  log(g, p.lastAction, p.name, String(p.bet));
  g.pending = g.pending.filter((id) => id !== p.id);
  advance(g, now);
}
function pause(g: Game, reason: "host" | "offline", at: number) {
  g.paused = true; g.pauseReason = reason; g.pausedAt = at;
  g.pausedRemaining = g.deadline === null ? null : Math.max(0, g.deadline - at); g.deadline = null;
}
function resume(g: Game, now: number) {
  g.startedAt += now - (g.pausedAt ?? now);
  g.deadline = g.pausedRemaining === null ? null : now + g.pausedRemaining;
  g.paused = false; g.pauseReason = null; g.pausedAt = null; g.pausedRemaining = null;
}
export function maintenance(g: Game, now: number, random: () => number) {
  const online = g.players.filter((p) => !p.left && now - p.lastSeen < OFFLINE_MS).sort((a, b) => a.joined - b.joined);
  if (!online.some((p) => p.id === g.host) && online.length) g.host = online[0].id;
  if (g.phase !== "playing" || g.paused) return;
  if (!online.length) {
    // Freeze from the last confirmed presence, before processing any overdue action.
    const absentSince = Math.max(...g.players.filter((p) => !p.left).map((p) => p.lastSeen));
    pause(g, "offline", Math.min(now, absentSince)); return;
  }
  if (g.deadline !== null && now >= g.deadline) {
    if (g.street === "showdown") deal(g, random, now);
    else { const p = player(g, g.active); log(g, "timeout", p.name); wager(g, p, { type: p.bet >= g.currentBet ? "check" : "fold" }, now); }
  }
}
export function applyAction(input: Game, actor: string, action: Action, random: () => number = Math.random, now = Date.now()): Game {
  const g = structuredClone(input), p = player(g, actor); g.updated = now;
  if (p.left) fail("notMember");
  const hostOnly = () => { if (actor !== g.host) fail("hostOnly"); };
  if (action.type === "heartbeat") {
    maintenance(g, now, random); p.lastSeen = now;
    if (g.paused && g.pauseReason === "offline") resume(g, now);
    maintenance(g, now, random); return g;
  }
  maintenance(g, now, random); p.lastSeen = now;
  if (g.paused && g.pauseReason === "offline") resume(g, now);
  if (action.type === "options") {
    hostOnly(); if (g.phase !== "lobby") fail("alreadyStarted");
    if (action.timer !== undefined) g.options.timer = TIMERS.find((x) => x === action.timer) ?? fail("invalidAmount");
    if (action.levelMinutes !== undefined) g.options.levelMinutes = LEVEL_MINUTES.find((x) => x === action.levelMinutes) ?? fail("invalidAmount");
    return g;
  }
  if (action.type === "profile") {
    if (g.phase !== "lobby") fail("alreadyStarted");
    if (action.name !== undefined) p.name = validName(action.name);
    if (action.emblem !== undefined) {
      const emblem = integer(action.emblem, 0, 7);
      if (g.players.some((x) => x.id !== actor && x.emblem === emblem)) fail("emblemTaken");
      p.emblem = emblem;
    } return g;
  }
  if (action.type === "start" || action.type === "again") {
    hostOnly();
    if (g.phase !== (action.type === "start" ? "lobby" : "finished")) fail("invalidPhase");
    g.players = g.players.filter((x) => !x.left);
    if (g.players.length < MIN_PLAYERS) fail("playerCount");
    for (const x of g.players) { x.stack = STARTING_STACK; x.eliminated = x.resigned = false; }
    g.handNumber = 0; g.startedAt = now; g.level = 0; g.winner = null; g.forfeited = 0;
    g.paused = false; g.pauseReason = null; g.pausedAt = null; g.pausedRemaining = null;
    deal(g, random, now); return g;
  }
  if (action.type === "pause") {
    hostOnly(); if (g.phase !== "playing") fail("invalidPhase");
    if (g.paused) resume(g, now); else pause(g, "host", now);
    return g;
  }
  if (["leave", "resign", "kick"].includes(action.type)) {
    if (action.type === "kick") hostOnly();
    const target = action.type === "kick" ? player(g, String(action.player)) : p;
    if (action.type === "kick" && (g.phase !== "lobby" || target.id === actor)) fail("invalidAction");
    if (action.type === "resign" && (g.phase !== "playing" || target.eliminated || target.resigned)) fail("eliminated");
    if (g.phase === "lobby") g.players = g.players.filter((x) => x.id !== target.id);
    else {
      const wasActive = g.active === target.id;
      target.left = action.type !== "resign"; target.resigned = true; target.eliminated = true; target.folded = true;
      g.forfeited += target.stack; target.stack = 0; target.lastAction = "resigned";
      log(g, "resigned", target.name);
      if (g.phase === "playing") {
        if (g.street === "showdown") { if (survivors(g).length < 2) finish(g); }
        else {
          const savedDeadline = g.deadline;
          advance(g, now);
          // Leaving out of turn must not give the active player a fresh clock.
          if (!wasActive && g.active) g.deadline = savedDeadline;
          if (g.paused && g.phase === "playing") {
            if (wasActive || g.result) g.pausedRemaining = g.deadline === null ? null : Math.max(0, g.deadline - now);
            g.deadline = null;
          }
        }
      }
    }
    if (target.id === g.host && !g.players.some((x) => x.id === g.host && !x.left)) g.host = g.players.find((x) => !x.left)?.id ?? "";
    return g;
  }
  if (g.phase !== "playing" || g.street === "showdown") fail("invalidPhase");
  if (g.paused) fail("paused");
  if (p.eliminated || p.resigned) fail("eliminated");
  if (g.active !== actor) fail("notYourTurn");
  wager(g, p, action, now); return g;
}
/** Explicit allowlist: internal betting bookkeeping, deck, burns, requests and hashes never escape. */
export function publicGame(g: Game, actor: string) {
  return {
    game: g.game, code: g.code, channel: g.channel, revision: g.revision, host: g.host, phase: g.phase,
    options: g.options, street: g.street, board: g.board, handNumber: g.handNumber, dealer: g.dealer,
    smallBlind: g.smallBlind, bigBlind: g.bigBlind, level: g.level, startedAt: g.startedAt,
    currentBet: g.currentBet, active: g.active, deadline: g.deadline, winner: g.winner, result: g.result,
    paused: g.paused, pauseReason: g.pauseReason, events: g.events,
    pot: g.players.reduce((s, p) => s + p.contributed, 0),
    legal: legalActions(g, actor), me: actor, serverTime: g.updated,
    players: g.players.map((p) => ({
      id: p.id, name: p.name, emblem: p.emblem, stack: p.stack, bet: p.bet, contributed: p.contributed,
      inHand: p.inHand, folded: p.folded, eliminated: p.eliminated, resigned: p.resigned, left: p.left,
      lastAction: p.lastAction, online: g.updated - p.lastSeen < OFFLINE_MS,
      hand: p.id === actor || (g.result?.showdown && p.inHand && !p.folded) ? p.hand : [],
      cardCount: p.hand.length,
    })),
  };
}
export type PublicGame = ReturnType<typeof publicGame>;
export type PublicPlayer = PublicGame["players"][number];

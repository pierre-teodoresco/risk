// Casino blackjack, six-deck shoe. Pure transitions: the server injects clock and randomness.
import type { Action } from "../../platform/contract";
import { fail } from "../../platform/errors";
import { shuffle } from "../../platform/cards";
import { makeDeck, type Card } from "../cards/standard";
export const MIN_PLAYERS = 1, MAX_PLAYERS = 7, STARTING_BANK = 1000;
export const MIN_BET = 10, MAX_BET = 200, BET_STEP = 10, MAX_HANDS = 4;
export const TIMERS = [15, 20, 30, 60] as const;
export const SESSION_LENGTHS = [20, 0] as const;
export const DEAL_MS = 1400, DEALER_MS = 1100, RESULT_MS = 6500;
const OFFLINE_MS = 60000;
// Enough cards for all seven players to split to four hands without an emergency mid-hand shuffle.
const SHOE_RESERVE = 210;
export type Options = { timer: number; rounds: number };
export type Outcome = "win" | "loss" | "push" | "blackjack";
export type Hand = {
  id: string; cards: Card[]; wager: number; split: boolean; splitAces: boolean; doubled: boolean;
  status: "playing" | "stood" | "bust" | "blackjack" | "forfeit";
  outcome: Outcome | null; returned: number;
};
export type Player = {
  id: string; name: string; emblem: number; tokenHash: string; joined: number; lastSeen: number;
  bank: number; wager: number | null; hands: Hand[]; resigned: boolean; left: boolean;
};
export type Step = "betting" | "dealing" | "players" | "dealer" | "result";
export type Game = {
  game: "blackjack"; code: string; channel: string; revision: number; created: number; updated: number;
  host: string; players: Player[]; phase: "lobby" | "playing" | "finished"; step: Step; options: Options;
  shoe: Card[]; discard: Card[]; dealer: Card[]; dealerRevealed: boolean; shuffles: number;
  round: number; active: string; activeHand: string; deadline: number | null;
  paused: boolean; pauseReason: "host" | "offline" | null; pausedRemaining: number | null;
  finishRequested: boolean; finishReason: "rounds" | "funds" | "host" | "resigned" | null;
  /** Player chips lost to the house, minus payouts; the fictional house has no finite bankroll. */
  houseNet: number; forfeited: number;
  result: { round: number; at: number; players: { id: string; wager: number; returned: number; profit: number }[] } | null;
  events: { id: string; key: string; args: string[]; at: number }[];
  requests?: Record<string, string[]>;
};
const uid = () => crypto.randomUUID();
const validName = (v: unknown) => typeof v === "string" && v.trim().length >= 2 && v.trim().length <= 20 ? v.trim() : fail("invalidName");
const integer = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : fail("invalidAmount");
const player = (g: Game, id: string) => g.players.find((p) => p.id === id) ?? fail("notMember");
const seated = (g: Game) => g.players.filter((p) => !p.left && !p.resigned);
export const cardValue = (card: Card) => card.rank === 14 ? 11 : Math.min(card.rank, 10);
export function handValue(cards: readonly Card[]) {
  const low = cards.reduce((s, c) => s + (c.rank === 14 ? 1 : Math.min(c.rank, 10)), 0);
  const soft = cards.some((c) => c.rank === 14) && low + 10 <= 21;
  return { total: low + (soft ? 10 : 0), low, soft, bust: low > 21 };
}
export const natural = (hand: Pick<Hand, "cards" | "split">) => !hand.split && hand.cards.length === 2 && handValue(hand.cards).total === 21;
export const makeShoe = (): Card[] => Array.from({ length: 6 }, (_, copy) => makeDeck().map((c) => ({ ...c, id: `${copy}:${c.id}` }))).flat();
const canBet = (p: Player) => !p.left && !p.resigned && p.bank >= MIN_BET;
function log(g: Game, key: string, ...args: string[]) { g.events = [...g.events, { id: uid(), key, args, at: g.updated }].slice(-70); }
function newHand(wager: number, cards: Card[] = [], split = false, splitAces = false): Hand {
  return { id: uid(), wager, cards, split, splitAces, doubled: false, status: "playing", outcome: null, returned: 0 };
}
function newPlayer(input: Record<string, unknown>, hash: string, now: number): Player {
  return { id: uid(), name: validName(input.name), emblem: integer(input.emblem ?? 0, 0, 7), tokenHash: hash,
    joined: now, lastSeen: now, bank: STARTING_BANK, wager: null, hands: [], resigned: false, left: false };
}
export function createGame(code: string, input: Record<string, unknown>, hash: string, now: number): Game {
  const p = newPlayer(input, hash, now);
  return { game: "blackjack", code, channel: uid(), revision: 0, created: now, updated: now, host: p.id, players: [p],
    phase: "lobby", step: "betting", options: { timer: 20, rounds: 20 }, shoe: [], discard: [], dealer: [], dealerRevealed: false,
    shuffles: 0, round: 0, active: "", activeHand: "", deadline: null, paused: false, pauseReason: null, pausedRemaining: null,
    finishRequested: false, finishReason: null, houseNet: 0, forfeited: 0, result: null, events: [] };
}
export function joinGame(input: Game, profile: Record<string, unknown>, hash: string, now: number): Game {
  const g = structuredClone(input);
  if (g.phase !== "lobby") fail("alreadyStarted");
  if (g.players.length >= MAX_PLAYERS) fail("roomFull");
  const p = newPlayer(profile, hash, now);
  p.emblem = Array.from({ length: 8 }, (_, n) => (p.emblem + n) % 8).find((e) => !g.players.some((x) => x.emblem === e))!;
  g.players.push(p); g.updated = now; return g;
}
function draw(g: Game) { return g.shoe.pop() ?? fail("shoeEmpty"); }
function finish(g: Game, reason: NonNullable<Game["finishReason"]>) {
  g.phase = "finished"; g.finishReason = reason; g.active = g.activeHand = ""; g.deadline = null;
  g.paused = false; g.pauseReason = null; g.pausedRemaining = null; log(g, "sessionEnd");
}
function betting(g: Game, now: number) {
  if (g.finishRequested) { finish(g, "host"); return; }
  if (g.options.rounds && g.round >= g.options.rounds) { finish(g, "rounds"); return; }
  if (!seated(g).length) { finish(g, "resigned"); return; }
  if (!g.players.some(canBet)) { finish(g, "funds"); return; }
  g.discard.push(...g.dealer, ...g.players.flatMap((p) => p.hands.flatMap((h) => h.cards)));
  g.dealer = []; g.dealerRevealed = false; g.result = null; g.active = g.activeHand = "";
  for (const p of g.players) { p.hands = []; p.wager = canBet(p) ? null : 0; }
  g.step = "betting"; g.deadline = now + g.options.timer * 1000;
}
function settle(g: Game, now: number) {
  const dealer = handValue(g.dealer), dealerBJ = g.dealer.length === 2 && dealer.total === 21;
  const results: NonNullable<Game["result"]>["players"] = [];
  for (const p of g.players) {
    if (!p.hands.length) continue;
    let wager = 0, returned = 0;
    for (const h of p.hands) {
      if (h.outcome !== null) continue;
      const value = handValue(h.cards);
      h.outcome = h.status === "forfeit" || value.bust ? "loss"
        : natural(h) ? dealerBJ ? "push" : "blackjack"
        : dealerBJ ? "loss" : dealer.bust || value.total > dealer.total ? "win"
        : value.total === dealer.total ? "push" : "loss";
      h.returned = h.outcome === "blackjack" ? h.wager * 2.5 : h.outcome === "win" ? h.wager * 2 : h.outcome === "push" ? h.wager : 0;
      p.bank += h.returned; g.houseNet += h.wager - h.returned; wager += h.wager; returned += h.returned;
    }
    results.push({ id: p.id, wager, returned, profit: returned - wager });
    log(g, "paid", p.name, String(returned - wager));
  }
  g.result = { round: g.round, at: now, players: results };
  g.step = "result"; g.active = g.activeHand = ""; g.deadline = now + RESULT_MS;
  if (!seated(g).length) finish(g, "resigned");
}
function dealerTurn(g: Game, now: number) {
  g.step = "dealer"; g.dealerRevealed = true; g.active = g.activeHand = "";
  g.deadline = now + DEALER_MS; log(g, "dealerReveal");
}
function activate(g: Game, now: number) {
  for (const p of seated(g)) for (const h of p.hands) {
    if (h.status !== "playing") continue;
    // A newly split second hand receives its next card only when its turn arrives.
    if (h.cards.length === 1) h.cards.push(draw(g));
    if (handValue(h.cards).total === 21 || h.splitAces) { h.status = "stood"; continue; }
    g.step = "players"; g.active = p.id; g.activeHand = h.id; g.deadline = now + g.options.timer * 1000; return;
  }
  dealerTurn(g, now);
}
function deal(g: Game, random: () => number, now: number) {
  const playing = seated(g).filter((p) => p.hands.length);
  if (!playing.length) { betting(g, now); return; }
  if (g.shoe.length < SHOE_RESERVE) {
    g.shoe = shuffle([...g.shoe, ...g.discard], random); g.discard = []; g.shuffles++; log(g, "shuffled");
  }
  for (let n = 0; n < 2; n++) {
    for (const p of playing) p.hands[0].cards.push(draw(g));
    g.dealer.push(draw(g));
  }
  for (const p of playing) if (natural(p.hands[0])) p.hands[0].status = "blackjack";
  g.round++; g.step = "dealing"; g.deadline = now + DEAL_MS; log(g, "dealt", String(g.round));
}
const pendingBets = (g: Game) => seated(g).filter((p) => p.wager === null && canBet(p));
export function legalActions(g: Pick<Game, "phase" | "step" | "active" | "activeHand" | "paused"> & { players: Pick<Player, "id" | "bank" | "hands" | "resigned" | "left">[] }, id: string) {
  const p = g.players.find((x) => x.id === id);
  if (!p || p.left || p.resigned || g.phase !== "playing" || g.step !== "players" || g.paused || g.active !== id) return null;
  const h = p.hands.find((h) => h.id === g.activeHand);
  if (!h || h.status !== "playing") return null;
  return { hit: handValue(h.cards).total < 21, stand: true,
    double: h.cards.length === 2 && !h.splitAces && p.bank >= h.wager,
    split: h.cards.length === 2 && !h.splitAces && p.hands.length < MAX_HANDS && cardValue(h.cards[0]) === cardValue(h.cards[1]) && p.bank >= h.wager };
}
function play(g: Game, p: Player, type: string, now: number) {
  const legal = legalActions(g, p.id) ?? fail("notYourTurn");
  const h = p.hands.find((h) => h.id === g.activeHand)!;
  if (type === "hit") {
    if (!legal.hit) fail("invalidAction");
    h.cards.push(draw(g)); const v = handValue(h.cards);
    h.status = v.bust ? "bust" : v.total === 21 ? "stood" : "playing";
  } else if (type === "stand") h.status = "stood";
  else if (type === "double") {
    if (!legal.double) fail("cannotDouble");
    p.bank -= h.wager; h.wager *= 2; h.doubled = true; h.cards.push(draw(g));
    h.status = handValue(h.cards).bust ? "bust" : "stood";
  } else if (type === "split") {
    if (!legal.split) fail("cannotSplit");
    p.bank -= h.wager; const aces = h.cards[0].rank === 14;
    const hands = h.cards.map((c) => newHand(h.wager, [c], true, aces));
    p.hands.splice(p.hands.indexOf(h), 1, ...hands);
    if (aces) for (const hand of hands) { hand.cards.push(draw(g)); hand.status = "stood"; }
  } else fail("invalidAction");
  log(g, type, p.name);
  if (type === "hit" && h.status === "playing") g.deadline = now + g.options.timer * 1000;
  else activate(g, now);
}
function pause(g: Game, reason: "host" | "offline", at: number) {
  g.paused = true; g.pauseReason = reason;
  g.pausedRemaining = g.deadline === null ? null : Math.max(0, g.deadline - at); g.deadline = null;
}
function resume(g: Game, now: number) {
  g.deadline = g.pausedRemaining === null ? null : now + g.pausedRemaining;
  g.paused = false; g.pauseReason = null; g.pausedRemaining = null;
}
export function maintenance(g: Game, now: number, random: () => number) {
  const online = g.players.filter((p) => !p.left && now - p.lastSeen < OFFLINE_MS).sort((a, b) => a.joined - b.joined);
  if (!online.some((p) => p.id === g.host) && online.length) g.host = online[0].id;
  if (g.phase !== "playing" || g.paused) return;
  if (!online.length) { pause(g, "offline", Math.min(now, Math.max(...g.players.filter((p) => !p.left).map((p) => p.lastSeen)))); return; }
  if (g.deadline === null || now < g.deadline) return;
  if (g.step === "betting") { for (const p of pendingBets(g)) p.wager = 0; deal(g, random, now); }
  else if (g.step === "dealing") {
    // US hole-card peek before any double or split; only a natural reveals the card now.
    if (g.dealer.length === 2 && handValue(g.dealer).total === 21) dealerTurn(g, now);
    else activate(g, now);
  } else if (g.step === "players") { const p = player(g, g.active); log(g, "timeout", p.name); play(g, p, "stand", now); }
  else if (g.step === "dealer") {
    const unresolved = seated(g).some((p) => p.hands.some((h) => h.status !== "bust" && h.status !== "forfeit" && !natural(h)));
    if (unresolved && handValue(g.dealer).total < 17) { g.dealer.push(draw(g)); g.deadline = now + DEALER_MS; log(g, "dealerHit"); }
    else settle(g, now);
  } else betting(g, now);
}
export function applyAction(input: Game, actor: string, action: Action, random: () => number = Math.random, now = Date.now()): Game {
  const g = structuredClone(input), p = player(g, actor); g.updated = now;
  if (p.left) fail("notMember");
  maintenance(g, now, random); p.lastSeen = now;
  if (g.paused && g.pauseReason === "offline") resume(g, now);
  if (action.type === "heartbeat") { maintenance(g, now, random); return g; }
  const hostOnly = () => { if (g.host !== actor) fail("hostOnly"); };
  if (action.type === "options") {
    hostOnly(); if (g.phase !== "lobby") fail("alreadyStarted");
    if (action.timer !== undefined) g.options.timer = TIMERS.find((t) => t === action.timer) ?? fail("invalidAmount");
    if (action.rounds !== undefined) g.options.rounds = SESSION_LENGTHS.find((t) => t === action.rounds) ?? fail("invalidAmount");
    return g;
  }
  if (action.type === "profile") {
    if (g.phase !== "lobby") fail("alreadyStarted");
    if (action.name !== undefined) p.name = validName(action.name);
    if (action.emblem !== undefined) { const emblem = integer(action.emblem, 0, 7); if (g.players.some((x) => x.id !== actor && x.emblem === emblem)) fail("emblemTaken"); p.emblem = emblem; }
    return g;
  }
  if (action.type === "start" || action.type === "again") {
    hostOnly(); if (g.phase !== (action.type === "start" ? "lobby" : "finished")) fail("invalidPhase");
    g.players = g.players.filter((x) => !x.left); if (!g.players.length || g.players.length > MAX_PLAYERS) fail("playerCount");
    for (const x of g.players) { x.bank = STARTING_BANK; x.hands = []; x.wager = null; x.resigned = false; }
    g.shoe = shuffle(makeShoe(), random); g.discard = []; g.dealer = []; g.round = 0; g.shuffles = 1;
    g.phase = "playing"; g.paused = false; g.pauseReason = null; g.pausedRemaining = null;
    g.houseNet = g.forfeited = 0; g.finishRequested = false; g.finishReason = null; betting(g, now); return g;
  }
  if (action.type === "pause") { hostOnly(); if (g.phase !== "playing") fail("invalidPhase"); if (g.paused) resume(g, now); else pause(g, "host", now); return g; }
  if (action.type === "finish") {
    hostOnly(); if (g.phase !== "playing") fail("invalidPhase"); g.finishRequested = true;
    if (g.step === "result" || (g.step === "betting" && !g.players.some((x) => x.hands.length))) finish(g, "host");
    return g;
  }
  if (["kick", "leave", "resign"].includes(action.type)) {
    if (action.type === "kick") hostOnly();
    const target = action.type === "kick" ? player(g, String(action.player)) : p;
    if (action.type === "kick" && (g.phase !== "lobby" || target.id === actor)) fail("invalidAction");
    if (action.type === "resign" && (g.phase !== "playing" || target.resigned)) fail("invalidPhase");
    if (g.phase === "lobby") g.players = g.players.filter((x) => x.id !== target.id);
    else {
      target.left = action.type !== "resign"; target.resigned = true;
      if (g.phase === "playing") {
        const previousStep = g.step;
        g.forfeited += target.bank; target.bank = 0;
        if (g.step === "betting") { g.forfeited += target.hands.reduce((s, h) => s + h.wager, 0); target.hands = []; }
        else for (const h of target.hands) if (h.outcome === null) h.status = "forfeit";
        log(g, "resigned", target.name);
        if (g.step === "betting") { if (!pendingBets(g).length) deal(g, random, now); }
        else if (g.step === "players" && g.active === target.id) {
          const wasPaused = g.paused; activate(g, now);
          if (wasPaused) { g.pausedRemaining = g.deadline === null ? null : g.deadline - now; g.deadline = null; }
        }
        if (g.paused && g.phase === "playing" && g.deadline !== null) {
          if (g.step !== previousStep) g.pausedRemaining = Math.max(0, g.deadline - now);
          g.deadline = null;
        }
      }
    }
    if (g.phase === "playing" && !seated(g).length) {
      if (g.players.some((x) => x.hands.some((h) => h.outcome === null))) settle(g, now);
      else finish(g, "resigned");
    }
    if (!g.players.some((x) => x.id === g.host && !x.left)) g.host = g.players.find((x) => !x.left)?.id ?? "";
    return g;
  }
  if (g.phase !== "playing") fail("invalidPhase");
  if (g.paused) fail("paused");
  if (p.resigned) fail("eliminated");
  if (action.type === "bet" || action.type === "skip") {
    if (g.step !== "betting") fail("invalidPhase");
    if (p.wager !== null) fail("alreadyBet");
    if (!canBet(p)) fail("insufficientFunds");
    const amount = action.type === "skip" ? 0 : integer(action.amount, MIN_BET, Math.min(MAX_BET, p.bank));
    if (amount % BET_STEP) fail("invalidAmount");
    p.wager = amount; p.bank -= amount;
    if (amount) p.hands = [newHand(amount)];
    log(g, amount ? "bet" : "skip", p.name, String(amount));
    if (!pendingBets(g).length) deal(g, random, now); return g;
  }
  if (g.step !== "players") fail("invalidPhase");
  if (g.active !== actor) fail("notYourTurn");
  play(g, p, action.type, now); return g;
}
/** Explicit public projection: only the dealer's visible cards; no shoe, discard order or identity hashes. */
export function publicGame(g: Game, actor: string) {
  const dealer: (Card | null)[] = g.dealerRevealed ? g.dealer : g.dealer.length ? [g.dealer[0], null] : [];
  return { game: g.game, code: g.code, channel: g.channel, revision: g.revision, host: g.host, phase: g.phase,
    step: g.step, options: g.options, round: g.round, active: g.active, activeHand: g.activeHand, deadline: g.deadline,
    paused: g.paused, pauseReason: g.pauseReason, finishRequested: g.finishRequested, finishReason: g.finishReason,
    dealer, dealerRevealed: g.dealerRevealed, shoeCount: g.shoe.length, shuffles: g.shuffles,
    houseNet: g.houseNet, result: g.result, events: g.events, legal: legalActions(g, actor), me: actor, serverTime: g.updated,
    players: g.players.map((p) => ({ id: p.id, name: p.name, emblem: p.emblem, bank: p.bank, wager: p.wager,
      hands: p.hands, resigned: p.resigned, left: p.left, online: g.updated - p.lastSeen < OFFLINE_MS, canBet: canBet(p) })),
  };
}
export type PublicGame = ReturnType<typeof publicGame>;
export type PublicPlayer = PublicGame["players"][number];

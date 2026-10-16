// Pioche: a shedding card game. Pure rules, independent of network and storage; time and
// randomness are injected so tests can replay any game.
import type { Action } from "../../platform/contract";
import { fail } from "../../platform/errors";

export const CARD_COLORS = ["red", "yellow", "green", "blue"] as const;
export type CardColor = (typeof CARD_COLORS)[number];
export type CardKind = "number" | "skip" | "reverse" | "draw2" | "wild" | "draw4";
export type Card = { id: string; kind: CardKind; color: CardColor | null; value: number | null };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const HAND_SIZE = 7;
export const EMBLEM_COUNT = 8;
export const TIMERS = [0, 15, 30, 60] as const;
export const REACTIONS = ["clap", "laugh", "shock", "angry", "gg", "ouch"] as const;
export const PILE_VISIBLE = 6;
const OFFLINE_MS = 60000;
const REACTION_GAP_MS = 800;
const KEPT_REACTIONS = 12;
const KEPT_EVENTS = 80;
const DRAW2 = 2;
const DRAW4 = 4;
export const CHALLENGE_PENALTY = 2;
const CATCH_PENALTY = 2;
/** End-of-round points left in a hand, shown on the winner screen. */
export const CARD_POINTS: Record<CardKind, number> = { number: 0, skip: 20, reverse: 20, draw2: 20, wild: 50, draw4: 50 };

/** `combos`: several identical cards (same number, or same symbol) may be played together. */
export type Options = { stacking: boolean; drawUntilPlayable: boolean; sevenZero: boolean; combos: boolean; timer: number };
export type Player = {
  id: string;
  name: string;
  emblem: number;
  tokenHash: string;
  lastSeen: number;
  joined: number;
  hand: Card[];
  /** Said "Last card!" for the hand they hold now. */
  called: boolean;
  left: boolean;
};
export type GameEvent = { id: string; key: string; args: string[]; at: number };
export type Reaction = { id: string; from: string; key: string; at: number };
export type Phase = "lobby" | "playing" | "finished";
export type Game = {
  game: "pioche";
  code: string;
  channel: string;
  revision: number;
  created: number;
  updated: number;
  host: string;
  players: Player[];
  phase: Phase;
  options: Options;
  deck: Card[];
  /** Last element is the top of the pile. */
  discard: Card[];
  /** Colour to follow: the top card's, or the one chosen with a wild. */
  color: CardColor | null;
  direction: 1 | -1;
  active: string;
  dealer: string;
  round: number;
  /** Cards the active player must draw unless they stack. */
  pendingDraw: number;
  /** A +4 the active player may challenge; `illegal` stays on the server. */
  challenge: { from: string; to: string; previousColor: CardColor; illegal: boolean } | null;
  /** Card just drawn this turn: the only one the player may still play. */
  drawn: string | null;
  /** "Draw until playable": the active player started drawing and must go on until a card fits. */
  drawing: boolean;
  deadline: number | null;
  paused: boolean;
  /** "offline" pauses lift when the active player returns; "host" pauses wait for the host. */
  pauseReason: "offline" | "host" | null;
  pausedRemaining: number | null;
  winner: string | null;
  /** `card` is the top card; `cards` lists the whole lot in play order (absent before combos). */
  lastPlay: { by: string; card: string; cards?: string[]; at: number } | null;
  events: GameEvent[];
  reactions: Reaction[];
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

/** The 108-card deck: per colour one 0, two of 1–9, two of each action; four of each wild. */
export function makeDeck(): Card[] {
  const cards: Card[] = [];
  for (const color of CARD_COLORS) {
    cards.push({ id: `${color}-0`, kind: "number", color, value: 0 });
    for (const copy of ["a", "b"]) {
      for (let value = 1; value <= 9; value++) cards.push({ id: `${color}-${value}${copy}`, kind: "number", color, value });
      for (const kind of ["skip", "reverse", "draw2"] as const) cards.push({ id: `${color}-${kind}${copy}`, kind, color, value: null });
    }
  }
  for (let n = 1; n <= 4; n++) {
    cards.push({ id: `wild${n}`, kind: "wild", color: null, value: null });
    cards.push({ id: `draw4-${n}`, kind: "draw4", color: null, value: null });
  }
  return cards;
}

function log(g: Game, key: string, ...args: string[]) {
  g.events.push({ id: uid(), key, args, at: g.updated });
  g.events = g.events.slice(-KEPT_EVENTS);
}
const seated = (g: Game) => g.players.filter((p) => !p.left);
const byId = (g: Game, id: string) => g.players.find((p) => p.id === id) ?? fail("notMember");
export const topCard = (g: Pick<Game, "discard">) => g.discard.at(-1) ?? null;

/** Seat `steps` places after `from` in the direction of play, skipping players who left. */
export function nextSeat(g: Pick<Game, "players" | "direction">, from: string, steps = 1) {
  const n = g.players.length;
  let i = g.players.findIndex((p) => p.id === from);
  for (let s = 0; s < steps; s++) {
    do i = (i + g.direction + n) % n;
    while (g.players[i].left);
  }
  return g.players[i].id;
}

/** Shared with the client, which passes its public view to highlight playable cards. */
export function playable(
  g: Pick<Game, "discard" | "pendingDraw" | "options" | "drawn" | "color"> & { drawing?: boolean },
  card: Card,
) {
  const top = topCard(g);
  if (g.pendingDraw > 0)
    return g.options.stacking && !!top && (top.kind === "draw2" || top.kind === "draw4") && card.kind === top.kind;
  if ((g.drawn || g.drawing) && card.id !== g.drawn) return false;
  if (card.kind === "wild" || card.kind === "draw4") return true;
  if (card.color === g.color) return true;
  if (!top) return true;
  if (card.kind === "number") return top.kind === "number" && top.value === card.value;
  return card.kind === top.kind;
}

/** Cards that may be played together as one lot: same number, or same symbol. */
export const sameRank = (a: Card, b: Card) => a.kind === b.kind && (a.kind !== "number" || a.value === b.value);

function refill(g: Game, random: () => number) {
  const top = g.discard.pop();
  g.deck = shuffle(g.discard, random);
  g.discard = top ? [top] : [];
}
function drawCards(g: Game, p: Player, count: number, random: () => number) {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (!g.deck.length) refill(g, random);
    const c = g.deck.pop();
    if (!c) break;
    p.hand.push(c);
    drawn.push(c);
  }
  if (p.hand.length > 1) p.called = false;
  if (drawn.length) log(g, "drew", p.name, String(drawn.length));
  return drawn;
}
function startTurn(g: Game, id: string, now: number) {
  g.active = id;
  g.drawn = null;
  g.drawing = false;
  g.deadline = g.options.timer ? now + g.options.timer * 1000 : null;
}
function advance(g: Game, steps: number, now: number) {
  startTurn(g, nextSeat(g, g.active, steps), now);
}
/** A player on their last card who has not called it yet: anyone else may make them draw. */
export const catchable = (p: { left: boolean; called: boolean } & ({ hand: Card[] } | { cardCount: number })) =>
  !p.left && !p.called && ("cardCount" in p ? p.cardCount : p.hand.length) === 1;
function finish(g: Game, winner: Player) {
  g.phase = "finished";
  g.winner = winner.id;
  g.deadline = null;
  g.paused = false;
  g.pauseReason = null;
  g.drawing = false;
  g.challenge = null;
  g.pendingDraw = 0;
  g.drawn = null;
  log(g, "won", winner.name);
}

function newPlayer(input: Record<string, unknown>, hash: string, now: number): Player {
  return {
    id: uid(),
    name: name(input.name),
    emblem: integer(typeof input.emblem === "number" ? input.emblem : 0, 0, EMBLEM_COUNT - 1),
    tokenHash: hash,
    lastSeen: now,
    joined: now,
    hand: [],
    called: false,
    left: false,
  };
}

export function createGame(code: string, input: Record<string, unknown>, hash: string, now: number): Game {
  const p = newPlayer(input, hash, now);
  return {
    game: "pioche",
    code,
    channel: uid(),
    revision: 0,
    created: now,
    updated: now,
    host: p.id,
    players: [p],
    phase: "lobby",
    options: { stacking: false, drawUntilPlayable: false, sevenZero: false, combos: false, timer: 0 },
    deck: [],
    discard: [],
    color: null,
    direction: 1,
    active: p.id,
    dealer: p.id,
    round: 0,
    pendingDraw: 0,
    challenge: null,
    drawn: null,
    drawing: false,
    deadline: null,
    paused: false,
    pauseReason: null,
    pausedRemaining: null,
    winner: null,
    lastPlay: null,
    events: [],
    reactions: [],
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

/** Shuffles, deals and flips a number card to start; the player after the dealer opens. */
function deal(g: Game, random: () => number, now: number) {
  g.deck = shuffle(makeDeck(), random);
  g.discard = [];
  g.direction = 1;
  g.pendingDraw = 0;
  g.challenge = null;
  g.winner = null;
  g.lastPlay = null;
  g.paused = false;
  g.pauseReason = null;
  g.pausedRemaining = null;
  for (const p of g.players) {
    p.hand = [];
    p.called = false;
  }
  for (let i = 0; i < HAND_SIZE; i++) for (const p of g.players) p.hand.push(g.deck.pop()!);
  // House simplification: the round always opens on a number card, so no effect applies to the first player.
  let first = g.deck.pop()!;
  while (first.kind !== "number") {
    g.deck.splice(Math.floor(random() * g.deck.length), 0, first);
    first = g.deck.pop()!;
  }
  g.discard.push(first);
  g.color = first.color;
  g.phase = "playing";
  g.round++;
  startTurn(g, nextSeat(g, g.dealer), now);
  log(g, "started", byId(g, g.dealer).name);
}

export function maintenance(g: Game, now: number, random: () => number) {
  let changed = false;
  const online = g.players.toSorted((a, b) => a.joined - b.joined).filter((p) => !p.left && now - p.lastSeen < OFFLINE_MS);
  if (!online.some((p) => p.id === g.host) && online.length) {
    g.host = online[0].id;
    log(g, "host", online[0].name);
    changed = true;
  }
  if (g.phase !== "playing" || g.paused) return changed;
  const active = byId(g, g.active);
  if (now - active.lastSeen >= OFFLINE_MS) {
    pause(g, "offline", now);
    return true;
  }
  if (g.deadline && now >= g.deadline) {
    log(g, "timeout", active.name);
    // A slow player pays their pending cards, or draws one card, then the turn moves on.
    if (g.pendingDraw > 0) takeDraw(g, active, random, now);
    else {
      if (!g.drawn) drawCards(g, active, 1, random);
      advance(g, 1, now);
    }
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

/** Draw action: pays a pending +2/+4, or draws one card (or until playable with the option). */
function takeDraw(g: Game, p: Player, random: () => number, now: number) {
  if (g.pendingDraw > 0) {
    drawCards(g, p, g.pendingDraw, random);
    g.pendingDraw = 0;
    g.challenge = null;
    advance(g, 1, now);
    return;
  }
  if (g.drawn) fail("alreadyDrew");
  // One card per draw, even when drawing until playable: each draw is its own suspenseful click.
  const card = drawCards(g, p, 1, random)[0];
  // The streak lock keeps hand cards out; the card just drawn is judged on its own.
  if (card && playable({ ...g, drawing: false }, card)) {
    g.drawn = card.id;
    g.drawing = false;
  } else if (card && g.options.drawUntilPlayable) g.drawing = true;
  else advance(g, 1, now);
}

/** The cards of a play, in order: the first must fit the pile, the others must be identical to it. */
function lot(g: Game, p: Player, action: Action) {
  const ids: unknown[] = Array.isArray(action.cards) ? action.cards : [action.card];
  if (!ids.length || new Set(ids).size !== ids.length) fail("invalidCard");
  if (ids.length > 1 && !g.options.combos) fail("combosOff");
  const cards = ids.map((id) => p.hand.find((c) => c.id === id) ?? fail("invalidCard"));
  if (!playable(g, cards[0])) fail("notPlayable");
  if (cards.some((c) => !sameRank(cards[0], c))) fail("notSameCard");
  return cards;
}

function play(g: Game, p: Player, action: Action, random: () => number, now: number) {
  const cards = lot(g, p, action);
  const card = cards[0], top = cards.at(-1)!, count = cards.length;
  const wild = card.kind === "wild" || card.kind === "draw4";
  // The last card of a lot ends on top, so its colour is the one to follow.
  const chosen = wild
    ? CARD_COLORS.find((c) => c === action.color) ?? fail("chooseColor")
    : top.color!;
  // A lot of 7s or 0s triggers its effect once: several swaps in a row would only undo each other.
  const sevenSwap = g.options.sevenZero && card.kind === "number" && card.value === 7;
  const target = sevenSwap
    ? g.players.find((x) => x.id === action.target && x.id !== p.id && !x.left) ?? fail("chooseTarget")
    : null;
  const previousColor = g.color!;
  const played = new Set(cards.map((c) => c.id));
  p.hand = p.hand.filter((c) => !played.has(c.id));
  g.discard.push(...cards);
  g.color = chosen;
  g.drawn = null;
  g.lastPlay = { by: p.id, card: top.id, cards: [...played], at: now };
  for (const c of cards) log(g, "played", p.name, c.id);
  if (count > 1) log(g, "combo", p.name, String(count));
  if (wild) log(g, "chose", p.name, chosen);
  if (!p.hand.length) return finish(g, p);

  if (target) {
    [p.hand, target.hand] = [target.hand, p.hand];
    p.called = target.called = false;
    log(g, "swapped", p.name, target.name);
  } else if (g.options.sevenZero && card.kind === "number" && card.value === 0) {
    const order = seated(g);
    const hands = order.map((x) => x.hand);
    order.forEach((x, i) => {
      x.hand = hands[(i - g.direction + order.length) % order.length];
      x.called = false;
    });
    log(g, "rotated");
  }

  // Skips beyond the other players wrap back to the one who played them, never further.
  const skips = Math.min(count, seated(g).length - 1);
  if (card.kind === "skip") {
    for (let i = 1; i <= skips; i++) log(g, "skipped", byId(g, nextSeat(g, p.id, i)).name);
    advance(g, skips + 1, now);
  } else if (card.kind === "reverse") {
    // Reverses cancel in pairs; with two players each one works as a skip.
    if (count % 2) {
      g.direction = g.direction === 1 ? -1 : 1;
      log(g, "reversed");
    }
    advance(g, seated(g).length === 2 ? 2 : 1, now);
  } else if (card.kind === "draw2") {
    g.pendingDraw += DRAW2 * count;
    advance(g, 1, now);
    // Without stacking there is nothing to decide: the next player pays at once.
    if (!g.options.stacking) takeDraw(g, byId(g, g.active), random, now);
  } else if (card.kind === "draw4") {
    const stacked = g.pendingDraw > 0;
    g.pendingDraw += DRAW4 * count;
    advance(g, 1, now);
    g.challenge = stacked
      ? null
      : { from: p.id, to: g.active, previousColor, illegal: p.hand.some((c) => c.color === previousColor) };
  } else advance(g, 1, now);
}

export function applyAction(
  input: Game,
  actor: string,
  action: Action,
  random: () => number = Math.random,
  now = Date.now(),
): Game {
  const g = structuredClone(input);
  g.updated = now;
  const p = byId(g, actor);
  const type = action.type;
  const hostOnly = () => {
    if (actor !== g.host) fail("hostOnly");
  };
  const myTurn = () => {
    if (g.phase !== "playing") fail("invalidPhase");
    if (g.paused) fail("paused");
    if (p.left) fail("eliminated");
    if (g.active !== actor) fail("notYourTurn");
  };

  if (type === "heartbeat") {
    maintenance(g, now, random);
    p.lastSeen = now;
    if (g.paused && g.pauseReason === "offline" && g.active === actor && g.phase === "playing") resume(g, now);
    return g;
  }
  maintenance(g, now, random);

  if (type === "react") {
    const key = REACTIONS.find((r) => r === action.key) ?? fail("invalidAction");
    const last = g.reactions.filter((r) => r.from === actor).at(-1);
    if (last && now - last.at < REACTION_GAP_MS) fail("slowDown");
    g.reactions = [...g.reactions, { id: uid(), from: actor, key, at: now }].slice(-KEPT_REACTIONS);
    return g;
  }

  if (type === "profile") {
    if (g.phase !== "lobby") fail("alreadyStarted");
    if (action.name !== undefined) p.name = name(action.name);
    if (action.emblem !== undefined) {
      const e = integer(action.emblem, 0, EMBLEM_COUNT - 1);
      if (g.players.some((x) => x.id !== actor && x.emblem === e)) fail("emblemTaken");
      p.emblem = e;
    }
    return g;
  }
  if (type === "options") {
    hostOnly();
    if (g.phase === "playing") fail("alreadyStarted");
    for (const key of ["stacking", "drawUntilPlayable", "sevenZero", "combos"] as const)
      if (action[key] !== undefined) g.options[key] = action[key] === true;
    if (action.timer !== undefined)
      g.options.timer = TIMERS.find((t) => t === action.timer) ?? fail("invalidAmount");
    return g;
  }
  if (type === "start" || type === "again") {
    hostOnly();
    if (type === "start" && g.phase !== "lobby") fail("alreadyStarted");
    if (type === "again") {
      if (g.phase !== "finished") fail("invalidPhase");
      g.players = g.players.filter((x) => !x.left);
      g.direction = 1;
      g.dealer = nextSeat(g, g.players.some((x) => x.id === g.dealer) ? g.dealer : g.players[0].id);
    } else g.dealer = g.players[Math.floor(random() * g.players.length)].id;
    if (g.players.length < MIN_PLAYERS) fail("playerCount");
    deal(g, random, now);
    return g;
  }
  if (type === "pause") {
    hostOnly();
    if (g.phase !== "playing") fail("invalidPhase");
    if (g.paused) {
      resume(g, now);
      for (const x of g.players) if (now - x.lastSeen >= OFFLINE_MS) x.lastSeen = now;
    } else pause(g, "host", now);
    return g;
  }
  if (type === "kick" || type === "leave") {
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
    if (g.phase !== "playing") return g;
    g.deck = [...shuffle(target.hand, random), ...g.deck];
    target.hand = [];
    if (g.challenge && (g.challenge.from === target.id || g.challenge.to === target.id)) {
      g.challenge = null;
      g.pendingDraw = 0;
    }
    const remaining = seated(g);
    if (remaining.length === 1) finish(g, remaining[0]);
    else if (g.active === target.id) {
      g.pendingDraw = 0;
      advance(g, 1, now);
    }
    return g;
  }

  // "Last card!" is a race: the player on one card must call it before anyone else does.
  if (type === "call") {
    if (g.phase !== "playing" || p.left) fail("invalidPhase");
    if (g.paused) fail("paused");
    if (!catchable(p)) fail("tooLate");
    p.called = true;
    log(g, "called", p.name);
    return g;
  }
  if (type === "catch") {
    if (g.phase !== "playing" || p.left) fail("invalidPhase");
    if (g.paused) fail("paused");
    const target = g.players.find((x) => x.id === action.player && x.id !== actor) ?? fail("invalidAction");
    if (!catchable(target)) fail("tooLate");
    drawCards(g, target, CATCH_PENALTY, random);
    log(g, "caught", p.name, target.name);
    return g;
  }

  myTurn();
  if (type === "play") play(g, p, action, random, now);
  else if (type === "draw") takeDraw(g, p, random, now);
  else if (type === "pass") {
    if (!g.drawn) fail("cannotPass");
    log(g, "passed", p.name);
    advance(g, 1, now);
  } else if (type === "challenge") {
    const c = g.challenge?.to === actor ? g.challenge : fail("noChallenge");
    const accused = byId(g, c.from);
    // A lot of +4s is challenged as a whole: the loser draws its total.
    const owed = g.pendingDraw;
    g.challenge = null;
    g.pendingDraw = 0;
    if (c.illegal) {
      drawCards(g, accused, owed, random);
      log(g, "challengeWon", p.name, accused.name, String(owed));
      startTurn(g, actor, now);
    } else {
      drawCards(g, p, owed + CHALLENGE_PENALTY, random);
      log(g, "challengeLost", p.name, accused.name, String(owed + CHALLENGE_PENALTY));
      advance(g, 1, now);
    }
  } else fail("invalidAction");
  return g;
}

/** Everything `actor` may see: other hands, the deck order and a +4's legality stay hidden. */
export function publicGame(g: Game, actor: string) {
  const { requests: _requests, deck, challenge, ...visible } = g;
  const reveal = g.phase === "finished";
  return {
    ...visible,
    deckCount: deck.length,
    discard: g.discard.slice(-PILE_VISIBLE),
    discardCount: g.discard.length,
    challenge: challenge ? { from: challenge.from, to: challenge.to } : null,
    drawn: actor === g.active ? g.drawn : null,
    hasDrawn: !!g.drawn,
    players: g.players.map(({ tokenHash: _hash, hand, ...p }) => ({
      ...p,
      cardCount: hand.length,
      hand: p.id === actor || reveal ? hand : [],
    })),
    me: actor,
    serverTime: Date.now(),
  };
}
export type PublicGame = ReturnType<typeof publicGame>;
export type PublicPlayer = PublicGame["players"][number];

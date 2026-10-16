// Two-player board games (chess, draughts): seats and colours, the chess clock, resignation,
// draw offers, pauses and rematches. Each game brings its own rules through `DuelRules`.
// Pure: time and randomness are injected so tests can replay any game.
import type { Action } from "../../platform/contract";
import { fail } from "../../platform/errors";

export type Side = "w" | "b";
export const otherSide = (s: Side): Side => (s === "w" ? "b" : "w");
export const EMBLEM_COUNT = 8;
/** Minutes on each clock; 0 plays without a clock. */
export const CLOCKS = [0, 3, 5, 10, 15] as const;
/** Seconds added after each move. */
export const INCREMENTS = [0, 2, 5] as const;
const OFFLINE_MS = 60000;
const KEPT_EVENTS = 60;

export type Outcome = { winner: Side | null; reason: string };
/** What a game brings: its starting position, its moves, and when it ends. */
export type DuelRules<P, M> = {
  id: string;
  start(): P;
  turn(p: P): Side;
  /** Reads a move from an action and checks it is legal; throws a GameError otherwise. */
  parse(p: P, action: Action): M;
  play(p: P, m: M): P;
  /** Short notation for the move list. */
  notation(p: P, m: M): string;
  /** Squares the move touched, for the client's highlight. */
  squares(m: M): number[];
  /** Squares the moving piece stops on, start to finish, for the client's animation. */
  path(m: M): number[];
  /** Repetition key of a position. */
  key(p: P): string;
  /** Result after a move, given how many times each position has occurred. */
  outcome(p: P, seen: Record<string, number>): Outcome | null;
  /** Whether `side` could still win on the board; flag falls against a side that cannot are draws. */
  canWin(p: P, side: Side): boolean;
};

export type Options = { clock: number; increment: number };
export type Player = {
  id: string;
  name: string;
  emblem: number;
  tokenHash: string;
  lastSeen: number;
  joined: number;
  side: Side | null;
  left: boolean;
};
export type GameEvent = { id: string; key: string; args: string[]; at: number };
export type Phase = "lobby" | "playing" | "finished";
export type Duel<P> = {
  game: string;
  code: string;
  channel: string;
  revision: number;
  created: number;
  updated: number;
  host: string;
  players: Player[];
  phase: Phase;
  options: Options;
  position: P;
  /** Moves in order, in each game's notation. */
  moves: string[];
  last: { squares: number[]; path: number[]; at: number } | null;
  seen: Record<string, number>;
  /** Remaining time per side, in ms, as of `turnStart`. */
  clocks: Record<Side, number>;
  turnStart: number;
  /** When the side to move runs out of time. */
  deadline: number | null;
  drawOffer: Side | null;
  result: Outcome | null;
  paused: boolean;
  pauseReason: "offline" | "host" | null;
  pausedRemaining: number | null;
  round: number;
  events: GameEvent[];
  requests?: Record<string, string[]>;
};

const uid = () => crypto.randomUUID();
const name = (v: unknown) =>
  typeof v === "string" && v.trim().length >= 2 && v.trim().length <= 20 ? v.trim() : fail("invalidName");
const integer = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fail("invalidAmount");

export function duel<P, M>(rules: DuelRules<P, M>) {
  type G = Duel<P>;
  const log = (g: G, key: string, ...args: string[]) => {
    g.events.push({ id: uid(), key, args, at: g.updated });
    g.events = g.events.slice(-KEPT_EVENTS);
  };
  const byId = (g: G, id: string) => g.players.find((p) => p.id === id) ?? fail("notMember");
  const seat = (g: G, side: Side) => g.players.find((p) => p.side === side && !p.left);
  const newPlayer = (input: Record<string, unknown>, hash: string, now: number): Player => ({
    id: uid(),
    name: name(input.name),
    emblem: integer(typeof input.emblem === "number" ? input.emblem : 0, 0, EMBLEM_COUNT - 1),
    tokenHash: hash,
    lastSeen: now,
    joined: now,
    side: null,
    left: false,
  });

  function create(code: string, input: Record<string, unknown>, hash: string, now: number): G {
    const p = newPlayer(input, hash, now);
    return {
      game: rules.id,
      code,
      channel: uid(),
      revision: 0,
      created: now,
      updated: now,
      host: p.id,
      players: [p],
      phase: "lobby",
      options: { clock: 10, increment: 0 },
      position: rules.start(),
      moves: [],
      last: null,
      seen: {},
      clocks: { w: 0, b: 0 },
      turnStart: now,
      deadline: null,
      drawOffer: null,
      result: null,
      paused: false,
      pauseReason: null,
      pausedRemaining: null,
      round: 0,
      events: [],
    };
  }

  function join(input: G, data: Record<string, unknown>, hash: string, now: number): G {
    const g = structuredClone(input);
    if (g.phase !== "lobby") fail("alreadyStarted");
    if (g.players.length >= 2) fail("roomFull");
    const p = newPlayer(data, hash, now);
    if (g.players.some((x) => x.emblem === p.emblem)) p.emblem = (g.players[0].emblem + 1) % EMBLEM_COUNT;
    g.players.push(p);
    g.updated = now;
    log(g, "joined", p.name);
    return g;
  }

  function begin(g: G, sides: [Side, Side], now: number) {
    g.players[0].side = sides[0];
    g.players[1].side = sides[1];
    g.position = rules.start();
    g.moves = [];
    g.last = null;
    g.seen = { [rules.key(g.position)]: 1 };
    const ms = g.options.clock * 60000;
    g.clocks = { w: ms, b: ms };
    g.turnStart = now;
    g.deadline = ms ? now + ms : null;
    g.drawOffer = null;
    g.result = null;
    g.paused = false;
    g.pauseReason = null;
    g.pausedRemaining = null;
    g.phase = "playing";
    g.round++;
    log(g, "started", seat(g, "w")!.name);
  }
  function finish(g: G, outcome: Outcome) {
    g.result = outcome;
    g.phase = "finished";
    g.deadline = null;
    g.drawOffer = null;
    g.paused = false;
    g.pauseReason = null;
    const winner = outcome.winner ? seat(g, outcome.winner) : null;
    log(g, outcome.winner ? "won" : "draw", winner?.name ?? "", outcome.reason);
  }
  /** Charges the side to move for the time spent since its turn began. */
  function tick(g: G, now: number) {
    if (!g.options.clock) return;
    const side = rules.turn(g.position);
    g.clocks[side] = Math.max(0, g.clocks[side] - (now - g.turnStart));
    g.turnStart = now;
  }
  function flag(g: G) {
    const loser = rules.turn(g.position);
    g.clocks[loser] = 0;
    // A flag only wins for a side that could still mate on the board.
    finish(g, rules.canWin(g.position, otherSide(loser)) ? { winner: otherSide(loser), reason: "time" } : { winner: null, reason: "timeVsInsufficient" });
  }

  function maintenance(g: G, now: number) {
    let changed = false;
    const online = g.players.toSorted((a, b) => a.joined - b.joined).filter((p) => !p.left && now - p.lastSeen < OFFLINE_MS);
    if (!online.some((p) => p.id === g.host) && online.length) {
      g.host = online[0].id;
      changed = true;
    }
    if (g.phase !== "playing" || g.paused) return changed;
    if (g.deadline && now >= g.deadline) {
      tick(g, now);
      flag(g);
      return true;
    }
    const mover = seat(g, rules.turn(g.position));
    if (mover && now - mover.lastSeen >= OFFLINE_MS) {
      pause(g, "offline", now);
      changed = true;
    }
    return changed;
  }
  function pause(g: G, reason: "offline" | "host", now: number) {
    tick(g, now);
    g.paused = true;
    g.pauseReason = reason;
    g.deadline = null;
    log(g, "paused");
  }
  function resume(g: G, now: number) {
    g.paused = false;
    g.pauseReason = null;
    g.turnStart = now;
    g.deadline = g.options.clock ? now + g.clocks[rules.turn(g.position)] : null;
    log(g, "resumed");
  }

  function apply(input: G, actor: string, action: Action, random: () => number = Math.random, now = Date.now()): G {
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
      if (!p.side || p.left) fail("notMember");
    };

    if (type === "heartbeat") {
      maintenance(g, now);
      p.lastSeen = now;
      if (g.paused && g.pauseReason === "offline" && g.phase === "playing" && p.side === rules.turn(g.position)) resume(g, now);
      return g;
    }
    maintenance(g, now);
    if (g.phase === "finished" && type !== "again" && type !== "leave" && type !== "kick" && type !== "profile") fail("invalidPhase");

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
        if (action.clock !== undefined) g.options.clock = CLOCKS.find((c) => c === action.clock) ?? fail("invalidAmount");
        if (action.increment !== undefined) g.options.increment = INCREMENTS.find((c) => c === action.increment) ?? fail("invalidAmount");
        return g;
      }
      case "start": {
        hostOnly();
        if (g.phase !== "lobby") fail("alreadyStarted");
        if (g.players.length !== 2) fail("playerCount");
        begin(g, random() < 0.5 ? ["w", "b"] : ["b", "w"], now);
        return g;
      }
      case "again": {
        if (g.phase !== "finished") fail("invalidPhase");
        g.players = g.players.filter((x) => !x.left);
        if (g.players.length !== 2) fail("playerCount");
        // A rematch swaps colours.
        begin(g, [otherSide(g.players[0].side ?? "b"), otherSide(g.players[1].side ?? "w")], now);
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
        target.left = true;
        log(g, "left", target.name);
        if (g.host === target.id) {
          const next = g.players.find((x) => !x.left);
          if (next) g.host = next.id;
        }
        if (g.phase === "playing" && target.side) finish(g, { winner: otherSide(target.side), reason: "left" });
        return g;
      }
      case "resign": {
        playing();
        finish(g, { winner: otherSide(p.side!), reason: "resign" });
        return g;
      }
      case "offerDraw": {
        playing();
        if (g.drawOffer === otherSide(p.side!)) {
          finish(g, { winner: null, reason: "agreement" });
          return g;
        }
        g.drawOffer = p.side;
        log(g, "drawOffer", p.name);
        return g;
      }
      case "answerDraw": {
        playing();
        if (g.drawOffer !== otherSide(p.side!)) fail("noDrawOffer");
        if (action.accept === true) finish(g, { winner: null, reason: "agreement" });
        else {
          g.drawOffer = null;
          log(g, "drawDeclined", p.name);
        }
        return g;
      }
      case "move": {
        playing();
        if (p.side !== rules.turn(g.position)) fail("notYourTurn");
        const m = rules.parse(g.position, action);
        tick(g, now);
        g.moves.push(rules.notation(g.position, m));
        g.position = rules.play(g.position, m);
        g.last = { squares: rules.squares(m), path: rules.path(m), at: now };
        const key = rules.key(g.position);
        g.seen[key] = (g.seen[key] ?? 0) + 1;
        // Moving declines any draw offer still on the table.
        g.drawOffer = null;
        const outcome = rules.outcome(g.position, g.seen);
        if (outcome) {
          finish(g, outcome);
          return g;
        }
        if (g.options.clock) {
          g.clocks[p.side] += g.options.increment * 1000;
          g.deadline = now + g.clocks[rules.turn(g.position)];
        }
        return g;
      }
    }
    fail("invalidAction");
  }

  /** Everything is public on a board; only token hashes and request ids stay hidden. */
  function view(g: G, actor: string) {
    const { requests: _requests, seen: _seen, ...visible } = g;
    return {
      ...visible,
      players: g.players.map(({ tokenHash: _hash, ...p }) => p),
      me: actor,
      serverTime: Date.now(),
    };
  }

  return {
    create,
    join,
    apply,
    view,
    maintenance,
    preview: (g: G) => ({ code: g.code, phase: g.phase, players: g.players.filter((x) => !x.left).map((x) => ({ name: x.name, emblem: x.emblem })) }),
    notify: (previous: G, next: G, action: Action) =>
      action.type !== "heartbeat" || next.phase !== previous.phase || next.paused !== previous.paused || next.host !== previous.host,
  };
}
export type DuelView<P> = Omit<Duel<P>, "requests" | "seen" | "players"> & {
  players: Omit<Player, "tokenHash">[];
  me: string;
  serverTime: number;
};

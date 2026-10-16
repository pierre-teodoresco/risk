// International draughts as a two-player duel.
import type { Action } from "../../platform/contract";
import { fail } from "../../platform/errors";
import { duel, type DuelRules, type DuelView } from "../duel/engine";
import { legalMoves, notation, play, positionKey, startPosition, type Move, type Position } from "./rules";

/** 25 moves each with only kings and no capture end in a draw. */
const QUIET_PLIES = 50;
const REPETITIONS = 3;

export const draughtsRules: DuelRules<Position, Move> = {
  id: "dames",
  start: startPosition,
  turn: (p) => p.turn,
  parse(p: Position, action: Action) {
    const path = Array.isArray(action.path) ? action.path.map(Number) : [];
    const m = legalMoves(p).find((x) => x.path.length === path.length && x.path.every((s, i) => s === path[i]));
    return m ?? fail("illegalMove");
  },
  play,
  notation: (_p, m) => notation(m),
  squares: (m) => [...m.path, ...m.taken],
  path: (m) => m.path,
  key: positionKey,
  outcome(p, seen) {
    // A player who cannot move, with no pieces left or all blocked, loses.
    if (!legalMoves(p).length) return { winner: p.turn === "w" ? "b" : "w", reason: "noMoves" };
    if (p.quiet >= QUIET_PLIES) return { winner: null, reason: "quiet" };
    if ((seen[positionKey(p)] ?? 0) >= REPETITIONS) return { winner: null, reason: "repetition" };
    return null;
  },
  canWin: (p, side) => p.board.some((c) => c?.[0] === side),
};

export const draughts = duel(draughtsRules);
export type DraughtsView = DuelView<Position>;

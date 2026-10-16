// Chess as a two-player duel: the rules of rules.ts, plus how a game ends.
import type { Action } from "../../platform/contract";
import { fail } from "../../platform/errors";
import { duel, type DuelRules, type DuelView } from "../duel/engine";
import { PROMOTIONS, canMate, inCheck, insufficient, legalMoves, play, positionKey, san, startPosition, type Kind, type Move, type Position } from "./rules";

const FIFTY_MOVES = 100;
const REPETITIONS = 3;

export const chessRules: DuelRules<Position, Move> = {
  id: "echecs",
  start: startPosition,
  turn: (p) => p.turn,
  parse(p: Position, action: Action) {
    const from = Number(action.from), to = Number(action.to);
    const promo = typeof action.promo === "string" && PROMOTIONS.includes(action.promo as Kind) ? (action.promo as Kind) : undefined;
    const options = legalMoves(p).filter((m) => m.from === from && m.to === to);
    if (!options.length) fail("illegalMove");
    if (options[0].promo) return options.find((m) => m.promo === (promo ?? "q"))!;
    return options[0];
  },
  play,
  notation: san,
  squares: (m) => [m.from, m.to],
  path: (m) => [m.from, m.to],
  key: positionKey,
  outcome(p, seen) {
    if (!legalMoves(p).length) return inCheck(p) ? { winner: p.turn === "w" ? "b" : "w", reason: "checkmate" } : { winner: null, reason: "stalemate" };
    if (insufficient(p.board)) return { winner: null, reason: "insufficient" };
    if (p.halfmove >= FIFTY_MOVES) return { winner: null, reason: "fifty" };
    if ((seen[positionKey(p)] ?? 0) >= REPETITIONS) return { winner: null, reason: "repetition" };
    return null;
  },
  canWin: (p, side) => canMate(p.board, side),
};

export const chess = duel(chessRules);
export type ChessView = DuelView<Position>;

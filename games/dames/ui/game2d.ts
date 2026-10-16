// International draughts plugged into the shared 2D table. A capture line is picked by where it
// ends; the board carries no coordinates.
import { createElement } from "react";
import type { Side } from "@/games/duel/engine";
import type { BoardCell } from "@/games/duel/ui/Board2D";
import type { Game2D } from "@/games/duel/ui/Table2D";
import { legalMoves, notation, play, startPosition, type Move, type Position } from "../rules";
import Piece from "./Piece";

const PIECES = 20;

function material(cells: BoardCell[]) {
  const left = { w: 0, b: 0 };
  let score = 0;
  for (const c of cells) {
    if (!c) continue;
    const s = c[0] as Side;
    left[s]++;
    score += s === "w" ? 1 : -1;
  }
  const taken = (by: Side): [string, number][] => {
    const n = PIECES - left[by === "w" ? "b" : "w"];
    return n > 0 ? [["m", n]] : [];
  };
  return { taken, score };
}

export const DRAUGHTS_2D: Game2D<Position, Move> = {
  size: 10,
  start: startPosition,
  cells: (p) => p.board,
  turn: (p) => p.turn,
  legal: legalMoves,
  play,
  notation: (_p, m) => notation(m),
  ends: (m) => ({ from: m.path[0], to: m.path[m.path.length - 1], capture: m.taken.length > 0 }),
  action: (m) => ({ path: m.path }),
  highlight: (m) => m.path,
  sound: (_before, m) => (m.taken.length ? "capture" : "move"),
  soundOf: (text) => (text.includes("x") ? "capture" : "move"),
  Piece: ({ cell, className }) => createElement(Piece, { cell, className }),
  material,
  board: { coords: false },
};

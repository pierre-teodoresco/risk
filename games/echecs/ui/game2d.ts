// Chess plugged into the shared 2D table: notation with figurines, material count, check, and
// premoves (any square the piece could reach if the board stayed as it is).
import { createElement } from "react";
import type { Side } from "@/games/duel/engine";
import type { BoardCell } from "@/games/duel/ui/Board2D";
import type { Game2D } from "@/games/duel/ui/Table2D";
import type { Sound } from "@/games/duel/ui/sound";
import { file, inCheck, kingSquare, legalMoves, play, rank, san, sq, startPosition, type Cell, type Kind, type Move, type Position } from "../rules";
import Piece from "./Piece";

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const CAPTURE_ORDER = ["p", "b", "n", "r", "q"];
const LINES: Record<string, number[][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

function material(cells: BoardCell[]) {
  const count: Record<Side, Record<string, number>> = { w: {}, b: {} };
  let score = 0;
  for (const c of cells) {
    if (!c) continue;
    const s = c[0] as Side, k = c[1];
    count[s][k] = (count[s][k] ?? 0) + 1;
    score += (s === "w" ? 1 : -1) * VALUE[k];
  }
  const taken = (by: Side) => {
    const them = by === "w" ? count.b : count.w;
    return CAPTURE_ORDER.map((k) => [k, Math.max(0, START_COUNT[k] - (them[k] ?? 0))] as [string, number]).filter(([, n]) => n > 0);
  };
  return { taken, score };
}

/** Where the piece on `from` could go if nothing else moved; blockers are ignored, as they may leave. */
function premoveTargets(cells: BoardCell[], from: number, real: Position) {
  const c = cells[from]!, color = c[0] as Side, kind = c[1];
  const f0 = file(from), r0 = rank(from);
  const out: number[] = [];
  const add = (f: number, r: number) => {
    if (f < 0 || f > 7 || r < 0 || r > 7) return;
    const s = sq(f, r);
    if (cells[s]?.[0] !== color) out.push(s);
  };
  if (kind === "p") {
    const dir = color === "w" ? 1 : -1;
    add(f0, r0 + dir);
    if (r0 === (color === "w" ? 1 : 6)) add(f0, r0 + 2 * dir);
    add(f0 - 1, r0 + dir);
    add(f0 + 1, r0 + dir);
  } else if (kind === "n") KNIGHT.forEach(([df, dr]) => add(f0 + df, r0 + dr));
  else if (kind === "k") {
    for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) if (df || dr) add(f0 + df, r0 + dr);
    const back = color === "w" ? 0 : 7;
    if (from === sq(4, back)) {
      if (real.castling.includes(color === "w" ? "K" : "k")) add(6, back);
      if (real.castling.includes(color === "w" ? "Q" : "q")) add(2, back);
    }
  } else
    for (const [df, dr] of LINES[kind])
      for (let k = 1; k < 8; k++) {
        const f = f0 + df * k, r = r0 + dr * k;
        if (f < 0 || f > 7 || r < 0 || r > 7) break;
        add(f, r);
      }
  return out;
}
/** The board once a premove is played: castling brings the rook, a pawn on the last rank becomes a queen. */
function premoveApply(cells: BoardCell[], from: number, to: number) {
  const next = [...cells];
  const c = next[from]!;
  next[from] = null;
  next[to] = c[1] === "p" && (rank(to) === 7 || rank(to) === 0) ? `${c[0]}q` : c;
  if (c[1] === "k" && Math.abs(file(to) - file(from)) === 2) {
    const r = rank(from), kingSide = file(to) === 6;
    const rookFrom = sq(kingSide ? 7 : 0, r), rookTo = sq(kingSide ? 5 : 3, r);
    next[rookTo] = next[rookFrom];
    next[rookFrom] = null;
  }
  return next;
}

function soundOf(text: string): Sound {
  if (text.includes("#") || text.includes("+")) return "check";
  if (text.startsWith("O-O")) return "castle";
  return text.includes("x") ? "capture" : "move";
}

/** Notation with the moving piece drawn instead of its letter, as on the big sites. */
function Notation({ text }: { text: string }) {
  const head = /^[KQRBN]/.test(text) ? (text[0].toLowerCase() as Kind) : null;
  const promo = text.match(/=([QRBN])/);
  const body = (head ? text.slice(1) : text).replace(/=[QRBN]/, "=");
  return createElement(
    "span",
    { className: "cc-notation" },
    head && createElement(Piece, { cell: `w${head}`, className: "cc-fig" }),
    body,
    promo && createElement(Piece, { cell: `w${promo[1].toLowerCase() as Kind}`, className: "cc-fig" }),
  );
}

export const CHESS_2D: Game2D<Position, Move> = {
  size: 8,
  start: startPosition,
  cells: (p) => p.board,
  turn: (p) => p.turn,
  legal: legalMoves,
  play,
  notation: san,
  ends: (m) => ({ from: m.from, to: m.to, capture: !!m.ep, promo: m.promo }),
  action: (m) => ({ from: m.from, to: m.to, promo: m.promo }),
  highlight: (m) => [m.from, m.to],
  check: (p) => (inCheck(p) ? kingSquare(p.board, p.turn) : null),
  sound: (before, m, after) => (inCheck(after) ? "check" : m.castle ? "castle" : before.board[m.to] || m.ep ? "capture" : "move"),
  soundOf,
  Piece: ({ cell, className }) => createElement(Piece, { cell: cell as Exclude<Cell, null>, className }),
  material,
  Notation,
  board: { coords: "edges", promoOrder: ["q", "n", "r", "b"] },
  premove: {
    targets: premoveTargets,
    apply: premoveApply,
    resolve(p, from, to) {
      const options = legalMoves(p).filter((m) => m.from === from && m.to === to);
      return options.find((m) => m.promo === "q") ?? options[0] ?? null;
    },
  },
};

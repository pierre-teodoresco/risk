// International draughts on a 10×10 board: men step forward and capture both ways, kings fly
// along diagonals, capturing is mandatory and the line taking the most pieces must be played.
// A man is crowned only if its move ends on the far row.
export type Side = "w" | "b";
/** "wm" man, "wk" king. */
export type Cell = "wm" | "wk" | "bm" | "bk" | null;
export type Position = {
  /** Index = row × 10 + column; row 0 is White's side. Only dark squares ((row + column) even) are used. */
  board: Cell[];
  turn: Side;
  /** Plies in a row with only king moves and no capture, for the draw rule. */
  quiet: number;
};
/** A move is the squares the piece stops on, from start to finish, and the pieces it takes. */
export type Move = { path: number[]; taken: number[] };

export const SIZE = 10;
export const row = (i: number) => Math.floor(i / SIZE);
export const col = (i: number) => i % SIZE;
export const at = (c: number, r: number) => r * SIZE + c;
export const dark = (i: number) => (row(i) + col(i)) % 2 === 0;
const inside = (c: number, r: number) => c >= 0 && c < SIZE && r >= 0 && r < SIZE;
const sideOf = (c: Cell) => (c ? (c[0] as Side) : null);
const isKing = (c: Cell) => !!c && c[1] === "k";
const DIRS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
/** Official square numbers 1–50, counted from Black's side. */
export const squareNumber = (i: number) => (SIZE - 1 - row(i)) * 5 + Math.floor(col(i) / 2) + 1;

export function startPosition(): Position {
  const board: Cell[] = Array(SIZE * SIZE).fill(null);
  for (let i = 0; i < board.length; i++) {
    if (!dark(i)) continue;
    if (row(i) <= 3) board[i] = "wm";
    if (row(i) >= 6) board[i] = "bm";
  }
  return { board, turn: "w", quiet: 0 };
}

/** Every capture line from `from`, followed to its end; captured pieces block until the line is over. */
function captureLines(board: Cell[], from: number, piece: Cell): Move[] {
  const us = sideOf(piece)!, king = isKing(piece);
  const out: Move[] = [];
  const work = [...board];
  work[from] = null;
  const walk = (pos: number, path: number[], taken: number[]) => {
    let extended = false;
    for (const [dc, dr] of DIRS) {
      let c = col(pos) + dc, r = row(pos) + dr;
      if (king) while (inside(c, r) && !work[at(c, r)]) {
        c += dc;
        r += dr;
      }
      if (!inside(c, r)) continue;
      const victim = at(c, r);
      if (sideOf(work[victim]) !== (us === "w" ? "b" : "w") || taken.includes(victim)) continue;
      let lc = c + dc, lr = r + dr;
      while (inside(lc, lr) && !work[at(lc, lr)]) {
        const land = at(lc, lr);
        extended = true;
        walk(land, [...path, land], [...taken, victim]);
        if (!king) break;
        lc += dc;
        lr += dr;
      }
    }
    if (!extended && taken.length) out.push({ path, taken });
  };
  walk(from, [from], []);
  return out;
}

export function legalMoves(p: Position): Move[] {
  const captures: Move[] = [];
  for (let i = 0; i < p.board.length; i++) if (sideOf(p.board[i]) === p.turn) captures.push(...captureLines(p.board, i, p.board[i]));
  if (captures.length) {
    // The majority rule: only the lines taking the most pieces may be played.
    const most = Math.max(...captures.map((m) => m.taken.length));
    return captures.filter((m) => m.taken.length === most);
  }
  const moves: Move[] = [];
  const forward = p.turn === "w" ? 1 : -1;
  for (let i = 0; i < p.board.length; i++) {
    const piece = p.board[i];
    if (sideOf(piece) !== p.turn) continue;
    for (const [dc, dr] of DIRS) {
      if (!isKing(piece) && dr !== forward) continue;
      let c = col(i) + dc, r = row(i) + dr;
      while (inside(c, r) && !p.board[at(c, r)]) {
        moves.push({ path: [i, at(c, r)], taken: [] });
        if (!isKing(piece)) break;
        c += dc;
        r += dr;
      }
    }
  }
  return moves;
}

export function play(p: Position, m: Move): Position {
  const board = [...p.board];
  const from = m.path[0], to = m.path[m.path.length - 1];
  let piece = board[from]!;
  board[from] = null;
  for (const t of m.taken) board[t] = null;
  const far = p.turn === "w" ? SIZE - 1 : 0;
  if (piece[1] === "m" && row(to) === far) piece = `${p.turn}k`;
  board[to] = piece;
  const quiet = m.taken.length || p.board[from]![1] === "m" ? 0 : p.quiet + 1;
  return { board, turn: p.turn === "w" ? "b" : "w", quiet };
}

export const positionKey = (p: Position) => p.board.map((c) => c ?? ".").join("") + p.turn;
/** Official notation: 32-28 for a move, 28x19x10 for a capture. */
export const notation = (m: Move) => m.path.map(squareNumber).join(m.taken.length ? "x" : "-");

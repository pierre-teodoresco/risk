// Chess rules on a 64-square board: legal moves, check, castling, en passant, promotion, and the
// standard notation. Pure functions over a position, shared by the engine and the client.
export type Color = "w" | "b";
export type Kind = "p" | "n" | "b" | "r" | "q" | "k";
/** "wp", "bk"…: colour then kind. */
export type Cell = `${Color}${Kind}` | null;
export type Position = {
  /** Index = rank × 8 + file; rank 0 is White's back rank, file 0 is the a-file. */
  board: Cell[];
  turn: Color;
  /** Remaining castling rights among "KQkq". */
  castling: string;
  /** Square a pawn may capture en passant, if any. */
  ep: number | null;
  /** Half-moves since the last capture or pawn move, for the fifty-move rule. */
  halfmove: number;
};
export type Move = { from: number; to: number; promo?: Kind; castle?: "k" | "q"; ep?: boolean; capture?: boolean };
export const PROMOTIONS: Kind[] = ["q", "r", "b", "n"];

export const file = (i: number) => i % 8;
export const rank = (i: number) => Math.floor(i / 8);
export const sq = (f: number, r: number) => r * 8 + f;
export const squareName = (i: number) => "abcdefgh"[file(i)] + (rank(i) + 1);
export const other = (c: Color): Color => (c === "w" ? "b" : "w");
const colorOf = (c: Cell) => (c ? (c[0] as Color) : null);
const kindOf = (c: Cell) => (c ? (c[1] as Kind) : null);

export function startPosition(): Position {
  const back: Kind[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const board: Cell[] = Array(64).fill(null);
  for (let f = 0; f < 8; f++) {
    board[sq(f, 0)] = `w${back[f]}`;
    board[sq(f, 1)] = "wp";
    board[sq(f, 6)] = "bp";
    board[sq(f, 7)] = `b${back[f]}`;
  }
  return { board, turn: "w", castling: "KQkq", ep: null, halfmove: 0 };
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const inside = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8;

/** Whether `by` attacks square `i`. */
export function attacked(board: Cell[], i: number, by: Color) {
  const f = file(i), r = rank(i);
  const pawnRank = by === "w" ? r - 1 : r + 1;
  for (const df of [-1, 1]) if (inside(f + df, pawnRank) && board[sq(f + df, pawnRank)] === `${by}p`) return true;
  for (const [df, dr] of KNIGHT) if (inside(f + df, r + dr) && board[sq(f + df, r + dr)] === `${by}n`) return true;
  for (const [df, dr] of KING) if (inside(f + df, r + dr) && board[sq(f + df, r + dr)] === `${by}k`) return true;
  for (const [dirs, kinds] of [[ROOK, ["r", "q"]], [BISHOP, ["b", "q"]]] as const)
    for (const [df, dr] of dirs) {
      let x = f + df, y = r + dr;
      while (inside(x, y)) {
        const c = board[sq(x, y)];
        if (c) {
          if (colorOf(c) === by && (kinds as readonly string[]).includes(kindOf(c)!)) return true;
          break;
        }
        x += df;
        y += dr;
      }
    }
  return false;
}
export const kingSquare = (board: Cell[], c: Color) => board.indexOf(`${c}k`);
export const inCheck = (p: Position, c: Color = p.turn) => attacked(p.board, kingSquare(p.board, c), other(c));

/** Moves that follow the pieces' patterns, before checking whether they leave the king in check. */
function pseudoMoves(p: Position): Move[] {
  const moves: Move[] = [];
  const us = p.turn, them = other(us);
  for (let i = 0; i < 64; i++) {
    const c = p.board[i];
    if (colorOf(c) !== us) continue;
    const f = file(i), r = rank(i), k = kindOf(c)!;
    const add = (to: number, extra: Partial<Move> = {}) => {
      const target = p.board[to];
      if (k === "p" && (rank(to) === 0 || rank(to) === 7)) for (const promo of PROMOTIONS) moves.push({ from: i, to, promo, capture: !!target, ...extra });
      else moves.push({ from: i, to, capture: !!target, ...extra });
    };
    if (k === "p") {
      const dir = us === "w" ? 1 : -1, start = us === "w" ? 1 : 6;
      if (inside(f, r + dir) && !p.board[sq(f, r + dir)]) {
        add(sq(f, r + dir));
        if (r === start && !p.board[sq(f, r + 2 * dir)]) add(sq(f, r + 2 * dir));
      }
      for (const df of [-1, 1]) {
        if (!inside(f + df, r + dir)) continue;
        const to = sq(f + df, r + dir);
        if (colorOf(p.board[to]) === them) add(to);
        else if (to === p.ep) moves.push({ from: i, to, ep: true, capture: true });
      }
      continue;
    }
    const steps = k === "n" ? KNIGHT : k === "k" ? KING : k === "r" ? ROOK : k === "b" ? BISHOP : [...ROOK, ...BISHOP];
    const slides = k === "r" || k === "b" || k === "q";
    for (const [df, dr] of steps) {
      let x = f + df, y = r + dr;
      while (inside(x, y)) {
        const t = p.board[sq(x, y)];
        if (colorOf(t) === us) break;
        add(sq(x, y));
        if (t || !slides) break;
        x += df;
        y += dr;
      }
    }
    if (k === "k") {
      const home = us === "w" ? 0 : 7;
      if (i === sq(4, home) && !inCheck(p, us)) {
        const [kc, qc] = us === "w" ? ["K", "Q"] : ["k", "q"];
        if (p.castling.includes(kc) && !p.board[sq(5, home)] && !p.board[sq(6, home)] && p.board[sq(7, home)] === `${us}r` && !attacked(p.board, sq(5, home), them))
          moves.push({ from: i, to: sq(6, home), castle: "k" });
        if (p.castling.includes(qc) && !p.board[sq(3, home)] && !p.board[sq(2, home)] && !p.board[sq(1, home)] && p.board[sq(0, home)] === `${us}r` && !attacked(p.board, sq(3, home), them))
          moves.push({ from: i, to: sq(2, home), castle: "q" });
      }
    }
  }
  return moves;
}

/** The position after `m`, which must be pseudo-legal. */
export function play(p: Position, m: Move): Position {
  const board = [...p.board];
  const piece = board[m.from]!, us = p.turn, k = kindOf(piece)!;
  board[m.to] = m.promo ? (`${us}${m.promo}` as Cell) : piece;
  board[m.from] = null;
  if (m.ep) board[sq(file(m.to), rank(m.from))] = null;
  if (m.castle) {
    const home = rank(m.from);
    const [rf, rt] = m.castle === "k" ? [7, 5] : [0, 3];
    board[sq(rt, home)] = board[sq(rf, home)];
    board[sq(rf, home)] = null;
  }
  let castling = p.castling;
  const strip = (s: number) => {
    if (s === 0) castling = castling.replace("Q", "");
    if (s === 7) castling = castling.replace("K", "");
    if (s === 56) castling = castling.replace("q", "");
    if (s === 63) castling = castling.replace("k", "");
  };
  if (k === "k") castling = castling.replace(us === "w" ? /[KQ]/g : /[kq]/g, "");
  strip(m.from);
  strip(m.to);
  const ep = k === "p" && Math.abs(rank(m.to) - rank(m.from)) === 2 ? sq(file(m.from), (rank(m.from) + rank(m.to)) / 2) : null;
  return { board, turn: other(us), castling, ep, halfmove: k === "p" || m.capture ? 0 : p.halfmove + 1 };
}

export function legalMoves(p: Position): Move[] {
  return pseudoMoves(p).filter((m) => !inCheck(play(p, m), p.turn));
}

/** Not enough material left for either side to mate: kings alone, or with one minor piece, or bishops on one colour. */
export function insufficient(board: Cell[]) {
  const rest = board.flatMap((c, i) => (c && c[1] !== "k" ? [{ c, i }] : []));
  if (rest.some(({ c }) => c![1] === "p" || c![1] === "r" || c![1] === "q")) return false;
  if (rest.length <= 1) return true;
  return rest.every(({ c }) => c![1] === "b") && new Set(rest.map(({ i }) => (file(i) + rank(i)) % 2)).size === 1;
}
/** Whether `c` alone could still mate, used when the other side runs out of time. */
export function canMate(board: Cell[], c: Color) {
  const mine = board.filter((x) => x && x[0] === c && x[1] !== "k");
  return mine.some((x) => x![1] !== "b" && x![1] !== "n") || mine.length >= 2;
}

/** Key for repetitions: same pieces, side to move, castling rights and en passant square. */
export const positionKey = (p: Position) => p.board.map((c) => c ?? ".").join("") + p.turn + p.castling + (p.ep ?? "-");

/** Standard algebraic notation of `m` in position `p`: Nf3, exd5, O-O, e8=Q+, Qxf7#. */
export function san(p: Position, m: Move, legal?: Move[]) {
  const piece = p.board[m.from]!, k = kindOf(piece)!;
  let s: string;
  if (m.castle) s = m.castle === "k" ? "O-O" : "O-O-O";
  else {
    const to = squareName(m.to);
    if (k === "p") s = (m.capture ? "abcdefgh"[file(m.from)] + "x" : "") + to + (m.promo ? "=" + m.promo.toUpperCase() : "");
    else {
      const twins = (legal ?? legalMoves(p)).filter((o) => o.to === m.to && o.from !== m.from && p.board[o.from] === piece);
      let dis = "";
      if (twins.length) {
        if (!twins.some((o) => file(o.from) === file(m.from))) dis = "abcdefgh"[file(m.from)];
        else if (!twins.some((o) => rank(o.from) === rank(m.from))) dis = String(rank(m.from) + 1);
        else dis = squareName(m.from);
      }
      s = k.toUpperCase() + dis + (m.capture ? "x" : "") + to;
    }
  }
  const next = play(p, m);
  if (inCheck(next)) s += legalMoves(next).length ? "+" : "#";
  return s;
}

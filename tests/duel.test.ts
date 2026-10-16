import { test } from "node:test";
import assert from "node:assert/strict";
import { chess } from "../games/echecs/engine";
import { legalMoves, play, san, sq, type Cell, type Position } from "../games/echecs/rules";
import { draughts } from "../games/dames/engine";
import { at, legalMoves as draughtsMoves, play as draughtsPlay, startPosition as draughtsStart, type Position as DPosition } from "../games/dames/rules";
import type { Duel } from "../games/duel/engine";

const NOW = 1000;
let seed = 99;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

// ---------- Chess move generation ----------
function fen(s: string): Position {
  const [rows, turn, castling, ep] = s.split(" ");
  const board: Cell[] = Array(64).fill(null);
  rows.split("/").forEach((line, k) => {
    let f = 0;
    for (const ch of line) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        board[sq(f, 7 - k)] = `${ch === ch.toUpperCase() ? "w" : "b"}${ch.toLowerCase()}` as Cell;
        f++;
      }
    }
  });
  const epSq = ep === "-" ? null : sq("abcdefgh".indexOf(ep[0]), Number(ep[1]) - 1);
  return { board, turn: turn as "w" | "b", castling: castling === "-" ? "" : castling, ep: epSq, halfmove: 0 };
}
function perft(p: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(p);
  if (depth === 1) return moves.length;
  return moves.reduce((n, m) => n + perft(play(p, m), depth - 1), 0);
}

test("chess move generation matches reference counts", () => {
  const start = fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
  assert.equal(perft(start, 1), 20);
  assert.equal(perft(start, 2), 400);
  assert.equal(perft(start, 3), 8902);
  // "Kiwipete": castling, en passant, promotions and pins all at once.
  const kiwi = fen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -");
  assert.equal(perft(kiwi, 1), 48);
  assert.equal(perft(kiwi, 2), 2039);
  // Position 3 of the classic test suite: en passant discovered checks along a rank.
  assert.equal(perft(fen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -"), 3), 2812);
});

test("standard notation: captures, disambiguation, castling, promotion and mate", () => {
  const p = fen("r3k2r/8/8/8/8/8/1N3N2/R3K2R w KQkq -");
  const m = legalMoves(p);
  assert.equal(san(p, m.find((x) => x.castle === "k")!), "O-O");
  assert.equal(san(p, m.find((x) => x.from === sq(1, 1) && x.to === sq(3, 2))!), "Nbd3");
  const promo = fen("8/P6k/8/8/8/8/8/K7 w - -");
  assert.equal(san(promo, legalMoves(promo).find((x) => x.promo === "q")!), "a8=Q");
  const mate = fen("6k1/5ppp/8/8/8/8/8/R5K1 w - -");
  assert.equal(san(mate, legalMoves(mate).find((x) => x.to === sq(0, 7))!), "Ra8#");
});

// ---------- Chess games through the duel engine ----------
type G = Duel<Position>;
function table(clock = 0, increment = 0): G {
  let g = chess.create("CHESS1", { name: "Alice", emblem: 0 }, "h0", NOW);
  g = chess.join(g, { name: "Bob", emblem: 1 }, "h1", NOW);
  g = chess.apply(g, g.host, { type: "options", clock, increment }, rand, NOW);
  return chess.apply(g, g.host, { type: "start" }, rand, NOW);
}
const sideOf = (g: G, s: "w" | "b") => g.players.find((p) => p.side === s)!.id;
const sqn = (n: string) => sq("abcdefgh".indexOf(n[0]), Number(n[1]) - 1);
const mv = (g: G, from: string, to: string, at = NOW, promo?: string) =>
  chess.apply(g, sideOf(g, g.position.turn), { type: "move", from: sqn(from), to: sqn(to), promo }, rand, at);

test("fool's mate ends the game with a winner and the move list in notation", () => {
  let g = table();
  for (const [a, b] of [["f2", "f3"], ["e7", "e5"], ["g2", "g4"], ["d8", "h4"]]) g = mv(g, a, b);
  assert.equal(g.phase, "finished");
  assert.deepEqual(g.result, { winner: "b", reason: "checkmate" });
  assert.deepEqual(g.moves, ["f3", "e5", "g4", "Qh4#"]);
});

test("illegal moves and moving out of turn are refused", () => {
  const g = table();
  assert.throws(() => mv(g, "e2", "e5"), /illegalMove/);
  assert.throws(() => chess.apply(g, sideOf(g, "b"), { type: "move", from: sqn("e7"), to: sqn("e5") }, rand, NOW), /notYourTurn/);
});

test("repeating a position three times is a draw", () => {
  let g = table();
  for (let k = 0; k < 2; k++) for (const [a, b] of [["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"]]) g = mv(g, a, b);
  assert.deepEqual(g.result, { winner: null, reason: "repetition" });
});

test("the clock runs for the side to move and a flag loses on time", () => {
  let g = table(3, 2);
  g = mv(g, "e2", "e4", NOW + 10000);
  assert.equal(g.clocks.w, 180000 - 10000 + 2000);
  const deadline = g.deadline!;
  g = chess.apply(g, sideOf(g, "w"), { type: "heartbeat" }, rand, deadline + 1);
  assert.deepEqual(g.result, { winner: "w", reason: "time" });
});

test("draw offers, resignation, and a rematch with colours swapped", () => {
  let g = table();
  const w = sideOf(g, "w"), b = sideOf(g, "b");
  g = chess.apply(g, w, { type: "offerDraw" }, rand, NOW);
  assert.equal(g.drawOffer, "w");
  g = chess.apply(g, b, { type: "answerDraw", accept: false }, rand, NOW);
  assert.equal(g.drawOffer, null);
  g = chess.apply(g, b, { type: "resign" }, rand, NOW);
  assert.deepEqual(g.result, { winner: "w", reason: "resign" });
  g = chess.apply(g, b, { type: "again" }, rand, NOW);
  assert.equal(sideOf(g, "w"), b);
  assert.equal(g.phase, "playing");
});

test("a room holds two players and hides token hashes", () => {
  const g = table();
  let lobby = chess.create("X", { name: "Ann", emblem: 0 }, "h", NOW);
  lobby = chess.join(lobby, { name: "Ben" }, "h1", NOW);
  assert.throws(() => chess.join(lobby, { name: "Cid" }, "h2", NOW), /roomFull/);
  assert.ok(!JSON.stringify(chess.view(g, g.host)).includes("tokenHash"));
});

// ---------- Draughts ----------
function dpos(white: number[], black: number[], kings: number[] = [], turn: "w" | "b" = "w"): DPosition {
  const board = Array(100).fill(null);
  for (const i of white) board[i] = kings.includes(i) ? "wk" : "wm";
  for (const i of black) board[i] = kings.includes(i) ? "bk" : "bm";
  return { board, turn, quiet: 0 };
}

test("draughts opens with 9 moves and 20 men a side", () => {
  const p = draughtsStart();
  assert.equal(p.board.filter((c) => c === "wm").length, 20);
  assert.equal(p.board.filter((c) => c === "bm").length, 20);
  assert.equal(draughtsMoves(p).length, 9);
});

test("capturing is mandatory, men capture backwards, and the longest line must be taken", () => {
  // A white man with one black piece in front and a two-piece line behind it.
  const p = dpos([at(4, 4)], [at(5, 5), at(3, 3), at(3, 1)]);
  const moves = draughtsMoves(p);
  assert.ok(moves.every((m) => m.taken.length === 2), JSON.stringify(moves));
  assert.deepEqual(moves[0].path, [at(4, 4), at(2, 2), at(4, 0)]);
});

test("kings fly along diagonals and may land anywhere beyond the piece they take", () => {
  const p = dpos([at(0, 0)], [at(4, 4)], [at(0, 0)]);
  const moves = draughtsMoves(p);
  assert.deepEqual(moves.map((m) => m.path[1]).sort((a, b) => a - b), [at(5, 5), at(6, 6), at(7, 7), at(8, 8), at(9, 9)]);
});

test("a man passing the far row during a capture is not crowned; ending there is", () => {
  const ends = draughtsPlay(dpos([at(7, 7)], [at(8, 8)]), { path: [at(7, 7), at(9, 9)], taken: [at(8, 8)] });
  assert.equal(ends.board[at(9, 9)], "wk");
  // Through the far row at (7, 9), then back down to (9, 7): still a man.
  const p = dpos([at(5, 7)], [at(6, 8), at(8, 8)]);
  const line = draughtsMoves(p)[0];
  assert.equal(line.taken.length, 2);
  assert.equal(draughtsPlay(p, line).board[line.path.at(-1)!], "wm");
});

test("a draughts game is won when the other side has no move", () => {
  let g = draughts.create("DAMES1", { name: "Alice", emblem: 0 }, "h0", NOW);
  g = draughts.join(g, { name: "Bob", emblem: 1 }, "h1", NOW);
  g = draughts.apply(g, g.host, { type: "options", clock: 0 }, rand, NOW);
  g = draughts.apply(g, g.host, { type: "start" }, rand, NOW);
  g.position = dpos([at(4, 4)], [at(5, 5)]);
  const w = g.players.find((p) => p.side === "w")!.id;
  g = draughts.apply(g, w, { type: "move", path: [at(4, 4), at(6, 6)] }, rand, NOW);
  assert.deepEqual(g.result, { winner: "w", reason: "noMoves" });
  assert.deepEqual(g.moves, ["28x19"]);
});

test("random draughts and chess games always end cleanly", () => {
  for (let n = 0; n < 20; n++) {
    let d = draughtsStart();
    for (let k = 0; k < 400 && draughtsMoves(d).length; k++) {
      const ms = draughtsMoves(d);
      d = draughtsPlay(d, ms[Math.floor(rand() * ms.length)]);
      const total = d.board.filter(Boolean).length;
      assert.ok(total <= 40);
    }
    let c = fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
    for (let k = 0; k < 300 && legalMoves(c).length; k++) {
      const ms = legalMoves(c);
      c = play(c, ms[Math.floor(rand() * ms.length)]);
      assert.equal(c.board.filter((x) => x === "wk").length, 1);
      assert.equal(c.board.filter((x) => x === "bk").length, 1);
    }
  }
});

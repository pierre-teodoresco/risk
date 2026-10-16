"use client";
// International draughts: the shared duel screen with the same 2D table as chess, and draughts pieces.
import { useEffect, useState } from "react";
import { gamePath } from "@/games/registry";
import DuelScreen, { type DuelConfig } from "@/games/duel/ui/DuelScreen";
import Board2D from "@/games/duel/ui/Board2D";
import Table2D from "@/games/duel/ui/Table2D";
import { dark, legalMoves, play, squareNumber, startPosition, type Position } from "../rules";
import { DRAUGHTS_2D } from "./game2d";
import Piece from "./Piece";

// A demo game for the entrance and the hub: the same moves every time, picked by a fixed seed.
const DEMO_PLIES = 60;
const DEMO = (() => {
  let seed = 7;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const positions = [startPosition()], played: number[][] = [[]];
  for (let k = 0; k < DEMO_PLIES; k++) {
    const ms = legalMoves(positions.at(-1)!);
    if (!ms.length) break;
    const m = ms[Math.floor(rand() * ms.length)];
    positions.push(play(positions.at(-1)!, m));
    played.push(m.path);
  }
  return { positions, played };
})();
const SHOWCASE_STEP_MS = 1000;
const label = (i: number) => (dark(i) ? String(squareNumber(i)) : null);

/** A board replaying a demo game on a loop. */
export function Showcase() {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setK((n) => (n + 1) % DEMO.positions.length), SHOWCASE_STEP_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="cc-showcase">
      <Board2D size={10} cells={DEMO.positions[k].board} flipped={false} moves={[]} last={DEMO.played[k]} renderPiece={(c) => <Piece cell={c} />} coords="squares" squareLabel={label} />
    </div>
  );
}

const CONFIG: DuelConfig<Position> = {
  id: "dames",
  path: gamePath("dames"),
  logo: "dames",
  tagline: { fr: "Prise obligatoire, rafle majoritaire.", en: "Capture is a must, the longest line wins." },
  rulesTitle: { fr: "Comment jouer aux dames", en: "How to play draughts" },
  rules: {
    fr: [
      ["Le but", "Prendre toutes les pièces adverses ou les bloquer : celui qui ne peut plus jouer a perdu. Les Blancs commencent, sur un damier de 10 × 10 cases."],
      ["Déplacements", "Un pion avance d’une case en diagonale. Une dame se déplace d’autant de cases libres qu’elle veut sur une diagonale."],
      ["Prises", "On prend en sautant par-dessus une pièce adverse, en avant comme en arrière, et on enchaîne tant que c’est possible. La prise est obligatoire, et il faut jouer la rafle qui prend le plus de pièces. Les pièces prises disparaissent à la fin de la rafle."],
      ["Promotion", "Un pion qui termine son coup sur la dernière rangée devient une dame. S’il ne fait qu’y passer pendant une rafle, il reste un pion."],
      ["Nulles", "La partie est nulle d’un commun accord, après une triple répétition, ou après 25 coups de chaque côté sans prise ni mouvement de pion."],
      ["Jouer ici", "Glisse une pièce sur sa case d’arrivée, ou clique la pièce puis la case : les points montrent où elle peut aller, un anneau marque la fin d’une rafle. Clic droit pour marquer une case ou tracer une flèche. Les flèches du clavier font défiler la partie."],
    ],
    en: [
      ["The goal", "Take all the opposing pieces or block them: whoever cannot move loses. White starts, on a 10 × 10 board."],
      ["Moving", "A man moves one square diagonally forward. A king moves any number of free squares along a diagonal."],
      ["Capturing", "Jump over an opposing piece, forwards or backwards, and keep going while you can. Capturing is compulsory, and you must play the line that takes the most pieces. Taken pieces leave at the end of the line."],
      ["Crowning", "A man ending its move on the far row becomes a king. If it only passes through during a capture, it stays a man."],
      ["Draws", "A game is drawn by agreement, after a threefold repetition, or after 25 moves each without a capture or a man moving."],
      ["Playing here", "Drag a piece to its square, or click the piece then the square: dots show where it can go, a ring marks the end of a capture line. Right-click to mark a square or draw an arrow. The arrow keys step through the game."],
    ],
  },
  Showcase,
  Table: (props) => <Table2D rules={DRAUGHTS_2D} {...props} />,
  className: "cc",
};
export default function Dames() {
  return <DuelScreen config={CONFIG} />;
}

"use client";
// International draughts: the shared duel screen, with capture lines picked square by square.
import { useMemo, useState } from "react";
import { gamePath } from "@/games/registry";
import DuelScreen, { type DuelConfig, type PlayProps } from "@/games/duel/ui/DuelScreen";
import GridBoard from "@/games/duel/ui/GridBoard";
import type { GridConfig } from "@/games/duel/ui/grid3d";
import { legalMoves, startPosition, type Position } from "../rules";
import { draughtsPiece } from "./pieces";

const BOARD: GridConfig = { size: 10, light: "#f3e3c3", dark: "#9a6a4b", piece: draughtsPiece };

function DraughtsPlay({ game, side, act, busy }: PlayProps<Position>) {
  const p = game.position;
  const [path, setPath] = useState<number[]>([]);
  const myTurn = game.phase === "playing" && !game.paused && side === p.turn;
  const moves = useMemo(() => (myTurn ? legalMoves(p) : []), [p, myTurn]);
  // Only the lines still matching the stops clicked so far.
  const open = moves.filter((m) => path.every((s, i) => m.path[i] === s));
  const current = path.length && open.length ? path : [];
  const targets = current.length ? [...new Set(open.map((m) => m.path[current.length]).filter((s) => s !== undefined))] : [];
  const starts = [...new Set(moves.map((m) => m.path[0]))];
  const taking = moves[0]?.taken.length ? new Set(open.flatMap((m) => m.taken)) : new Set<number>();
  function onSquare(i: number) {
    if (!myTurn || busy) return;
    if (current.length && targets.includes(i)) {
      const next = [...current, i];
      const done = open.find((m) => m.path.length === next.length && m.path.every((s, k) => s === next[k]));
      if (done && !open.some((m) => m.path.length > next.length && m.path.every((s, k) => k >= next.length || s === next[k]))) {
        setPath([]);
        void act({ type: "move", path: done.path });
      } else setPath(next);
      return;
    }
    setPath(starts.includes(i) ? [i] : []);
  }
  const state = useMemo(
    () => ({
      cells: p.board,
      flipped: side === "b",
      selected: current.length ? current[current.length - 1] : null,
      targets,
      captures: [] as number[],
      last: [...(game.last?.squares ?? []), ...current, ...taking],
      danger: null,
      move: game.last ? { path: game.last.path, at: game.last.at } : null,
      interactive: true,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p, side, current.join(), targets.join(), game.last?.at],
  );
  return <GridBoard config={BOARD} state={state} onSquare={onSquare} />;
}

const START = startPosition();
export function Showcase() {
  const state = useMemo(() => ({ cells: START.board, flipped: false, selected: null, targets: [], captures: [], last: [], danger: null, move: null, interactive: false, spin: true }), []);
  return <GridBoard config={BOARD} state={state} onSquare={() => {}} />;
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
      ["Jouer ici", "Clique sur une pièce, puis sur ses cases d’arrivée. Pour une rafle, clique chaque étape : les pièces menacées s’allument."],
    ],
    en: [
      ["The goal", "Take all the opposing pieces or block them: whoever cannot move loses. White starts, on a 10 × 10 board."],
      ["Moving", "A man moves one square diagonally forward. A king moves any number of free squares along a diagonal."],
      ["Capturing", "Jump over an opposing piece, forwards or backwards, and keep going while you can. Capturing is compulsory, and you must play the line that takes the most pieces. Taken pieces leave at the end of the line."],
      ["Crowning", "A man ending its move on the far row becomes a king. If it only passes through during a capture, it stays a man."],
      ["Draws", "A game is drawn by agreement, after a threefold repetition, or after 25 moves each without a capture or a man moving."],
      ["Playing here", "Click a piece, then where it should land. For a capture line, click each stop: the pieces at stake light up."],
    ],
  },
  Play: DraughtsPlay,
  Showcase,
};
export default function Dames() {
  return <DuelScreen config={CONFIG} />;
}

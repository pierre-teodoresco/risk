"use client";
// Chess: the shared duel screen (entrance, waiting room) with a chess table of its own, drawn
// like the big chess sites.
import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { gamePath } from "@/games/registry";
import DuelScreen, { type DuelConfig } from "@/games/duel/ui/DuelScreen";
import type { Lang } from "@/lib/world";
import Board2D from "@/games/duel/ui/Board2D";
import Table2D from "@/games/duel/ui/Table2D";
import { setSound, soundOn } from "@/games/duel/ui/sound";
import { legalMoves, play, san, startPosition, type Cell, type Position } from "../rules";
import { CHESS_2D } from "./game2d";
import Piece from "./Piece";

// The Opera Game, Morphy against the Duke of Brunswick and Count Isouard, Paris 1858.
const OPERA = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(" ");
const OPERA_GAME = (() => {
  const positions = [startPosition()], played: ({ from: number; to: number } | null)[] = [null];
  for (const text of OPERA) {
    const p = positions.at(-1)!;
    const m = legalMoves(p).find((x) => san(p, x) === text)!;
    positions.push(play(p, m));
    played.push(m);
  }
  return { positions, played };
})();
const SHOWCASE_STEP_MS = 1100;
const SHOWCASE_REST = 4;

/** A board replaying a famous game on a loop, for the entrance and the hub. */
export function Showcase() {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setK((n) => (n + 1) % (OPERA_GAME.positions.length + SHOWCASE_REST)), SHOWCASE_STEP_MS);
    return () => clearInterval(t);
  }, []);
  const at = Math.min(k, OPERA_GAME.positions.length - 1);
  const m = OPERA_GAME.played[at];
  return (
    <div className="cc-showcase">
      <Board2D size={8} cells={OPERA_GAME.positions[at].board} flipped={false} moves={[]} last={m ? [m.from, m.to] : null} renderPiece={(c) => <Piece cell={c as Exclude<Cell, null>} />} />
    </div>
  );
}

function SoundToggle({ lang }: { lang: Lang }) {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(soundOn()), []);
  const label = lang === "fr" ? (on ? "Couper le son" : "Activer le son") : on ? "Mute" : "Unmute";
  return (
    <button
      className="gt-orb"
      aria-label={label}
      title={label}
      aria-pressed={!on}
      onClick={() => {
        setSound(!on);
        setOn(!on);
      }}
    >
      {on ? <Volume2 /> : <VolumeX />}
    </button>
  );
}

const CONFIG: DuelConfig<Position> = {
  id: "echecs",
  path: gamePath("echecs"),
  logo: "échecs",
  tagline: { fr: "Le roi tombe, la partie aussi.", en: "When the king falls, so does the game." },
  rulesTitle: { fr: "Comment jouer aux échecs", en: "How to play chess" },
  rules: {
    fr: [
      ["Le but", "Mettre le roi adverse en échec et mat : il est attaqué et ne peut plus s’échapper. Les Blancs jouent en premier, puis chacun son tour."],
      ["Les pièces", "Le pion avance d’une case (deux au premier coup) et prend en diagonale. Le cavalier saute en L. Le fou va en diagonale, la tour en ligne droite, la dame dans toutes les directions, le roi d’une case."],
      ["Coups spéciaux", "Le roque déplace le roi de deux cases vers une tour qui passe de l’autre côté, si aucun des deux n’a bougé et que le roi ne traverse pas d’échec. La prise en passant capture un pion qui vient d’avancer de deux cases à côté du tien. Un pion qui atteint la dernière rangée devient la pièce de ton choix."],
      ["Fin de partie", "Échec et mat, abandon ou temps écoulé donnent la victoire. Le pat, la triple répétition, la règle des cinquante coups, le matériel insuffisant ou l’accord des deux joueurs donnent la nulle."],
      ["Jouer ici", "Glisse une pièce sur sa case d’arrivée, ou clique la pièce puis la case : les points montrent ses coups possibles. Pendant le coup adverse, tu peux préparer autant de coups d’avance que tu veux (prémoves, en rouge), y compris une reprise sur une case où se trouve encore ta pièce : ils partent dès que c’est ton tour s’ils sont encore légaux ; clic droit ou Échap pour les annuler. Clic droit pour marquer une case, clic droit glissé pour tracer une flèche. Les flèches du clavier font défiler la partie."],
    ],
    en: [
      ["The goal", "Checkmate the opposing king: it is attacked and cannot escape. White moves first, then each side in turn."],
      ["The pieces", "Pawns move one square (two on their first move) and capture diagonally. Knights jump in an L. Bishops move diagonally, rooks in straight lines, the queen in every direction, the king one square."],
      ["Special moves", "Castling moves the king two squares towards a rook, which jumps to its other side, if neither has moved and the king does not cross a check. En passant takes a pawn that just moved two squares beside yours. A pawn reaching the last rank becomes the piece of your choice."],
      ["End of the game", "Checkmate, resignation or running out of time wins. Stalemate, threefold repetition, the fifty-move rule, insufficient material or agreement is a draw."],
      ["Playing here", "Drag a piece to its square, or click the piece then the square: the dots show where it can go. While your opponent thinks, you can queue as many moves ahead as you like (premoves, in red), including a recapture on a square your own piece still stands on: they play as soon as it is your turn if they are still legal; right-click or Escape cancels them. Right-click to mark a square, right-drag to draw an arrow. The arrow keys step through the game."],
    ],
  },
  Showcase,
  Table: (props) => <Table2D rules={CHESS_2D} {...props} />,
  className: "cc",
  Nav: SoundToggle,
};
export default function Echecs() {
  return <DuelScreen config={CONFIG} />;
}

// Rebuilds the positions of a game from its move list in standard notation, so the board can
// show any earlier move. Extends the previous result when the list only grew.
import { legalMoves, play, san, startPosition, type Move, type Position } from "../rules";

export type Replay = { moves: string[]; positions: Position[]; played: (Move | null)[] };

export function replay(moves: string[], previous?: Replay): Replay {
  const keep = previous && previous.moves.length <= moves.length && previous.moves.every((m, k) => m === moves[k]) ? previous : null;
  const positions = keep ? [...keep.positions] : [startPosition()];
  const played = keep ? [...keep.played] : [null];
  for (let k = positions.length - 1; k < moves.length; k++) {
    const p = positions[k];
    const m = legalMoves(p).find((x) => san(p, x) === moves[k]);
    // A list that does not replay (should not happen) stops where it breaks.
    if (!m) break;
    positions.push(play(p, m));
    played.push(m);
  }
  return { moves: [...moves], positions, played };
}

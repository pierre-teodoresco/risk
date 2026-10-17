import { test } from "node:test";
import assert from "node:assert/strict";
import { TourBoard, type TourState } from "../games/grand-tour/ui/engine3d";

function state(): TourState {
  return {
    holdings: { "1": { owner: "alice", houses: 0, mortgaged: false } },
    pawns: [], move: null, ownerColor: () => "#ff6b3d", dice: null, selected: null,
    labels: Array.from({ length: 40 }, (_, i) => `Square ${i}`),
    prices: Array(40).fill(100), rents: Array(40).fill(null),
    groupColors: Array(40).fill(null), flags: Array(40).fill(null), active: null, pot: 0, card: null,
  };
}

/** Exercise state updates without a WebGL context; count texture redraws at the renderer boundary. */
function renderer(previous: TourState | null) {
  const drawn: number[] = [];
  const board: Pick<TourBoard, "setState"> = Object.assign(Object.create(TourBoard.prototype), {
    state: previous, tiles: Array(40).fill(null), potShown: 0,
    drawLabel: (i: number) => drawn.push(i), syncHolding: () => {}, syncPawns: () => {},
    arrow: { visible: false },
  });
  return { board, drawn };
}

test("Grand Tour draws every label initially, then skips equal server snapshots and selection changes", () => {
  const { board, drawn } = renderer(null), initial = state();
  board.setState(initial);
  assert.deepEqual(drawn, Array.from({ length: 40 }, (_, i) => i));
  drawn.length = 0;
  const fresh = { ...structuredClone({ ...initial, ownerColor: undefined }), ownerColor: initial.ownerColor };
  board.setState(fresh);
  board.setState({ ...fresh, selected: 3 });
  assert.deepEqual(drawn, []);
});

test("Grand Tour only redraws affected rents, mortgages, owners and translated labels", () => {
  const previous = state(), { board, drawn } = renderer(previous);
  const next = state();
  next.rents[1] = "₲12";
  board.setState(next);
  assert.deepEqual(drawn, [1]);
  drawn.length = 0;
  board.setState({ ...next, holdings: { "1": { ...next.holdings["1"], mortgaged: true } } });
  assert.deepEqual(drawn, [1]);
  drawn.length = 0;
  board.setState({ ...next, holdings: { "1": { ...next.holdings["1"], owner: "bob" } } });
  assert.deepEqual(drawn, [1]);
  drawn.length = 0;
  const translated = { ...next, labels: next.labels.map((_, i) => `Case ${i}`) };
  board.setState(translated);
  assert.deepEqual(drawn, Array.from({ length: 40 }, (_, i) => i));
});

test("Grand Tour redraws owned labels when a player changes colour", () => {
  const previous = state(), { board, drawn } = renderer(previous);
  board.setState({ ...previous, ownerColor: () => "#4c8dff" });
  assert.deepEqual(drawn, [1]);
});

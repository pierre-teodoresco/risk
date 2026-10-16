import { test } from "node:test";
import assert from "node:assert/strict";
import MAP from "../lib/map-data.json" with { type: "json" };
import { WORLD } from "../lib/world";

// Below this gap two shapes read as sharing a border on the board.
const TOUCH_PX = 3;

const TERR = MAP.territories as Record<string, { rings: number[][][] }>;
const points = (id: string) => TERR[id].rings.flat();
const bounds = (id: string) => {
  const xs = points(id).map((p) => p[0]), ys = points(id).map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};
const gap = (a: string, b: string) => {
  const ba = bounds(a), bb = bounds(b);
  if (ba.x0 - bb.x1 > TOUCH_PX || bb.x0 - ba.x1 > TOUCH_PX || ba.y0 - bb.y1 > TOUCH_PX || bb.y0 - ba.y1 > TOUCH_PX) return Infinity;
  let min = Infinity;
  for (const [ax, ay] of points(a))
    for (const [bx, by] of points(b)) min = Math.min(min, Math.hypot(ax - bx, ay - by));
  return min;
};

test("territories that touch on the board are neighbours", () => {
  const stray: string[] = [];
  for (const a of WORLD)
    for (const b of WORLD)
      if (a.id < b.id && !a.neighbors.includes(b.id) && gap(a.id, b.id) < TOUCH_PX) stray.push(`${a.id}–${b.id}`);
  assert.deepEqual(stray, []);
});

test("sea routes only join declared neighbours", () => {
  for (const [a, b] of MAP.sea as [string, string][])
    assert.ok(WORLD.find((t) => t.id === a)?.neighbors.includes(b), `${a}–${b}`);
});

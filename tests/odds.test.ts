import { test } from "node:test";
import assert from "node:assert/strict";
import { blitzOdds } from "../lib/odds";

// Exact Blitz odds for the engine's rules (lib/game.ts, action "attack"):
// the attacker rolls min(3, armies - 1) dice, the defender min(2, armies),
// highest dice are compared pairwise, ties go to the defender, and rounds
// repeat until the defender is wiped out or one attacking army is left.
const ROUND: Record<string, number[]> = {};
for (let ka = 1; ka <= 3; ka++)
  for (let kd = 1; kd <= 2; kd++) {
    const m = Math.min(ka, kd),
      out = new Array<number>(m + 1).fill(0),
      total = 6 ** (ka + kd);
    for (let code = 0; code < total; code++) {
      let c = code;
      const a: number[] = [],
        d: number[] = [];
      for (let k = 0; k < ka; k++, c = Math.floor(c / 6)) a.push(c % 6);
      for (let k = 0; k < kd; k++, c = Math.floor(c / 6)) d.push(c % 6);
      a.sort((x, y) => y - x);
      d.sort((x, y) => y - x);
      let lost = 0;
      for (let k = 0; k < m; k++) if (a[k] <= d[k]) lost++;
      out[lost] += 1 / total;
    }
    // out[i] = chance that the attacker loses i armies in this round.
    ROUND[`${ka}v${kd}`] = out;
  }

type ReferenceOdds = {
  win: number;
  attackerLoss: number;
  defenderLoss: number;
  survivors: number;
};

/** attackers counts the whole stack, including the army that must stay behind. */
function referenceOdds(attackers: number, defenders: number): ReferenceOdds {
  let states = new Map<string, number>([[`${attackers},${defenders}`, 1]]);
  let win = 0,
    attackerLoss = 0,
    defenderLoss = 0,
    survivors = 0;
  while (states.size) {
    const next = new Map<string, number>();
    for (const [key, p] of states) {
      const [a, d] = key.split(",").map(Number);
      if (d === 0) {
        win += p;
        attackerLoss += p * (attackers - a);
        defenderLoss += p * defenders;
        survivors += p * a;
        continue;
      }
      if (a <= 1) {
        attackerLoss += p * (attackers - a);
        defenderLoss += p * (defenders - d);
        continue;
      }
      const ka = Math.min(3, a - 1),
        kd = Math.min(2, d),
        m = Math.min(ka, kd);
      ROUND[`${ka}v${kd}`].forEach((q, i) => {
        if (!q) return;
        const k = `${a - i},${d - (m - i)}`;
        next.set(k, (next.get(k) ?? 0) + p * q);
      });
    }
    states = next;
  }
  return { win, attackerLoss, defenderLoss, survivors: win ? survivors / win : 0 };
}


test("Blitz forecasts match exhaustive dice outcomes across small battles", () => {
  for (let a = 1; a <= 16; a++) for (let d = 0; d <= 14; d++) {
    const actual = blitzOdds(a, d), expected = referenceOdds(a, d);
    for (const key of ["win", "attackerLoss", "defenderLoss", "survivors"] as const)
      assert.ok(Math.abs(actual[key] - expected[key]) < 1e-10, `${a} v ${d}: ${key}`);
  }
});

test("Blitz forecasts stay exact for large armies and do not expose their cache", () => {
  const actual = blitzOdds(100, 80), expected = referenceOdds(100, 80);
  for (const key of ["win", "attackerLoss", "defenderLoss", "survivors"] as const)
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, key);
  actual.win = -1;
  assert.ok(Math.abs(blitzOdds(100, 80).win - expected.win) < 1e-10);
});

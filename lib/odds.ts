// Exact Blitz odds for min(3, armies - 1) attacking dice and min(2, armies)
// defending dice; ties favour the defender. Numerators are exhaustively checked in tests.
// ROUND[attacker dice][defender dice][attacker losses in this round].
const ROUND = [
  [],
  [[], [15 / 36, 21 / 36], [55 / 216, 161 / 216]],
  [[], [125 / 216, 91 / 216], [295 / 1296, 420 / 1296, 581 / 1296]],
  [[], [855 / 1296, 441 / 1296], [2890 / 7776, 2611 / 7776, 2275 / 7776]],
];

export type Odds = { win: number; attackerLoss: number; defenderLoss: number; survivors: number };
const CACHE_LIMIT = 128;
const cache = new Map<string, Odds>();

/** attackers includes the army that must stay behind. Memory is linear in defenders. */
export function blitzOdds(attackers: number, defenders: number): Odds {
  if (!defenders) return { win: 1, attackerLoss: 0, defenderLoss: 0, survivors: attackers };
  if (attackers <= 1) return { win: 0, attackerLoss: 0, defenderLoss: 0, survivors: 0 };
  const key = `${attackers}:${defenders}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return { ...cached };
  }

  // Each round removes at most two attackers: only the current and two preceding rows
  // are needed. Columns hold win probability, expected losses and winning survivor mass.
  const rows = Array.from({ length: 3 }, () => new Float64Array((defenders + 1) * 4));
  rows[1][0] = rows[1][3] = 1;
  for (let a = 2; a <= attackers; a++) {
    const row = rows[a % 3], ka = Math.min(3, a - 1);
    row[0] = 1; row[1] = row[2] = 0; row[3] = a;
    for (let d = 1; d <= defenders; d++) {
      const kd = Math.min(2, d), m = Math.min(ka, kd), round = ROUND[ka][kd];
      let win = 0, attackerLoss = 0, defenderLoss = 0, survivors = 0;
      for (let i = 0; i <= m; i++) {
        const next = rows[(a - i) % 3], at = (d - (m - i)) * 4, q = round[i];
        win += q * next[at];
        attackerLoss += q * (i + next[at + 1]);
        defenderLoss += q * (m - i + next[at + 2]);
        survivors += q * next[at + 3];
      }
      const at = d * 4;
      row[at] = win; row[at + 1] = attackerLoss; row[at + 2] = defenderLoss; row[at + 3] = survivors;
    }
  }
  const row = rows[attackers % 3], at = defenders * 4;
  const result = { win: row[at], attackerLoss: row[at + 1], defenderLoss: row[at + 2], survivors: row[at] ? row[at + 3] / row[at] : 0 };
  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  // Do not let callers mutate the cached forecast.
  return { ...result };
}

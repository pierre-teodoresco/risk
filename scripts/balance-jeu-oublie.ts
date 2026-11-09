// Balance bench for the forgotten game's factions: `npx tsx scripts/balance-jeu-oublie.ts [seeds]`.
// 1. Duels: what each faction produces in 90 s (with its own spawn time) meets the other's in the
//    middle of the board; who is left standing?
// 2. Matches: two identical bots (same strategy, see `bot`) play full 1v1 games, on both seats.
// Nothing here is used by the game: it only reads the simulation and prints win rates.
import { createSim, step, unitStats, spawnTicks, ownedTiles, M, TPS, WARMUP, type Order, type Sim } from "../games/jeu-oublie/sim";
import { FACTION_IDS, type FactionId } from "../games/jeu-oublie/factions";

const SEEDS = Number(process.argv[2] ?? 12);
const MAX_TICKS = 15 * 60 * TPS;

function duel(a: FactionId, b: FactionId, seconds = 90) {
  const s = createSim(1, [a, b]);
  for (let i = 0; i <= WARMUP; i++) step(s);
  s.units = [];
  s.crateAt = Infinity;
  for (const p of s.players) p.acc = -1e15; // no reinforcements during a duel
  const mid = (s.n * M) / 2;
  const count = (f: number) => Math.floor((seconds * TPS) / spawnTicks(s, f));
  for (const f of [0, 1]) for (let k = 0; k < count(f); k++) {
    const x = mid + (f ? 1 : -1) * (2000 + (k % 5) * 330), y = mid - 800 + Math.floor(k / 5) * 330;
    const u = { id: s.next++, o: f, k: 0 as const, x, y, hp: 0, tx: mid + (f ? -1 : 1) * 3000, ty: y, mv: 1 as const, cd: 0, ig: 0, idle: 0, life: -1, a: 0 };
    u.hp = unitStats(s, u).hp;
    s.units.push(u);
  }
  // The fight is in the middle, out of reach of the base turrets.
  for (let i = 0; i < 600; i++) {
    step(s);
    const left = [0, 1].map((f) => s.units.filter((u) => u.o === f).length);
    if (!left[0] || !left[1]) break;
    // Keep both sides walking into each other.
    for (const u of s.units) { u.tx = mid; u.ty = u.y; u.mv = 1; }
  }
  const hp = [0, 1].map((f) => s.units.filter((u) => u.o === f).reduce((t, u) => t + u.hp, 0));
  return { left: [0, 1].map((f) => s.units.filter((u) => u.o === f).length), hp, sent: [count(0), count(1)] };
}

/** The same simple strategy for every seat: expand with pairs, defend the base, attack when ahead. */
function bot(s: Sim, p: number, orders: Order[], patience: number) {
  const me = s.players[p], enemy = s.players.findIndex((e, q) => q !== p && e.alive);
  if (!me.alive || enemy < 0) return;
  const mine = s.units.filter((u) => u.o === p && u.k !== 1), theirs = s.units.filter((u) => u.o === enemy);
  const near = (u: { x: number; y: number }, x: number, y: number, r: number) => (u.x - x) ** 2 + (u.y - y) ** 2 < (r * M) ** 2;
  // Only units not already heading there get the order: a fresh order makes a unit ignore
  // enemies for a moment, so re-ordering every second would stop it from fighting.
  const send = (x: number, y: number) => {
    const ids = mine.filter((u) => !near({ x: u.tx, y: u.ty }, x, y, 2.5)).map((u) => u.id);
    if (ids.length) orders.push({ p, c: { k: "mv", u: ids, x, y } });
  };
  const raid = theirs.filter((u) => near(u, me.bx, me.by, 4.5));
  if (raid.length) { send(me.bx, me.by); return; }
  const e = s.players[enemy];
  if (mine.length >= patience && mine.length >= theirs.length * 1.3) { send(e.bx, e.by); return; }
  const idle = mine.filter((u) => !u.mv);
  const claimed = new Set<number>();
  for (let k = 0; k + 1 < idle.length; k += 2) {
    const a = idle[k];
    let best = -1, bd = Infinity;
    for (let i = 0; i < s.kind.length; i++) {
      if (s.kind[i] !== 1 || s.own[i] === p || claimed.has(i)) continue;
      const x = (i % s.n + 0.5) * M, y = (Math.floor(i / s.n) + 0.5) * M, d = (a.x - x) ** 2 + (a.y - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) break;
    claimed.add(best);
    orders.push({ p, c: { k: "mv", u: [a.id, idle[k + 1].id], x: (best % s.n + 0.5) * M, y: (Math.floor(best / s.n) + 0.5) * M } });
  }
}

function match(a: FactionId, b: FactionId, seed: number, patience: number) {
  const s = createSim(seed, [a, b]);
  while (!s.over && s.tick < MAX_TICKS) {
    const orders: Order[] = [];
    if (s.tick % TPS === 0) { bot(s, 0, orders, patience); bot(s, 1, orders, patience); }
    step(s, orders);
  }
  const winner = s.over ? s.winner : ownedTiles(s, 0) === ownedTiles(s, 1) ? -1 : ownedTiles(s, 0) > ownedTiles(s, 1) ? 0 : 1;
  return { winner, minutes: (s.tick - WARMUP) / TPS / 60, timeout: !s.over };
}

console.log("Duels (90 s of production each, survivors / hp left):");
for (let i = 0; i < FACTION_IDS.length; i++) for (let j = i + 1; j < FACTION_IDS.length; j++) {
  const a = FACTION_IDS[i], b = FACTION_IDS[j], r = duel(a, b);
  console.log(`  ${a.padEnd(10)} ${String(r.sent[0]).padStart(2)} vs ${String(r.sent[1]).padStart(2)} ${b.padEnd(10)} → ${r.left[0]} / ${r.left[1]} left (hp ${r.hp[0]} / ${r.hp[1]})`);
}
console.log(`\nBot matches (${SEEDS} seeds × 2 seats per pair):`);
const wins: Record<string, number> = Object.fromEntries(FACTION_IDS.map((f) => [f, 0])), games: Record<string, number> = { ...wins };
let minutes = 0, total = 0, timeouts = 0;
for (let i = 0; i < FACTION_IDS.length; i++) for (let j = i + 1; j < FACTION_IDS.length; j++) {
  const a = FACTION_IDS[i], b = FACTION_IDS[j];
  let wa = 0, wb = 0;
  // Half the games with rushing bots (attack at 12 units), half with patient ones (25 units).
  for (let seed = 1; seed <= SEEDS; seed++) for (const flip of [false, true]) {
    const r = match(flip ? b : a, flip ? a : b, seed * 7919, seed % 2 ? 12 : 25);
    const w = r.winner < 0 ? null : (r.winner === 0) !== flip ? a : b;
    if (w === a) wa++; else if (w === b) wb++;
    minutes += r.minutes; total++; if (r.timeout) timeouts++;
  }
  wins[a] += wa; wins[b] += wb; games[a] += SEEDS * 2; games[b] += SEEDS * 2;
  console.log(`  ${a.padEnd(10)} ${String(wa).padStart(2)} – ${String(wb).padEnd(2)} ${b}`);
}
console.log("\nWin rate over all pairs:");
for (const f of FACTION_IDS) console.log(`  ${f.padEnd(10)} ${Math.round((wins[f] / games[f]) * 100)} %`);
console.log(`\nAverage length ${(minutes / total).toFixed(1)} min, ${timeouts} game(s) decided on cells after 15 min.`);

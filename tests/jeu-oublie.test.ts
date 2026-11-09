import { test } from "node:test";
import assert from "node:assert/strict";
import { CAP, M, TPS, WARMUP, BASE_HP, MAP_SIZE, captureRate, cloneSim, createSim, hash, ownedTiles, spawnBonus, spawnTicks, step, tileOf, unitStats, type Order, type Sim } from "../games/jeu-oublie/sim";
import { FACTIONS, FACTION_IDS, BASE_STATS, type FactionId } from "../games/jeu-oublie/factions";
import { applyAction, createGame, joinGame, publicGame, type Game } from "../games/jeu-oublie/engine";

const NOW = 1_000_000;
let seed = 7;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const run = (s: Sim, ticks: number, orders: Map<number, Order[]> = new Map()) => {
  for (let i = 0; i < ticks; i++) step(s, orders.get(s.tick) ?? []);
};
/** Random but reproducible orders: every player sends groups around the map. */
function randomOrders(s: Sim, rng: () => number, ticks: number) {
  const orders = new Map<number, Order[]>();
  for (let t = WARMUP; t < ticks; t += 7) {
    const p = Math.floor(rng() * s.players.length);
    const k = rng();
    const c = k < 0.85
      ? { k: "mv", u: Array.from({ length: 30 }, () => 1 + Math.floor(rng() * 400)), x: rng() * s.n * M, y: rng() * s.n * M }
      : { k: "ra", x: rng() * s.n * M, y: rng() * s.n * M };
    orders.set(t, [...(orders.get(t) ?? []), { p, c }]);
  }
  return orders;
}

// ---------- factions ----------
test("each faction is best at its own stat and pays for it elsewhere", () => {
  const better = (id: FactionId, key: keyof typeof BASE_STATS) => key === "spawn" ? FACTIONS[id].stats.spawn < BASE_STATS.spawn : FACTIONS[id].stats[key] > BASE_STATS[key];
  for (const id of FACTION_IDS) {
    const f = FACTIONS[id];
    assert.ok(better(id, f.strength), id);
    // Others may be above the base unit in that stat to balance, but never as good as the specialist.
    const value = (x: FactionId) => (f.strength === "spawn" ? -FACTIONS[x].stats.spawn : FACTIONS[x].stats[f.strength]);
    for (const other of FACTION_IDS) if (other !== id) assert.ok(value(other) < value(id), `${other} is as good as ${id} at ${f.strength}`);
    const weaker = (Object.keys(BASE_STATS) as (keyof typeof BASE_STATS)[]).filter((k) => k === "spawn" ? f.stats.spawn > BASE_STATS.spawn : f.stats[k] < BASE_STATS[k]);
    assert.ok(weaker.length >= 1, `${id} has no weakness`);
  }
});

// ---------- simulation ----------
test("map: bases in the corners, one cell in two capturable", () => {
  for (const n of [2, 3, 4]) {
    const s = createSim(1, Array(n).fill("mamies"));
    assert.equal(s.n, MAP_SIZE[n]);
    assert.equal(s.kind.filter((k) => k === 2).length, 9 * n);
    for (let i = 0; i < s.n * s.n; i++) {
      const x = i % s.n, y = Math.floor(i / s.n);
      if (s.kind[i] !== 2) assert.equal(s.kind[i], (x + y) % 2 === 0 ? 1 : 0);
    }
    // Every base touches the same number of cells, whatever its corner.
    const anchors = s.players.map((p, q) => s.own.filter((o, i) => o === q && s.kind[i] === 2).length);
    assert.ok(anchors.every((a) => a === 9));
    assert.ok(s.players.every((p) => p.linked === 0 && p.hp === BASE_HP));
  }
});

test("same seed and same orders give the same game, also after a JSON snapshot", () => {
  const factions: FactionId[] = ["escargots", "joggeurs", "armoires", "mamies"];
  const a = createSim(42, factions), b = createSim(42, factions);
  const orders = randomOrders(a, (() => { let x = 3; return () => ((x = (Math.imul(x, 48271) % 2147483647) >>> 0) / 2147483647); })(), 3000);
  run(a, 1500, orders); run(b, 1500, orders);
  assert.equal(hash(a), hash(b));
  assert.ok(a.units.length > 10, "units should have spawned");
  // A browser joining mid-game from a snapshot continues identically.
  const c = cloneSim(JSON.parse(JSON.stringify(b)));
  run(a, 1500, orders); run(c, 1500, orders);
  assert.equal(hash(a), hash(c));
  assert.deepEqual(JSON.parse(JSON.stringify({ ...a, ev: [] })), JSON.parse(JSON.stringify({ ...c, ev: [] })));
});

test("a different order changes the outcome (the hash sees it)", () => {
  const a = createSim(5, ["mamies", "mamies"]), b = createSim(5, ["mamies", "mamies"]);
  run(a, WARMUP + 5); run(b, WARMUP + 5);
  const ids = a.units.filter((u) => u.o === 0).map((u) => u.id);
  step(a, [{ p: 0, c: { k: "mv", u: ids, x: 7500, y: 7500 } }]); step(b, []);
  run(a, 20); run(b, 20);
  assert.notEqual(hash(a), hash(b));
});

test("units capture a cell over time; an enemy must neutralise it before taking it", () => {
  const s = createSim(9, ["mamies", "mamies"]);
  run(s, WARMUP + 1);
  const target = 7 * s.n + 7; // (7, 7): capturable, centre of the 15 × 15 map
  assert.equal(s.kind[target], 1);
  const mine = s.units.filter((u) => u.o === 0).map((u) => u.id);
  step(s, [{ p: 0, c: { k: "mv", u: mine, x: 7300, y: 7800 } }]);
  for (let i = 0; i < 400 && s.own[target] !== 0; i++) step(s);
  assert.equal(s.own[target], 0);
  assert.equal(s.prog[target], CAP);
  assert.ok(s.players[0].caps >= 1);
  // Player 1 arrives alone: neutralise first, then capture.
  for (const u of s.units) if (u.o === 0) u.hp = 0;
  s.units = s.units.filter((u) => u.hp > 0);
  const theirs = s.units.filter((u) => u.o === 1).map((u) => u.id);
  step(s, [{ p: 1, c: { k: "mv", u: theirs, x: 7500, y: 7500 } }]);
  let neutral = false;
  const owner = (): number => s.own[target];
  for (let i = 0; i < 600 && owner() !== 1; i++) { step(s); if (owner() === -1) neutral = true; for (const u of s.units) if (u.o === 0) u.hp = 0; s.units = s.units.filter((u) => u.hp > 0); }
  assert.ok(neutral, "the cell went through neutral");
  assert.equal(owner(), 1);
});

test("a contested cell does not move; paths are never owned", () => {
  const s = createSim(3, ["mamies", "mamies"]);
  run(s, WARMUP + 1);
  const t = tileOf(s, 7500, 7500);
  s.units.forEach((u, i) => { u.x = 7400 + (i % 2) * 200; u.y = 7500; u.mv = 0; u.ig = 9999; });
  // Frozen on the spot (ig keeps them from fighting) so both stay on the tile.
  for (let i = 0; i < 30; i++) { step(s); s.units.forEach((u, k) => { u.x = 7400 + (k % 2) * 200; u.y = 7500; u.ig = 9999; }); }
  assert.equal(s.own[t], -1);
  assert.ok(s.own.every((o, i) => o === -1 || s.kind[i] !== 0));
});

test("only cells linked to the base by diagonal chains count for the spawn bonus", () => {
  const s = createSim(1, ["mamies", "mamies"]);
  const set = (x: number, y: number) => { const i = y * s.n + x; s.own[i] = 0; s.prog[i] = CAP; s.cap[i] = 0; };
  set(3, 3); set(4, 4); set(5, 5); // chain from the base corner
  set(9, 9); // isolated
  run(s, 1);
  assert.equal(s.players[0].linked, 3);
  assert.equal(s.lk[9 * s.n + 9], 0);
  assert.equal(s.lk[5 * s.n + 5], 1);
  assert.equal(ownedTiles(s, 0), 4);
  assert.ok(spawnBonus(3) > 0 && spawnBonus(1000) === 0.3);
});

test("units spawn at the base and faster factions spawn more", () => {
  const s = createSim(1, ["escargots", "mamies"]);
  run(s, WARMUP + 600);
  const count = (p: number) => s.units.filter((u) => u.o === p).length + s.players[p].lost;
  assert.ok(count(0) > count(1), `${count(0)} vs ${count(1)}`);
  assert.ok(count(1) >= 3 + Math.floor(600 / spawnTicks(s, 1)) - 1);
});

test("units fight when they meet and the base defends itself", () => {
  const s = createSim(2, ["armoires", "joggeurs"]);
  run(s, WARMUP + 1);
  const a = s.units.filter((u) => u.o === 0).map((u) => u.id), b = s.units.filter((u) => u.o === 1).map((u) => u.id);
  step(s, [{ p: 0, c: { k: "mv", u: a, x: 7500, y: 7500 } }, { p: 1, c: { k: "mv", u: b, x: 7500, y: 7500 } }]);
  run(s, 200);
  assert.ok(s.players[0].kills + s.players[1].kills > 0);
  // Walk into the enemy base: its turret shoots.
  const raider = s.units.find((u) => u.o === 0) ?? s.units[0];
  raider.o = 0; raider.hp = 5000; raider.x = s.players[1].bx - 2500; raider.y = s.players[1].by;
  step(s, [{ p: 0, c: { k: "mv", u: [raider.id], x: s.players[1].bx, y: s.players[1].by } }]);
  let shot = false;
  for (let i = 0; i < 300; i++) { step(s); if (s.ev.some((e) => e.t === "shot" && e.p === 1)) shot = true; }
  assert.ok(shot);
});

test("a conquered base eliminates its player and frees their cells; last base standing wins", () => {
  const s = createSim(4, ["mamies", "mamies", "mamies"]);
  run(s, WARMUP + 10);
  const cell = 7 * s.n + 9;
  s.own[cell] = 2; s.prog[cell] = CAP; s.cap[cell] = 2;
  s.players[2].hp = 5;
  const p1 = s.players[1];
  const raiders = s.units.filter((u) => u.o === 0).map((u) => u.id);
  for (const u of s.units) if (u.o === 0) { u.x = s.players[2].bx + 1200; u.y = s.players[2].by; }
  step(s, [{ p: 0, c: { k: "mv", u: raiders, x: s.players[2].bx, y: s.players[2].by } }]);
  for (let i = 0; i < 100 && s.players[2].alive; i++) step(s);
  assert.equal(s.players[2].alive, false);
  assert.equal(s.players[2].conqueror, 0);
  assert.equal(s.own[cell], -1);
  assert.ok(s.own.every((o) => o !== 2));
  assert.ok(!s.units.some((u) => u.o === 2));
  assert.equal(s.over, false);
  step(s, [{ p: 1, c: { k: "rs" } }]);
  assert.equal(p1.alive, false);
  assert.equal(s.over, true);
  assert.equal(s.winner, 0);
});

test("rally point: new units walk to it", () => {
  const s = createSim(8, ["joggeurs", "joggeurs"]);
  step(s, [{ p: 0, c: { k: "ra", x: 4500, y: 6500 } }]);
  run(s, WARMUP + 200);
  const settled = s.units.filter((u) => u.o === 0 && !u.mv);
  assert.ok(settled.length > 0);
  assert.ok(settled.every((u) => Math.abs(u.x - 4500) < 1500 && Math.abs(u.y - 6500) < 1500));
});

test("malformed orders are ignored", () => {
  const s = createSim(8, ["joggeurs", "joggeurs"]);
  const before = hash(s);
  for (const c of [null, 3, "mv", { k: "mv" }, { k: "mv", u: "x", x: 1, y: 1 }, { k: "ra", x: NaN, y: 1 }, { k: "zz" }, { k: "mv", u: Array(10000).fill(1), x: 1, y: 1 }])
    step(cloneSim(s), [{ p: 0, c }, { p: 9, c: { k: "rs" } }]);
  assert.equal(hash(s), before);
  const t = cloneSim(s);
  step(t, [{ p: 7, c: { k: "rs" } }, { p: 0, c: { k: "ra", x: 1e12, y: -5 } }]);
  assert.ok(t.players[0].rx <= t.n * M && t.players[0].ry >= 0);
  assert.ok(t.players.every((p) => p.alive));
});

test("crates drop in the middle and help whoever picks them up", () => {
  const s = createSim(11, ["mamies", "mamies"]);
  let dropped = false, picked = false;
  for (let i = 0; i < 2000 && !picked; i++) {
    step(s);
    if (s.ev.some((e) => e.t === "drop")) dropped = true;
    if (s.crate) { const u = s.units.find((u) => u.o === 0); if (u) { u.x = s.crate.x; u.y = s.crate.y; } }
    if (s.ev.some((e) => e.t === "crate" && e.p === 0)) picked = true;
  }
  assert.ok(dropped && picked);
});

test("long random four-player games stay consistent", () => {
  for (const g of [1, 2]) {
    const s = createSim(100 + g, ["escargots", "joggeurs", "armoires", "mamies"]);
    const orders = randomOrders(s, rand, 6000);
    for (let i = 0; i < 6000; i++) {
      step(s, orders.get(s.tick) ?? []);
      if (i % 500 === 0) {
        const ids = new Set(s.units.map((u) => u.id));
        assert.equal(ids.size, s.units.length);
        assert.ok(s.units.every((u) => u.hp > 0 && u.x >= 0 && u.y >= 0 && u.x <= s.n * M && u.y <= s.n * M && s.players[u.o].alive));
        assert.ok(s.prog.every((p) => p >= 0 && p <= CAP));
        assert.ok(s.own.every((o, k) => o === -1 || s.players[o].alive || s.kind[k] === 2));
      }
    }
  }
});

// ---------- room ----------
function room(players = 2) {
  let g: Game = createGame("ABCDEF", { name: "Alice", faction: "mamies" }, "h0", NOW);
  for (let i = 1; i < players; i++) g = joinGame(g, { name: "Joueur " + i }, "h" + i, NOW + i);
  return g;
}
test("room: factions in the lobby, two to four players, same faction allowed", () => {
  let g = room(1);
  const host = g.players[0].id;
  assert.throws(() => applyAction(g, host, { type: "start" }, rand, NOW), /playerCount/);
  g = room(4);
  const host4 = g.players[0].id;
  assert.throws(() => joinGame(g, { name: "Eve" }, "h9", NOW), /roomFull/);
  const second = g.players[1].id;
  g = applyAction(g, second, { type: "profile", faction: "mamies" }, rand, NOW);
  assert.equal(g.players[1].faction, "mamies");
  assert.throws(() => applyAction(g, second, { type: "profile", faction: "licornes" }, rand, NOW), /invalidFaction/);
  assert.throws(() => applyAction(g, second, { type: "start" }, rand, NOW), /hostOnly/);
  g = applyAction(g, host4, { type: "start" }, rand, NOW + 10);
  assert.equal(g.phase, "playing");
  assert.equal(g.match, 1);
  assert.deepEqual(g.roster.map((s) => s.id), g.players.map((p) => p.id));
  assert.throws(() => applyAction(g, second, { type: "profile", faction: "joggeurs" }, rand, NOW), /alreadyStarted/);
  assert.throws(() => joinGame(g, { name: "Late" }, "h8", NOW), /alreadyStarted/);
  const view = publicGame(g, second);
  assert.ok(!JSON.stringify(view).includes("tokenHash") && !("requests" in view));
});

test("room: resign, finish reported once, rematch through the lobby", () => {
  let g = room(3);
  const [a, b, c] = g.players.map((p) => p.id);
  g = applyAction(g, a, { type: "start" }, rand, NOW);
  g = applyAction(g, c, { type: "resign" }, rand, NOW + 1);
  assert.ok(g.players[2].resigned && !g.players[2].left);
  assert.throws(() => applyAction(g, c, { type: "resign" }, rand, NOW + 2), /eliminated/);
  const stats = g.roster.map((s) => ({ id: s.id, tiles: 3, kills: 1, lost: 2, out: -1 }));
  assert.throws(() => applyAction(g, b, { type: "finish", match: 9, winner: a, ticks: 10, stats }, rand, NOW), /invalidPhase/);
  assert.throws(() => applyAction(g, b, { type: "finish", match: 1, winner: "nobody", ticks: 10, stats }, rand, NOW), /invalidAction/);
  assert.throws(() => applyAction(g, b, { type: "finish", match: 1, winner: a, ticks: 10, stats: stats.slice(1) }, rand, NOW), /invalidAction/);
  g = applyAction(g, b, { type: "finish", match: 1, winner: a, ticks: 3000, stats }, rand, NOW + 3);
  assert.equal(g.phase, "finished");
  assert.equal(g.result?.winner, a);
  const again = applyAction(g, c, { type: "finish", match: 1, winner: b, ticks: 1, stats }, rand, NOW + 4);
  assert.equal(again.result?.winner, a);
  assert.throws(() => applyAction(g, b, { type: "again" }, rand, NOW), /hostOnly/);
  g = applyAction(g, a, { type: "again" }, rand, NOW + 5);
  assert.equal(g.phase, "lobby");
  assert.ok(g.players.every((p) => !p.resigned));
  g = applyAction(g, a, { type: "start" }, rand, NOW + 6);
  assert.equal(g.match, 2);
});

test("room: leaving mid-game keeps the seat as eliminated; the host moves on", () => {
  let g = room(2);
  const [a, b] = g.players.map((p) => p.id);
  g = applyAction(g, a, { type: "start" }, rand, NOW);
  g = applyAction(g, a, { type: "leave" }, rand, NOW + 1);
  assert.ok(g.players[0].left && g.players[0].resigned);
  assert.equal(g.host, b);
  assert.throws(() => applyAction(g, a, { type: "heartbeat" }, rand, NOW + 2), /notMember/);
  g = applyAction(g, b, { type: "abort" }, rand, NOW + 3);
  assert.equal(g.phase, "lobby");
  assert.equal(g.players.length, 1);
  // Host transfer by arrival order after a long absence.
  let h = room(3);
  const [x, y, z] = h.players.map((p) => p.id);
  h = applyAction(h, y, { type: "heartbeat" }, rand, NOW + 50_000);
  h = applyAction(h, z, { type: "heartbeat" }, rand, NOW + 50_001);
  assert.equal(h.host, y);
  assert.notEqual(h.host, x);
});

test("capture takes 12 s alone and speeds up with more units, up to 2.4 times", () => {
  assert.equal(CAP / captureRate(1) / TPS, 12);
  for (let n = 1; n < 12; n++) assert.ok(captureRate(n + 1) >= captureRate(n));
  assert.equal(captureRate(8), captureRate(30));
  assert.ok(CAP / captureRate(30) / TPS >= 4.5);
  // One unit standing alone on a neutral cell.
  const s = createSim(9, ["mamies", "mamies"]);
  run(s, WARMUP + 1);
  const u = s.units.find((x) => x.o === 0)!;
  s.units = [u];
  for (const p of s.players) p.acc = -1e15;
  u.x = 7500; u.y = 7500; u.mv = 0;
  const t = tileOf(s, 7500, 7500);
  let ticks = 0;
  while (s.own[t] !== 0 && ticks < 1000) { step(s); u.x = 7500; u.y = 7500; ticks++; }
  assert.ok(ticks >= 12 * TPS && ticks <= 12 * TPS + 2, String(ticks));
});

test("a base turret needs five shots for any faction's unit", () => {
  for (const f of ["escargots", "joggeurs", "armoires", "mamies"] as const) {
    const s = createSim(3, ["mamies", f]);
    run(s, WARMUP + 1);
    s.units = [];
    for (const p of s.players) p.acc = -1e15;
    s.crateAt = Infinity;
    const p0 = s.players[0];
    const u = { id: s.next++, o: 1, k: 0 as const, x: p0.bx + 2200, y: p0.by, hp: 0, tx: p0.bx + 2200, ty: p0.by, mv: 0 as const, cd: 0, ig: 9999, idle: 0, life: -1, a: 0 };
    u.hp = unitStats(s, u).hp;
    s.units.push(u);
    let shots = 0;
    for (let i = 0; i < 200 && s.units.length; i++) { step(s); u.ig = 9999; shots += s.ev.filter((e) => e.t === "shot").length; }
    assert.equal(shots, 5, f);
  }
});

// The battle itself: a deterministic simulation run identically in every player's browser.
// Same seed + same orders at the same ticks ⇒ the same game, bit for bit. To keep that true:
// - positions, hit points and timers are integers (positions in milli-tiles, see M);
// - only + − × ÷, Math.sqrt, Math.round, Math.floor and Math.imul: no Math.sin, pow, hypot…
//   (their results may differ between browsers);
// - randomness comes only from `rand(s)`, whose state lives in the simulation;
// - iteration follows array order, never object-key or Set order of objects.
// The state is plain JSON: a snapshot is JSON.stringify(sim), and loading it continues the
// game exactly. `ev` is the only transient field: the events of the last tick, for sound and UI.
import { FACTIONS, type FactionId } from "./factions";

export const TICK_MS = 100;
export const TPS = 1000 / TICK_MS;
/** Milli-tiles per tile. */
export const M = 1000;
/** Ticks before the first units leave the bases: the fake loading screen runs meanwhile. */
export const WARMUP = 40;
/** Capture progress of a fully held tile. */
export const CAP = 1200;
/** A unit idle for this many ticks falls asleep (cosmetic). */
export const SLEEP_TICKS = 150;
export const BASE_HP = 3000;
export const MAP_SIZE: Record<number, number> = { 2: 15, 3: 17, 4: 19 };
/** Corner of each seat: 0 top, 1 right, 2 bottom, 3 left of the diamond. Seats 0 and 1 face each other. */
export const CORNERS: Record<number, number[]> = { 2: [0, 2], 3: [0, 2, 1], 4: [0, 2, 1, 3] };
export const CRATE_KINDS = ["coffee", "soup", "chicken", "reinforcements", "flash"] as const;

const MELEE = 450, AGGRO = 1000, SEP = 320, BASE_REACH = 2100, BASE_RANGE = 3000;
const HIT_TICKS = 10, BASE_SHOT_TICKS = 8, BASE_REGEN = 3, BASE_CALM = 50;
/** Capture speed per tick: one unit alone takes CAP / 10 = 12 s; each extra unit adds 20 %,
 *  up to 2.4 times faster (8 units and more: 5 s). Neutralising an enemy cell takes as long again. */
export const captureRate = (units: number) => (units <= 0 ? 0 : Math.min(24, 8 + 2 * units));
const DECAY = 4, REGEN = 10;
/** Spawn bonus per tile linked to the base, and its ceiling (+30 %). */
export const BONUS_PER_TILE = 0.01, BONUS_MAX = 0.3;
const MILITIA = { speed: 160, hp: 60, damage: 7, count: 4, life: 250, cooldown: 600 };
const CHICKEN = { speed: 180, hp: 600, damage: 25 };
const CRATE_FIRST = WARMUP + 300, CRATE_REACH = 550;
export const CRATE_EVERY = 450;
const BOOST_TICKS = 200, BOOST = 1.4, FREEZE_TICKS = 40, MAX_ORDERED = 600;
/** Ticks during which a unit that just got an order ignores enemies (to be able to retreat). */
export const IGNORE_TICKS = 8;

/** k: 0 regular, 1 militia (temporary), 2 giant chicken. */
export type Unit = {
  id: number; o: number; k: 0 | 1 | 2; x: number; y: number; hp: number;
  tx: number; ty: number; mv: 0 | 1; cd: number; ig: number; idle: number; life: number; a: number;
};
export type SimPlayer = {
  faction: FactionId; corner: number; bx: number; by: number; hp: number; alive: boolean;
  acc: number; rx: number; ry: number; boost: number; frozen: number; militia: number; calm: number; shot: number;
  kills: number; lost: number; caps: number; linked: number; out: number; conqueror: number;
};
export type Crate = { x: number; y: number };
export type SimEvent =
  | { t: "cap"; i: number; p: number }
  | { t: "lose"; i: number; p: number }
  | { t: "kill"; x: number; y: number; p: number; by: number }
  | { t: "shot"; p: number; x: number; y: number }
  | { t: "hit"; p: number }
  | { t: "elim"; p: number; by: number }
  | { t: "drop"; x: number; y: number }
  | { t: "crate"; p: number; k: number; x: number; y: number }
  | { t: "militia"; p: number }
  | { t: "win"; p: number };
export type Sim = {
  v: 1; n: number; tick: number; rng: number; next: number;
  players: SimPlayer[]; units: Unit[];
  /** Per tile: 0 path (never owned), 1 capturable cell, 2 base. */
  kind: number[];
  /** Per tile: owner seat or −1; capture progress; seat the progress counts for (−1 none). */
  own: number[]; prog: number[]; cap: number[];
  /** Per tile: 1 when the owned tile is linked to its owner's base (derived each tick). */
  lk: number[];
  crate: Crate | null; crateAt: number; over: boolean; winner: number; end: number;
  ev: SimEvent[];
};
export type Cmd =
  | { k: "mv"; u: number[]; x: number; y: number }
  | { k: "ra"; x: number; y: number }
  | { k: "rs" };
/** An order as scheduled: seat `p` gave command `c`. `c` comes from the network: untrusted. */
export type Order = { p: number; c: unknown };

export function rand(s: Sim) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (s: Sim, lo: number, hi: number) => lo + Math.floor(rand(s) * (hi - lo + 1));
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const d2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

/** Top-left tile of a corner's 3 × 3 base block. */
export function baseBlock(n: number, corner: number) {
  return { x: corner === 0 || corner === 3 ? 0 : n - 3, y: corner === 0 || corner === 1 ? 0 : n - 3 };
}
export const tileOf = (s: Pick<Sim, "n">, x: number, y: number) =>
  clamp(Math.floor(y / M), 0, s.n - 1) * s.n + clamp(Math.floor(x / M), 0, s.n - 1);

// Formation slots for a group move, nearest first.
const OFFSETS: { x: number; y: number }[] = [];
for (let j = -12; j <= 12; j++) for (let i = -12; i <= 12; i++) OFFSETS.push({ x: i * 330, y: j * 330 });
OFFSETS.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y) || a.y - b.y || a.x - b.x);

export function createSim(seed: number, factions: readonly FactionId[]): Sim {
  const count = factions.length, n = MAP_SIZE[count];
  if (!n) throw new Error("2 to 4 players");
  const kind: number[] = Array.from({ length: n * n }, (_, i) => ((i % n) + Math.floor(i / n)) % 2 === 0 ? 1 : 0);
  const own = Array(n * n).fill(-1), prog = Array(n * n).fill(0), cap = Array(n * n).fill(-1);
  const players = factions.map((faction, p): SimPlayer => {
    const corner = CORNERS[count][p], b = baseBlock(n, corner);
    for (let y = b.y; y < b.y + 3; y++) for (let x = b.x; x < b.x + 3; x++) {
      const i = y * n + x;
      kind[i] = 2; own[i] = p; prog[i] = CAP; cap[i] = p;
    }
    const bx = (b.x + 1.5) * M, by = (b.y + 1.5) * M;
    const sx = bx < (n * M) / 2 ? 1 : -1, sy = by < (n * M) / 2 ? 1 : -1;
    return {
      faction, corner, bx, by, hp: BASE_HP, alive: true, acc: 0, rx: bx + sx * 1900, ry: by + sy * 1900,
      boost: 0, frozen: 0, militia: 0, calm: 0, shot: 0, kills: 0, lost: 0, caps: 0, linked: 0, out: -1, conqueror: -1,
    };
  });
  const s: Sim = {
    v: 1, n, tick: 0, rng: seed | 0, next: 1, players, units: [], kind, own, prog, cap, lk: Array(n * n).fill(0),
    crate: null, crateAt: CRATE_FIRST, over: false, winner: -1, end: -1, ev: [],
  };
  link(s);
  return s;
}

export function unitStats(s: Sim, u: Pick<Unit, "o" | "k">) {
  if (u.k === 1) return MILITIA;
  if (u.k === 2) return CHICKEN;
  const p = s.players[u.o], f = FACTIONS[p.faction].stats;
  const speed = Math.round((f.speed * M) / TPS);
  return { speed: p.boost > 0 ? Math.round(speed * BOOST) : speed, hp: f.hp, damage: f.damage };
}
/** Ticks between two spawns for a seat, before the territory bonus. */
export const spawnTicks = (s: Sim, p: number) => Math.round(FACTIONS[s.players[p].faction].stats.spawn * TPS);
export const spawnBonus = (linked: number) => Math.min(BONUS_MAX, linked * BONUS_PER_TILE);

/** Moves u toward (x, y), stopping `stop` short; true when it got there. */
function moveToward(u: Unit, x: number, y: number, speed: number, stop: number) {
  const dx = x - u.x, dy = y - u.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d <= stop) return true;
  if (d - stop <= speed) {
    if (stop === 0) { u.x = x; u.y = y; }
    else { const k = (d - stop) / d; u.x += Math.round(dx * k); u.y += Math.round(dy * k); }
    return true;
  }
  u.x += Math.round((dx * speed) / d);
  u.y += Math.round((dy * speed) / d);
  return false;
}

function addUnit(s: Sim, o: number, k: Unit["k"], x: number, y: number, tx: number, ty: number) {
  const max = s.n * M - 50;
  const u: Unit = {
    id: s.next++, o, k, x: clamp(x, 50, max), y: clamp(y, 50, max), hp: 0,
    tx: clamp(tx, 50, max), ty: clamp(ty, 50, max), mv: tx === x && ty === y ? 0 : 1,
    cd: 0, ig: 0, idle: 0, life: k === 1 ? MILITIA.life : -1, a: 0,
  };
  u.hp = unitStats(s, u).hp;
  s.units.push(u);
  return u;
}
function spawnAtBase(s: Sim, o: number, k: Unit["k"] = 0) {
  const p = s.players[o], half = (s.n * M) / 2;
  const sx = p.bx < half ? 1 : -1, sy = p.by < half ? 1 : -1;
  return addUnit(s, o, k, p.bx + sx * 1100 + rint(s, -300, 300), p.by + sy * 1100 + rint(s, -300, 300),
    p.rx + rint(s, -350, 350), p.ry + rint(s, -350, 350));
}

function eliminate(s: Sim, p: number, by: number) {
  const pl = s.players[p];
  if (!pl.alive) return;
  pl.alive = false; pl.hp = 0; pl.out = s.tick; pl.conqueror = by;
  for (let i = 0; i < s.own.length; i++) {
    if (s.own[i] === p) { s.own[i] = -1; s.prog[i] = 0; s.cap[i] = -1; }
    else if (s.own[i] === -1 && s.cap[i] === p) { s.prog[i] = 0; s.cap[i] = -1; }
  }
  for (const u of s.units) if (u.o === p) u.hp = 0;
  s.units = s.units.filter((u) => u.hp > 0);
  s.ev.push({ t: "elim", p, by });
}

function applyOrder(s: Sim, o: Order) {
  const p = s.players[o.p], c = o.c as Record<string, unknown> | null;
  if (!p || !p.alive || s.over || !c || typeof c !== "object") return;
  const max = s.n * M - 100;
  const coord = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? clamp(Math.round(v), 100, max) : null);
  if (c.k === "rs") { eliminate(s, o.p, -1); return; }
  const x = coord(c.x), y = coord(c.y);
  if (x === null || y === null) return;
  if (c.k === "ra") { p.rx = x; p.ry = y; return; }
  if (c.k !== "mv" || !Array.isArray(c.u) || c.u.length > MAX_ORDERED) return;
  const wanted = new Set(c.u.filter((v): v is number => typeof v === "number"));
  // A click on a capturable cell aims at its centre, so the group stands on it.
  const t = tileOf(s, x, y);
  const cx = s.kind[t] === 1 ? (t % s.n) * M + M / 2 : x, cy = s.kind[t] === 1 ? Math.floor(t / s.n) * M + M / 2 : y;
  const group = s.units.filter((u) => u.o === o.p && wanted.has(u.id))
    .sort((a, b) => d2(a.x, a.y, cx, cy) - d2(b.x, b.y, cx, cy) || a.id - b.id);
  group.forEach((u, i) => {
    const off = OFFSETS[i];
    u.tx = clamp(cx + off.x, 50, max + 50); u.ty = clamp(cy + off.y, 50, max + 50);
    u.mv = 1; u.ig = IGNORE_TICKS; u.idle = 0;
  });
}

function units(s: Sim) {
  const n = s.n, us = s.units, len = us.length;
  const head = new Int32Array(n * n).fill(-1), nxt = new Int32Array(len);
  for (let i = len - 1; i >= 0; i--) { const c = tileOf(s, us[i].x, us[i].y); nxt[i] = head[c]; head[c] = i; }
  const dmg = new Int32Array(len), killer = new Int32Array(len).fill(-1);
  const baseDmg = new Int32Array(s.players.length), baseBy = new Int32Array(s.players.length).fill(-1);
  for (let i = 0; i < len; i++) {
    const u = us[i], p = s.players[u.o];
    if (u.cd > 0) u.cd--;
    if (u.ig > 0) u.ig--;
    if (u.a > 0) u.a--;
    if (u.k === 1 && --u.life <= 0) { u.hp = 0; continue; }
    if (p.frozen > 0) continue;
    const st = unitStats(s, u);
    let best = -1, bd = AGGRO * AGGRO + 1;
    if (u.ig === 0) {
      const cx = clamp(Math.floor(u.x / M), 0, n - 1), cy = clamp(Math.floor(u.y / M), 0, n - 1);
      for (let gy = Math.max(0, cy - 1); gy <= Math.min(n - 1, cy + 1); gy++)
        for (let gx = Math.max(0, cx - 1); gx <= Math.min(n - 1, cx + 1); gx++)
          for (let j = head[gy * n + gx]; j >= 0; j = nxt[j]) {
            const v = us[j];
            if (v.o === u.o || v.hp <= 0) continue;
            const d = d2(u.x, u.y, v.x, v.y);
            if (d < bd) { bd = d; best = j; }
          }
    }
    if (best >= 0) {
      u.idle = 0;
      if (bd <= MELEE * MELEE) {
        if (u.cd === 0) { dmg[best] += st.damage; killer[best] = u.o; u.cd = HIT_TICKS; u.a = 4; }
      } else moveToward(u, us[best].x, us[best].y, st.speed, MELEE - 80);
      continue;
    }
    let base = -1;
    for (let q = 0; q < s.players.length; q++) {
      const e = s.players[q];
      if (q === u.o || !e.alive || d2(u.x, u.y, e.bx, e.by) > BASE_REACH * BASE_REACH) continue;
      if (u.mv && d2(u.tx, u.ty, e.bx, e.by) > BASE_REACH * BASE_REACH) continue;
      base = q;
      break;
    }
    if (base >= 0) {
      u.idle = 0;
      if (u.cd === 0) { baseDmg[base] += st.damage; baseBy[base] = u.o; u.cd = HIT_TICKS; u.a = 4; }
      continue;
    }
    if (u.mv) { u.idle = 0; if (moveToward(u, u.tx, u.ty, st.speed, 0)) u.mv = 0; }
    else u.idle++;
  }
  // Keep units from stacking on one point; pairs from the grid built at the start of the tick.
  for (let i = 0; i < len; i++) {
    const a = us[i], cx = clamp(Math.floor(a.x / M), 0, n - 1), cy = clamp(Math.floor(a.y / M), 0, n - 1);
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(n - 1, cy + 1); gy++)
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(n - 1, cx + 1); gx++)
        for (let j = head[gy * n + gx]; j >= 0; j = nxt[j]) {
          if (j <= i) continue;
          const b = us[j];
          let dx = b.x - a.x, dy = b.y - a.y, dd = dx * dx + dy * dy;
          if (dd >= SEP * SEP) continue;
          if (dd === 0) { dx = ((a.id * 7 + b.id * 13) % 11) - 5 || 1; dy = ((a.id * 3 + b.id * 5) % 11) - 5; dd = dx * dx + dy * dy; }
          const d = Math.sqrt(dd), push = (SEP - d) / 2;
          const ox = Math.round((dx / d) * push), oy = Math.round((dy / d) * push);
          a.x -= ox; a.y -= oy; b.x += ox; b.y += oy;
        }
  }
  const max = n * M - 50;
  for (let i = 0; i < len; i++) {
    const u = us[i];
    u.x = clamp(u.x, 50, max); u.y = clamp(u.y, 50, max);
    if (!dmg[i] || u.hp <= 0) continue;
    u.hp -= dmg[i];
    if (u.hp <= 0) {
      s.players[killer[i]].kills++; s.players[u.o].lost++;
      s.ev.push({ t: "kill", x: u.x, y: u.y, p: u.o, by: killer[i] });
    }
  }
  return { baseDmg, baseBy };
}

/** A turret shot takes 22 % of the target's maximum health (at most 40): every faction's unit
 *  falls in five shots. A flat damage would favour the factions with more health. */
const turretDamage = (s: Sim, u: Unit) => Math.min(40, Math.round(unitStats(s, u).hp * 0.22));

function bases(s: Sim, baseDmg: Int32Array, baseBy: Int32Array) {
  for (let q = 0; q < s.players.length; q++) {
    const p = s.players[q];
    if (!p.alive) continue;
    if (p.frozen > 0) p.frozen--;
    if (p.boost > 0) p.boost--;
    if (p.militia > 0) p.militia--;
    if (p.shot > 0) p.shot--;
    // The base defends itself: one shot at the nearest enemy in range.
    let target: Unit | null = null, bd = BASE_RANGE * BASE_RANGE + 1;
    for (const u of s.units) {
      if (u.o === q || u.hp <= 0) continue;
      const d = d2(u.x, u.y, p.bx, p.by);
      if (d < bd) { bd = d; target = u; }
    }
    if (target) {
      p.calm = 0;
      if (p.shot === 0) {
        p.shot = BASE_SHOT_TICKS;
        target.hp -= turretDamage(s, target);
        s.ev.push({ t: "shot", p: q, x: target.x, y: target.y });
        if (target.hp <= 0) {
          p.kills++; s.players[target.o].lost++;
          s.ev.push({ t: "kill", x: target.x, y: target.y, p: target.o, by: q });
        }
      }
    } else if (++p.calm > BASE_CALM) p.hp = Math.min(BASE_HP, p.hp + BASE_REGEN);
    if (baseDmg[q]) { p.hp -= baseDmg[q]; s.ev.push({ t: "hit", p: q }); }
    if (p.hp <= 0) { eliminate(s, q, baseBy[q]); continue; }
    // Last-ditch militia when the base is badly damaged.
    if (p.hp < BASE_HP / 2 && p.militia === 0) {
      p.militia = MILITIA.cooldown;
      for (let m = 0; m < MILITIA.count; m++) {
        const ang = [[1, 0], [0, 1], [-1, 0], [0, -1]][m];
        addUnit(s, q, 1, p.bx + ang[0] * 900, p.by + ang[1] * 900, p.bx + ang[0] * 900, p.by + ang[1] * 900);
      }
      s.ev.push({ t: "militia", p: q });
    }
  }
}

function capture(s: Sim) {
  const size = s.n * s.n, occ = new Int32Array(size).fill(-1), cnt = new Int32Array(size);
  for (const u of s.units) {
    const t = tileOf(s, u.x, u.y);
    if (s.kind[t] !== 1) continue;
    if (occ[t] === -1) { occ[t] = u.o; cnt[t] = 1; }
    else if (occ[t] === u.o) cnt[t]++;
    else occ[t] = -2;
  }
  for (let t = 0; t < size; t++) {
    if (s.kind[t] !== 1) continue;
    const o = occ[t];
    if (o >= 0) {
      const rate = captureRate(cnt[t]);
      if (s.cap[t] === o) {
        s.prog[t] = Math.min(CAP, s.prog[t] + rate);
        if (s.own[t] !== o && s.prog[t] === CAP) { s.own[t] = o; s.players[o].caps++; s.ev.push({ t: "cap", i: t, p: o }); }
      } else {
        s.prog[t] -= rate;
        if (s.prog[t] <= 0) {
          s.prog[t] = 0;
          if (s.own[t] !== -1) { s.ev.push({ t: "lose", i: t, p: s.own[t] }); s.own[t] = -1; }
          s.cap[t] = o;
        }
      }
    } else if (o === -1) {
      if (s.own[t] === -1 && s.prog[t] > 0) { s.prog[t] = Math.max(0, s.prog[t] - DECAY); if (!s.prog[t]) s.cap[t] = -1; }
      else if (s.own[t] >= 0) s.prog[t] = Math.min(CAP, s.prog[t] + REGEN);
    }
  }
}

/** Marks owned cells linked to their base by a chain of diagonal neighbours (cells touch by corners). */
function link(s: Sim) {
  const n = s.n;
  s.lk.fill(0);
  s.players.forEach((p, q) => {
    p.linked = 0;
    if (!p.alive) return;
    const b = baseBlock(n, p.corner), queue: number[] = [];
    for (let y = Math.max(0, b.y - 1); y <= Math.min(n - 1, b.y + 3); y++)
      for (let x = Math.max(0, b.x - 1); x <= Math.min(n - 1, b.x + 3); x++) {
        const i = y * n + x;
        if (s.kind[i] === 1 && s.own[i] === q && !s.lk[i]) { s.lk[i] = 1; queue.push(i); }
      }
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k], x = i % n, y = Math.floor(i / n);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = x + dx, ny = y + dy, j = ny * n + nx;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n || s.lk[j] || s.kind[j] !== 1 || s.own[j] !== q) continue;
        s.lk[j] = 1; queue.push(j);
      }
    }
    p.linked = queue.length;
  });
}

function spawn(s: Sim) {
  s.players.forEach((p, q) => {
    if (!p.alive) return;
    const every = spawnTicks(s, q) * 1000;
    p.acc += Math.round(1000 * (1 + spawnBonus(p.linked)));
    while (p.acc >= every) { p.acc -= every; spawnAtBase(s, q); }
  });
}

function crates(s: Sim) {
  if (!s.crate && s.tick >= s.crateAt) {
    const q = Math.floor(s.n / 4), c = Math.floor(s.n / 2);
    s.crate = { x: rint(s, c - q, c + q) * M + M / 2, y: rint(s, c - q, c + q) * M + M / 2 };
    s.ev.push({ t: "drop", x: s.crate.x, y: s.crate.y });
  }
  const c = s.crate;
  if (!c) return;
  const u = s.units.find((u) => u.hp > 0 && d2(u.x, u.y, c.x, c.y) <= CRATE_REACH * CRATE_REACH);
  if (!u) return;
  const k = rint(s, 0, CRATE_KINDS.length - 1), p = s.players[u.o];
  s.crate = null; s.crateAt = s.tick + CRATE_EVERY;
  s.ev.push({ t: "crate", p: u.o, k, x: c.x, y: c.y });
  const kind = CRATE_KINDS[k];
  if (kind === "coffee") p.boost = BOOST_TICKS;
  else if (kind === "soup") { for (const v of s.units) if (v.o === u.o) v.hp = unitStats(s, v).hp; }
  else if (kind === "chicken") addUnit(s, u.o, 2, c.x, c.y, c.x, c.y);
  else if (kind === "reinforcements") for (let m = 0; m < 5; m++) spawnAtBase(s, u.o);
  else s.players.forEach((e, q) => { if (q !== u.o && e.alive) e.frozen = FREEZE_TICKS; });
}

function victory(s: Sim) {
  if (s.over) return;
  const alive = s.players.flatMap((p, q) => (p.alive ? [q] : []));
  if (alive.length > 1) return;
  s.over = true; s.winner = alive[0] ?? -1; s.end = s.tick;
  s.ev.push({ t: "win", p: s.winner });
}

/** Runs tick `s.tick` with the orders scheduled for it, in their scheduled order. */
export function step(s: Sim, orders: readonly Order[] = []) {
  s.ev = [];
  for (const o of orders) applyOrder(s, o);
  if (s.tick === WARMUP) s.players.forEach((p, q) => { if (p.alive) for (let m = 0; m < 3; m++) spawnAtBase(s, q); });
  if (s.tick >= WARMUP) {
    const { baseDmg, baseBy } = units(s);
    bases(s, baseDmg, baseBy);
    s.units = s.units.filter((u) => u.hp > 0);
    capture(s);
  }
  link(s);
  if (s.tick >= WARMUP) {
    spawn(s);
    crates(s);
  }
  victory(s);
  s.tick++;
}

/** Fingerprint of the whole state, compared between browsers to detect a desync. */
export function hash(s: Sim) {
  let h = 2166136261 | 0;
  const mix = (v: number) => { h = Math.imul(h ^ (v | 0), 16777619); };
  mix(s.tick); mix(s.rng); mix(s.next); mix(s.crateAt); mix(s.units.length);
  for (const u of s.units) { mix(u.id); mix(u.o); mix(u.x); mix(u.y); mix(u.hp); mix(u.mv); mix(u.tx); mix(u.ty); mix(u.cd); }
  for (let i = 0; i < s.own.length; i++) { mix(s.own[i]); mix(s.prog[i]); mix(s.cap[i]); }
  for (const p of s.players) { mix(p.hp); mix(p.acc); mix(p.rx); mix(p.ry); mix(p.alive ? 1 : 0); mix(p.boost); mix(p.frozen); }
  return h >>> 0;
}

/** A copy that shares nothing with `s` (what a snapshot carries). */
export const cloneSim = (s: Sim): Sim => ({ ...JSON.parse(JSON.stringify(s)), ev: [] });

export function ownedTiles(s: Sim, p: number) {
  let c = 0;
  for (let i = 0; i < s.own.length; i++) if (s.own[i] === p && s.kind[i] === 1) c++;
  return c;
}
export const cellCount = (s: Sim) => s.kind.reduce((c, k) => c + (k === 1 ? 1 : 0), 0);

// Isometric drawing on a 2D canvas, outside React. Everything is drawn with paths (no image files):
// the board, the bases, one little character per faction, effects and the minimap.
// World coordinates are the simulation's milli-tiles; `project` turns them into screen pixels.
import { BASE_HP, CAP, M, SLEEP_TICKS, baseBlock, unitStats, type Sim, type Unit } from "../sim";
import { COLORS, FACTIONS } from "../factions";

export const TW = 64, TH = 32;
const HX = TW / 2 / M, HY = TH / 2 / M;
export const MIN_ZOOM = 0.45, MAX_ZOOM = 2.2;

export type Fx = {
  k: "puff" | "shot" | "text" | "ring" | "drop";
  x: number; y: number; at: number; text?: string; color?: string; fx?: number; fy?: number; rally?: boolean;
};
export type Bubble = { id: number; text: string; at: number };
export type View = {
  w: number; h: number; cx: number; cy: number; zoom: number; seat: number;
  selected: Set<number>; baseSel: boolean;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  fx: Fx[]; bubbles: Bubble[]; names: string[];
};

export function project(v: View, x: number, y: number): [number, number] {
  return [v.w / 2 + (x - v.cx - (y - v.cy)) * HX * v.zoom, v.h / 2 + (x - v.cx + (y - v.cy)) * HY * v.zoom];
}
export function unproject(v: View, sx: number, sy: number): [number, number] {
  const a = (sx - v.w / 2) / (HX * v.zoom), b = (sy - v.h / 2) / (HY * v.zoom);
  return [v.cx + (a + b) / 2, v.cy + (b - a) / 2];
}
/** Moves the camera by a screen offset. */
export function panBy(v: View, n: number, dsx: number, dsy: number) {
  const a = dsx / (HX * v.zoom), b = dsy / (HY * v.zoom);
  v.cx = Math.max(0, Math.min(n * M, v.cx + (a + b) / 2));
  v.cy = Math.max(0, Math.min(n * M, v.cy + (b - a) / 2));
}
export function unitPos(u: Unit, prev: Map<number, [number, number]>, alpha: number): [number, number] {
  const p = prev.get(u.id);
  return p ? [p[0] + (u.x - p[0]) * alpha, p[1] + (u.y - p[1]) * alpha] : [u.x, u.y];
}

const mixCache = new Map<string, string>();
export function mix(a: string, b: string, t: number) {
  const key = a + b + t;
  let c = mixCache.get(key);
  if (!c) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    c = `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    mixCache.set(key, c);
  }
  return c;
}

const BEIGE = "#f6e9c4", BEIGE_EDGE = "#d9c48c", GRASS = ["#8fd36a", "#86cb60", "#93d870"], INK = "#2b2118";

function diamond(ctx: CanvasRenderingContext2D, v: View, x: number, y: number, inset = 0, scale = 1) {
  // Tile (x, y) in tiles; inset in tiles; scale around the centre.
  const c = (x + 0.5) * M, d = (y + 0.5) * M, r = (0.5 - inset) * M * scale;
  const p = [project(v, c - r, d - r), project(v, c + r, d - r), project(v, c + r, d + r), project(v, c - r, d + r)];
  ctx.beginPath();
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]);
  ctx.closePath();
}

function background(ctx: CanvasRenderingContext2D, v: View, now: number) {
  const g = ctx.createLinearGradient(0, 0, 0, v.h);
  g.addColorStop(0, "#5cc8ff");
  g.addColorStop(1, "#d8f4ff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.w, v.h);
  // A few lazy clouds.
  ctx.fillStyle = "#ffffffcc";
  for (let i = 0; i < 5; i++) {
    const x = ((i * 397 + now / (60 + i * 14)) % (v.w + 300)) - 150, y = 40 + ((i * 131) % Math.max(60, v.h * 0.5));
    ctx.beginPath();
    ctx.ellipse(x, y, 60, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 35, y - 10, 38, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 30, y - 6, 30, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function slab(ctx: CanvasRenderingContext2D, v: View, n: number) {
  const depth = 22 * v.zoom;
  const a = project(v, n * M, 0), b = project(v, n * M, n * M), c = project(v, 0, n * M);
  ctx.fillStyle = "#a8743f";
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(b[0], b[1] + depth); ctx.lineTo(a[0], a[1] + depth); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#8a5c2f";
  ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(b[0], b[1] + depth); ctx.lineTo(c[0], c[1] + depth); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#5a3a1c"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a[0], a[1] + depth); ctx.lineTo(b[0], b[1] + depth); ctx.lineTo(c[0], c[1] + depth); ctx.stroke();
}

function tiles(ctx: CanvasRenderingContext2D, s: Sim, v: View) {
  const n = s.n, margin = TW * v.zoom;
  ctx.lineJoin = "round";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const [sx, sy] = project(v, (x + 0.5) * M, (y + 0.5) * M);
    if (sx < -margin || sx > v.w + margin || sy < -margin || sy > v.h + margin) continue;
    const i = y * n + x, kind = s.kind[i], own = s.own[i];
    if (kind === 0) {
      diamond(ctx, v, x, y);
      ctx.fillStyle = GRASS[(x * 7 + y * 13) % 3];
      ctx.fill();
      continue;
    }
    if (kind === 2) {
      diamond(ctx, v, x, y);
      ctx.fillStyle = own >= 0 ? mix(COLORS[own], "#000000", 0.25) : "#8d8a83";
      ctx.fill();
      ctx.strokeStyle = own >= 0 ? mix(COLORS[own], "#000000", 0.45) : "#6d6a63";
      ctx.lineWidth = 1;
      ctx.stroke();
      continue;
    }
    // Capturable cell: a raised slab.
    const linked = s.lk[i] === 1, prog = s.prog[i], cap = s.cap[i];
    diamond(ctx, v, x, y);
    ctx.fillStyle = GRASS[(x * 7 + y * 13) % 3];
    ctx.fill();
    diamond(ctx, v, x, y, 0.05);
    const full = own >= 0 && prog >= CAP;
    ctx.fillStyle = full ? (linked ? mix(COLORS[own], "#ffffff", 0.12) : mix(COLORS[own], BEIGE, 0.55)) : BEIGE;
    ctx.fill();
    if (!full && prog > 0 && cap >= 0) {
      diamond(ctx, v, x, y, 0.05, Math.sqrt(prog / CAP));
      ctx.fillStyle = own >= 0 ? COLORS[own] : mix(COLORS[cap], BEIGE, 0.3);
      ctx.fill();
    }
    diamond(ctx, v, x, y, 0.05);
    ctx.lineWidth = Math.max(1, 1.5 * v.zoom);
    ctx.strokeStyle = full ? mix(COLORS[own], "#000000", 0.35) : BEIGE_EDGE;
    if (full && !linked) ctx.setLineDash([4 * v.zoom, 3 * v.zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, ratio: number, z: number) {
  const h = Math.max(3, 4 * z);
  ctx.fillStyle = "#000000aa";
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = ratio > 0.5 ? "#3ee05a" : ratio > 0.25 ? "#ffc600" : "#ff3b3b";
  ctx.fillRect(x - w / 2, y, w * Math.max(0, ratio), h);
}

function drawBase(ctx: CanvasRenderingContext2D, s: Sim, v: View, q: number, now: number) {
  const p = s.players[q], z = v.zoom, color = COLORS[q];
  const corners = (r: number): [number, number][] => [project(v, p.bx - r, p.by - r), project(v, p.bx + r, p.by - r), project(v, p.bx + r, p.by + r), project(v, p.bx - r, p.by + r)];
  if (!p.alive) {
    ctx.fillStyle = "#7b7770";
    for (let k = 0; k < 6; k++) {
      const [x, y] = project(v, p.bx + ((k * 337) % 1200) - 600, p.by + ((k * 571) % 1200) - 600);
      ctx.beginPath(); ctx.moveTo(x - 9 * z, y); ctx.lineTo(x, y - 8 * z); ctx.lineTo(x + 10 * z, y - 2 * z); ctx.lineTo(x + 4 * z, y + 4 * z); ctx.closePath(); ctx.fill();
    }
    const [x, y] = project(v, p.bx, p.by);
    ctx.fillStyle = "#c9c2b4"; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.fillRect(x - 14 * z, y - 30 * z, 28 * z, 16 * z); ctx.strokeRect(x - 14 * z, y - 30 * z, 28 * z, 16 * z);
    ctx.fillRect(x - 2 * z, y - 14 * z, 4 * z, 14 * z);
    ctx.fillStyle = INK; ctx.font = `bold ${Math.round(10 * z)}px "Comic Sans MS", "Comic Neue", cursive`; ctx.textAlign = "center";
    ctx.fillText("RIP", x, y - 18 * z);
    return;
  }
  // Iso box: walls, then a tower with a pointed roof and a flag.
  const box = (r: number, h: number, top: string, left: string, right: string) => {
    const c = corners(r);
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, 1.4 * z);
    ctx.fillStyle = left;
    ctx.beginPath(); ctx.moveTo(c[3][0], c[3][1]); ctx.lineTo(c[2][0], c[2][1]); ctx.lineTo(c[2][0], c[2][1] - h); ctx.lineTo(c[3][0], c[3][1] - h); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = right;
    ctx.beginPath(); ctx.moveTo(c[1][0], c[1][1]); ctx.lineTo(c[2][0], c[2][1]); ctx.lineTo(c[2][0], c[2][1] - h); ctx.lineTo(c[1][0], c[1][1] - h); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = top;
    ctx.beginPath(); c.forEach(([x, y], k) => (k ? ctx.lineTo(x, y - h) : ctx.moveTo(x, y - h))); ctx.closePath(); ctx.fill(); ctx.stroke();
    return c;
  };
  box(820, 26 * z, "#eadfc4", "#cdbb92", "#b19d72");
  // Crenels along the front edges.
  const c = corners(820);
  ctx.fillStyle = mix(color, "#ffffff", 0.2);
  for (let k = 0; k <= 4; k++) for (const [a, b] of [[c[3], c[2]], [c[1], c[2]]] as const) {
    const x = a[0] + ((b[0] - a[0]) * k) / 4, y = a[1] + ((b[1] - a[1]) * k) / 4 - 26 * z;
    ctx.fillRect(x - 3 * z, y - 6 * z, 6 * z, 6 * z);
  }
  const tower = box(380, 58 * z, "#f3ead6", "#d6c6a0", "#bba67c");
  const [tx, ty] = project(v, p.bx, p.by);
  const top = ty - 58 * z;
  ctx.fillStyle = color; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.moveTo(tower[3][0], tower[3][1] - 58 * z); ctx.lineTo(tx, top - 30 * z); ctx.lineTo(tower[1][0], tower[1][1] - 58 * z); ctx.lineTo(tower[2][0], tower[2][1] - 58 * z); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Flag.
  const wave = Math.sin(now / 180 + q) * 3 * z;
  ctx.beginPath(); ctx.moveTo(tx, top - 30 * z); ctx.lineTo(tx, top - 52 * z); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(tx, top - 52 * z); ctx.quadraticCurveTo(tx + 10 * z, top - 50 * z + wave, tx + 20 * z, top - 46 * z); ctx.lineTo(tx, top - 40 * z); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Door.
  const [dx, dy] = project(v, p.bx + 820, p.by + 300);
  ctx.fillStyle = "#6b4423";
  ctx.beginPath(); ctx.ellipse(dx - 3 * z, dy - 9 * z, 5 * z, 9 * z, 0, Math.PI, 0); ctx.lineTo(dx + 2 * z, dy); ctx.lineTo(dx - 8 * z, dy); ctx.closePath(); ctx.fill();
  hpBar(ctx, tx, top - 66 * z, 70 * z, p.hp / BASE_HP, z);
  if (z > 0.6) {
    ctx.font = `bold ${Math.round(12 * Math.min(1.3, z))}px "Comic Sans MS", "Comic Neue", cursive`;
    ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#ffffff"; ctx.fillStyle = INK;
    ctx.strokeText(v.names[q] ?? "", tx, top - 72 * z); ctx.fillText(v.names[q] ?? "", tx, top - 72 * z);
  }
}

function unitBody(ctx: CanvasRenderingContext2D, faction: keyof typeof FACTIONS, k: Unit["k"], color: string, z: number, t: number, moving: boolean) {
  const look = FACTIONS[faction].look, swing = moving ? Math.sin(t / 70) : 0;
  ctx.lineWidth = Math.max(1, 1.2 * z); ctx.strokeStyle = INK;
  const circle = (x: number, y: number, r: number, fillStyle: string) => { ctx.fillStyle = fillStyle; ctx.beginPath(); ctx.arc(x * z, y * z, r * z, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
  if (k === 2) {
    // Giant chicken.
    ctx.strokeStyle = "#e08a00"; ctx.lineWidth = 2.5 * z;
    ctx.beginPath(); ctx.moveTo(-4 * z, -6 * z); ctx.lineTo(-4 * z + swing * 3 * z, 0); ctx.moveTo(4 * z, -6 * z); ctx.lineTo(4 * z - swing * 3 * z, 0); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, 1.4 * z);
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.ellipse(0, -16 * z, 14 * z, 11 * z, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12 * z, -20 * z); ctx.lineTo(-20 * z, -30 * z); ctx.lineTo(-8 * z, -24 * z); ctx.closePath(); ctx.fill(); ctx.stroke();
    circle(10, -30, 7, "#ffffff");
    ctx.fillStyle = "#ff3030"; ctx.beginPath(); ctx.arc(8 * z, -38 * z, 3 * z, 0, Math.PI * 2); ctx.arc(12 * z, -39 * z, 3 * z, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffb000"; ctx.beginPath(); ctx.moveTo(16 * z, -31 * z); ctx.lineTo(23 * z, -29 * z); ctx.lineTo(16 * z, -27 * z); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(12 * z, -32 * z, 1.4 * z, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.fillRect(2 * z, -25 * z, 14 * z, 4 * z); ctx.strokeRect(2 * z, -25 * z, 14 * z, 4 * z);
    return 44;
  }
  if (k === 1) {
    // Slipper-wearing uncle.
    ctx.fillStyle = "#ff8fc7"; ctx.beginPath(); ctx.ellipse((-3 + swing * 2) * z, -1 * z, 3.5 * z, 1.8 * z, 0, 0, Math.PI * 2); ctx.ellipse((3 - swing * 2) * z, -1 * z, 3.5 * z, 1.8 * z, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, -8 * z, 6 * z, 6.5 * z, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    circle(0, -17, 3.6, "#f2c6a0");
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6 * z; ctx.beginPath(); ctx.moveTo(-2.5 * z, -15.6 * z); ctx.lineTo(2.5 * z, -15.6 * z); ctx.stroke();
    return 22;
  }
  if (faction === "escargots") {
    ctx.fillStyle = look.body;
    ctx.beginPath(); ctx.ellipse((1 + swing) * z, -3 * z, 9 * z, 3 * z, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6 * z, -5 * z); ctx.lineTo(8 * z, -12 * z); ctx.moveTo(4 * z, -5 * z); ctx.lineTo(4.5 * z, -12 * z); ctx.stroke();
    circle(8, -12.5, 1.6, "#ffffff"); circle(4.5, -12.5, 1.6, "#ffffff");
    circle(-1, -10, 6.5, color);
    ctx.strokeStyle = look.trim; ctx.lineWidth = 1.5 * z;
    ctx.beginPath(); ctx.arc(-1 * z, -10 * z, 4 * z, 0, Math.PI * 1.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(-1 * z, -10 * z, 1.8 * z, Math.PI, Math.PI * 2.4); ctx.stroke();
    return 18;
  }
  if (faction === "joggeurs") {
    ctx.strokeStyle = INK; ctx.lineWidth = 2 * z;
    ctx.beginPath(); ctx.moveTo(0, -8 * z); ctx.lineTo(-3 * z * (0.4 + swing), 0); ctx.moveTo(0, -8 * z); ctx.lineTo(3 * z * (0.4 + swing), 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -13 * z); ctx.lineTo(4 * z, (-9 - swing * 3) * z); ctx.moveTo(0, -13 * z); ctx.lineTo(-4 * z, (-9 + swing * 3) * z); ctx.stroke();
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.fillStyle = color; ctx.fillRect(-3.2 * z, -15 * z, 6.4 * z, 7.5 * z); ctx.strokeRect(-3.2 * z, -15 * z, 6.4 * z, 7.5 * z);
    circle(0, -18.5, 3.4, look.body);
    ctx.fillStyle = look.trim; ctx.fillRect(-3.6 * z, -20.5 * z, 7.2 * z, 1.8 * z);
    return 23;
  }
  if (faction === "armoires") {
    const wob = moving ? swing * 0.08 : 0;
    ctx.rotate(wob);
    ctx.fillStyle = INK; ctx.fillRect(-5 * z, -2 * z, 2 * z, 2 * z); ctx.fillRect(3 * z, -2 * z, 2 * z, 2 * z);
    ctx.fillStyle = look.body; ctx.fillRect(-6.5 * z, -20 * z, 13 * z, 18 * z); ctx.strokeRect(-6.5 * z, -20 * z, 13 * z, 18 * z);
    ctx.beginPath(); ctx.moveTo(0, -20 * z); ctx.lineTo(0, -2 * z); ctx.stroke();
    ctx.fillStyle = color; ctx.fillRect(-7.5 * z, -23 * z, 15 * z, 3.5 * z); ctx.strokeRect(-7.5 * z, -23 * z, 15 * z, 3.5 * z);
    circle(-3, -15, 1.6, "#ffffff"); circle(3, -15, 1.6, "#ffffff");
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-2.6 * z, -15 * z, 0.7 * z, 0, Math.PI * 2); ctx.arc(3.4 * z, -15 * z, 0.7 * z, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e7c34a"; ctx.beginPath(); ctx.arc(-1.5 * z, -9 * z, 0.9 * z, 0, Math.PI * 2); ctx.arc(1.5 * z, -9 * z, 0.9 * z, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(-wob);
    return 25;
  }
  // Grannies.
  ctx.strokeStyle = "#6b4423"; ctx.lineWidth = 1.6 * z;
  ctx.beginPath(); ctx.moveTo(6 * z, 0); ctx.lineTo(6 * z, -10 * z); ctx.arc(4.5 * z, -10 * z, 1.5 * z, 0, Math.PI, true); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, 1.2 * z);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo((-6 + swing) * z, 0); ctx.lineTo((6 + swing) * z, 0); ctx.lineTo(1.5 * z, -14 * z); ctx.lineTo(-1.5 * z, -14 * z); ctx.closePath(); ctx.fill(); ctx.stroke();
  circle(0, -16.5, 3.6, "#f2d2b6");
  circle(0, -21, 2.6, look.body);
  ctx.beginPath(); ctx.arc(-1.4 * z, -16.6 * z, 1.1 * z, 0, Math.PI * 2); ctx.arc(1.4 * z, -16.6 * z, 1.1 * z, 0, Math.PI * 2); ctx.stroke();
  return 24;
}

function drawUnit(ctx: CanvasRenderingContext2D, s: Sim, v: View, u: Unit, x: number, y: number, face: number, moving: boolean, now: number) {
  const z = v.zoom, p = s.players[u.o], color = COLORS[u.o], sel = u.o === v.seat && v.selected.has(u.id);
  const big = u.k === 2 ? 1.8 : 1;
  ctx.fillStyle = "#00000040";
  ctx.beginPath(); ctx.ellipse(x, y, 8 * z * big, 4 * z * big, 0, 0, Math.PI * 2); ctx.fill();
  if (sel) {
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, 11 * z * big, 5.5 * z * big, 0, 0, Math.PI * 2); ctx.stroke();
  }
  const bob = moving ? Math.abs(Math.sin(now / 90 + u.id)) * 2 * z : 0, lunge = u.a > 0 ? 3 * z : 0;
  ctx.save();
  ctx.translate(x + lunge * face, y - bob);
  ctx.scale(face, 1);
  const height = unitBody(ctx, p.faction, u.k, color, z, now + u.id * 37, moving);
  ctx.restore();
  if (p.frozen > 0) {
    ctx.fillStyle = "#9fe3ff80";
    ctx.beginPath(); ctx.ellipse(x, y - height * z * 0.5, 9 * z * big, height * z * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  }
  const max = unitStats(s, u).hp;
  if (u.hp < max) hpBar(ctx, x, y - (height + 6) * z, 16 * z * big, u.hp / max, z * 0.7);
  if (!moving && !u.mv && u.idle >= SLEEP_TICKS && u.a === 0) {
    const k = (now / 600 + u.id) % 3;
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.font = `bold ${Math.round((9 + k * 2) * z)}px "Comic Sans MS", "Comic Neue", cursive`;
    ctx.strokeText("z", x + (6 + k * 4) * z, y - (height + 4 + k * 6) * z);
    ctx.fillText("z", x + (6 + k * 4) * z, y - (height + 4 + k * 6) * z);
  }
  return height;
}

function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, z: number) {
  ctx.font = `bold ${Math.round(12 * Math.min(1.2, Math.max(0.9, z)))}px "Comic Sans MS", "Comic Neue", cursive`;
  const w = ctx.measureText(text).width + 14, h = 22, bx = x - w / 2, by = y - h - 10;
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 9);
  ctx.moveTo(x - 4, by + h); ctx.lineTo(x, by + h + 8); ctx.lineTo(x + 5, by + h);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ffffff"; ctx.fillRect(x - 3, by + h - 2, 7, 3);
  ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, x, by + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
}

function crate(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, now: number) {
  const s = 9 * z, lift = Math.abs(Math.sin(now / 300)) * 2 * z;
  ctx.fillStyle = "#00000040"; ctx.beginPath(); ctx.ellipse(x, y, 12 * z, 6 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  const top = y - 2 * s - lift;
  ctx.fillStyle = "#c98a3d"; ctx.beginPath(); ctx.moveTo(x - s, top + s * 0.5); ctx.lineTo(x, top + s); ctx.lineTo(x, top + 2.4 * s); ctx.lineTo(x - s, top + 1.9 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#a96f2a"; ctx.beginPath(); ctx.moveTo(x + s, top + s * 0.5); ctx.lineTo(x, top + s); ctx.lineTo(x, top + 2.4 * s); ctx.lineTo(x + s, top + 1.9 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e3a75a"; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + s, top + s * 0.5); ctx.lineTo(x, top + s); ctx.lineTo(x - s, top + s * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ffffff"; ctx.font = `bold ${Math.round(12 * z)}px "Comic Sans MS", "Comic Neue", cursive`; ctx.textAlign = "center";
  ctx.fillText("?", x - s * 0.5, top + 1.75 * s);
}

export function drawWorld(ctx: CanvasRenderingContext2D, s: Sim, v: View, prev: Map<number, [number, number]>, alpha: number, now: number) {
  background(ctx, v, now);
  slab(ctx, v, s.n);
  tiles(ctx, s, v);
  const z = v.zoom, margin = 60 * z;
  type D = { d: number; draw: () => void };
  const list: D[] = [];
  s.players.forEach((p, q) => list.push({ d: p.bx + p.by + 700, draw: () => drawBase(ctx, s, v, q, now) }));
  const heads = new Map<number, [number, number]>();
  for (const u of s.units) {
    const [wx, wy] = unitPos(u, prev, alpha), [sx, sy] = project(v, wx, wy);
    if (sx < -margin || sx > v.w + margin || sy < -margin || sy > v.h + margin * 2) continue;
    const old = prev.get(u.id);
    const dsx = old ? u.x - old[0] - (u.y - old[1]) : 0;
    const moving = !!old && (old[0] !== u.x || old[1] !== u.y);
    list.push({ d: wx + wy, draw: () => {
      const h = drawUnit(ctx, s, v, u, sx, sy, dsx < 0 ? -1 : 1, moving, now);
      heads.set(u.id, [sx, sy - (h + 4) * z]);
    } });
  }
  const c = s.crate;
  if (c) {
    const dropping = v.fx.find((f) => f.k === "drop" && now - f.at < 1100);
    const [sx, sy] = project(v, c.x, c.y);
    list.push({ d: c.x + c.y, draw: () => {
      if (dropping) {
        const k = 1 - (now - dropping.at) / 1100, off = k * 160 * z;
        ctx.strokeStyle = INK; ctx.lineWidth = 1;
        ctx.fillStyle = "#ff5d8f";
        ctx.beginPath(); ctx.arc(sx, sy - off - 40 * z, 18 * z, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx - 18 * z, sy - off - 40 * z); ctx.lineTo(sx, sy - off - 18 * z); ctx.lineTo(sx + 18 * z, sy - off - 40 * z); ctx.stroke();
        crate(ctx, sx, sy - off, z, now);
      } else crate(ctx, sx, sy, z, now);
    } });
  }
  // Own rally point.
  const me = s.players[v.seat];
  if (me?.alive) {
    const [rx, ry] = project(v, me.rx, me.ry);
    list.push({ d: me.rx + me.ry, draw: () => {
      if (v.baseSel) {
        const [bx, by] = project(v, me.bx, me.by);
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(rx, ry); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry - 22 * z); ctx.stroke();
      ctx.fillStyle = COLORS[v.seat];
      ctx.beginPath(); ctx.moveTo(rx, ry - 22 * z); ctx.lineTo(rx + 12 * z, ry - 18 * z); ctx.lineTo(rx, ry - 14 * z); ctx.closePath(); ctx.fill(); ctx.stroke();
    } });
  }
  list.sort((a, b) => a.d - b.d);
  for (const item of list) item.draw();
  // Selected base outline.
  if (v.baseSel && me?.alive) {
    const b = baseBlock(s.n, me.corner);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    const p = [project(v, b.x * M, b.y * M), project(v, (b.x + 3) * M, b.y * M), project(v, (b.x + 3) * M, (b.y + 3) * M), project(v, b.x * M, (b.y + 3) * M)];
    ctx.beginPath(); p.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  }
  effects(ctx, s, v, now);
  for (let k = v.bubbles.length - 1; k >= 0; k--) {
    const b = v.bubbles[k];
    if (now - b.at > 2200) { v.bubbles.splice(k, 1); continue; }
    const at = heads.get(b.id);
    if (at) bubble(ctx, at[0], at[1], b.text, z);
  }
  if (v.box) {
    const { x0, y0, x1, y1 } = v.box;
    ctx.fillStyle = "#ffffff22"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.setLineDash([]);
  }
}

const LIFE: Record<Fx["k"], number> = { puff: 650, shot: 180, text: 1800, ring: 550, drop: 1100 };
function effects(ctx: CanvasRenderingContext2D, s: Sim, v: View, now: number) {
  const z = v.zoom;
  for (let k = v.fx.length - 1; k >= 0; k--) {
    const f = v.fx[k], age = now - f.at, life = LIFE[f.k];
    if (age > life) { v.fx.splice(k, 1); continue; }
    const t = age / life, [x, y] = project(v, f.x, f.y);
    if (f.k === "shot") {
      const [bx, by] = project(v, f.fx ?? f.x, f.fy ?? f.y);
      ctx.strokeStyle = `rgba(255,240,120,${1 - t})`; ctx.lineWidth = 3 * z;
      ctx.beginPath(); ctx.moveTo(bx, by - 100 * z); ctx.lineTo(x, y - 8 * z); ctx.stroke();
    } else if (f.k === "puff") {
      ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - t)})`;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.arc(x + Math.cos(i * 1.7) * 8 * z * (1 + t), y - 8 * z + Math.sin(i * 1.7) * 5 * z * (1 + t), (4 + 6 * t) * z, 0, Math.PI * 2); ctx.fill();
      }
      if (f.text) {
        ctx.font = `900 ${Math.round(14 * z * (1 + t * 0.3))}px "Comic Sans MS", "Comic Neue", cursive`; ctx.textAlign = "center";
        ctx.lineWidth = 3; ctx.strokeStyle = `rgba(43,33,24,${1 - t})`; ctx.fillStyle = `rgba(255,214,0,${1 - t})`;
        ctx.strokeText(f.text, x, y - (20 + 18 * t) * z); ctx.fillText(f.text, x, y - (20 + 18 * t) * z);
      }
    } else if (f.k === "text") {
      ctx.font = `900 ${Math.round(15 * Math.max(0.8, z))}px "Comic Sans MS", "Comic Neue", cursive`; ctx.textAlign = "center";
      ctx.globalAlpha = 1 - t * t;
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.fillStyle = f.color ?? "#ffffff";
      ctx.strokeText(f.text ?? "", x, y - (24 + 40 * t) * z); ctx.fillText(f.text ?? "", x, y - (24 + 40 * t) * z);
      ctx.globalAlpha = 1;
    } else if (f.k === "ring") {
      ctx.strokeStyle = f.rally ? `rgba(255,214,0,${1 - t})` : `rgba(80,255,120,${1 - t})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, (6 + 18 * t) * z, (3 + 9 * t) * z, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  void s;
}

// ---------- minimap ----------
export const MINI = { w: 220, h: 118, pad: 4 };
const miniHalf = (n: number) => (MINI.w - 2 * MINI.pad) / (2 * n);
export function miniProject(n: number, x: number, y: number): [number, number] {
  const hx = miniHalf(n);
  return [MINI.w / 2 + ((x - y) / M) * hx, MINI.pad + ((x + y) / M) * (hx / 2)];
}
export function miniToWorld(n: number, mx: number, my: number): [number, number] {
  const hx = miniHalf(n), a = (mx - MINI.w / 2) / hx, b = (my - MINI.pad) / (hx / 2);
  return [Math.max(0, Math.min(n * M, ((a + b) / 2) * M)), Math.max(0, Math.min(n * M, ((b - a) / 2) * M))];
}
export function drawMinimap(ctx: CanvasRenderingContext2D, s: Sim, v: View) {
  const n = s.n;
  ctx.clearRect(0, 0, MINI.w, MINI.h);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, own = s.own[i], kind = s.kind[i];
    const p = [miniProject(n, x * M, y * M), miniProject(n, (x + 1) * M, y * M), miniProject(n, (x + 1) * M, (y + 1) * M), miniProject(n, x * M, (y + 1) * M)];
    ctx.beginPath(); p.forEach(([a, b], k) => (k ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath();
    ctx.fillStyle = kind === 0 ? "#5aa845" : kind === 2 ? (own >= 0 ? mix(COLORS[own], "#000000", 0.3) : "#77736b")
      : own >= 0 && s.prog[i] >= CAP ? (s.lk[i] ? COLORS[own] : mix(COLORS[own], BEIGE, 0.5)) : BEIGE;
    ctx.fill();
  }
  for (const u of s.units) {
    const [a, b] = miniProject(n, u.x, u.y);
    ctx.fillStyle = mix(COLORS[u.o], "#000000", 0.35);
    ctx.fillRect(a - 1.5, b - 1.5, 3, 3);
  }
  if (s.crate) {
    const [a, b] = miniProject(n, s.crate.x, s.crate.y);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(a - 3, b - 3, 6, 6);
    ctx.fillStyle = "#c98a3d"; ctx.fillRect(a - 2, b - 2, 4, 4);
  }
  // Camera frame, clipped to the board so a wide view does not draw lines in the void.
  const corners = [unproject(v, 0, 0), unproject(v, v.w, 0), unproject(v, v.w, v.h), unproject(v, 0, v.h)].map(([x, y]) => miniProject(n, x, y));
  const board = [miniProject(n, 0, 0), miniProject(n, n * M, 0), miniProject(n, n * M, n * M), miniProject(n, 0, n * M)];
  ctx.save();
  ctx.beginPath(); board.forEach(([a, b], k) => (k ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.clip();
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
  ctx.beginPath(); corners.forEach(([a, b], k) => (k ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.stroke();
  ctx.restore();
}

/** A unit portrait for the lobby, drawn with the same code as on the board. */
export function drawPortrait(canvas: HTMLCanvasElement, faction: keyof typeof FACTIONS, color: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 56, h = canvas.clientHeight || 56;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const z = h / 30;
  ctx.fillStyle = "#00000030";
  ctx.beginPath(); ctx.ellipse(w / 2, h - 4 * z, 9 * z, 3.5 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(w / 2, h - 4 * z);
  unitBody(ctx, faction, 0, color, z, 0, false);
  ctx.restore();
}

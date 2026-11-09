"use client";
// The battle screen: a full-screen canvas drawn from the local simulation (net.ts keeps it in step
// with the other browsers), the minimap, the scoreboard and the jokes. React only renders the HUD
// a few times per second; the canvas is redrawn every frame from refs.
import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { BookOpen, BoxSelect, Castle, ChevronDown, ChevronUp, Users, X } from "lucide-react";
import type { Action } from "@/platform/contract";
import type { Lang } from "@/lib/world";
import { Match } from "../net";
import { BASE_HP, CRATE_KINDS, M, TICK_MS, WARMUP, ownedTiles, spawnBonus, spawnTicks, type Cmd, type Sim, type SimEvent } from "../sim";
import { COLORS, FACTIONS, type FactionId } from "../factions";
import type { PublicGame } from "../engine";
import { fill, type JeuTexts } from "../i18n";
import { MAX_ZOOM, MINI, MIN_ZOOM, drawMinimap, drawWorld, miniToWorld, panBy, project, unitPos, unproject, type View } from "./render";
import { play } from "./sound";

type HudPlayer = { seat: number; name: string; faction: FactionId; alive: boolean; units: number; tiles: number; hp: number; conqueror: number };
type Hud = {
  players: HudPlayer[]; time: number; selected: number; baseSel: boolean; spawnEvery: number; bonus: number; linked: number;
  status: "connecting" | "syncing" | "live" | "offline" | "waiting"; host: boolean; over: boolean; winner: number; tick: number; frozen: boolean; alive: boolean;
};
type Banner = { id: number; text: string; tone: "info" | "good" | "bad" };

const EDGE = 18, EDGE_SPEED = 1100, KEY_SPEED = 900;
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

export default function Battle({ game, tx, lang, act, orderRef, openRules }: {
  game: PublicGame; tx: JeuTexts; lang: Lang; act: (a: Action) => Promise<boolean>; orderRef: MutableRefObject<((c: Cmd) => void) | null>; openRules: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), mini = useRef<HTMLCanvasElement>(null);
  const matchRef = useRef<Match | null>(null);
  const seat = game.roster.findIndex((r) => r.id === game.me);
  const names = game.roster.map((r) => game.players.find((p) => p.id === r.id)?.name ?? "?");
  const view = useRef<View>({ w: 800, h: 600, cx: 0, cy: 0, zoom: 1, seat, selected: new Set(), baseSel: false, box: null, fx: [], bubbles: [], names });
  const [hud, setHud] = useState<Hud | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [missing, setMissing] = useState(false);
  const [loader, setLoader] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [touch, setTouch] = useState(false);
  const [boxMode, setBoxMode] = useState(false);
  const boxModeRef = useRef(false), touchRef = useRef(false);
  const touchActions = useRef<{ all: () => void; base: () => void; clear: () => void }>({ all: () => {}, base: () => {}, clear: () => {} });
  const actRef = useRef(act), txRef = useRef(tx);
  actRef.current = act; txRef.current = tx;
  const gameRef = useRef(game);
  gameRef.current = game;

  function banner(text: string, tone: Banner["tone"] = "info") {
    const id = Math.random();
    setBanners((b) => [...b.slice(-2), { id, text, tone }]);
    setTimeout(() => setBanners((b) => b.filter((x) => x.id !== id)), 4200);
  }

  useEffect(() => { boxModeRef.current = boxMode; }, [boxMode]);
  useEffect(() => { const coarse = window.matchMedia("(pointer: coarse)").matches; touchRef.current = coarse; setTouch(coarse); }, []);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) { setMissing(true); return; }
    const g = gameRef.current, v = view.current;
    const match = new Match({
      url, key, channel: g.channel, code: g.code, match: g.match, me: g.me,
      roster: g.roster.map((r) => r.id), factions: g.roster.map((r) => r.faction), seed: g.seed, host: g.simHost,
    });
    matchRef.current = match;
    orderRef.current = (c) => match.order(c);
    match.start();
    // Debugging aid (see docs/jeu-oublie.md): window.__jeuOublie.sim, .role, .status, .desyncs.
    (window as unknown as { __jeuOublie?: Match }).__jeuOublie = match;
    let raf = 0, last = performance.now(), lastMini = 0, lastHud = 0, centered = false, reported = 0, loaderShown = false, alarmAt = 0, lostAt = 0;
    const keys = new Set<string>();
    let mouse: { x: number; y: number } | null = null;
    const ctx = canvas.current!.getContext("2d")!, mctx = mini.current!.getContext("2d")!;
    const tx = () => txRef.current;

    function onEvent(e: SimEvent, sim: Sim, now: number) {
      const t = tx();
      const onScreen = (x: number, y: number) => { const [sx, sy] = project(v, x, y); return sx > -40 && sy > -40 && sx < v.w + 40 && sy < v.h + 40; };
      if (e.t === "cap") {
        if (e.p === seat) { play("capture"); v.fx.push({ k: "text", x: (e.i % sim.n + 0.5) * M, y: (Math.floor(e.i / sim.n) + 0.5) * M, at: now, text: "+1", color: COLORS[seat] }); }
      } else if (e.t === "lose") {
        if (e.p === seat) { play("lose"); v.fx.push({ k: "text", x: (e.i % sim.n + 0.5) * M, y: (Math.floor(e.i / sim.n) + 0.5) * M, at: now, text: "−1", color: "#ff5050" }); if (now - lostAt > 15000) { lostAt = now; banner(t.lostTile, "bad"); } }
      } else if (e.t === "kill") {
        if (onScreen(e.x, e.y)) { play("kill"); v.fx.push({ k: "puff", x: e.x, y: e.y, at: now, text: Math.random() < 0.4 ? pick(t.ouch) : undefined }); }
      } else if (e.t === "shot") {
        const b = sim.players[e.p];
        if (onScreen(e.x, e.y)) { play("shot"); v.fx.push({ k: "shot", x: e.x, y: e.y, fx: b.bx, fy: b.by, at: now }); }
      } else if (e.t === "hit") {
        if (e.p === seat && now - alarmAt > 9000) { alarmAt = now; play("alarm"); banner(t.baseHit, "bad"); }
      } else if (e.t === "elim") {
        banner(e.by >= 0 ? fill(t.elim, { a: names[e.by], b: names[e.p] }) : fill(t.elimResign, { b: names[e.p] }), e.p === seat ? "bad" : "info");
        play(e.p === seat ? "defeat" : "militia");
        if (e.p === seat) { v.selected.clear(); v.baseSel = false; }
      } else if (e.t === "drop") {
        play("drop"); banner(t.drop); v.fx.push({ k: "drop", x: e.x, y: e.y, at: now });
      } else if (e.t === "crate") {
        const kind = CRATE_KINDS[e.k], c = t.crates[kind];
        banner(fill(t.crateTaken, { a: names[e.p], c: c.name }) + (e.p === seat || kind === "flash" ? " — " + c.desc : ""), e.p === seat ? "good" : "info");
        play(kind === "chicken" ? "chicken" : "crate");
        v.fx.push({ k: "text", x: e.x, y: e.y, at: now, text: c.name, color: "#ffd600" });
      } else if (e.t === "militia") {
        banner(fill(t.militia, { a: names[e.p] }), e.p === seat ? "good" : "info"); play("militia");
      } else if (e.t === "win") {
        play(e.p === seat ? "victory" : "defeat");
      }
    }

    function updateHud(sim: Sim | null, now: number) {
      const status: Hud["status"] = match.waitingHost(now) ? "waiting" : match.status;
      if (!sim) { setHud((h) => (h ? { ...h, status } : null)); return; }
      for (const id of v.selected) if (!sim.units.some((u) => u.id === id && u.o === seat)) v.selected.delete(id);
      const me = sim.players[seat];
      setHud({
        players: sim.players.map((p, q) => ({ seat: q, name: names[q], faction: p.faction, alive: p.alive, units: sim.units.filter((u) => u.o === q).length, tiles: ownedTiles(sim, q), hp: p.hp, conqueror: p.conqueror })),
        time: Math.max(0, sim.tick - WARMUP) * TICK_MS, selected: v.selected.size, baseSel: v.baseSel,
        spawnEvery: me ? (spawnTicks(sim, seat) * TICK_MS) / 1000 / (1 + spawnBonus(me.linked)) : 0, bonus: me ? spawnBonus(me.linked) : 0, linked: me?.linked ?? 0,
        status, host: match.role === "host", over: sim.over, winner: sim.winner, tick: sim.tick, frozen: (me?.frozen ?? 0) > 0, alive: !!me?.alive,
      });
      if (sim.tick < WARMUP && (loaderShown || sim.tick < 10)) { loaderShown = true; setLoader(sim.tick / WARMUP); }
      else if (loaderShown) { loaderShown = false; setLoader(null); setFlash(true); play("start"); }
      // Report the end once; every browser reaches it, the server keeps the first report.
      if (sim.over && gameRef.current.phase === "playing" && now - reported > 3000) {
        reported = now;
        void actRef.current({
          type: "finish", match: gameRef.current.match, winner: gameRef.current.roster[sim.winner]?.id ?? "", ticks: sim.end,
          stats: sim.players.map((p, q) => ({ id: gameRef.current.roster[q].id, tiles: ownedTiles(sim, q), kills: p.kills, lost: p.lost, out: p.out })),
        });
      }
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const el = canvas.current;
      if (!el) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const dpr = window.devicePixelRatio || 1, w = el.clientWidth, h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
      v.w = w; v.h = h;
      const sim = match.sim;
      if (sim) {
        if (!centered && sim.players[Math.max(0, seat)]) {
          centered = true;
          const p = sim.players[Math.max(0, seat)];
          // Between the base and the centre; further toward the centre on a portrait screen.
          const k = h > w ? 0.5 : 0.28;
          v.cx = p.bx + (sim.n * M / 2 - p.bx) * k; v.cy = p.by + (sim.n * M / 2 - p.by) * k;
        }
        let dx = 0, dy = 0;
        if (mouse && document.hasFocus()) {
          if (mouse.x < EDGE) dx -= 1; else if (mouse.x > w - EDGE) dx += 1;
          if (mouse.y < EDGE) dy -= 1; else if (mouse.y > h - EDGE) dy += 1;
          dx *= EDGE_SPEED; dy *= EDGE_SPEED;
        }
        if (keys.has("ArrowLeft")) dx -= KEY_SPEED;
        if (keys.has("ArrowRight")) dx += KEY_SPEED;
        if (keys.has("ArrowUp")) dy -= KEY_SPEED;
        if (keys.has("ArrowDown")) dy += KEY_SPEED;
        if (dx || dy) panBy(v, sim.n, dx * dt, dy * dt);
        for (const e of match.drain()) onEvent(e, sim, now);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawWorld(ctx, sim, v, match.prev, match.alpha(now), now);
        if (now - lastMini > 100) { lastMini = now; drawMinimap(mctx, sim, v); }
      } else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#5cc8ff"; ctx.fillRect(0, 0, w, h);
      }
      if (now - lastHud > 250) { lastHud = now; updateHud(sim, now); }
    }
    raf = requestAnimationFrame(frame);

    // ---------- input ----------
    const el = canvas.current!, mel = mini.current!;
    const own = (sim: Sim) => sim.units.filter((u) => u.o === seat);
    function pickUnit(sim: Sim, sx: number, sy: number) {
      let best: number | null = null, bd = (18 * Math.max(0.8, v.zoom)) ** 2;
      for (const u of own(sim)) {
        const [x, y] = project(v, ...unitPos(u, match.prev, match.alpha(performance.now())));
        const d = (x - sx) ** 2 + (y - 10 * v.zoom - sy) ** 2;
        if (d < bd) { bd = d; best = u.id; }
      }
      return best;
    }
    function pickBase(sim: Sim, sx: number, sy: number) {
      const p = sim.players[seat];
      if (!p?.alive) return false;
      const [x, y] = unproject(v, sx, sy + 20 * v.zoom);
      return Math.abs(x - p.bx) < 1600 && Math.abs(y - p.by) < 1600;
    }
    function voice(ids: number[], kind: "select" | "move") {
      const sim = match.sim;
      if (!sim || !ids.length || v.bubbles.some((b) => performance.now() - b.at < 1400)) return;
      const id = pick(ids), u = sim.units.find((x) => x.id === id);
      if (!u) return;
      const t = tx(), lines = u.k === 2 ? ["COT COT !", "BWAAAK !", "COT ?"] : u.k === 1 ? ["Qui c'est qui fait du bruit ?", "J'étais en pleine sieste !"] : t.factions[sim.players[seat].faction][kind];
      v.bubbles.push({ id, text: pick(lines), at: performance.now() });
    }
    function select(ids: number[], add: boolean) {
      if (!add) v.selected.clear();
      v.baseSel = false;
      for (const id of ids) v.selected.add(id);
      if (ids.length) { play("select"); voice(ids, "select"); }
    }
    function issue(x: number, y: number) {
      const sim = match.sim;
      if (!sim || !sim.players[seat]?.alive) return;
      const now = performance.now();
      if (v.baseSel) {
        match.order({ k: "ra", x: Math.round(x), y: Math.round(y) });
        v.fx.push({ k: "ring", x, y, at: now, rally: true });
        play("rally");
        return;
      }
      const ids = [...v.selected].filter((id) => sim.units.some((u) => u.id === id && u.o === seat));
      if (!ids.length) return;
      match.order({ k: "mv", u: ids, x: Math.round(x), y: Math.round(y) });
      v.fx.push({ k: "ring", x, y, at: now });
      play("order");
      voice(ids, "move");
    }
    function boxSelect(sim: Sim, add: boolean) {
      const b = v.box!;
      const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
      const ids = own(sim).filter((u) => {
        const [x, y] = project(v, ...unitPos(u, match.prev, match.alpha(performance.now())));
        return x >= x0 && x <= x1 && y - 8 * v.zoom >= y0 && y - 8 * v.zoom <= y1;
      }).map((u) => u.id);
      select(ids, add);
    }
    function tap(sx: number, sy: number, add: boolean) {
      const sim = match.sim;
      if (!sim) return;
      const id = pickUnit(sim, sx, sy);
      if (id !== null) {
        if (add && v.selected.has(id)) v.selected.delete(id);
        else select([id], add);
        return;
      }
      const touch = touchRef.current;
      if (pickBase(sim, sx, sy) && !(touch && v.selected.size)) { v.selected.clear(); v.baseSel = true; play("select"); return; }
      if (touch && (v.selected.size || v.baseSel)) { issue(...unproject(v, sx, sy)); return; }
      if (!add) { v.selected.clear(); v.baseSel = false; }
    }
    const local = (e: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const touches = new Map<number, { x: number; y: number }>();
    let touchStart: { x: number; y: number; at: number; moved: boolean } | null = null, pinch = 0;
    // Mouse box selection: press and drag, or click once to anchor the box and click again to close it
    // (some browsers start an image drag on press-and-drag over a canvas).
    let pressed = false, anchored = false, consumed = false;
    const cancelBox = () => { anchored = false; pressed = false; v.box = null; };

    function down(e: PointerEvent) {
      const p = local(e);
      if (e.pointerType === "touch") {
        touches.set(e.pointerId, p);
        if (touches.size === 1) { touchStart = { ...p, at: performance.now(), moved: false }; if (boxModeRef.current) v.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; }
        else { const [a, b] = [...touches.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); v.box = null; if (touchStart) touchStart.moved = true; }
        el.setPointerCapture(e.pointerId);
        return;
      }
      e.preventDefault();
      if (e.button === 0) {
        if (anchored && v.box) {
          // Second click: close the anchored box.
          const sim = match.sim, b = v.box;
          b.x1 = p.x; b.y1 = p.y;
          if (sim && Math.abs(b.x1 - b.x0) + Math.abs(b.y1 - b.y0) >= 6) boxSelect(sim, e.shiftKey);
          else if (!e.shiftKey) { v.selected.clear(); v.baseSel = false; }
          cancelBox();
          consumed = true;
          return;
        }
        v.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        pressed = true;
        el.setPointerCapture(e.pointerId);
      } else if (e.button === 2) {
        cancelBox();
        issue(...unproject(v, p.x, p.y));
      }
    }
    function move(e: PointerEvent) {
      const p = local(e);
      if (e.pointerType === "touch") {
        const old = touches.get(e.pointerId);
        if (!old) return;
        touches.set(e.pointerId, p);
        const sim = match.sim;
        if (!sim) return;
        if (touches.size >= 2) {
          const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) v.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * (d / pinch)));
          pinch = d;
          panBy(v, sim.n, -(p.x - old.x) / 2, -(p.y - old.y) / 2);
          return;
        }
        if (touchStart && Math.hypot(p.x - touchStart.x, p.y - touchStart.y) > 10) touchStart.moved = true;
        if (v.box) { v.box.x1 = p.x; v.box.y1 = p.y; }
        else panBy(v, sim.n, old.x - p.x, old.y - p.y);
        return;
      }
      mouse = p;
      if (v.box) { v.box.x1 = p.x; v.box.y1 = p.y; }
    }
    function up(e: PointerEvent) {
      const p = local(e), sim = match.sim;
      if (e.pointerType === "touch") {
        touches.delete(e.pointerId);
        if (touches.size) return;
        pinch = 0;
        if (sim && v.box && Math.abs(v.box.x1 - v.box.x0) + Math.abs(v.box.y1 - v.box.y0) > 12) { boxSelect(sim, false); setBoxMode(false); }
        else if (touchStart && !touchStart.moved && performance.now() - touchStart.at < 400) tap(p.x, p.y, true);
        v.box = null; touchStart = null;
        return;
      }
      if (e.button !== 0) return;
      if (consumed) { consumed = false; return; }
      if (!pressed || !v.box || !sim) return;
      pressed = false;
      const b = v.box;
      if (Math.abs(b.x1 - b.x0) + Math.abs(b.y1 - b.y0) >= 6) { boxSelect(sim, e.shiftKey); v.box = null; return; }
      // A plain click: a unit or the base is picked at once; on open ground the box stays anchored
      // and follows the mouse until the next click.
      if (pickUnit(sim, p.x, p.y) !== null || pickBase(sim, p.x, p.y)) { tap(p.x, p.y, e.shiftKey); v.box = null; return; }
      anchored = true;
    }
    function dbl(e: MouseEvent) {
      const sim = match.sim;
      if (!sim) return;
      const p = local(e);
      if (pickUnit(sim, p.x, p.y) === null) return;
      select(own(sim).filter((u) => { const [x, y] = project(v, u.x, u.y); return x >= 0 && y >= 0 && x <= v.w && y <= v.h; }).map((u) => u.id), false);
    }
    function wheel(e: WheelEvent) {
      e.preventDefault();
      const p = local(e), before = unproject(v, p.x, p.y);
      v.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * Math.exp(-e.deltaY * 0.0015)));
      const after = unproject(v, p.x, p.y);
      v.cx += before[0] - after[0]; v.cy += before[1] - after[1];
    }
    const leave = () => { mouse = null; };
    const menu = (e: Event) => e.preventDefault();
    const noDrag = (e: Event) => e.preventDefault();
    let miniDrag = false;
    function miniAt(e: PointerEvent) {
      const sim = match.sim, r = mel.getBoundingClientRect();
      if (!sim) return null;
      return miniToWorld(sim.n, ((e.clientX - r.left) / r.width) * MINI.w, ((e.clientY - r.top) / r.height) * MINI.h);
    }
    function miniDown(e: PointerEvent) {
      const at = miniAt(e);
      if (!at) return;
      if (e.button === 2 || (e.pointerType === "touch" && (v.selected.size || v.baseSel))) { issue(...at); return; }
      miniDrag = true; v.cx = at[0]; v.cy = at[1]; mel.setPointerCapture(e.pointerId);
    }
    function miniMove(e: PointerEvent) { if (!miniDrag) return; const at = miniAt(e); if (at) { v.cx = at[0]; v.cy = at[1]; } }
    const miniUp = () => { miniDrag = false; };

    function keydown(e: KeyboardEvent) {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target && (target.closest("input, textarea, select, dialog") || target.isContentEditable)) return;
      const sim = match.sim;
      if (e.key.startsWith("Arrow")) { keys.add(e.key); e.preventDefault(); return; }
      if (!sim) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Letters by the character typed (e.key), not the key position (e.code): on an AZERTY
      // keyboard the A key reports the code "KeyQ".
      const key = e.key.toLowerCase();
      if (key === "a") select(own(sim).map((u) => u.id), false);
      else if (key === "b") { cancelBox(); v.selected.clear(); v.baseSel = true; play("select"); }
      else if (key === " ") {
        e.preventDefault();
        const p = sim.players[seat];
        if (p) { v.cx = p.bx; v.cy = p.by; }
      } else if (key === "escape") { if (v.box) cancelBox(); else { v.selected.clear(); v.baseSel = false; } }
      else if (e.key === "+" || e.key === "=") v.zoom = Math.min(MAX_ZOOM, v.zoom * 1.15);
      else if (e.key === "-") v.zoom = Math.max(MIN_ZOOM, v.zoom / 1.15);
    }
    const keyup = (e: KeyboardEvent) => keys.delete(e.key);
    const blur = () => { keys.clear(); mouse = null; };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("dblclick", dbl);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", menu);
    el.addEventListener("dragstart", noDrag);
    mel.addEventListener("dragstart", noDrag);
    mel.addEventListener("pointerdown", miniDown);
    mel.addEventListener("pointermove", miniMove);
    mel.addEventListener("pointerup", miniUp);
    mel.addEventListener("contextmenu", menu);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    // Toolbar actions for touch screens.
    touchActions.current = {
      all: () => { const sim = match.sim; if (sim) select(own(sim).map((u) => u.id), false); },
      base: () => { const sim = match.sim, p = sim?.players[seat]; if (p) { v.cx = p.bx; v.cy = p.by; v.selected.clear(); v.baseSel = p.alive; } },
      clear: () => { v.selected.clear(); v.baseSel = false; },
    };
    return () => {
      cancelAnimationFrame(raf);
      match.stop();
      matchRef.current = null;
      delete (window as unknown as { __jeuOublie?: Match }).__jeuOublie;
      orderRef.current = null;
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("dblclick", dbl);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", menu);
      el.removeEventListener("dragstart", noDrag);
      mel.removeEventListener("dragstart", noDrag);
      mel.removeEventListener("pointerdown", miniDown);
      mel.removeEventListener("pointermove", miniMove);
      mel.removeEventListener("pointerup", miniUp);
      mel.removeEventListener("contextmenu", menu);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
    };
    // One battle per match: a rematch remounts with a fresh simulation.
  }, [game.match, game.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  const me = hud?.players[seat];
  const loaderStep = loader === null ? 0 : Math.min(tx.loader.length - 1, Math.floor(loader * tx.loader.length));
  const stopTouch = (e: ReactPointerEvent) => e.stopPropagation();

  return <div className="jo-battle">
    <canvas ref={canvas} className="jo-canvas" aria-label={tx.fullName} draggable={false} />
    {missing && <div className="jo-overlay"><div className="jo-window"><p>{tx.realtimeMissing}</p></div></div>}

    {hud && <ol className="jo-scores" aria-label={tx.players}>
      <li className="jo-clock"><span>{tx.time}</span><b>{clock(hud.time)}</b></li>
      {hud.players.map((p) => <li key={p.seat} className={p.alive ? "" : "is-out"} style={{ "--c": COLORS[p.seat] } as CSSProperties}>
        <i aria-hidden="true" />
        <span className="jo-score-name"><b>{p.name}{p.seat === seat ? ` (${tx.you})` : ""}</b><small>{tx.factions[p.faction].name}</small></span>
        {p.alive ? <span className="jo-score-figures">
          <span title={tx.units}><Users size={12} aria-hidden="true" />{p.units}</span>
          <span title={tx.tiles}>▱ {p.tiles}</span>
          <span className="jo-mini-hp" title={tx.base} aria-label={`${tx.base} ${Math.round((p.hp / BASE_HP) * 100)} %`}><span style={{ width: `${Math.max(0, (p.hp / BASE_HP) * 100)}%` }} /></span>
        </span> : <span className="jo-score-out">{tx.eliminated}{p.conqueror >= 0 ? " " + fill(tx.conqueredBy, { a: names[p.conqueror] }) : ""}</span>}
      </li>)}
    </ol>}

    <div className="jo-banners" role="status" aria-live="polite">{banners.map((b) => <p key={b.id} className={`is-${b.tone}`}>{b.text}</p>)}</div>

    <div className="jo-minimap" onPointerDown={stopTouch}>
      <canvas ref={mini} width={MINI.w} height={MINI.h} aria-label={tx.minimap} title={tx.minimap} draggable={false} />
    </div>

    {hud && hud.alive && !hud.over && <div className="jo-selection">
      {hud.frozen ? <b>❄ {tx.frozen}</b> : hud.baseSel ? <span>{tx.baseSelected}</span> : hud.selected ? <b>{fill(tx.selected, { n: hud.selected })}</b> : <span>{touch ? tx.touch.hint : tx.noSelection}</span>}
      <small>{fill(tx.spawnRate, { s: hud.spawnEvery.toLocaleString(lang, { maximumFractionDigits: 1 }) })}{hud.linked ? " · " + fill(tx.spawnBonus, { b: Math.round(hud.bonus * 100), n: hud.linked }) : ""}</small>
    </div>}
    {hud && !hud.alive && !hud.over && <div className="jo-selection"><span>{tx.spectating}</span></div>}

    {touch ? <div className="jo-touchbar" onPointerDown={stopTouch}>
      <button className={`jo-chunky${boxMode ? " is-on" : ""}`} aria-pressed={boxMode} onClick={() => setBoxMode((b) => !b)}><BoxSelect size={18} />{tx.touch.box}</button>
      <button className="jo-chunky" onClick={() => touchActions.current.all()}><Users size={18} />{tx.touch.all}</button>
      <button className="jo-chunky" onClick={() => touchActions.current.base()}><Castle size={18} />{tx.touch.base}</button>
      <button className="jo-chunky" onClick={() => touchActions.current.clear()}><X size={18} />{tx.touch.clear}</button>
      <button className="jo-chunky jo-touch-book" onClick={openRules}><BookOpen size={18} />{tx.booklet.open}</button>
    </div> : <div className={`jo-keys${keysOpen ? " is-open" : ""}`}>
      <div className="jo-keys-buttons">
        <button className="jo-chunky" onClick={openRules}><BookOpen size={16} />{tx.booklet.open}</button>
        <button className="jo-chunky" aria-expanded={keysOpen} onClick={() => setKeysOpen((o) => !o)}>{tx.keysTitle}{keysOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
      </div>
      {keysOpen && <dl>{tx.keys.map(([k, d]) => <div key={k}><dt>{k}</dt><dd>{d}</dd></div>)}</dl>}
    </div>}

    {hud && hud.status !== "live" && !missing && <div className="jo-netstate" role="status">{hud.status === "offline" ? tx.offline : hud.status === "waiting" ? tx.waitingHost : tx.syncing}</div>}

    {loader !== null && <div className="jo-overlay jo-loader" role="status">
      <div className="jo-window"><div className="jo-titlebar"><span>{tx.fullName}.swf</span></div>
        <div className="jo-window-body">
          <p className="jo-loader-title">{tx.loader[loaderStep]}</p>
          <div className="jo-progress"><span style={{ width: `${Math.min(99, Math.round(loader * 120))}%` }} /></div>
          <p className="jo-tip">{tx.tips[(game.match + seat) % tx.tips.length]}</p>
        </div></div>
    </div>}
    {flash && <div className="jo-flash" role="dialog" aria-labelledby="jo-flash-title">
      <div className="jo-window"><div className="jo-titlebar"><span id="jo-flash-title">⚠ {tx.flashTitle}</span><button aria-label={tx.close} onClick={() => setFlash(false)}>×</button></div>
        <div className="jo-window-body"><p>{tx.flashBody}</p>
          <div className="jo-window-actions"><button className="jo-chunky is-primary" autoFocus onClick={() => setFlash(false)}>{tx.flashButton}</button><button className="jo-chunky" onClick={() => setFlash(false)}>{tx.flashLater}</button></div>
        </div></div>
    </div>}

    {hud?.over && <div className="jo-over" role="status">
      <p className="jo-over-title">{hud.winner === seat ? tx.victory : seat >= 0 && hud.winner >= 0 ? tx.defeat : tx.gameOver}</p>
      <p>{hud.winner === seat ? tx.winLine : hud.winner >= 0 ? fill(tx.winnerIs, { a: names[hud.winner] }) : tx.nobody}</p>
    </div>}
    {me && hud?.host && <span className="jo-hostdot" title={tx.hostBadge} aria-label={tx.hostBadge} />}
  </div>;
}

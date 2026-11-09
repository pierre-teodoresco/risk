// Browser-to-browser lockstep over a Supabase Realtime broadcast channel.
//
// Every browser runs the same simulation (sim.ts). Only orders travel:
// - a player's order ("o") goes to the channel; the HOST browser stamps it with the tick at which
//   everyone will apply it and rebroadcasts it in a TURN ("t");
// - a turn also announces `f` (final): every order for ticks < f is known, so a browser may
//   simulate up to f − 1. The host announces f = its tick + LEAD four times a second;
// - every CHECK_EVERY ticks the host sends a hash of its state; a browser that disagrees, misses
//   a turn (sequence gap) or arrives late asks for a SNAPSHOT ("q" → "s"): the full state as JSON.
// Host election: the first roster player present on the channel (Realtime presence) becomes host
// when the current host has been silent for HOST_SILENCE_MS. Each takeover raises the `epoch`,
// and every other browser then resynchronises from the new host's snapshot.
// Each browser saves a snapshot in localStorage every few seconds, so a battle survives even if
// every player reloads at once. No anti-cheat by design: this is a game between friends.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSim, hash, step, TICK_MS, type Cmd, type Order, type Sim, type SimEvent } from "./sim";
import type { FactionId } from "./factions";

const LEAD = 5;
const SEND_MS = 250;
const HOST_SILENCE_MS = 3000;
const LISTEN_FIRST_MS = 2500;
const CHECK_EVERY = 50;
const SAVE_MS = 4000;
const RESEND_MS = 1200;
const SNAP_REQUEST_MS = 1500;
const MAX_CATCHUP = 80;

type Scheduled = [tick: number, seat: number, id: string, cmd: unknown];
type Turn = { e: number; p: string; s: number; h: number; f: number; o: Scheduled[]; k?: [number, number][] };
type Snapshot = { e: number; p: string; s: number; h: number; f: number; st: Sim; o: Scheduled[]; to: string };

export type NetStatus = "connecting" | "syncing" | "live" | "offline";
export type MatchInfo = {
  url: string; key: string; channel: string; code: string; match: number; me: string;
  roster: string[]; factions: FactionId[]; seed: number; host: string;
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const snapKey = (code: string, match: number) => `jeu-oublie.snap.${code}.${match}`;
const startedKey = (code: string) => `jeu-oublie.started.${code}`;

export class Match {
  sim: Sim | null = null;
  role: "host" | "client" = "client";
  status: NetStatus = "connecting";
  /** Previous positions of the units, for interpolation between two ticks. */
  prev = new Map<number, [number, number]>();
  lastStepAt = 0;
  /** Set when a client has reached `final` and waits for the host. */
  stalledSince = 0;
  desyncs = 0;
  readonly seat: number;

  private epoch = 0;
  private hostId: string;
  private seq = 0;
  private final = 0;
  private schedule = new Map<number, Order[]>();
  private seen = new Set<string>();
  private seenOrder: string[] = [];
  private inbox: { seat: number; id: string; c: unknown }[] = [];
  private mine = new Map<string, { c: Cmd; at: number; tries: number }>();
  private present = new Set<string>();
  private hostTick = { h: 0, at: 0 };
  private lastHostMsg = 0;
  private connectedAt = 0;
  private clockBase = 0;
  private lastSend = 0;
  private lastSave = 0;
  private lastSnapRequest = 0;
  private lastSnapSent = 0;
  private awaitingSnap = false;
  private expected = new Map<number, number>();
  private computed = new Map<number, number>();
  private checks: [number, number][] = [];
  private events: SimEvent[] = [];
  private channel: RealtimeChannel | null = null;
  /** Sending before the channel is joined would fall back to one HTTP request per message. */
  private joined = false;
  private removeChannel: () => void = () => {};
  private ticker: Worker | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private session = Math.random().toString(36).slice(2, 8);
  private counter = 0;

  constructor(private info: MatchInfo) {
    this.seat = info.roster.indexOf(info.me);
    this.hostId = info.host;
  }

  start() {
    const { code, match, seed, factions, me, host } = this.info;
    let saved: { e: number; st: Sim } | null = null, fresh = true;
    try {
      fresh = localStorage.getItem(startedKey(code)) !== String(match);
      localStorage.setItem(startedKey(code), String(match));
      const raw = localStorage.getItem(snapKey(code, match));
      if (raw) saved = JSON.parse(raw);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith("jeu-oublie.snap.") && k !== snapKey(code, match)) localStorage.removeItem(k);
      }
    } catch {}
    if (fresh && !saved) {
      // Everyone builds tick 0 from the seed; the starting host runs the clock.
      this.sim = createSim(seed, factions);
      this.status = "live";
      if (me === host) this.becomeHost(performance.now(), 0);
    } else {
      // A reload: keep the saved state as a fallback and ask the host for the current one.
      if (saved?.st?.v === 1) this.sim = { ...saved.st, ev: [] };
      this.epoch = -1;
      this.awaitingSnap = true;
      this.status = "syncing";
    }
    this.startTicker();
    void this.connect();
  }

  stop() {
    this.stopped = true;
    this.save(true);
    this.ticker?.postMessage("stop");
    this.ticker?.terminate();
    if (this.interval) clearInterval(this.interval);
    this.removeChannel();
  }

  /** Sends one command for the local player. */
  order(c: Cmd) {
    if (this.seat < 0) return;
    const id = this.session + (this.counter++).toString(36);
    this.mine.set(id, { c, at: performance.now(), tries: 1 });
    this.deliver(id, c);
  }

  /** Events of the ticks run since the last call. */
  drain() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  alpha(now: number) {
    return Math.max(0, Math.min(1, (now - this.lastStepAt) / TICK_MS));
  }

  waitingHost(now: number) {
    return this.role === "client" && this.status === "live" && now - this.lastHostMsg > 1500 && this.connectedAt > 0;
  }

  // ---------- transport ----------

  private async connect() {
    const { url, key, channel, match, me } = this.info;
    try {
      const { createClient } = await import("@supabase/supabase-js");
      if (this.stopped) return;
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: "jeu-oublie-realtime" },
        realtime: { params: { eventsPerSecond: 40 } },
      });
      const ch = supabase.channel(`jo:${channel}:${match}`, {
        config: { broadcast: { self: false, ack: false }, presence: { key: me } },
      });
      ch.on("broadcast", { event: "t" }, ({ payload }) => this.onTurn(payload as Turn))
        .on("broadcast", { event: "o" }, ({ payload }) => this.onOrder(payload as { p: string; id: string; c: unknown }))
        .on("broadcast", { event: "q" }, ({ payload }) => this.onSnapRequest(payload as { p: string }))
        .on("broadcast", { event: "s" }, ({ payload }) => this.onSnapshot(payload as Snapshot))
        .on("presence", { event: "sync" }, () => { this.present = new Set(Object.keys(ch.presenceState())); })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            this.joined = true;
            this.connectedAt = performance.now();
            // Back from a network cut: turns were probably missed meanwhile.
            if (this.status === "offline") {
              if (this.role === "host") this.status = "live";
              else { this.awaitingSnap = true; this.status = "syncing"; }
            }
            void ch.track({ at: Date.now() });
            if (this.awaitingSnap) this.requestSnapshot(performance.now(), true);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            this.joined = false;
            if (status !== "CLOSED") this.status = "offline";
          }
        });
      this.channel = ch;
      this.removeChannel = () => { void supabase.removeChannel(ch); };
    } catch {
      this.status = "offline";
    }
  }

  private send(event: string, payload: unknown) {
    if (this.joined) void this.channel?.send({ type: "broadcast", event, payload });
  }

  private startTicker() {
    // Worker timers keep running in a background tab, where page timers slow to once a second:
    // the host's tab may be hidden while it plays against itself in another tab.
    try {
      const src = "const t=setInterval(()=>postMessage(0),25);onmessage=()=>{clearInterval(t);close()}";
      this.ticker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      this.ticker.onmessage = () => this.update(performance.now());
    } catch {
      this.interval = setInterval(() => this.update(performance.now()), 25);
    }
  }

  // ---------- clock ----------

  update(now: number) {
    if (this.stopped) return;
    const sim = this.sim;
    if (this.role === "host" && sim) {
      let target = Math.floor((now - this.clockBase) / TICK_MS);
      if (target - sim.tick > MAX_CATCHUP) { this.clockBase = now - (sim.tick + MAX_CATCHUP) * TICK_MS; target = sim.tick + MAX_CATCHUP; }
      while (sim.tick < target) this.advance(now);
      if (this.joined && (now - this.lastSend >= SEND_MS || (this.inbox.length && now - this.lastSend >= 60))) this.sendTurn(now);
    } else if (sim && this.status === "live") {
      const estimate = Math.floor(this.hostTick.h + (now - this.hostTick.at) / TICK_MS);
      const target = Math.min(this.final, estimate);
      let n = 0;
      while (sim.tick < target && n++ < MAX_CATCHUP) this.advance(now);
      if (sim.tick >= this.final) { if (!this.stalledSince) this.stalledSince = now; } else this.stalledSince = 0;
    }
    if (this.role === "client") {
      if (this.awaitingSnap) this.requestSnapshot(now);
      this.elect(now);
    }
    this.resend(now);
    this.save();
  }

  private advance(now: number) {
    const sim = this.sim!;
    const orders = this.schedule.get(sim.tick) ?? [];
    this.schedule.delete(sim.tick);
    const prev = new Map<number, [number, number]>();
    for (const u of sim.units) prev.set(u.id, [u.x, u.y]);
    this.prev = prev;
    step(sim, orders);
    this.lastStepAt = now;
    if (sim.ev.length && this.events.length < 400) this.events.push(...sim.ev);
    if (sim.tick % CHECK_EVERY === 0) {
      const h = hash(sim);
      if (this.role === "host") this.checks.push([sim.tick, h]);
      else {
        this.computed.set(sim.tick, h);
        this.verify(sim.tick, now);
        for (const k of this.computed.keys()) if (k < sim.tick - 500) { this.computed.delete(k); this.expected.delete(k); }
      }
    }
  }

  private verify(tick: number, now: number) {
    const mine = this.computed.get(tick), theirs = this.expected.get(tick);
    if (mine === undefined || theirs === undefined || mine === theirs) return;
    this.desyncs++;
    console.warn(`[jeu-oublie] desync at tick ${tick}; resynchronising`);
    this.awaitingSnap = true;
    this.status = "syncing";
    this.requestSnapshot(now, true);
  }

  // ---------- host ----------

  private becomeHost(now: number, epoch: number) {
    const sim = this.sim!;
    this.role = "host";
    this.epoch = epoch;
    this.hostId = this.info.me;
    this.status = "live";
    this.awaitingSnap = false;
    // Never schedule before a tick another browser may already have run.
    this.final = Math.max(this.final, sim.tick);
    this.clockBase = now - sim.tick * TICK_MS;
    this.lastSend = 0;
    this.lastHostMsg = now;
    for (const [id, m] of this.mine) if (!this.seen.has(id)) this.inbox.push({ seat: this.seat, id, c: m.c });
  }

  private sendTurn(now: number) {
    const sim = this.sim!;
    const at = Math.max(this.final, sim.tick);
    const o: Scheduled[] = this.inbox.map((m) => [at, m.seat, m.id, m.c]);
    this.inbox = [];
    for (const [tick, seat, id, c] of o) { this.queue(tick, seat, c); this.mark(id); this.mine.delete(id); }
    this.final = sim.tick + LEAD;
    const turn: Turn = { e: this.epoch, p: this.info.me, s: ++this.seq, h: sim.tick, f: this.final, o };
    if (this.checks.length) turn.k = this.checks.splice(0);
    this.send("t", turn);
    this.lastSend = now;
    this.lastHostMsg = now;
  }

  private onOrder(m: { p: string; id: string; c: unknown }) {
    if (this.role !== "host" || !m || typeof m.id !== "string" || m.id.length > 40 || this.seen.has(m.id)) return;
    const seat = this.info.roster.indexOf(m.p);
    if (seat < 0) return;
    this.mark(m.id);
    this.inbox.push({ seat, id: m.id, c: m.c });
  }

  private onSnapRequest(m: { p: string }) {
    const now = performance.now();
    if (!this.sim || !m) return;
    // Without a host, any browser holding a state helps the candidate start one.
    const helping = this.role === "client" && now - this.lastHostMsg > HOST_SILENCE_MS;
    if (this.role !== "host" && !helping) return;
    if (now - this.lastSnapSent < 400) return;
    this.lastSnapSent = now;
    const o: Scheduled[] = [];
    for (const [tick, list] of this.schedule) if (tick >= this.sim.tick) for (const x of list) o.push([tick, x.p, "", x.c]);
    const { ev: _ev, ...st } = this.sim;
    void _ev;
    this.send("s", { e: this.epoch, p: this.info.me, s: this.seq, h: this.sim.tick, f: this.final, st, o, to: "*" } satisfies Omit<Snapshot, "st"> & { st: Omit<Sim, "ev"> });
  }

  // ---------- client ----------

  private deliver(id: string, c: unknown) {
    if (this.role === "host") {
      if (!this.seen.has(id)) { this.mark(id); this.inbox.push({ seat: this.seat, id, c }); }
    } else this.send("o", { p: this.info.me, id, c });
  }

  private resend(now: number) {
    for (const [id, m] of this.mine) {
      if (this.seen.has(id)) { this.mine.delete(id); continue; }
      if (now - m.at < RESEND_MS) continue;
      if (m.tries >= 4) { this.mine.delete(id); continue; }
      m.at = now; m.tries++;
      this.deliver(id, m.c);
    }
  }

  private rank(id: string) {
    const r = this.info.roster.indexOf(id);
    return r < 0 ? 99 : r;
  }

  private onTurn(t: Turn) {
    const now = performance.now();
    if (!t || !num(t.e) || !num(t.s) || !num(t.f) || !num(t.h) || !Array.isArray(t.o) || typeof t.p !== "string") return;
    if (this.role === "host") {
      // Two hosts: the newer epoch wins, then the earlier seat. The loser resynchronises.
      if (t.e > this.epoch || (t.e === this.epoch && this.rank(t.p) < this.rank(this.info.me))) {
        this.role = "client";
        this.epoch = t.e;
        this.hostId = t.p;
        this.lastHostMsg = now;
        this.awaitingSnap = true;
        this.status = "syncing";
        this.requestSnapshot(now, true);
      }
      return;
    }
    if (t.e < this.epoch) return;
    this.lastHostMsg = now;
    if (t.e > this.epoch || t.p !== this.hostId) {
      this.epoch = t.e;
      this.hostId = t.p;
      this.awaitingSnap = true;
      this.status = "syncing";
    }
    if (this.awaitingSnap || !this.sim) { this.requestSnapshot(now); return; }
    if (t.s <= this.seq) return;
    if (t.s !== this.seq + 1) { this.lost(now); return; }
    for (const [tick] of t.o) if (!num(tick) || tick < this.sim.tick) { this.lost(now); return; }
    this.seq = t.s;
    for (const [tick, seat, id, c] of t.o) { this.queue(tick, seat, c); if (typeof id === "string") { this.mark(id); this.mine.delete(id); } }
    this.final = Math.max(this.final, t.f);
    this.hostTick = { h: t.h, at: now };
    for (const [k, h] of t.k ?? []) { this.expected.set(k, h); this.verify(k, now); }
  }

  private lost(now: number) {
    this.awaitingSnap = true;
    this.status = "syncing";
    this.requestSnapshot(now, true);
  }

  private requestSnapshot(now: number, force = false) {
    if (!this.joined || (!force && now - this.lastSnapRequest < SNAP_REQUEST_MS)) return;
    this.lastSnapRequest = now;
    this.send("q", { p: this.info.me });
  }

  private onSnapshot(m: Snapshot) {
    if (this.role === "host" || !m || (m.to !== "*" && m.to !== this.info.me) || !m.st || m.st.v !== 1) return;
    if (!this.awaitingSnap && this.sim) return;
    if (m.e < this.epoch) return;
    const now = performance.now();
    this.sim = { ...m.st, ev: [] };
    this.schedule.clear();
    for (const [tick, seat, , c] of m.o) this.queue(tick, seat, c);
    this.final = m.f;
    this.seq = m.s;
    this.epoch = m.e;
    this.hostId = m.p;
    this.hostTick = { h: m.h, at: now };
    this.expected.clear();
    this.computed.clear();
    this.prev = new Map();
    this.lastStepAt = now;
    this.awaitingSnap = false;
    this.status = "live";
  }

  private elect(now: number) {
    if (!this.connectedAt || now - this.connectedAt < LISTEN_FIRST_MS || now - this.lastHostMsg < HOST_SILENCE_MS) return;
    // The silent host may still look present for a while: skip it.
    const candidate = this.info.roster.find((id) => this.present.has(id) && id !== this.hostId)
      ?? this.info.roster.find((id) => this.present.has(id));
    if (candidate !== this.info.me) return;
    if (!this.sim) { this.requestSnapshot(now); return; }
    this.becomeHost(now, Math.max(this.epoch, 0) + 1);
    console.info(`[jeu-oublie] this browser now runs the battle clock (epoch ${this.epoch})`);
  }

  // ---------- bookkeeping ----------

  private queue(tick: number, seat: number, c: unknown) {
    if (!num(tick) || !num(seat)) return;
    const list = this.schedule.get(tick);
    if (list) list.push({ p: seat, c });
    else this.schedule.set(tick, [{ p: seat, c }]);
  }

  private mark(id: string) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length > 600) this.seen.delete(this.seenOrder.shift()!);
  }

  private save(force = false) {
    const now = performance.now();
    if (!this.sim || this.status !== "live" || (!force && now - this.lastSave < SAVE_MS)) return;
    this.lastSave = now;
    try {
      if (this.sim.over) localStorage.removeItem(snapKey(this.info.code, this.info.match));
      else {
        const { ev: _ev, ...st } = this.sim;
        void _ev;
        localStorage.setItem(snapKey(this.info.code, this.info.match), JSON.stringify({ e: this.epoch, st }));
      }
    } catch {}
  }
}

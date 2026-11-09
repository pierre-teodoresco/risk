// The room around the battle: lobby, factions, start, resignations and the final result.
// The battle itself does not go through the server (see sim.ts and net.ts): the server only
// hands every browser the same seed and roster, then records the result one of them reports.
import type { Action } from "../../platform/contract";
import { fail } from "../../platform/errors";
import { FACTION_IDS, isFaction, type FactionId } from "./factions";

export const MIN_PLAYERS = 2, MAX_PLAYERS = 4;
const OFFLINE_MS = 45000;

export type Player = {
  id: string; name: string; tokenHash: string; joined: number; lastSeen: number;
  faction: FactionId; resigned: boolean; left: boolean;
};
export type SeatStats = { id: string; tiles: number; kills: number; lost: number; out: number };
export type Result = { match: number; winner: string; ticks: number; at: number; stats: SeatStats[] };
export type Game = {
  game: "jeu-oublie"; code: string; channel: string; revision: number; created: number; updated: number;
  host: string; players: Player[]; phase: "lobby" | "playing" | "finished";
  /** Increases at each start; separates the Realtime channels and saved snapshots of rematches. */
  match: number;
  seed: number;
  started: number | null;
  /** Seats of the current battle, in simulation order (seat = index). */
  roster: { id: string; faction: FactionId }[];
  /** Browser that runs the battle clock at the start; others take over if it disappears. */
  simHost: string;
  result: Result | null;
  requests?: Record<string, string[]>;
};

const uid = () => crypto.randomUUID();
const validName = (v: unknown) =>
  typeof v === "string" && v.trim().length >= 2 && v.trim().length <= 20 ? v.trim() : fail("invalidName");
const player = (g: Game, id: string) => g.players.find((p) => p.id === id) ?? fail("notMember");
const faction = (v: unknown, fallback: FactionId) => (v === undefined ? fallback : isFaction(v) ? v : fail("invalidFaction"));
const count = (v: unknown, max: number) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= -1 && v <= max ? v : fail("invalidAction");

function newPlayer(input: Record<string, unknown>, hash: string, now: number): Player {
  return {
    id: uid(), name: validName(input.name), tokenHash: hash, joined: now, lastSeen: now,
    faction: faction(input.faction, FACTION_IDS[0]), resigned: false, left: false,
  };
}

export function createGame(code: string, input: Record<string, unknown>, hash: string, now: number): Game {
  const p = newPlayer(input, hash, now);
  return {
    game: "jeu-oublie", code, channel: uid(), revision: 0, created: now, updated: now, host: p.id, players: [p],
    phase: "lobby", match: 0, seed: 0, started: null, roster: [], simHost: "", result: null,
  };
}

export function joinGame(input: Game, profile: Record<string, unknown>, hash: string, now: number): Game {
  const g = structuredClone(input);
  if (g.phase !== "lobby") fail("alreadyStarted");
  if (g.players.length >= MAX_PLAYERS) fail("roomFull");
  g.players.push(newPlayer(profile, hash, now));
  g.updated = now;
  return g;
}

function maintenance(g: Game, now: number) {
  const online = g.players.filter((p) => !p.left && now - p.lastSeen < OFFLINE_MS).sort((a, b) => a.joined - b.joined);
  if (!online.some((p) => p.id === g.host) && online.length) g.host = online[0].id;
}

export function applyAction(input: Game, actor: string, action: Action, random: () => number = Math.random, now = Date.now()): Game {
  const g = structuredClone(input), p = player(g, actor);
  if (p.left) fail("notMember");
  g.updated = now;
  p.lastSeen = now;
  maintenance(g, now);
  const hostOnly = () => { if (g.host !== actor) fail("hostOnly"); };
  switch (action.type) {
    case "heartbeat":
      return g;
    case "profile": {
      if (g.phase !== "lobby") fail("alreadyStarted");
      if (action.name !== undefined) p.name = validName(action.name);
      p.faction = faction(action.faction, p.faction);
      return g;
    }
    case "start": {
      hostOnly();
      if (g.phase !== "lobby") fail("invalidPhase");
      g.players = g.players.filter((x) => !x.left);
      if (g.players.length < MIN_PLAYERS || g.players.length > MAX_PLAYERS) fail("playerCount");
      for (const x of g.players) x.resigned = false;
      g.match++;
      g.seed = Math.floor(random() * 0x7fffffff);
      g.started = now;
      g.roster = g.players.map((x) => ({ id: x.id, faction: x.faction }));
      g.simHost = actor;
      g.result = null;
      g.phase = "playing";
      return g;
    }
    case "resign": {
      if (g.phase !== "playing" || !g.roster.some((s) => s.id === actor)) fail("invalidPhase");
      if (p.resigned) fail("eliminated");
      p.resigned = true;
      return g;
    }
    case "finish": {
      // Reported by a browser when its simulation ends; every browser reaches the same end,
      // so the first report wins and the others are accepted without effect.
      if (g.phase === "finished" && action.match === g.match) return g;
      if (g.phase !== "playing" || action.match !== g.match) fail("invalidPhase");
      const ids = g.roster.map((s) => s.id);
      const winner = action.winner === "" ? "" : ids.includes(String(action.winner)) ? String(action.winner) : fail("invalidAction");
      const ticks = count(action.ticks, 10_000_000);
      const raw = Array.isArray(action.stats) ? action.stats : fail("invalidAction");
      if (raw.length !== ids.length) fail("invalidAction");
      const stats = raw.map((s: Record<string, unknown>, i): SeatStats => {
        if (!s || typeof s !== "object" || s.id !== ids[i]) fail("invalidAction");
        return { id: ids[i], tiles: count(s.tiles, 10_000), kills: count(s.kills, 1_000_000), lost: count(s.lost, 1_000_000), out: count(s.out, 10_000_000) };
      });
      g.result = { match: g.match, winner, ticks, at: now, stats };
      g.phase = "finished";
      return g;
    }
    case "again": {
      hostOnly();
      if (g.phase !== "finished") fail("invalidPhase");
      g.players = g.players.filter((x) => !x.left);
      for (const x of g.players) x.resigned = false;
      g.phase = "lobby";
      return g;
    }
    case "abort": {
      // Stops a battle that cannot go on (everyone lost the connection to it, for instance).
      hostOnly();
      if (g.phase !== "playing") fail("invalidPhase");
      g.players = g.players.filter((x) => !x.left);
      for (const x of g.players) x.resigned = false;
      g.phase = "lobby";
      g.result = null;
      return g;
    }
    case "kick":
    case "leave": {
      if (action.type === "kick") hostOnly();
      const target = action.type === "kick" ? player(g, String(action.player)) : p;
      if (action.type === "kick" && (g.phase !== "lobby" || target.id === actor)) fail("invalidAction");
      if (g.phase === "lobby") g.players = g.players.filter((x) => x.id !== target.id);
      else { target.left = true; target.resigned = true; }
      if (!g.players.some((x) => x.id === g.host && !x.left)) g.host = g.players.find((x) => !x.left)?.id ?? "";
      return g;
    }
  }
  return fail("invalidAction");
}

/** Everything is public in this game except identity hashes and request ids. */
export function publicGame(g: Game, actor: string) {
  return {
    game: g.game, code: g.code, channel: g.channel, revision: g.revision, host: g.host, phase: g.phase,
    match: g.match, seed: g.seed, started: g.started, roster: g.roster, simHost: g.simHost, result: g.result,
    me: actor, serverTime: g.updated,
    players: g.players.map((p) => ({
      id: p.id, name: p.name, faction: p.faction, resigned: p.resigned, left: p.left, online: g.updated - p.lastSeen < OFFLINE_MS,
    })),
  };
}
export type PublicGame = ReturnType<typeof publicGame>;
export type PublicPlayer = PublicGame["players"][number];

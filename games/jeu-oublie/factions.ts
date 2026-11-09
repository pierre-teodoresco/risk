// The four factions. All start from the same base unit; each is better at one thing and pays
// for it elsewhere. This table is the only place to tune them: the simulation, the lobby and
// the rules booklet all read it. Keep `strength` in line with the numbers when you rebalance,
// and check with `npx tsx scripts/balance-jeu-oublie.ts 30` (bot matches, see docs/jeu-oublie.md).
// Values of 2026-11-09: win rates 49 / 43 / 53 / 54 % over 180 bot games per faction.
// Combat works in whole hits (hp ÷ damage, rounded up): small changes can jump a threshold.

/** The reference unit every faction starts from. */
export const BASE_STATS = {
  /** Seconds between two units leaving the base, before the territory bonus. */
  spawn: 5,
  /** Tiles per second. */
  speed: 1.5,
  hp: 100,
  /** Damage per hit; every unit hits once per second. */
  damage: 10,
};
export type Stats = typeof BASE_STATS;

export const FACTION_IDS = ["escargots", "joggeurs", "armoires", "mamies"] as const;
export type FactionId = (typeof FACTION_IDS)[number];

export type Faction = {
  id: FactionId;
  /** The stat this faction is known for, shown first in the lobby. */
  strength: keyof Stats;
  stats: Stats;
  /** Body and trim colours of the unit drawing, under the player's colour. */
  look: { body: string; trim: string };
};

export const FACTIONS: Record<FactionId, Faction> = {
  // Spawn faster (−16 % wait), a little weaker (−10 % health and damage).
  escargots: { id: "escargots", strength: "spawn", stats: { spawn: 4.2, speed: 1.5, hp: 90, damage: 9 }, look: { body: "#c9a46b", trim: "#8a5a2b" } },
  // Walk faster (+33 %), hit softer (−10 %), slightly sturdier (+8 %).
  joggeurs: { id: "joggeurs", strength: "speed", stats: { spawn: 5, speed: 2, hp: 108, damage: 9 }, look: { body: "#f2c6a0", trim: "#ffffff" } },
  // Hit harder (+30 %), fewer hit points (−20 %).
  armoires: { id: "armoires", strength: "damage", stats: { spawn: 5, speed: 1.5, hp: 80, damage: 13 }, look: { body: "#9c6b3f", trim: "#5e3d20" } },
  // More hit points (+15 %), slower (−27 %), hit softer (−10 %).
  mamies: { id: "mamies", strength: "hp", stats: { spawn: 5, speed: 1.1, hp: 115, damage: 9 }, look: { body: "#e7e2f2", trim: "#a998c9" } },
};

export const isFaction = (v: unknown): v is FactionId => typeof v === "string" && (FACTION_IDS as readonly string[]).includes(v);

/** Player colours by seat (join order): flat, loud, very 2006. */
export const COLORS = ["#ff3b3b", "#2f7bff", "#ffc600", "#2fd15a"] as const;

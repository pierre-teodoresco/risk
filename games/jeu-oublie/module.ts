import type { GameModule } from "@/platform/contract";
import { applyAction, createGame, joinGame, publicGame, type Game } from "./engine";
export const jeuOublie: GameModule<Game> = {
  id: "jeu-oublie", create: createGame, join: joinGame, apply: applyAction, view: publicGame,
  preview: (g) => ({ code: g.code, phase: g.phase, players: g.players.filter((p) => !p.left).map((p) => ({ name: p.name, faction: p.faction })) }),
  // Heartbeats only matter to others when they move the host.
  notify: (a, b, action) => action.type !== "heartbeat" || a.host !== b.host,
};

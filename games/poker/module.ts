import type { GameModule } from "@/platform/contract";
import { applyAction, createGame, joinGame, publicGame, type Game } from "./engine";
export const poker: GameModule<Game> = {
  id: "poker", create: createGame, join: joinGame, apply: applyAction, view: publicGame,
  preview: (g) => ({ code: g.code, phase: g.phase, players: g.players.filter((p) => !p.left).map((p) => ({ name: p.name, emblem: p.emblem })) }),
  notify: (a, b, action) => action.type !== "heartbeat" || a.host !== b.host || a.phase !== b.phase || a.paused !== b.paused || a.active !== b.active || a.street !== b.street || a.handNumber !== b.handNumber || a.events.at(-1)?.id !== b.events.at(-1)?.id,
};

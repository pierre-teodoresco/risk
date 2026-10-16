// Mappa as a platform brick: a thin adapter over the engine in lib/game.ts.
import type { GameModule } from "@/platform/contract";
import { applyAction, createGame, joinGame, publicGame, type Game } from "@/lib/game";

export const mappa: GameModule<Game> = {
  id: "mappa",
  create: (code, input, hash, now) =>
    createGame(code, input.name, typeof input.color === "number" ? input.color : 0, hash, now),
  join: (state, input, hash, now) => joinGame(state, input.name, input.color, hash, now),
  apply: (state, actor, action, random, now) => applyAction(state, actor, action, random, now),
  view: publicGame,
  preview: (g) => ({
    code: g.code,
    phase: g.phase,
    players: g.players.map((p) => ({ name: p.name, color: p.color })),
    timer: g.timer,
  }),
  notify: (previous, next, action) =>
    action.type !== "heartbeat" ||
    next.phase !== previous.phase ||
    next.paused !== previous.paused ||
    next.host !== previous.host ||
    next.active !== previous.active,
};

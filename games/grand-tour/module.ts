// Grand Tour as a platform brick.
import type { GameModule } from "@/platform/contract";
import { applyAction, createGame, joinGame, publicGame, type Game } from "./engine";

export const grandTour: GameModule<Game> = {
  id: "grand-tour",
  create: createGame,
  join: joinGame,
  apply: applyAction,
  view: publicGame,
  preview: (g) => ({
    code: g.code,
    phase: g.phase,
    players: g.players.filter((p) => !p.left).map((p) => ({ name: p.name, emblem: p.emblem })),
  }),
  notify: (previous, next, action) =>
    action.type !== "heartbeat" ||
    next.phase !== previous.phase ||
    next.paused !== previous.paused ||
    next.host !== previous.host ||
    next.active !== previous.active ||
    next.step !== previous.step ||
    next.events.at(-1)?.id !== previous.events.at(-1)?.id,
};

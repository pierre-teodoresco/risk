import type { GameModule } from "@/platform/contract";
import { applyAction, createGame, joinGame, publicGame, type Game } from "./engine";
export const blackjack: GameModule<Game> = {
  id: "blackjack", create: createGame, join: joinGame, apply: applyAction, view: publicGame,
  preview: (g) => ({ code: g.code, phase: g.phase, players: g.players.filter((p) => !p.left).map((p) => ({ name: p.name, emblem: p.emblem })) }),
  notify: (a, b, action) => action.type !== "heartbeat" || a.host !== b.host || a.phase !== b.phase || a.paused !== b.paused || a.step !== b.step || a.active !== b.active || a.activeHand !== b.activeHand || a.round !== b.round || a.events.at(-1)?.id !== b.events.at(-1)?.id,
};

// Server-side list of playable bricks. A brick listed here can create rooms through /api/rooms.
import "server-only";
import type { GameModule, RoomState } from "./contract";
import { GameError } from "./errors";
import { mappa } from "@/games/mappa/module";
import { pioche } from "@/games/pioche/module";
import { grandTour } from "@/games/grand-tour/module";
import { echecs } from "@/games/echecs/module";
import { poker } from "@/games/poker/module";
import { dames } from "@/games/dames/module";

// Each module only ever receives rooms of its own game (see gameOf), hence the widening casts.
const MODULES: Record<string, GameModule<RoomState>> = {
  [poker.id]: poker as unknown as GameModule<RoomState>,
  [mappa.id]: mappa as unknown as GameModule<RoomState>,
  [pioche.id]: pioche as unknown as GameModule<RoomState>,
  [grandTour.id]: grandTour as unknown as GameModule<RoomState>,
  [echecs.id]: echecs as unknown as GameModule<RoomState>,
  [dames.id]: dames as unknown as GameModule<RoomState>,
};
/** Rooms saved before the hub carry no game id: they are Mappa rooms. */
export const LEGACY_GAME = mappa.id;
export const gameOf = (state: RoomState) => state.game ?? LEGACY_GAME;
export function moduleFor(id: unknown) {
  const m = typeof id === "string" ? MODULES[id] : undefined;
  if (!m) throw new GameError("invalidAction");
  return m;
}

// International draughts as a platform brick.
import type { GameModule } from "@/platform/contract";
import type { Duel } from "../duel/engine";
import { draughts } from "./engine";
import type { Position } from "./rules";

export const dames: GameModule<Duel<Position>> = {
  id: "dames",
  create: draughts.create,
  join: draughts.join,
  apply: draughts.apply,
  view: draughts.view,
  preview: draughts.preview,
  notify: draughts.notify,
};

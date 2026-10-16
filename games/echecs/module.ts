// Chess as a platform brick.
import type { GameModule } from "@/platform/contract";
import type { Duel } from "../duel/engine";
import { chess } from "./engine";
import type { Position } from "./rules";

export const echecs: GameModule<Duel<Position>> = {
  id: "echecs",
  create: chess.create,
  join: chess.join,
  apply: chess.apply,
  view: chess.view,
  preview: chess.preview,
  notify: chess.notify,
};

import type { PiocheTexts } from "../i18n";

const EMOJI: Record<string, string> = { clap: "👏", laugh: "😂", shock: "😱", angry: "😡" };
/** Emoji reactions read the same in every language; word reactions are translated. */
export const reactionGlyph = (key: string, tx: PiocheTexts) => EMOJI[key] ?? tx.reactionLabels[key] ?? key;

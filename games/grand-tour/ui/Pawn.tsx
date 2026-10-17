import { EmblemShapes } from "@/components/Crest";
import { EMBLEM_INK, EMBLEM_OUTLINE, emblemOf } from "@/lib/emblems";
import { PAWN_HEX } from "../i18n";

/** Shared SVG source for player cards and the server-rendered 3D avatar textures. */
export function Pawn({ emblem, size = 30 }: { emblem: number; size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="gt-pawn-face" viewBox="-2 -2 68 68" width={size} height={size} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill={PAWN_HEX[emblem % PAWN_HEX.length]} stroke="#ffffff" strokeWidth="4" />
      <g transform="translate(32 33) scale(.82)" fill="#fff" stroke={EMBLEM_INK} strokeWidth={EMBLEM_OUTLINE} strokeLinejoin="round">
        <EmblemShapes emblem={emblemOf(emblem)} />
      </g>
    </svg>
  );
}

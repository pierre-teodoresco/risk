import { EMBLEM_INK, EMBLEM_OUTLINE, emblemOf } from "@/lib/emblems";
import { EmblemShapes } from "./Crest";

// Player medallion without a player colour, for games whose colours already mean something.
export default function EmblemBadge({ emblem, size, className = "" }: { emblem: number; size?: number; className?: string }) {
  return (
    <svg className={"emblem-badge " + className} viewBox="-2 -2 68 68" width={size} height={size} aria-hidden="true">
      <circle cx="32" cy="32" r="31" fill="#2b2145" stroke="#fff7e3" strokeWidth="2" />
      <circle cx="32" cy="32" r="25" fill="none" stroke="#fff7e3" strokeOpacity=".25" strokeWidth="1.6" strokeDasharray="1.5 3" />
      <g transform="translate(32 33)" fill="#fff7e3" stroke={EMBLEM_INK} strokeWidth={EMBLEM_OUTLINE} strokeLinejoin="round">
        <EmblemShapes emblem={emblemOf(emblem)} />
      </g>
    </svg>
  );
}

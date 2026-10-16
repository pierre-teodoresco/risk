import { EMBLEM_INK, EMBLEM_OUTLINE, STROKE_EMBLEM_WIDTHS, emblemOf, type Emblem } from "@/lib/emblems";

// Faction crest per colour: medallion in the player's colour with an outlined emblem.
// The fill reads the --pcN variables so the colour-blind palette applies everywhere.
function EmblemShapes({ emblem }: { emblem: Emblem }) {
  const shapes = emblem.strokeOnly ? (
    <g fill="none" strokeLinecap="round">
      {[[EMBLEM_INK, STROKE_EMBLEM_WIDTHS.outline], ["#fff", STROKE_EMBLEM_WIDTHS.inner]].map(([c, w]) => (
        <g key={c} stroke={c as string} strokeWidth={w as number}>
          {emblem.shapes.map((d) => <path key={d} d={d} />)}
        </g>
      ))}
    </g>
  ) : (
    emblem.shapes.map((d) => <path key={d} d={d} fillRule={emblem.evenOdd ? "evenodd" : undefined} />)
  );
  return emblem.rotate ? <g transform={`rotate(${emblem.rotate})`}>{shapes}</g> : <>{shapes}</>;
}

export default function Crest({
  color,
  size,
  className = "",
}: {
  color: number;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={"crest " + className}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="crest-shine" cx="50%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity=".38" />
          <stop offset=".6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".3" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="32" style={{ fill: `var(--pc${color}, #9aa3ad)` }} />
      <path d="M32 0a32 32 0 0 1 0 64z" fill="#000" opacity=".1" />
      <circle cx="32" cy="32" r="32" fill="url(#crest-shine)" />
      <circle
        cx="32"
        cy="32"
        r="26.5"
        fill="none"
        stroke="#fff"
        strokeOpacity=".45"
        strokeWidth="1.6"
        strokeDasharray="1.5 3"
      />
      <g
        transform="translate(32 33)"
        fill="#fff"
        stroke={EMBLEM_INK}
        strokeWidth={EMBLEM_OUTLINE}
        strokeLinejoin="round"
      >
        <EmblemShapes emblem={emblemOf(color)} />
      </g>
    </svg>
  );
}

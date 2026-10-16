// Flat chess pieces in the style of online boards: thick dark outline, soft shading, a base under
// every piece. Drawn on a 100 × 100 square.
import type { Cell, Color, Kind } from "../rules";

const INK = { w: "#38352f", b: "#1d1b19" };
const FILL = { w: ["#ffffff", "#e3ddd2"], b: ["#6e6a66", "#3b3835"] };
const DETAIL = { w: "#38352f", b: "#a8a39d" };

function Shapes({ kind, c }: { kind: Kind; c: Color }) {
  const base = <rect x="22" y="79" width="56" height="11" rx="5.5" />;
  const d = DETAIL[c];
  switch (kind) {
    case "p":
      return (
        <>
          <path d="M32 81C32 66 41 59 43 49H57C59 59 68 66 68 81Z" />
          <rect x="36" y="43" width="28" height="8" rx="4" />
          <circle cx="50" cy="31" r="13.5" />
          {base}
        </>
      );
    case "r":
      return (
        <>
          <path d="M31 80L34 46H66L69 80Z" />
          <rect x="27" y="68" width="46" height="10" rx="3.5" />
          <rect x="30" y="38" width="40" height="9" rx="3" />
          <path d="M28 15H39V23H45V15H55V23H61V15H72V39H28Z" />
          {base}
        </>
      );
    case "b":
      return (
        <>
          <path d="M33 81C35 72 41 68 43 63H57C59 68 65 72 67 81Z" />
          <rect x="36" y="58" width="28" height="8" rx="4" />
          <path d="M50 18C63 28 68 38 65 47C63 55 57 60 50 60C43 60 37 55 35 47C32 38 37 28 50 18Z" />
          <circle cx="50" cy="14" r="5.5" />
          <path d="M55 31L46 44" fill="none" stroke={d} strokeWidth="4" />
          <path d="M42 51H58" fill="none" stroke={d} strokeWidth="3" />
          {base}
        </>
      );
    case "n":
      return (
        <>
          <path d="M30 81C29 70 33 63 44 55C38 54 33 57 29 61C25 64 20 61 20 56C21 47 30 37 38 31C38 26 40 21 45 16L49 23C51 21 54 20 57 20L57 25C68 30 76 42 76 57C76 67 73 74 72 81Z" />
          <circle cx="43" cy="37" r="3" fill={d} stroke="none" />
          <path d="M26 56L28 54" fill="none" stroke={d} strokeWidth="3" />
          <path d="M57 26C65 34 69 44 69 58" fill="none" stroke={d} strokeWidth="2.5" opacity=".55" />
          {base}
        </>
      );
    case "q":
      return (
        <>
          <path d="M30 80L21 35L34 58L36 29L44 54L50 24L56 54L64 29L66 58L79 35L70 80Z" />
          <rect x="27" y="68" width="46" height="10" rx="4" />
          <circle cx="21" cy="32" r="5.5" />
          <circle cx="36" cy="25" r="5.5" />
          <circle cx="50" cy="19" r="5.5" />
          <circle cx="64" cy="25" r="5.5" />
          <circle cx="79" cy="32" r="5.5" />
          {base}
        </>
      );
    case "k":
      return (
        <>
          <path d="M30 80C25 67 20 57 23 48C26 39 37 37 44 45L50 52L56 45C63 37 74 39 77 48C80 57 75 67 70 80Z" />
          <path d="M50 53C43 45 41 37 50 30C59 37 57 45 50 53Z" />
          <rect x="27" y="68" width="46" height="10" rx="4" />
          <rect x="46.5" y="9" width="7" height="23" rx="2" />
          <rect x="40" y="14.5" width="20" height="7" rx="2" />
          {base}
        </>
      );
  }
}

/** One piece as an SVG filling its box. */
export default function Piece({ cell, className }: { cell: Exclude<Cell, null>; className?: string }) {
  const c = cell[0] as Color, kind = cell[1] as Kind;
  const id = `cc-fill-${c}`;
  return (
    <svg className={className} viewBox="6 5 88 88" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={FILL[c][0]} />
          <stop offset="1" stopColor={FILL[c][1]} />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`} stroke={INK[c]} strokeWidth="3.6" strokeLinejoin="round" strokeLinecap="round">
        <Shapes kind={kind} c={c} />
      </g>
    </svg>
  );
}

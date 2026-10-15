import { COLORS } from "@/lib/world";

// Faction crest per colour: medallion in the player's colour with an outlined emblem.
const STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 8 : 19, a = (i * Math.PI) / 5;
  return `${(r * Math.sin(a)).toFixed(1)},${(-r * Math.cos(a)).toFixed(1)}`;
}).join(" ");
const EMBLEMS = [
  // Crown
  <>
    <path d="M-17 9-19-11-9-3 0-17 9-3 19-11 17 9Z" />
    <rect x="-18" y="9" width="36" height="8" rx="2.5" />
  </>,
  // Sword
  <g transform="rotate(40)">
    <path d="M-3.5-19 0-25 3.5-19V5h-7Z" />
    <rect x="-12" y="5" width="24" height="6" rx="2.5" />
    <rect x="-3" y="11" width="6" height="8" rx="1.5" />
    <circle cy="22" r="4" />
  </g>,
  // Tower
  <path d="M-14 18V-4h-4v-14h7v6h5v-6h12v6h5v-6h7v14h-4v22Zm9 0v-9a5 5 0 0 1 10 0v9Z" fillRule="evenodd" />,
  // Star
  <polygon points={STAR} />,
  // Anchor (strokes drawn twice: dark outline, then white)
  <g fill="none" strokeLinecap="round">
    {[["#0a1830", 9], ["#fff", 4.5]].map(([c, w]) => (
      <g key={c} stroke={c as string} strokeWidth={w as number}>
        <circle cy="-14" r="4.5" />
        <path d="M0-9V17M-9-3H9M-15 5Q-13 18 0 18 13 18 15 5" />
      </g>
    ))}
  </g>,
  // Lightning
  <path d="M4-21-12 3h9l-5 18 17-25H0l5-17Z" />,
];

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
      <circle cx="32" cy="32" r="32" fill={COLORS[color] ?? "#9aa3ad"} />
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
        stroke="#0a1830"
        strokeWidth="3"
        strokeLinejoin="round"
      >
        {EMBLEMS[color % EMBLEMS.length]}
      </g>
    </svg>
  );
}

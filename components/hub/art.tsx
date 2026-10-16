// Box-lid illustrations for the hub shelf, one per game id. Server-only: Mappa's art reads the
// map shapes, which must not ship in the hub's client bundle.
import type { ReactNode } from "react";
import MAP from "@/lib/map-data.json";
import { CONTINENTS, WORLD } from "@/lib/world";

const VIEW = "0 0 320 200";
const MAP_POINT_STEP = 2; // keep one map vertex in two: plenty at box-art size
const MIN_RING_POINTS = 12;

const TERR = MAP.territories as Record<string, { rings: number[][][] }>;
const CONTINENT_COLOR = Object.fromEntries(CONTINENTS.map((c) => [c.id, c.color]));
const ringPath = (ring: number[][]) => {
  const pts = ring.length > MIN_RING_POINTS ? ring.filter((_, i) => i % MAP_POINT_STEP === 0) : ring;
  return "M" + pts.map(([x, y]) => `${x} ${y}`).join("L") + "Z";
};

function MappaArt() {
  const [x, y, w, h] = MAP.viewBox;
  return (
    <svg viewBox={VIEW} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="art-mappa-sea" cx="50%" cy="40%" r="80%">
          <stop offset="0" stopColor="#2f9fd0" />
          <stop offset="1" stopColor="#0b3a66" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill="url(#art-mappa-sea)" />
      <svg x="-6" y="14" width="332" height="180" viewBox={`${x} ${y} ${w} ${h}`}>
        {WORLD.map((t) => (
          <path
            key={t.id}
            d={TERR[t.id].rings.map(ringPath).join("")}
            fill={CONTINENT_COLOR[t.continent]}
            stroke="#2a1c12"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </svg>
  );
}

const CARD_COLORS = ["#e2483d", "#ffc531", "#4cbb4f", "#2f6fd6", "#1d1d2b"];
const CARD_SYMBOLS = ["7", "+2", "↻", "4", "★"];
function PiocheArt() {
  return (
    <svg viewBox={VIEW} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="320" height="200" fill="#3b1d4a" />
      <circle cx="160" cy="230" r="170" fill="#55286a" />
      {CARD_COLORS.map((c, i) => (
        <g key={c} transform={`rotate(${(i - 2) * 16} 160 260)`}>
          <rect x="128" y="62" width="64" height="96" rx="9" fill="#fff" />
          <rect x="133" y="67" width="54" height="86" rx="6" fill={c} />
          <ellipse cx="160" cy="110" rx="20" ry="30" transform="rotate(28 160 110)" fill="#fff" />
          <text x="160" y="119" textAnchor="middle" fontFamily="Paytone One, sans-serif" fontSize="24" fill={c}>
            {CARD_SYMBOLS[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

const STREETS = ["#e2483d", "#ff7a45", "#ffd24d", "#4cbb4f", "#2f9fd0", "#2f6fd6", "#9b8cff", "#e0559a"];
const TILES_PER_SIDE = 6;
function GrandTourArt() {
  const tiles: ReactNode[] = [];
  const size = 26, x0 = 82, y0 = 22;
  for (let side = 0; side < 4; side++)
    for (let k = 0; k < TILES_PER_SIDE; k++) {
      const pos = [
        [x0 + k * size, y0],
        [x0 + TILES_PER_SIDE * size, y0 + k * size],
        [x0 + (TILES_PER_SIDE - k) * size, y0 + TILES_PER_SIDE * size],
        [x0, y0 + (TILES_PER_SIDE - k) * size],
      ][side];
      const n = side * TILES_PER_SIDE + k;
      tiles.push(
        <g key={n}>
          <rect x={pos[0]} y={pos[1]} width={size} height={size} fill="#fff7e3" stroke="#1d3a2a" strokeWidth="1.5" />
          {k % 3 !== 0 && <rect x={pos[0] + 3} y={pos[1] + 3} width={size - 6} height="7" rx="2" fill={STREETS[n % STREETS.length]} />}
        </g>,
      );
    }
  return (
    <svg viewBox={VIEW} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="320" height="200" fill="#1f5a3c" />
      <g transform="translate(0 -10) scale(1 .62) translate(0 70)">{tiles}</g>
      <g transform="translate(160 104)">
        <path d="M-26 6v26h52V6L0-16Z" fill="#e2483d" stroke="#2a1c12" strokeWidth="3" strokeLinejoin="round" />
        <rect x="-7" y="14" width="14" height="18" fill="#2a1c12" />
        <circle cx="44" cy="22" r="14" fill="#ffd24d" stroke="#2a1c12" strokeWidth="3" />
        <text x="44" y="28" textAnchor="middle" fontFamily="Paytone One, sans-serif" fontSize="16" fill="#2a1c12">€</text>
      </g>
    </svg>
  );
}

const STARS = [[30, 30], [70, 18], [112, 44], [214, 26], [262, 52], [292, 20], [180, 14], [140, 22]];
function LoupGarouArt() {
  return (
    <svg viewBox={VIEW} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="art-wolf-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#120e2e" />
          <stop offset="1" stopColor="#3b2a6e" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#art-wolf-sky)" />
      {STARS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#fff" opacity=".8" />)}
      <circle cx="236" cy="70" r="38" fill="#fff4d0" />
      <circle cx="222" cy="62" r="7" fill="#efe1b2" />
      <circle cx="246" cy="84" r="5" fill="#efe1b2" />
      <path d="M0 200V150Q60 112 120 140T240 132Q290 120 320 142V200Z" fill="#1b1638" />
      <path d="M0 200V170Q80 150 170 172T320 166V200Z" fill="#0d0b22" />
      <g fill="#ffd24d">
        <ellipse cx="96" cy="166" rx="7" ry="4" transform="rotate(-12 96 166)" />
        <ellipse cx="120" cy="166" rx="7" ry="4" transform="rotate(12 120 166)" />
      </g>
    </svg>
  );
}

function DiceArt() {
  return (
    <svg viewBox={VIEW} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="320" height="200" fill="#25324d" />
      <rect x="128" y="68" width="64" height="64" rx="12" fill="#fff" transform="rotate(-10 160 100)" />
    </svg>
  );
}

const ARTS: Record<string, () => ReactNode> = {
  mappa: MappaArt,
  pioche: PiocheArt,
  "grand-tour": GrandTourArt,
  "loup-garou": LoupGarouArt,
};
export const boxArt = (id: string) => (ARTS[id] ?? DiceArt)();

// Faction emblems: one per Mappa colour slot (first six), one per Pioche seat (all eight), as SVG path data centred on (0, 0) within ±25 units.
// Shared by the SVG crests and the canvas-drawn troop coins of the 3D board.
export type Emblem = {
  /** Drawn in order, each filled then outlined, so later shapes cover earlier outlines. */
  shapes: string[];
  rotate?: number;
  evenOdd?: boolean;
  /** Outline-only emblem: drawn as a thick dark stroke under a thin white one. */
  strokeOnly?: boolean;
};

export const EMBLEM_INK = "#0a1830";
export const EMBLEM_OUTLINE = 3;
export const STROKE_EMBLEM_WIDTHS = { outline: 9, inner: 4.5 };

const rect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}` +
  `h${2 * r - w}a${r} ${r} 0 0 1 ${-r} ${-r}v${2 * r - h}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const STAR_POINTS = 10;
const star = () =>
  "M" +
  Array.from({ length: STAR_POINTS }, (_, i) => {
    const r = i % 2 ? 8 : 19, a = (i * Math.PI * 2) / STAR_POINTS;
    return `${(r * Math.sin(a)).toFixed(1)} ${(-r * Math.cos(a)).toFixed(1)}`;
  }).join("L") +
  "Z";

export const EMBLEMS: Emblem[] = [
  // Crown
  { shapes: ["M-17 9-19-11-9-3 0-17 9-3 19-11 17 9Z", rect(-18, 9, 36, 8, 2.5)] },
  // Sword
  {
    rotate: 40,
    shapes: ["M-3.5-19 0-25 3.5-19V5h-7Z", rect(-12, 5, 24, 6, 2.5), rect(-3, 11, 6, 8, 1.5), circle(0, 22, 4)],
  },
  // Tower
  { evenOdd: true, shapes: ["M-14 18V-4h-4v-14h7v6h5v-6h12v6h5v-6h7v14h-4v22Zm9 0v-9a5 5 0 0 1 10 0v9Z"] },
  // Star
  { shapes: [star()] },
  // Anchor
  { strokeOnly: true, shapes: [circle(0, -14, 4.5), "M0-9V17M-9-3H9M-15 5Q-13 18 0 18 13 18 15 5"] },
  // Lightning
  { shapes: ["M4-21-12 3h9l-5 18 17-25H0l5-17Z"] },
  // Moon
  { shapes: ["M4-21A20 20 0 1 0 19 9 16 16 0 1 1 4-21Z"] },
  // Heart
  { shapes: ["M0 19C-15 9-21 0-21-8a10.5 10.5 0 0 1 21-4 10.5 10.5 0 0 1 21 4c0 8-6 17-21 27Z"] },
];

export const emblemOf = (color: number) => EMBLEMS[color % EMBLEMS.length];

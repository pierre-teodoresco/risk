// Flat draughts pieces to match the chess set: a round disc seen from above, with a dark outline,
// a thin edge showing underneath and two grooves; a king carries a gold crown. Drawn on 100 × 100.
const INK = { w: "#38352f", b: "#1d1b19" };
const FILL = { w: ["#ffffff", "#e3ddd2"], b: ["#6e6a66", "#3b3835"] };
const EDGE = { w: "#c9c1b3", b: "#24211e" };
const GROOVE = { w: "#bcb4a6", b: "#2a2724" };

export default function Piece({ cell, className }: { cell: string; className?: string }) {
  const c = (cell[0] === "b" ? "b" : "w") as "w" | "b", king = cell[1] === "k";
  const id = `dm-fill-${c}`;
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={FILL[c][0]} />
          <stop offset="1" stopColor={FILL[c][1]} />
        </linearGradient>
      </defs>
      {/* The edge of the disc peeks out below its face. */}
      <circle cx="50" cy="53" r="38" fill={EDGE[c]} stroke={INK[c]} strokeWidth="3.6" />
      <circle cx="50" cy="49" r="38" fill={`url(#${id})`} stroke={INK[c]} strokeWidth="3.6" />
      <circle cx="50" cy="49" r="27" fill="none" stroke={GROOVE[c]} strokeWidth="3" />
      <circle cx="50" cy="49" r="15" fill="none" stroke={GROOVE[c]} strokeWidth="2.6" />
      {king && (
        <path d="M31 58 L28 36 L40 46 L50 30 L60 46 L72 36 L69 58 Z" fill="#ffcf3a" stroke="#8a5b00" strokeWidth="3" strokeLinejoin="round" />
      )}
    </svg>
  );
}

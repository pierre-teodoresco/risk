// Draughts pieces in the same family as the chess set: a full disc seen from above, a thick dark
// outline and a light relief (a soft highlight on top, a shade along the lower edge); a king
// carries a gold crown. Drawn on a 100 × 100 square.
const INK = { w: "#38352f", b: "#1d1b19" };
const FILL = { w: ["#ffffff", "#e6e0d5"], b: ["#6e6a66", "#3b3835"] };
const SHADE = { w: "#cfc7b8", b: "#2a2724" };

export default function Piece({ cell, className }: { cell: string; className?: string }) {
  const c = (cell[0] === "b" ? "b" : "w") as "w" | "b", king = cell[1] === "k";
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`dm-fill-${c}`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={FILL[c][0]} />
          <stop offset="1" stopColor={FILL[c][1]} />
        </linearGradient>
        <clipPath id="dm-disc">
          <circle cx="50" cy="50" r="38" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="38" fill={`url(#dm-fill-${c})`} />
      {/* Relief: a shade along the lower edge and a soft light near the top. */}
      <g clipPath="url(#dm-disc)">
        <circle cx="50" cy="44" r="38" fill="none" stroke={SHADE[c]} strokeWidth="9" opacity=".8" />
        <ellipse cx="42" cy="32" rx="18" ry="9" fill="#ffffff" opacity={c === "w" ? 0.7 : 0.12} />
      </g>
      <circle cx="50" cy="50" r="38" fill="none" stroke={INK[c]} strokeWidth="5" />
      {king && (
        <path d="M31 62 L28 39 L40 49 L50 33 L60 49 L72 39 L69 62 Z" fill="#ffcf3a" stroke="#8a5b00" strokeWidth="3.5" strokeLinejoin="round" />
      )}
    </svg>
  );
}

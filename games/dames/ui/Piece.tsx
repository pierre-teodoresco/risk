// Flat draughts pieces to match the chess set: a thick disc with a dark outline and two grooves;
// a king carries a gold crown. Drawn on a 100 × 100 square.
const INK = { w: "#38352f", b: "#1d1b19" };
const FILL = { w: ["#ffffff", "#e3ddd2"], b: ["#6e6a66", "#3b3835"] };
const GROOVE = { w: "#b9b1a3", b: "#26231f" };

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
      {/* The edge of the disc, then its face. */}
      <ellipse cx="50" cy="58" rx="40" ry="32" fill={INK[c]} />
      <ellipse cx="50" cy="52" rx="40" ry="32" fill={`url(#${id})`} stroke={INK[c]} strokeWidth="3.6" />
      <ellipse cx="50" cy="52" rx="29" ry="22.5" fill="none" stroke={GROOVE[c]} strokeWidth="3" />
      <ellipse cx="50" cy="52" rx="17" ry="12.5" fill="none" stroke={GROOVE[c]} strokeWidth="2.6" />
      {king && (
        <path
          d="M30 60 L27 38 L39 48 L50 32 L61 48 L73 38 L70 60 Z"
          fill="#ffcf3a"
          stroke="#8a5b00"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

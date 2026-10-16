"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { COLORS } from "@/lib/world";

const pieces = Array.from({ length: 84 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  background: i % 4 === 0 ? "#edc75e" : `var(--pc${i % COLORS.length})`,
  width: `${7 + (i % 4) * 2}px`,
  height: `${10 + (i % 5) * 2}px`,
  borderRadius: i % 3 === 0 ? "50%" : "2px",
  "--confetti-drift": `${((i * 53) % 220) - 110}px`,
  "--confetti-rotation": `${(i % 2 ? 1 : -1) * (540 + (i % 5) * 180)}deg`,
  "--confetti-duration": `${3.6 + (i % 8) * 0.18}s`,
  "--confetti-delay": `${(i % 12) * 0.1}s`,
}));

export default function VictoryConfetti() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timeout = setTimeout(() => setVisible(false), 6500);
    return () => clearTimeout(timeout);
  }, []);
  if (!visible) return null;
  return (
    <div
      className="victory-confetti"
      aria-hidden="true"
      data-testid="victory-confetti"
    >
      {pieces.map((style, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={style as CSSProperties}
        />
      ))}
    </div>
  );
}

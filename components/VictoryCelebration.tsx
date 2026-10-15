"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { Crown, X } from "lucide-react";
import { COLORS, type Lang } from "@/lib/world";
import { texts } from "@/lib/i18n";
import VictoryConfetti from "./VictoryConfetti";

export default function VictoryCelebration({
  winner,
  lang,
}: {
  winner: { name: string; color: number };
  lang: Lang;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timeout = setTimeout(() => setVisible(false), 6500);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVisible(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  if (!visible) return null;
  const t = texts(lang);
  return (
    <>
      <div
        className="victory-celebration"
        style={{ "--winner-color": COLORS[winner.color] } as CSSProperties}
        data-testid="victory-celebration"
      >
        <section
          className="victory-announcement"
          aria-labelledby="victory-result-title"
        >
          <button
            className="icon-button victory-close"
            onClick={() => setVisible(false)}
            aria-label={t.close}
          >
            <X size={18} />
          </button>
          <span className="victory-crown" aria-hidden="true">
            <Crown size={48} strokeWidth={1.5} />
          </span>
          <h2 id="victory-result-title">
            {t.victoryOf}
            <strong>{winner.name}</strong>
          </h2>
          <p>{t.victoryComplete}</p>
        </section>
      </div>
      <VictoryConfetti />
    </>
  );
}

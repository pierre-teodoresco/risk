"use client";
import { useEffect, useState } from "react";
import { ShieldOff } from "lucide-react";
import type { Lang } from "@/lib/world";
import { texts } from "@/lib/i18n";

export default function DefeatAnimation({ lang }: { lang: Lang }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timeout = setTimeout(() => setVisible(false), 4200);
    return () => clearTimeout(timeout);
  }, []);
  if (!visible) return null;
  const t = texts(lang);
  return (
    <div
      className="defeat-animation"
      data-testid="defeat-animation"
      aria-hidden="true"
    >
      <div className="defeat-card">
        <span className="defeat-emblem">
          <ShieldOff size={54} strokeWidth={1.4} />
          <span className="defeat-fragment fragment-left" />
          <span className="defeat-fragment fragment-right" />
        </span>
        <h2>{t.defeatTitle}</h2>
        <p>{t.defeatSpectator}</p>
      </div>
    </div>
  );
}

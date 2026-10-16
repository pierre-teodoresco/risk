"use client";
import { useEffect, useId, useRef } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { themeTexts } from "@/lib/i18n";
import { setTheme, useTheme } from "@/lib/theme";
import type { Lang } from "@/lib/world";

export default function ThemeToggle({ lang }: { lang: Lang }) {
  const { preference, theme } = useTheme();
  const tx = themeTexts(lang), name = useId();
  const picker = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) picker.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const choices = [ ["light", Sun], ["dark", Moon], ["system", Monitor] ] as const;
  return (
    <details className="theme-picker" ref={picker} onKeyDown={(event) => {
      if (event.key === "Escape") {
        picker.current?.removeAttribute("open");
        picker.current?.querySelector("summary")?.focus();
      }
    }}>
      <summary className="theme-trigger" aria-label={tx.appearance} title={tx.appearance}>
        {theme === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
      </summary>
      <fieldset className="theme-menu">
        <legend>{tx.appearance}</legend>
        {choices.map(([value, Icon]) => (
          <label key={value}>
            <Icon size={18} aria-hidden="true" />
            <span>{tx[value]}</span>
            <input type="radio" name={name} value={value} checked={preference === value} onChange={() => setTheme(value)} />
          </label>
        ))}
      </fieldset>
    </details>
  );
}

"use client";
import { useEffect, useMemo, useRef } from "react";
import type { TroopChange } from "@/lib/game-feedback";
import { useAppFontReady } from "@/lib/useAppFontReady";
import { useTheme } from "@/lib/theme";
import { LocateFixed } from "lucide-react";
import { hudTexts } from "@/lib/i18n";
import MAP from "@/lib/map-data.json";
import { CONTINENTS, WORLD } from "@/lib/world";
import {
  BoardEngine,
  toWorld,
  type Battle,
  type BoardOptions,
  type Lands,
} from "./board/engine";

export type ContinentBadge = {
  id: string;
  bonus: number;
  name: string;
  detail: string;
  /** 0–100, drawn as the ring around the bonus. */
  share: number;
  ring: string;
};

const TERR = MAP.territories as Record<string, { center: number[]; area: number }>;
// Badge anchor: area-weighted centre of each continent's territory labels.
const ANCHORS = CONTINENTS.map((c) => {
  const ts = WORLD.filter((t) => t.continent === c.id);
  const w = ts.map((t) => Math.sqrt(TERR[t.id].area)), sum = w.reduce((a, b) => a + b, 0);
  const pts = ts.map((t) => toWorld(TERR[t.id].center[0], TERR[t.id].center[1]));
  return [pts.reduce((s, p, k) => s + p[0] * w[k], 0) / sum, pts.reduce((s, p, k) => s + p[1] * w[k], 0) / sum];
});

const CENTERS = Object.fromEntries(
  Object.entries(TERR).map(([id, t]) => [id, toWorld(t.center[0], t.center[1])]),
);

export default function Board3D({
  lands,
  options,
  battle,
  pulse,
  badges,
  changes = [],
  onSelect,
  onHover,
}: {
  lands: Lands;
  options: BoardOptions;
  battle?: (Battle & { at: number }) | null;
  pulse?: { id: string; at: number } | null;
  badges?: ContinentBadge[] | null;
  /** Floating +N / −N over territories whose troops just changed. */
  changes?: TroopChange[];
  onSelect: (id: string) => void;
  onHover: (id: string | null, x: number, y: number) => void;
}) {
  const { theme } = useTheme();
  const fontReady = useAppFontReady();
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<BoardEngine | null>(null),
    badgeEls = useRef<(HTMLDivElement | null)[]>([]),
    changeEls = useRef(new Map<string, HTMLDivElement>()),
    callbacks = useRef({ onSelect, onHover });
  callbacks.current = { onSelect, onHover };

  useEffect(() => {
    if (!fontReady) return;
    const e = new BoardEngine(
      host.current!,
      {
        onSelect: (id) => callbacks.current.onSelect(id),
        onHover: (id, x, y) => callbacks.current.onHover(id, x, y),
        onFrame: (project) => {
          badgeEls.current.forEach((el, i) => {
            if (!el) return;
            const p = project(ANCHORS[i][0], ANCHORS[i][1]);
            el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
          });
          changeEls.current.forEach((el) => {
            const c = CENTERS[el.dataset.territory!];
            if (!c) return;
            const p = project(c[0], c[1]);
            el.style.transform = `translate(${p.x}px, ${p.y}px)`;
          });
        },
      },
      { ...options, theme },
    );
    engine.current = e;
    e.setLands(lands, true);
    return () => {
      e.dispose();
      engine.current = null;
    };
    // The engine lives for the component's lifetime; later props flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontReady]);

  useEffect(() => {
    engine.current?.setLands(lands);
  }, [fontReady, lands]);
  useEffect(() => {
    engine.current?.setOptions({ ...options, theme });
  }, [fontReady, options, theme]);
  useEffect(() => {
    if (battle) engine.current?.battle(battle);
    // Only a new battle (new timestamp) triggers effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontReady, battle?.at]);
  useEffect(() => {
    if (pulse) engine.current?.pulse(pulse.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontReady, pulse?.at]);

  // Rapid placements add up in one float; gains and losses stay distinct.
  const floats = useMemo(() => {
    const grouped = new Map<string, TroopChange & { stack: number }>();
    for (const c of changes) {
      const key = `${c.territory}:${c.amount > 0 ? "gain" : "loss"}`;
      const g = grouped.get(key);
      grouped.set(key, g ? { ...g, amount: g.amount + c.amount } : { ...c, stack: 0 });
    }
    const list = [...grouped.values()];
    list.forEach((f, i) => (f.stack = list.slice(0, i).filter((o) => o.territory === f.territory).length));
    return list;
  }, [changes]);

  return (
    <div className="board3d" ref={host}>
      {options.interactive && (
        <div className="hud board-tools">
          <button className="orb" aria-label={hudTexts(options.lang).resetView} title={hudTexts(options.lang).resetView} onClick={() => engine.current?.resetView()}><LocateFixed /></button>
          <select aria-label={hudTexts(options.lang).selectTerritory} aria-describedby="map-keyboard-help" value={options.selected} onChange={(e) => { if (e.target.value) onSelect(e.target.value); }}>
            <option value="">{hudTexts(options.lang).selectTerritory}</option>
            {WORLD.map((territory) => <option key={territory.id} value={territory.id}>{territory[options.lang]} · {lands[territory.id]?.troops ?? 0}</option>)}
          </select>
          <span id="map-keyboard-help" className="sr-only">{hudTexts(options.lang).mapKeyboard}</span>
        </div>
      )}
      <div className="tfloats" aria-hidden="true">
        {floats.map((f) => (
          <div
            key={f.id}
            data-territory={f.territory}
            className="tfloat-anchor"
            ref={(el) => {
              if (el) changeEls.current.set(f.id, el);
              else changeEls.current.delete(f.id);
            }}
          >
            <span
              className={"tfloat outlined " + (f.amount > 0 ? "gain" : "loss")}
              style={{ "--stack": f.stack } as React.CSSProperties}
              data-testid="troop-change"
            >
              {f.amount > 0 ? "+" : "−"}
              {Math.abs(f.amount)}
            </span>
          </div>
        ))}
      </div>
      {badges && (
        <div className="cbadges" aria-hidden="true">
          {badges.map((b, i) => (
            <div
              key={b.id}
              className="cbadge"
              ref={(el) => {
                badgeEls.current[i] = el;
              }}
              style={
                {
                  "--cc": CONTINENTS[i].color,
                  "--p": b.share,
                  "--ring": b.ring,
                } as React.CSSProperties
              }
            >
              <div className="ring">
                <b className="outlined">+{b.bonus}</b>
              </div>
              <div className="plate">
                {b.name}
                <small>{b.detail}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

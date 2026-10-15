"use client";
import { useEffect, useRef } from "react";
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

export default function Board3D({
  lands,
  options,
  battle,
  pulse,
  badges,
  onSelect,
  onHover,
}: {
  lands: Lands;
  options: BoardOptions;
  battle?: (Battle & { at: number }) | null;
  pulse?: { id: string; at: number } | null;
  badges?: ContinentBadge[] | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null, x: number, y: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<BoardEngine | null>(null),
    badgeEls = useRef<(HTMLDivElement | null)[]>([]),
    callbacks = useRef({ onSelect, onHover });
  callbacks.current = { onSelect, onHover };

  useEffect(() => {
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
        },
      },
      options,
    );
    engine.current = e;
    e.setLands(lands, true);
    document.fonts?.ready.then(() => engine.current?.refreshText());
    return () => {
      e.dispose();
      engine.current = null;
    };
    // The engine lives for the component's lifetime; later props flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engine.current?.setLands(lands);
  }, [lands]);
  useEffect(() => {
    engine.current?.setOptions(options);
  }, [options]);
  useEffect(() => {
    if (battle) engine.current?.battle(battle);
    // Only a new battle (new timestamp) triggers effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.at]);
  useEffect(() => {
    if (pulse) engine.current?.pulse(pulse.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse?.at]);

  return (
    <div className="board3d" ref={host}>
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

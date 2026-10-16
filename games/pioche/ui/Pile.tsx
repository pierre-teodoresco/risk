"use client";
// Discard pile: each card rests at its own small angle; a new top card flies in from where it was
// played (the hand, or the opponent's seat), spins and lands with a bounce.
import { useEffect, useLayoutEffect, useRef, type Ref } from "react";
import { Spring, SPRINGS, createLoop } from "@/platform/spring";
import type { Card } from "../engine";
import { CardFace } from "./CardFace";

const JITTER_DEG = 22;
const JITTER_PX = 9;
const ARRIVAL_SPIN_DEG = 200;
const ARRIVAL_SCALE = 1.25;

function hash(id: string) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}
export const restingPose = (id: string) => ({
  rot: (hash(id) - 0.5) * 2 * JITTER_DEG,
  x: (hash(id + "x") - 0.5) * 2 * JITTER_PX,
  y: (hash(id + "y") - 0.5) * 2 * JITTER_PX,
});

type Flight = { x: Spring; y: Spring; rot: Spring; scale: Spring };

export default function Pile({
  cards,
  originOf,
  label,
  zoneRef,
}: {
  cards: Card[];
  /** Where a newly arrived card comes from, in viewport pixels; null lands it in place. */
  originOf: (card: Card) => DOMRect | null;
  label: string;
  zoneRef: Ref<HTMLDivElement>;
}) {
  const host = useRef<HTMLDivElement | null>(null),
    els = useRef(new Map<string, HTMLDivElement>()),
    flights = useRef(new Map<string, Flight>()),
    seen = useRef<Set<string> | null>(null),
    loop = useRef<ReturnType<typeof createLoop> | null>(null);

  useLayoutEffect(() => {
    const ids = cards.map((c) => c.id);
    // The first render shows the pile as it is; only later arrivals fly in.
    if (!seen.current) {
      seen.current = new Set(ids);
      return;
    }
    const box = host.current?.getBoundingClientRect();
    for (const card of cards) {
      if (seen.current.has(card.id)) continue;
      seen.current.add(card.id);
      const from = originOf(card);
      if (!from || !box) continue;
      const rest = restingPose(card.id);
      const spin = hash(card.id + "s") > 0.5 ? ARRIVAL_SPIN_DEG : -ARRIVAL_SPIN_DEG;
      flights.current.set(card.id, {
        x: new Spring(from.left + from.width / 2 - (box.left + box.width / 2), SPRINGS.soft, rest.x),
        y: new Spring(from.top + from.height / 2 - (box.top + box.height / 2), SPRINGS.soft, rest.y),
        rot: new Spring(rest.rot - spin, SPRINGS.soft, rest.rot),
        scale: new Spring(ARRIVAL_SCALE, SPRINGS.wobbly, 1),
      });
    }
    seen.current = new Set(ids);
    // Place flying cards at their start before the browser paints the resting pose.
    for (const [id, f] of flights.current) {
      const el = els.current.get(id);
      if (el) el.style.transform = `translate(${f.x.value}px, ${f.y.value}px) rotate(${f.rot.value}deg) scale(${f.scale.value})`;
    }
    loop.current?.kick();
  }, [cards, originOf]);

  useEffect(() => {
    const l = createLoop((dt) => {
      let moving = false;
      for (const [id, f] of flights.current) {
        const el = els.current.get(id);
        const busy = [f.x, f.y, f.rot, f.scale].map((s) => s.step(dt)).some(Boolean);
        if (el) el.style.transform = `translate(${f.x.value}px, ${f.y.value}px) rotate(${f.rot.value}deg) scale(${f.scale.value})`;
        if (busy) moving = true;
        else flights.current.delete(id);
      }
      return moving;
    });
    loop.current = l;
    return () => l.stop();
  }, []);

  const top = cards.at(-1);
  return (
    <div
      className="pile"
      ref={(el) => {
        host.current = el;
        if (typeof zoneRef === "function") zoneRef(el);
        else if (zoneRef) (zoneRef as { current: HTMLDivElement | null }).current = el;
      }}
      role="img"
      aria-label={label}
      aria-live="polite"
    >
      {cards.map((card, i) => {
        const rest = restingPose(card.id);
        return (
          <div
            key={card.id}
            ref={(el) => {
              if (el) els.current.set(card.id, el);
              else els.current.delete(card.id);
            }}
            className={"pile-card" + (card === top ? " top" : "")}
            style={{ zIndex: i + 1, transform: `translate(${rest.x}px, ${rest.y}px) rotate(${rest.rot}deg)` }}
          >
            <CardFace card={card} />
          </div>
        );
      })}
    </div>
  );
}

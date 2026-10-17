"use client";
// Card arrival, hover lift and flip use the same spring loop as Pioche's hand.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Spring, SPRINGS, createLoop, prefersReducedMotion } from "@/platform/spring";
export default function AnimatedCard({ front, back, revealed, label, index = 0, rotation = 0, selected = false, onSelect, origin }: {
  front: ReactNode; back: ReactNode; revealed: boolean; label: string; index?: number;
  rotation?: number; selected?: boolean; onSelect?: () => void; origin?: () => DOMRect | null;
}) {
  const el = useRef<HTMLDivElement>(null), hover = useRef(false), loop = useRef<ReturnType<typeof createLoop> | null>(null);
  const motion = useRef({ x: new Spring(0), y: new Spring(0), rotate: new Spring(rotation), lift: new Spring(0, SPRINGS.wobbly), flip: new Spring(0), wait: index * .085 });
  const live = useRef({ revealed, rotation, selected }); live.current = { revealed, rotation, selected };
  useLayoutEffect(() => {
    const box = el.current?.getBoundingClientRect(), source = origin?.();
    const m = motion.current;
    if (box && source && !prefersReducedMotion()) {
      m.x.set(source.left + source.width / 2 - box.left - box.width / 2);
      m.y.set(source.top + source.height / 2 - box.top - box.height / 2);
    }
  }, []); // Origin is sampled only when a new card is dealt.
  useEffect(() => {
    const reduced = prefersReducedMotion(), m = motion.current;
    const l = createLoop((dt) => {
      if (!el.current) return false;
      m.wait -= dt;
      if (m.wait > 0 && !reduced) return true;
      m.x.target = m.y.target = 0; m.rotate.target = live.current.rotation;
      m.lift.target = live.current.selected ? -18 : hover.current ? -9 : 0;
      m.flip.target = live.current.revealed ? 1 : 0;
      let moving = false;
      for (const s of [m.x, m.y, m.rotate, m.lift, m.flip]) {
        if (reduced) s.set(s.target); else moving = s.step(dt) || moving;
      }
      el.current.style.transform = `translate3d(${m.x.value}px,${m.y.value + m.lift.value}px,0) rotate(${m.rotate.value}deg)`;
      el.current.style.setProperty("--card-flip", `${(1 - m.flip.value) * 180}deg`);
      return moving;
    });
    loop.current = l; l.kick(); return () => l.stop();
  }, []);
  useEffect(() => { loop.current?.kick(); }, [revealed, rotation, selected]);
  const faces = <span className="pk-card-turn"><span className="pk-card-front">{front}</span><span className="pk-card-back">{back}</span></span>;
  const events = { onPointerEnter: () => { hover.current = true; loop.current?.kick(); }, onPointerLeave: () => { hover.current = false; loop.current?.kick(); } };
  return <div className="pk-card-motion" ref={el} {...events}>
    {onSelect ? <button className="pk-card-surface" type="button" aria-label={label} aria-pressed={selected} onClick={onSelect}
      onFocus={() => { hover.current = true; loop.current?.kick(); }} onBlur={() => { hover.current = false; loop.current?.kick(); }}>{faces}</button>
      : <span className="pk-card-surface" role="img" aria-label={label}>{faces}</span>}
  </div>;
}

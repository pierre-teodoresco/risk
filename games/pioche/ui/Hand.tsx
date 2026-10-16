"use client";
// The player's hand: a fanned row of cards driven by springs. Transforms are written straight to
// the DOM from one animation loop, so hovering, dragging and reflowing never re-render React.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Spring, SPRINGS, createLoop, prefersReducedMotion } from "@/platform/spring";
import type { Card } from "../engine";
import { CardBack, CardFace } from "./CardFace";
import { cardLabel, type PiocheTexts } from "../i18n";
import type { Cue } from "./sound";

type Props = {
  cards: Card[];
  canPlay: (card: Card) => boolean;
  /** Card the player just drew: highlighted, the only one they may still play. */
  highlight: string | null;
  /** Cards appear from this rectangle (the deck) instead of popping in place. */
  drawOrigin: () => DOMRect | null;
  /** Dropping a dragged card over this rectangle plays it. */
  dropZone: () => DOMRect | null;
  onPlay: (card: Card, from: DOMRect) => void;
  onCue: (cue: Cue) => void;
  tx: PiocheTexts;
};
type Motion = {
  x: Spring; y: Spring; rot: Spring; lift: Spring; scale: Spring; tiltX: Spring; tiltY: Spring; flip: Spring;
  /** Seconds (loop clock) before a dealt card leaves the deck. */
  wait: number;
  phase: number;
};

const LIFT_HOVER = 0.14;
const LIFT_SELECTED = 0.26;
const SCALE_HOVER = 1.07;
const SCALE_SELECTED = 1.1;
const TILT_MAX_DEG = 18;
const DRAG_THRESHOLD_PX = 8;
const DRAG_LEAN = 0.04;
const DRAG_LEAN_MAX_DEG = 16;
const DROP_MARGIN_PX = 40;
const DEAL_STAGGER_S = 0.07;
const SWAY_DEG = 0.7;
const SWAY_PX = 2;
const MAX_STEP_RATIO = 0.72;
const FAN_DEG = 40;
const FAN_MAX_STEP_DEG = 5;
const ARC_RATIO = 0.07;

function slot(i: number, n: number, width: number, cardW: number) {
  const centre = i - (n - 1) / 2;
  const spread = Math.max(0, width - cardW - 24);
  const step = n > 1 ? Math.min(cardW * MAX_STEP_RATIO, spread / (n - 1)) : 0;
  const norm = n > 1 ? centre / ((n - 1) / 2) : 0;
  return { x: centre * step, y: norm * norm * cardW * 1.5 * ARC_RATIO, rot: centre * Math.min(FAN_MAX_STEP_DEG, FAN_DEG / n) };
}

export default function Hand({ cards, canPlay, highlight, drawOrigin, dropZone, onPlay, onCue, tx }: Props) {
  const [order, setOrder] = useState<string[]>([]),
    [selected, setSelected] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null),
    els = useRef(new Map<string, HTMLButtonElement>()),
    motion = useRef(new Map<string, Motion>()),
    hover = useRef<string | null>(null),
    drag = useRef<{ id: string; startX: number; startY: number; dx: number; dy: number; active: boolean; lastX: number } | null>(null),
    clock = useRef(0),
    mounted = useRef(false),
    live = useRef({ order, selected, highlight }),
    originRef = useRef(drawOrigin),
    loop = useRef<ReturnType<typeof createLoop> | null>(null);
  live.current = { order, selected, highlight };
  originRef.current = drawOrigin;

  const byId = new Map(cards.map((c) => [c.id, c]));
  // Keep the player's own arrangement across refreshes; new cards go to the right.
  useEffect(() => {
    setOrder((prev) => {
      const ids = cards.map((c) => c.id);
      const kept = prev.filter((id) => ids.includes(id));
      return [...kept, ...ids.filter((id) => !kept.includes(id))];
    });
    if (selected && !cards.some((c) => c.id === selected)) setSelected(null);
  }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

  // New cards fly in from the deck, face down, and turn over on the way.
  useLayoutEffect(() => {
    const box = host.current?.getBoundingClientRect();
    const origin = originRef.current();
    let delay = 0;
    for (const id of order) {
      if (motion.current.has(id)) continue;
      const fromDeck = mounted.current && box && origin;
      const ox = fromDeck ? origin.left + origin.width / 2 - (box.left + box.width / 2) : 0;
      const oy = fromDeck ? origin.top - box.top : 0;
      motion.current.set(id, {
        x: new Spring(ox, SPRINGS.soft),
        y: new Spring(oy, SPRINGS.soft),
        rot: new Spring(fromDeck ? -20 : 0, SPRINGS.soft),
        lift: new Spring(0, SPRINGS.wobbly),
        scale: new Spring(fromDeck ? 0.8 : 1, SPRINGS.wobbly),
        tiltX: new Spring(0, SPRINGS.snappy),
        tiltY: new Spring(0, SPRINGS.snappy),
        flip: new Spring(fromDeck ? 0 : 1, SPRINGS.soft),
        wait: fromDeck ? clock.current + delay : 0,
        phase: Math.random() * Math.PI * 2,
      });
      if (fromDeck) delay += DEAL_STAGGER_S;
    }
    for (const id of [...motion.current.keys()]) if (!order.includes(id)) motion.current.delete(id);
    mounted.current = true;
    loop.current?.kick();
  }, [order]);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const l = createLoop((dt) => {
      clock.current += dt;
      const el = host.current;
      if (!el) return true;
      const width = el.clientWidth;
      const { order: ids, selected: sel } = live.current;
      const d = drag.current?.active ? drag.current : null;
      const layout = ids.filter((id) => id !== d?.id);
      ids.forEach((id) => {
        const m = motion.current.get(id), card = els.current.get(id);
        if (!m || !card) return;
        const cardW = card.offsetWidth, cardH = cardW * 1.5;
        if (clock.current >= m.wait) {
          if (d?.id === id) {
            m.x.target = d.dx;
            m.y.target = d.dy;
            m.rot.target = Math.max(-DRAG_LEAN_MAX_DEG, Math.min(DRAG_LEAN_MAX_DEG, (d.dx - d.lastX) * DRAG_LEAN * 60));
            d.lastX = d.dx;
          } else {
            const s = slot(layout.indexOf(id), layout.length, width, cardW);
            const sway = reduced ? 0 : Math.sin(clock.current * 1.4 + m.phase);
            m.x.target = s.x;
            m.y.target = s.y + sway * SWAY_PX;
            m.rot.target = s.rot + sway * SWAY_DEG;
          }
          m.flip.target = 1;
          const up = sel === id ? LIFT_SELECTED : hover.current === id || d?.id === id ? LIFT_HOVER : 0;
          m.lift.target = -up * cardH;
          m.scale.target = sel === id ? SCALE_SELECTED : hover.current === id || d?.id === id ? SCALE_HOVER : 1;
          if (hover.current !== id && d?.id !== id) m.tiltX.target = m.tiltY.target = 0;
        }
        for (const s of [m.x, m.y, m.rot, m.lift, m.scale, m.tiltX, m.tiltY, m.flip]) s.step(dt);
        card.style.transform =
          `translate3d(${m.x.value}px, ${m.y.value + m.lift.value}px, 0) rotate(${m.rot.value}deg) ` +
          `rotateX(${m.tiltX.value}deg) rotateY(${m.tiltY.value}deg) scale(${m.scale.value})`;
        card.style.zIndex = String(d?.id === id ? 200 : sel === id || hover.current === id ? 100 : layout.indexOf(id) + 1);
        card.style.setProperty("--flip", String(m.flip.value));
      });
      // The idle sway keeps the loop alive; with reduced motion it sleeps once everything rests.
      return !reduced || [...motion.current.values()].some((m) =>
        [m.x, m.y, m.rot, m.lift, m.scale, m.tiltX, m.tiltY, m.flip].some((s) => s.value !== s.target || s.velocity !== 0),
      );
    });
    loop.current = l;
    l.kick();
    return () => l.stop();
  }, []);

  function tilt(e: PointerEvent<HTMLButtonElement>, id: string) {
    const m = motion.current.get(id);
    if (!m) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    m.tiltY.target = px * TILT_MAX_DEG;
    m.tiltX.target = -py * TILT_MAX_DEG;
    e.currentTarget.style.setProperty("--mx", `${(px + 0.5) * 100}%`);
    e.currentTarget.style.setProperty("--my", `${(py + 0.5) * 100}%`);
    loop.current?.kick();
  }

  function choose(card: Card) {
    const el = els.current.get(card.id);
    if (selected === card.id && canPlay(card) && el) {
      onPlay(card, el.getBoundingClientRect());
      return;
    }
    if (selected === card.id) setSelected(null);
    else {
      setSelected(card.id);
      onCue(canPlay(card) ? "select" : "error");
    }
    loop.current?.kick();
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>, id: string) {
    if (e.button !== 0) return;
    drag.current = { id, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, active: false, lastX: 0 };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture only keeps a fast drag attached to its card; the drag still works without it.
    }
  }
  function onPointerMove(e: PointerEvent<HTMLButtonElement>, id: string) {
    const d = drag.current;
    if (!d || d.id !== id) return tilt(e, id);
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
    const box = host.current!.getBoundingClientRect();
    if (!d.active) {
      d.active = true;
      d.lastX = motion.current.get(id)!.x.value;
    }
    d.dx = e.clientX - (box.left + box.width / 2);
    d.dy = e.clientY - box.top - e.currentTarget.offsetHeight / 2;
    // Live reorder: the dragged card takes the slot under the pointer.
    const rest = order.filter((x) => x !== id);
    const cardW = e.currentTarget.offsetWidth;
    let index = rest.length;
    for (let i = 0; i < rest.length; i++)
      if (d.dx < slot(i, rest.length + 1, box.width, cardW).x) {
        index = i;
        break;
      }
    const next = [...rest.slice(0, index), id, ...rest.slice(index)];
    if (next.join() !== order.join()) setOrder(next);
    loop.current?.kick();
  }
  function onPointerUp(e: PointerEvent<HTMLButtonElement>, card: Card) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== card.id) return;
    if (!d.active) return choose(card);
    const zone = dropZone();
    const over = zone &&
      e.clientX > zone.left - DROP_MARGIN_PX && e.clientX < zone.right + DROP_MARGIN_PX &&
      e.clientY > zone.top - DROP_MARGIN_PX && e.clientY < zone.bottom + DROP_MARGIN_PX;
    if (over && canPlay(card)) onPlay(card, e.currentTarget.getBoundingClientRect());
    else if (over) onCue("error");
    loop.current?.kick();
  }
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = order.indexOf(id) + (e.key === "ArrowRight" ? 1 : -1);
    els.current.get(order[(i + order.length) % order.length])?.focus();
  }

  return (
    <div className="pc-hand" ref={host} role="group" aria-label={tx.hand}>
      {order.map((id) => {
        const card = byId.get(id);
        if (!card) return null;
        const ok = canPlay(card);
        return (
          <button
            key={id}
            ref={(el) => {
              if (el) els.current.set(id, el);
              else els.current.delete(id);
            }}
            className={"hand-card" + (ok ? " playable" : "") + (selected === id ? " selected" : "") + (highlight === id ? " drawn" : "")}
            style={{ "--flip": 1 } as CSSProperties}
            aria-label={`${cardLabel(card, tx)}${ok ? ", " + tx.playable : ""}`}
            aria-pressed={selected === id}
            onPointerEnter={() => {
              hover.current = id;
              onCue("hover");
              loop.current?.kick();
            }}
            onPointerLeave={() => {
              if (hover.current === id) hover.current = null;
              loop.current?.kick();
            }}
            onPointerDown={(e) => onPointerDown(e, id)}
            onPointerMove={(e) => onPointerMove(e, id)}
            onPointerUp={(e) => onPointerUp(e, card)}
            onPointerCancel={() => (drag.current = null)}
            onFocus={() => {
              hover.current = id;
              loop.current?.kick();
            }}
            onBlur={() => {
              if (hover.current === id) hover.current = null;
            }}
            // Keyboard activation only: pointer clicks are handled on pointer up.
            onClick={(e) => e.detail === 0 && choose(card)}
            onKeyDown={(e) => onKeyDown(e, id)}
          >
            <span className="card-flip">
              <span className="card-side front"><CardFace card={card} /></span>
              <span className="card-side back"><CardBack /></span>
              <span className="card-sheen" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

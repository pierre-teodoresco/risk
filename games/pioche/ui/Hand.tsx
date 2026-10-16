"use client";
// The player's hand: a fanned row of cards driven by springs. Transforms are written straight to
// the DOM from one animation loop, so hovering, dragging and reflowing never re-render React.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { Spring, SPRINGS, createLoop, prefersReducedMotion } from "@/platform/spring";
import type { Card } from "../engine";
import { CardBack, CardFace } from "./CardFace";
import { fmt } from "@/lib/i18n";
import { cardLabel, type PiocheTexts } from "../i18n";
import type { Cue } from "./sound";

type Props = {
  cards: Card[];
  canPlay: (card: Card) => boolean;
  /** Card the player just drew: highlighted, the only one they may still play. */
  highlight: string | null;
  /** Cards appear from this rectangle (the deck) instead of popping in place. */
  drawOrigin: () => DOMRect | null;
  /** Dropping a dragged card over this element plays it; it lights up while a card hovers it. */
  dropZone: () => HTMLElement | null;
  /** Selected cards in play order: one card, or a lot of identical cards led by a playable one. */
  selected: string[];
  onSelect: (ids: string[]) => void;
  /** Whether `card` may join a lot led by `lead`; always false without the combo option. */
  canJoin: (lead: Card, card: Card) => boolean;
  onPlay: (cards: Card[], from: Map<string, DOMRect>) => void;
  onCue: (cue: Cue) => void;
  tx: PiocheTexts;
};
type Drag = {
  id: string;
  startX: number;
  startY: number;
  /** Pointer offset from the card centre when the drag started, kept for the whole drag. */
  grabX: number;
  grabY: number;
  x: number;
  y: number;
  /** Smoothed horizontal speed in px/s, which leans the card like a held sheet. */
  vx: number;
  lastX: number;
  lastT: number;
  active: boolean;
  over: boolean;
  /** Hand order when the drag began, restored if the card is let go away from the hand. */
  original: string[];
};
type Motion = {
  x: Spring; y: Spring; rot: Spring; lift: Spring; scale: Spring; tiltX: Spring; tiltY: Spring; flip: Spring;
  /** Seconds (loop clock) before a dealt card leaves the deck. */
  wait: number;
  phase: number;
};

const LIFT_HOVER = 0.14;
const LIFT_SELECTED = 0.26;
/** Cards of a lot rise less than a lone selection, keeping clear of the actions above the hand. */
const LIFT_LOT = 0.2;
/** A card that may join the selected lot rises a little, inviting the click. */
const LIFT_JOINABLE = 0.05;
const SCALE_HOVER = 1.07;
const SCALE_SELECTED = 1.1;
const TILT_MAX_DEG = 18;
const DRAG_THRESHOLD_PX = 8;
const DRAG_LEAN_DEG_PER_PX_S = 0.012;
const DRAG_LEAN_MAX_DEG = 14;
const DRAG_SPEED_SMOOTHING = 0.35;
/** Per-second decay of the lean once the pointer stops. */
const DRAG_LEAN_DECAY = 10;
const DRAG_SCALE = 1.08;
/** Share of the card height, from its top, above which a held card no longer reorders the hand. */
const REORDER_BAND = 0.35;
/** A card that left the hand (played but refused) comes back from where it was for this long. */
const DEPARTED_MEMORY_S = 6;
const DROP_MARGIN_PX = 40;
const DEAL_STAGGER_S = 0.07;
const SWAY_DEG = 0.7;
const SWAY_PX = 2;
const MAX_STEP_RATIO = 0.72;
const FAN_DEG = 40;
const FAN_MAX_STEP_DEG = 5;
const ARC_RATIO = 0.07;
/** The other cards of a dragged lot trail behind it like a held fan. */
const TRAIL_STEP_PX = 14;
const TRAIL_STEP_DEG = 7;

function slot(i: number, n: number, width: number, cardW: number) {
  const centre = i - (n - 1) / 2;
  const spread = Math.max(0, width - cardW - 24);
  const step = n > 1 ? Math.min(cardW * MAX_STEP_RATIO, spread / (n - 1)) : 0;
  const norm = n > 1 ? centre / ((n - 1) / 2) : 0;
  return { x: centre * step, y: norm * norm * cardW * 1.5 * ARC_RATIO, rot: centre * Math.min(FAN_MAX_STEP_DEG, FAN_DEG / n) };
}

export default function Hand({ cards, canPlay, highlight, drawOrigin, dropZone, selected, onSelect, canJoin, onPlay, onCue, tx }: Props) {
  const [order, setOrder] = useState<string[]>([]);
  const host = useRef<HTMLDivElement>(null),
    els = useRef(new Map<string, HTMLButtonElement>()),
    motion = useRef(new Map<string, Motion>()),
    hover = useRef<string | null>(null),
    drag = useRef<Drag | null>(null),
    returning = useRef<string | null>(null),
    departed = useRef(new Map<string, { motion: Motion; at: number }>()),
    clock = useRef(0),
    mounted = useRef(false),
    live = useRef({ order, selected, joinable: new Set<string>() }),
    originRef = useRef(drawOrigin),
    loop = useRef<ReturnType<typeof createLoop> | null>(null);
  originRef.current = drawOrigin;

  const byId = new Map(cards.map((c) => [c.id, c]));
  const lead = byId.get(selected[0]);
  const joinable = new Set(lead ? cards.filter((c) => !selected.includes(c.id) && canJoin(lead, c)).map((c) => c.id) : []);
  live.current = { order, selected, joinable };
  // Keep the player's own arrangement across refreshes; new cards go to the right.
  useEffect(() => {
    setOrder((prev) => {
      const ids = cards.map((c) => c.id);
      const kept = prev.filter((id) => ids.includes(id));
      return [...kept, ...ids.filter((id) => !kept.includes(id))];
    });
    const present = selected.filter((id) => cards.some((c) => c.id === id));
    if (present.length !== selected.length) onSelect(present);
  }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

  // New cards fly in from the deck, face down, and turn over on the way.
  useLayoutEffect(() => {
    const box = host.current?.getBoundingClientRect();
    const origin = originRef.current();
    let delay = 0;
    for (const id of order) {
      if (motion.current.has(id)) continue;
      const back = departed.current.get(id);
      if (back && clock.current - back.at < DEPARTED_MEMORY_S) {
        motion.current.set(id, back.motion);
        departed.current.delete(id);
        continue;
      }
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
    for (const [id, m] of [...motion.current]) {
      if (order.includes(id)) continue;
      departed.current.set(id, { motion: m, at: clock.current });
      motion.current.delete(id);
    }
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
      const { order: ids, selected: sel, joinable: join } = live.current;
      const d = drag.current?.active ? drag.current : null;
      const trail = d && sel.length > 1 && sel.includes(d.id) ? sel.filter((id) => id !== d.id) : [];
      const layout = ids.filter((id) => id !== d?.id && !trail.includes(id));
      ids.forEach((id) => {
        const m = motion.current.get(id), card = els.current.get(id);
        if (!m || !card) return;
        const cardW = card.offsetWidth, cardH = cardW * 1.5;
        if (clock.current >= m.wait) {
          if (d?.id === id) {
            // The held card sticks to the pointer; only its lean is animated.
            m.x.set(d.x);
            m.y.set(d.y);
            d.vx *= Math.exp(-DRAG_LEAN_DECAY * dt);
            m.rot.target = Math.max(-DRAG_LEAN_MAX_DEG, Math.min(DRAG_LEAN_MAX_DEG, d.vx * DRAG_LEAN_DEG_PER_PX_S));
          } else if (d && trail.includes(id)) {
            const k = trail.indexOf(id) + 1;
            m.x.target = d.x - k * TRAIL_STEP_PX;
            m.y.target = d.y + k * TRAIL_STEP_PX * 0.3;
            m.rot.target = -k * TRAIL_STEP_DEG;
          } else {
            const s = slot(layout.indexOf(id), layout.length, width, cardW);
            const sway = reduced ? 0 : Math.sin(clock.current * 1.4 + m.phase);
            m.x.target = s.x;
            m.y.target = s.y + sway * SWAY_PX;
            m.rot.target = s.rot + sway * SWAY_DEG;
          }
          m.flip.target = 1;
          const held = d?.id === id || trail.includes(id);
          const up = held ? 0 : sel.includes(id) ? (sel.length > 1 ? LIFT_LOT : LIFT_SELECTED) : hover.current === id ? LIFT_HOVER : join.has(id) ? LIFT_JOINABLE : 0;
          m.lift.target = -up * cardH;
          m.scale.target = held ? DRAG_SCALE : sel.includes(id) ? SCALE_SELECTED : hover.current === id ? SCALE_HOVER : 1;
          if (hover.current !== id && d?.id !== id) m.tiltX.target = m.tiltY.target = 0;
        }
        for (const s of [m.x, m.y, m.rot, m.lift, m.scale, m.tiltX, m.tiltY, m.flip]) s.step(dt);
        card.style.transform =
          `translate3d(${m.x.value}px, ${m.y.value + m.lift.value}px, 0) rotate(${m.rot.value}deg) ` +
          `rotateX(${m.tiltX.value}deg) rotateY(${m.tiltY.value}deg) scale(${m.scale.value})`;
        if (returning.current === id && ![m.x, m.y].some((s) => s.value !== s.target || s.velocity !== 0)) returning.current = null;
        const trailing = trail.indexOf(id);
        card.style.zIndex = String(
          d?.id === id || returning.current === id ? 200
          : trailing >= 0 ? 199 - trailing
          : sel.includes(id) ? 100 + sel.indexOf(id)
          : hover.current === id ? 100
          : join.has(id) ? 50 + layout.indexOf(id)
          : layout.indexOf(id) + 1,
        );
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

  function play(group: Card[]) {
    const from = new Map<string, DOMRect>();
    for (const c of group) {
      const el = els.current.get(c.id);
      if (el) from.set(c.id, el.getBoundingClientRect());
    }
    onPlay(group, from);
  }
  /** A lot keeps a playable card first: removing its lead hands the lead to the next one that fits. */
  function withPlayableLead(ids: string[]) {
    const i = ids.findIndex((id) => {
      const c = byId.get(id);
      return !!c && canPlay(c);
    });
    return i <= 0 ? ids : [ids[i], ...ids.slice(0, i), ...ids.slice(i + 1)];
  }
  function choose(card: Card) {
    loop.current?.kick();
    if (selected.includes(card.id)) {
      if (selected.length === 1 && canPlay(card)) return play([card]);
      return onSelect(withPlayableLead(selected.filter((id) => id !== card.id)));
    }
    if (joinable.has(card.id)) {
      onSelect([...selected, card.id]);
      return onCue("select");
    }
    onSelect([card.id]);
    onCue(canPlay(card) ? "select" : "error");
  }
  /** What a drag carries: the whole lot when the held card belongs to one, else the card alone. */
  function dragged(card: Card) {
    if (selected.length < 2 || !selected.includes(card.id)) return [card];
    return selected.map((id) => byId.get(id)).filter((c): c is Card => !!c);
  }
  const groupFits = (group: Card[]) => canPlay(group[0]) && group.slice(1).every((c) => canJoin(group[0], c));

  function dropState(clientX: number, clientY: number) {
    const zone = dropZone();
    const r = zone?.getBoundingClientRect();
    const over = !!r &&
      clientX > r.left - DROP_MARGIN_PX && clientX < r.right + DROP_MARGIN_PX &&
      clientY > r.top - DROP_MARGIN_PX && clientY < r.bottom + DROP_MARGIN_PX;
    return { zone, over };
  }
  function lightZone(zone: HTMLElement | null, over: boolean, ok: boolean) {
    zone?.classList.toggle("drop-ready", over && ok);
    zone?.classList.toggle("drop-refused", over && !ok);
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>, id: string) {
    if (e.button !== 0) return;
    drag.current = {
      id, startX: e.clientX, startY: e.clientY, grabX: 0, grabY: 0, x: 0, y: 0,
      vx: 0, lastX: e.clientX, lastT: e.timeStamp, active: false, over: false, original: order,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture only keeps a fast drag attached to its card; the drag still works without it.
    }
  }
  function onPointerMove(e: PointerEvent<HTMLButtonElement>, card: Card) {
    const d = drag.current;
    if (!d || d.id !== card.id) return tilt(e, card.id);
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
    const el = e.currentTarget;
    const box = host.current!.getBoundingClientRect();
    // Card centre when it sits at translate(0, 0): CSS left/top inside the hand.
    const baseX = box.left + el.offsetLeft + el.offsetWidth / 2;
    const baseY = box.top + el.offsetTop + el.offsetHeight / 2;
    if (!d.active) {
      const m = motion.current.get(card.id)!;
      d.active = true;
      d.grabX = d.startX - (baseX + m.x.value);
      d.grabY = d.startY - (baseY + m.y.value + m.lift.value);
      // The hover lift becomes part of the held position, so the card does not slide off the cursor.
      m.lift.set(0);
      m.tiltX.target = m.tiltY.target = 0;
      if (dragged(card).length === 1) onSelect([]);
    }
    const dt = Math.max(1, e.timeStamp - d.lastT) / 1000;
    d.vx += ((e.clientX - d.lastX) / dt - d.vx) * DRAG_SPEED_SMOOTHING;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    d.x = e.clientX - d.grabX - baseX;
    d.y = e.clientY - d.grabY - baseY;

    const { zone, over } = dropState(e.clientX, e.clientY);
    d.over = over;
    const group = dragged(card);
    lightZone(zone, over, groupFits(group));
    // Reorder only while the pointer stays in the band of cards, not on the way to the pile.
    if (group.length === 1 && e.clientY > box.top + el.offsetTop + el.offsetHeight * REORDER_BAND) {
      const rest = order.filter((x) => x !== card.id);
      const relX = e.clientX - (box.left + box.width / 2);
      let index = rest.length;
      for (let i = 0; i < rest.length; i++)
        if (relX < slot(i, rest.length + 1, box.width, el.offsetWidth).x) {
          index = i;
          break;
        }
      const next = [...rest.slice(0, index), card.id, ...rest.slice(index)];
      if (next.join() !== order.join()) setOrder(next);
    }
    loop.current?.kick();
  }
  function endDrag() {
    lightZone(dropZone(), false, false);
    drag.current = null;
  }
  function onPointerUp(e: PointerEvent<HTMLButtonElement>, card: Card) {
    const d = drag.current;
    endDrag();
    if (!d || d.id !== card.id) return;
    if (!d.active) return choose(card);
    const { over } = dropState(e.clientX, e.clientY);
    const group = dragged(card);
    if (over && groupFits(group)) play(group);
    else {
      returning.current = card.id;
      if (over) onCue("error");
      const box = host.current!.getBoundingClientRect();
      if (e.clientY < box.top) setOrder(d.original);
    }
    loop.current?.kick();
  }
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (e.key === "Escape" && selected.length) {
      e.preventDefault();
      loop.current?.kick();
      return onSelect([]);
    }
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
        const place = selected.length > 1 ? selected.indexOf(id) + 1 : 0;
        const classes = ["hand-card", ok && "playable", selected.includes(id) && "selected", place > 0 && "in-lot", joinable.has(id) && "joinable", highlight === id && "drawn"];
        return (
          <button
            key={id}
            data-card={id}
            ref={(el) => {
              if (el) els.current.set(id, el);
              else els.current.delete(id);
            }}
            className={classes.filter(Boolean).join(" ")}
            style={{ "--flip": 1 } as CSSProperties}
            aria-label={[cardLabel(card, tx), ok && tx.playable, place && fmt(tx.inLot, { n: place })].filter(Boolean).join(", ")}
            aria-pressed={selected.includes(id)}
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
            onPointerMove={(e) => onPointerMove(e, card)}
            onPointerUp={(e) => onPointerUp(e, card)}
            onPointerCancel={endDrag}
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
            {place > 0 && <span className="lot-badge" key={place} aria-hidden="true">{place}</span>}
          </button>
        );
      })}
    </div>
  );
}

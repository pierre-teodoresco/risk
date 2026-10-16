"use client";
// Opponents spread along an arc above the table, in turn order starting after the player.
import type { CSSProperties } from "react";
import EmblemBadge from "@/components/EmblemBadge";
import { fmt } from "@/lib/i18n";
import type { PublicGame, PublicPlayer, Reaction } from "../engine";
import { CardBack } from "./CardFace";
import type { PiocheTexts } from "../i18n";
import { reactionGlyph } from "./reactions";

const FAN_SHOWN = 8;
const FAN_STEP_DEG = 7;
const ARC_CENTRE_DEG = 270;
const ARC_MAX_SPAN_DEG = 144;
const ARC_SPAN_PER_SEAT_DEG = 42;
const ARC_RX = 43;
const ARC_RY = 62;
const ARC_CY = 74;
const REACTION_SHOWN_MS = 2600;

/** Opponents in seating order, starting with the player after `me`. */
export function opponentsOf(g: PublicGame) {
  const i = g.players.findIndex((p) => p.id === g.me);
  return [...g.players.slice(i + 1), ...g.players.slice(0, Math.max(0, i))].filter((p) => !p.left);
}

function seatPosition(k: number, m: number) {
  // Few opponents gather near the top; a full table uses the whole arc.
  const span = Math.min(ARC_MAX_SPAN_DEG, ARC_SPAN_PER_SEAT_DEG * (m - 1));
  const t = m === 1 ? 0.5 : k / (m - 1);
  const a = ((ARC_CENTRE_DEG - span / 2 + span * t) * Math.PI) / 180;
  return { left: `${50 + ARC_RX * Math.cos(a)}%`, top: `${ARC_CY + ARC_RY * Math.sin(a)}%` };
}

export function lastReaction(reactions: Reaction[], player: string, now: number) {
  const r = reactions.filter((x) => x.from === player).at(-1);
  return r && now - r.at < REACTION_SHOWN_MS ? r : null;
}

export default function Seats({
  game,
  tx,
  now,
  shaking,
  choosing,
  onChoose,
  onCatch,
  register,
}: {
  game: PublicGame;
  tx: PiocheTexts;
  now: number;
  /** Players who just took two cards or more, with the amount. */
  shaking: Map<string, number>;
  /** When set, seats become buttons to pick the hand-swap target. */
  choosing: boolean;
  onChoose: (id: string) => void;
  onCatch: () => void;
  register: (id: string, el: HTMLElement | null) => void;
}) {
  const seats = opponentsOf(game);
  return (
    <div className="pc-seats">
      {seats.map((p: PublicPlayer, k) => {
        const active = p.id === game.active && game.phase === "playing";
        const timed = active && game.deadline && game.options.timer && !game.paused;
        const elapsed = timed ? game.options.timer * 1000 - (game.deadline! - now) : 0;
        const reaction = lastReaction(game.reactions, p.id, now);
        const shake = shaking.get(p.id);
        const fan = Math.min(p.cardCount, FAN_SHOWN);
        const Tag = choosing ? "button" : "div";
        return (
          <Tag
            key={p.id}
            ref={(el: HTMLElement | null) => register(p.id, el)}
            className={"pc-seat" + (active ? " active" : "") + (shake ? " shake" : "") + (choosing ? " choosable" : "")}
            style={seatPosition(k, seats.length)}
            {...(choosing ? { onClick: () => onChoose(p.id), "aria-label": p.name } : {})}
          >
            <div className="seat-fan" aria-hidden="true">
              {Array.from({ length: fan }, (_, i) => (
                <span key={i} className="mini-card" style={{ "--r": `${(i - (fan - 1) / 2) * FAN_STEP_DEG}deg` } as CSSProperties}>
                  <CardBack />
                </span>
              ))}
            </div>
            <div className="seat-medal">
              <EmblemBadge emblem={p.emblem} />
              {active && (
                <svg className="seat-ring" viewBox="0 0 64 64" aria-hidden="true">
                  <circle
                    key={game.deadline ?? "free"}
                    cx="32"
                    cy="32"
                    r="30"
                    className={timed ? "timed" : ""}
                    style={timed ? ({ "--turn-ms": `${game.options.timer * 1000}ms`, "--elapsed-ms": `${Math.max(0, elapsed)}ms` } as CSSProperties) : undefined}
                  />
                </svg>
              )}
              <span className="seat-count">{p.cardCount}</span>
            </div>
            <div className="seat-name">{p.name}</div>
            <span className="sr-only">{p.cardCount === 1 ? tx.card1 : fmt(tx.cards, { n: p.cardCount })}</span>
            {p.called && p.cardCount <= 2 && <span className="seat-call">{tx.call}</span>}
            {shake && <span className="seat-penalty" key={`${p.id}-${p.cardCount}`}>+{shake}</span>}
            {reaction && <span className="pc-bubble" key={reaction.id}>{reactionGlyph(reaction.key, tx)}</span>}
            {game.exposed === p.id && !choosing && (
              <button className="seat-catch" onClick={onCatch} aria-label={fmt(tx.catchLabel, { name: p.name })}>
                {tx.catch}
              </button>
            )}
          </Tag>
        );
      })}
    </div>
  );
}

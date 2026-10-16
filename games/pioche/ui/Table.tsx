"use client";
// The game screen: opponents on top, deck and pile in the middle, the player's hand at the bottom.
// The server decides what is legal; this screen only predicts it to highlight playable cards.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import EmblemBadge from "@/components/EmblemBadge";
import { fmt } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import type { Action } from "@/platform/contract";
import { CARD_COLORS, CHALLENGE_PENALTY, REACTIONS, catchable, playable, sameRank, type Card, type CardColor, type PublicGame } from "../engine";
import { eventText, type PiocheTexts } from "../i18n";
import { CARD_HEX, CardBack } from "./CardFace";
import Hand from "./Hand";
import Pile from "./Pile";
import Seats, { lastReaction } from "./Seats";
import { reactionGlyph } from "./reactions";
import type { Cue } from "./sound";

const TOAST_MS = 3600;
const TOASTS_KEPT = 3;
const SHAKE_MS = 900;
const DECK_LAYERS = 3;
const CLOCK_MS = 250;
/** The shout button ignores clicks while it pops in, so a click already on its way lands nowhere. */
const SHOUT_ARM_MS = 150;

/**
 * "Last card!" must be won by reflex, not by parking the cursor where the button always appears:
 * each race puts it at a fresh random spot of the table, drawn separately on every screen.
 */
function ShoutButton({ label, title, disabled, onShout }: {
  label: string; title: string; disabled: boolean; onShout: () => void;
}) {
  const [spot] = useState(() => ({ x: 14 + Math.random() * 72, y: 16 + Math.random() * 50, tilt: Math.random() * 16 - 8 }));
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), SHOUT_ARM_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <button
      className="pc-shout"
      style={{ left: `${spot.x}%`, top: `${spot.y}%`, "--tilt": `${spot.tilt}deg` } as CSSProperties}
      disabled={disabled}
      aria-label={title}
      title={title}
      onClick={() => armed && onShout()}
    >
      {label}
    </button>
  );
}

/** Cards on their way to the pile, with where each one left the hand. */
type Staged = { cards: Card[]; from: Map<string, DOMRect> };
type PendingPick = Staged & { kind: "color" | "target" };
type Toast = { id: string; text: string };

function Deck({ count, pending, enabled, label, onDraw, deckRef }: {
  count: number; pending: number; enabled: boolean; label: string; onDraw: () => void; deckRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button className={"pc-deck" + (enabled ? " ready" : "")} ref={deckRef} disabled={!enabled} onClick={onDraw} aria-label={label}>
      {Array.from({ length: Math.min(DECK_LAYERS, Math.max(1, Math.ceil(count / 30))) }, (_, i) => (
        <span key={i} className="deck-layer" style={{ "--i": i } as CSSProperties}>
          <CardBack />
        </span>
      ))}
      {pending > 0 && <span className="deck-pending">+{pending}</span>}
    </button>
  );
}

function DirectionRing({ direction, label }: { direction: 1 | -1; label: string }) {
  return (
    <svg className={"direction " + (direction === 1 ? "cw" : "ccw")} viewBox="-100 -100 200 200" role="img" aria-label={label}>
      <g className="direction-spin">
        {[0, 120, 240].map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <path d="M-86 -20A88 88 0 0 1 -20 -86" />
            <path d={direction === 1 ? "M-30 -95-18-86-30-76" : "M-95 -30-86-18-76-30"} />
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function Table({ game, tx, lang, act, busy, cue }: {
  game: PublicGame;
  tx: PiocheTexts;
  lang: Lang;
  act: (action: Action) => Promise<boolean>;
  busy: boolean;
  cue: (c: Cue) => void;
}) {
  const me = game.players.find((p) => p.id === game.me)!;
  const playing = game.phase === "playing" && !game.paused;
  const myTurn = playing && game.active === game.me && !me.left;
  const challengedMe = myTurn && game.challenge?.to === game.me;
  const top = game.discard.at(-1) ?? null;

  const [inFlight, setInFlight] = useState<(Staged & { color?: CardColor }) | null>(null),
    [picking, setPicking] = useState<PendingPick | null>(null),
    [lot, setLot] = useState<string[]>([]),
    [toasts, setToasts] = useState<Toast[]>([]),
    [shaking, setShaking] = useState(new Map<string, number>()),
    [now, setNow] = useState(() => Date.now());
  const deckEl = useRef<HTMLButtonElement | null>(null),
    pileEl = useRef<HTMLDivElement | null>(null),
    handEl = useRef<HTMLDivElement | null>(null),
    seatEls = useRef(new Map<string, HTMLElement>()),
    previous = useRef<PublicGame | null>(null);

  useEffect(() => {
    const it = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(it);
  }, []);

  // Sounds, toasts and penalty shakes come from what changed since the last state.
  useEffect(() => {
    const old = previous.current;
    previous.current = game;
    if (!old || old.code !== game.code) return;
    const known = new Set(old.events.map((e) => e.id));
    const fresh = game.events.filter((e) => !known.has(e.id));
    const texts = fresh.map((e) => eventText(e.key, e.args, lang)).filter((t): t is string => !!t);
    if (texts.length) {
      const added = texts.map((text) => ({ id: crypto.randomUUID(), text }));
      setToasts((x) => [...x, ...added].slice(-TOASTS_KEPT));
      setTimeout(() => setToasts((x) => x.filter((t) => !added.includes(t))), TOAST_MS);
    }
    if (fresh.some((e) => e.key === "called")) cue("call");
    if (fresh.some((e) => e.key === "caught")) cue("catch");
    // A player just reached their last card without calling: the race to shout starts.
    const racing = (s: PublicGame) => s.players.filter(catchable).map((p) => p.id).join();
    if (game.phase === "playing" && racing(game) && racing(game) !== racing(old)) cue("call");
    if (game.lastPlay && game.lastPlay.at !== old.lastPlay?.at && game.lastPlay.by !== game.me) cue("play");
    if (game.active === game.me && old.active !== game.me && game.phase === "playing") cue("turn");
    const hits = new Map<string, number>();
    for (const p of game.players) {
      const before = old.players.find((x) => x.id === p.id)?.cardCount ?? p.cardCount;
      if (p.cardCount - before >= 2 && old.round === game.round) hits.set(p.id, p.cardCount - before);
      if (p.id === game.me && p.cardCount > before && old.round === game.round) cue("draw");
    }
    if (hits.size) {
      setShaking(hits);
      setTimeout(() => setShaking(new Map()), SHAKE_MS);
    }
  }, [game, lang, cue]);

  const canPlay = useCallback(
    (card: Card) => myTurn && !busy && !inFlight && !picking && playable(game, card),
    [myTurn, busy, inFlight, picking, game],
  );
  const canJoin = useCallback(
    (lead: Card, card: Card) => !!game.options.combos && lead.id !== card.id && sameRank(lead, card) && canPlay(lead),
    [game.options.combos, canPlay],
  );

  async function send(staged: Staged, extra: Partial<Action> = {}) {
    setPicking(null);
    setInFlight({ ...staged, color: CARD_COLORS.find((c) => c === extra.color) });
    await act({ type: "play", cards: staged.cards.map((c) => c.id), ...extra });
    setInFlight(null);
  }
  function onPlay(cards: Card[], from: Map<string, DOMRect>) {
    const lead = cards[0];
    cue("play");
    setLot([]);
    if (lead.kind === "wild" || lead.kind === "draw4") return setPicking({ cards, from, kind: "color" });
    if (game.options.sevenZero && lead.kind === "number" && lead.value === 7)
      return setPicking({ cards, from, kind: "target" });
    void send({ cards, from });
  }
  function cancelPick() {
    // The lot comes back as it was chosen, ready to be played again.
    if (picking && picking.cards.length > 1) setLot(picking.cards.map((c) => c.id));
    setPicking(null);
  }

  const lotCards = lot.map((id) => me.hand.find((c) => c.id === id)).filter((c): c is Card => !!c);
  const lead = lotCards[0];
  const lotReady = lotCards.length > 1 && canPlay(lead) && lotCards.slice(1).every((c) => canJoin(lead, c));
  const partners = lotCards.length === 1 && me.hand.some((c) => canJoin(lead, c));
  function playLot() {
    const from = new Map<string, DOMRect>();
    for (const c of lotCards) {
      const el = handEl.current?.querySelector(`[data-card="${c.id}"]`);
      if (el) from.set(c.id, el.getBoundingClientRect());
    }
    onPlay(lotCards, from);
  }

  // Cards waiting for a colour or target already lie on the pile; cancelling returns them to the hand.
  const staged = inFlight ?? picking;
  const stagedIds = new Set(staged?.cards.map((c) => c.id));
  const originOf = useCallback(
    (card: Card) => {
      const fromHand = staged?.from.get(card.id);
      if (fromHand) return fromHand;
      const last = game.lastPlay;
      if (!last || !(last.cards ?? [last.card]).includes(card.id)) return null;
      if (last.by === game.me) return handEl.current?.getBoundingClientRect() ?? null;
      return seatEls.current.get(last.by)?.getBoundingClientRect() ?? null;
    },
    [staged, game.lastPlay, game.me],
  );
  const pileCards = [...game.discard, ...(staged?.cards.filter((c) => !game.discard.some((d) => d.id === c.id)) ?? [])];
  const hand = me.hand.filter((c) => !stagedIds.has(c.id));
  // A wild on top shows the colour chosen for it: ours as soon as we pick it, others' from the server.
  const pileTop = pileCards.at(-1);
  const topTint = pileTop && !pileTop.color ? (inFlight?.cards.some((c) => c.id === pileTop.id) ? inFlight.color ?? null : picking ? null : game.color) : null;

  const canDraw = myTurn && !busy && !inFlight && !picking && (!game.drawn || game.pendingDraw > 0);
  const activePlayer = game.players.find((p) => p.id === game.active);
  const challenger = game.challenge ? game.players.find((p) => p.id === game.challenge!.from) : null;
  let prompt = myTurn ? (game.options.combos ? tx.playHintCombos : tx.playHint) : fmt(tx.theirTurn, { name: activePlayer?.name ?? "" });
  if (myTurn && game.drawn) prompt = tx.drawnHint;
  if (myTurn && game.drawing && !game.drawn) prompt = tx.keepDrawingHint;
  if (myTurn && game.pendingDraw > 0 && !challengedMe)
    prompt = fmt(tx.stackHint, { card: top?.kind === "draw4" ? "+4" : "+2", n: game.pendingDraw });
  if (challengedMe)
    prompt = fmt(tx.challengeHint, { name: challenger?.name ?? "", n: game.pendingDraw, m: game.pendingDraw + CHALLENGE_PENALTY });
  if (partners) prompt = fmt(tx.comboHint, { card: lead.kind === "number" ? String(lead.value) : tx.kinds[lead.kind] });
  if (lotReady) prompt = tx.lotHint;
  if (picking) prompt = picking.kind === "color" ? tx.chooseColor : tx.chooseTarget;
  // "Last card!" is a race open as long as a player sits on one card without having called it.
  const canCall = playing && catchable(me);
  const forgetful = playing ? game.players.find((p) => p.id !== game.me && catchable(p)) : undefined;
  if (forgetful && !picking) prompt = fmt(tx.catchHint, { name: forgetful.name });
  if (canCall && !picking) prompt = tx.callHint;
  const myReaction = lastReaction(game.reactions, game.me, now);

  return (
    <div className={"table" + (myTurn ? " my-turn" : "") + (lotReady ? " lot-ready" : "")}>
      <Seats
        game={game}
        tx={tx}
        now={now}
        shaking={shaking}
        choosing={picking?.kind === "target"}
        onChoose={(id) => picking && void send(picking, { target: id })}
        register={(id, el) => {
          if (el) seatEls.current.set(id, el);
          else seatEls.current.delete(id);
        }}
      />

      <div className="centre">
        <DirectionRing direction={game.direction} label={`${tx.direction} : ${game.direction === 1 ? tx.clockwise : tx.counterClockwise}`} />
        {game.color && (
          <span className={"colour-glow" + (topTint ? " strong" : "")} style={{ "--glow": CARD_HEX[topTint ?? game.color] } as CSSProperties} aria-hidden="true" />
        )}
        <Deck
          count={game.deckCount}
          pending={myTurn ? game.pendingDraw : 0}
          enabled={canDraw}
          label={game.pendingDraw > 0 && myTurn ? fmt(tx.drawN, { n: game.pendingDraw }) : fmt(tx.deck, { n: game.deckCount })}
          onDraw={() => void act({ type: "draw" })}
          deckRef={(el) => (deckEl.current = el)}
        />
        <Pile cards={pileCards} topTint={topTint} originOf={originOf} label={tx.pile} zoneRef={pileEl} />
        {topTint && (
          <span className="colour-tag" key={`${pileCards.at(-1)?.id}-${topTint}`} style={{ "--glow": CARD_HEX[topTint] } as CSSProperties}>
            <i aria-hidden="true" />
            {fmt(tx.colourInPlay, { colour: tx.colors[topTint] })}
          </span>
        )}
        {picking?.kind === "color" && (
          <div className="colour-picker" role="group" aria-label={tx.chooseColor}>
            {CARD_COLORS.map((c: CardColor, i) => (
              <button
                key={c}
                className="petal"
                style={{ "--petal": CARD_HEX[c], "--i": i } as CSSProperties}
                aria-label={tx.colors[c]}
                onClick={() => void send(picking, { color: c })}
              />
            ))}
          </div>
        )}
      </div>

      <div className="prompt" aria-live="polite">
        {myTurn && <b className="turn-flag">{tx.yourTurn}</b>}
        <span>{prompt}</span>
        <div className="prompt-actions">
          {challengedMe && (
            <>
              <button className="btn red" disabled={busy} onClick={() => void act({ type: "challenge" })}>{tx.challenge}</button>
              <button className="btn ghost" disabled={busy} onClick={() => void act({ type: "draw" })}>{fmt(tx.drawN, { n: game.pendingDraw })}</button>
            </>
          )}
          {lotReady && !picking && (
            <>
              <button className="btn go lot-play" disabled={busy} onClick={playLot}>
                <span className="lot-stack" aria-hidden="true">{lotCards.map((c) => <i key={c.id} />)}</span>
                {fmt(tx.playLot, { n: lotCards.length })}
              </button>
              <button className="btn ghost" onClick={() => setLot([])}>{tx.cancel}</button>
            </>
          )}
          {myTurn && game.drawn && !game.pendingDraw && (
            <button className="btn ghost" disabled={busy} onClick={() => void act({ type: "pass" })}>{tx.pass}</button>
          )}
          {picking && <button className="btn ghost" onClick={cancelPick}>{tx.cancel}</button>}
        </div>
      </div>

      <div className="hand-zone" ref={handEl}>
        <Hand
          cards={hand}
          canPlay={canPlay}
          highlight={game.drawn}
          drawOrigin={() => deckEl.current?.getBoundingClientRect() ?? null}
          dropZone={() => pileEl.current}
          selected={lot}
          onSelect={setLot}
          canJoin={canJoin}
          onPlay={onPlay}
          onCue={cue}
          tx={tx}
        />
        <div className="me-tag">
          <EmblemBadge emblem={me.emblem} size={34} />
          <span className="me-name">{me.name}</span>
          <span className="me-count" aria-live="polite">{me.hand.length === 1 ? tx.card1 : fmt(tx.cards, { n: me.hand.length })}</span>
          {myReaction && <span className="pc-bubble mine" key={myReaction.id}>{reactionGlyph(myReaction.key, tx)}</span>}
        </div>
      </div>

      {(canCall || (forgetful && !picking)) && (
        // A new key (player and hand size) is a new race, so the button moves somewhere else.
        <ShoutButton
          key={canCall ? `me:${me.hand.length}` : `${forgetful!.id}:${forgetful!.cardCount}`}
          label={canCall ? tx.call : tx.catch}
          title={canCall ? tx.callHint : fmt(tx.catchLabel, { name: forgetful!.name })}
          disabled={busy}
          onShout={() => {
            if (canCall) {
              cue("call");
              void act({ type: "call" });
            } else void act({ type: "catch", player: forgetful!.id });
          }}
        />
      )}

      <div className="reactions" role="group" aria-label={tx.reactions}>
        {REACTIONS.map((r) => (
          <button key={r} aria-label={tx.reactionLabels[r]} title={tx.reactionLabels[r]} onClick={() => void act({ type: "react", key: r })}>
            {reactionGlyph(r, tx)}
          </button>
        ))}
      </div>

      <div className="pc-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pc-toast">{t.text}</div>
        ))}
      </div>
    </div>
  );
}

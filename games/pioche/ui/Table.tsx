"use client";
// The game screen: opponents on top, deck and pile in the middle, the player's hand at the bottom.
// The server decides what is legal; this screen only predicts it to highlight playable cards.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import EmblemBadge from "@/components/EmblemBadge";
import { fmt } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import type { Action } from "@/platform/contract";
import { CARD_COLORS, REACTIONS, playable, type Card, type CardColor, type PublicGame } from "../engine";
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

type PendingPick = { card: Card; from: DOMRect; kind: "color" | "target" };
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

  const [inFlight, setInFlight] = useState<{ card: Card; from: DOMRect } | null>(null),
    [picking, setPicking] = useState<PendingPick | null>(null),
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
    if (game.exposed && game.exposed !== game.me && game.exposed !== old.exposed) cue("call");
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

  async function send(card: Card, from: DOMRect, extra: Partial<Action> = {}) {
    setPicking(null);
    setInFlight({ card, from });
    await act({ type: "play", card: card.id, ...extra });
    setInFlight(null);
  }
  function onPlay(card: Card, from: DOMRect) {
    cue("play");
    if (card.kind === "wild" || card.kind === "draw4") return setPicking({ card, from, kind: "color" });
    if (game.options.sevenZero && card.kind === "number" && card.value === 7)
      return setPicking({ card, from, kind: "target" });
    void send(card, from);
  }

  // A card waiting for its colour or target already lies on the pile; cancelling returns it to the hand.
  const staged = inFlight ?? picking;
  const originOf = useCallback(
    (card: Card) => {
      if (staged?.card.id === card.id) return staged.from;
      if (game.lastPlay?.card !== card.id) return null;
      if (game.lastPlay.by === game.me) return handEl.current?.getBoundingClientRect() ?? null;
      return seatEls.current.get(game.lastPlay.by)?.getBoundingClientRect() ?? null;
    },
    [staged, game.lastPlay, game.me],
  );
  const pileCards = staged && !game.discard.some((c) => c.id === staged.card.id) ? [...game.discard, staged.card] : game.discard;
  const hand = me.hand.filter((c) => c.id !== staged?.card.id);

  const canDraw = myTurn && !busy && !inFlight && !picking && (!game.drawn || game.pendingDraw > 0);
  const activePlayer = game.players.find((p) => p.id === game.active);
  const challenger = game.challenge ? game.players.find((p) => p.id === game.challenge!.from) : null;
  let prompt = myTurn ? tx.playHint : fmt(tx.theirTurn, { name: activePlayer?.name ?? "" });
  if (myTurn && game.drawn) prompt = tx.drawnHint;
  if (myTurn && game.pendingDraw > 0 && !challengedMe)
    prompt = fmt(tx.stackHint, { card: top?.kind === "draw4" ? "+4" : "+2", n: game.pendingDraw });
  if (challengedMe) prompt = fmt(tx.challengeHint, { name: challenger?.name ?? "" });
  if (picking) prompt = picking.kind === "color" ? tx.chooseColor : tx.chooseTarget;
  const canCall = playing && !me.left && me.hand.length > 0 && me.hand.length <= 2 && !me.called;
  // Someone else forgot to call: every other player may shout it until the next move.
  const forgetful = game.exposed && game.exposed !== game.me ? game.players.find((p) => p.id === game.exposed) : null;
  if (forgetful && !picking) prompt = fmt(tx.catchHint, { name: forgetful.name });
  const myReaction = lastReaction(game.reactions, game.me, now);

  return (
    <div className={"table" + (myTurn ? " my-turn" : "")}>
      <Seats
        game={game}
        tx={tx}
        now={now}
        shaking={shaking}
        choosing={picking?.kind === "target"}
        onChoose={(id) => picking && void send(picking.card, picking.from, { target: id })}
        onCatch={() => void act({ type: "catch" })}
        register={(id, el) => {
          if (el) seatEls.current.set(id, el);
          else seatEls.current.delete(id);
        }}
      />

      <div className="centre">
        <DirectionRing direction={game.direction} label={`${tx.direction} : ${game.direction === 1 ? tx.clockwise : tx.counterClockwise}`} />
        {game.color && (
          <span className="colour-glow" style={{ "--glow": CARD_HEX[game.color] } as CSSProperties} aria-hidden="true" />
        )}
        <Deck
          count={game.deckCount}
          pending={myTurn ? game.pendingDraw : 0}
          enabled={canDraw}
          label={game.pendingDraw > 0 && myTurn ? fmt(tx.drawN, { n: game.pendingDraw }) : fmt(tx.deck, { n: game.deckCount })}
          onDraw={() => void act({ type: "draw" })}
          deckRef={(el) => (deckEl.current = el)}
        />
        <Pile cards={pileCards} originOf={originOf} label={tx.pile} zoneRef={pileEl} />
        {picking?.kind === "color" && (
          <div className="colour-picker" role="group" aria-label={tx.chooseColor}>
            {CARD_COLORS.map((c: CardColor, i) => (
              <button
                key={c}
                className="petal"
                style={{ "--petal": CARD_HEX[c], "--i": i } as CSSProperties}
                aria-label={tx.colors[c]}
                onClick={() => void send(picking.card, picking.from, { color: c })}
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
              <button className="btn ghost" disabled={busy} onClick={() => void act({ type: "draw" })}>{tx.acceptDraw}</button>
            </>
          )}
          {myTurn && game.drawn && !game.pendingDraw && (
            <button className="btn ghost" disabled={busy} onClick={() => void act({ type: "pass" })}>{tx.pass}</button>
          )}
          {forgetful && !picking && (
            <button className="btn red shout" disabled={busy} onClick={() => void act({ type: "catch" })} aria-label={fmt(tx.catchLabel, { name: forgetful.name })}>
              {tx.catch}
            </button>
          )}
          {picking && <button className="btn ghost" onClick={() => setPicking(null)}>{tx.cancel}</button>}
        </div>
      </div>

      <div className="hand-zone" ref={handEl}>
        {canCall && (
          <button className="call" disabled={busy} onClick={() => { cue("call"); void act({ type: "call" }); }} title={tx.callHint}>
            {tx.call}
          </button>
        )}
        {game.exposed === game.me && !canCall && <span className="exposed-note">{tx.callHint}</span>}
        <Hand
          cards={hand}
          canPlay={canPlay}
          highlight={game.drawn}
          drawOrigin={() => deckEl.current?.getBoundingClientRect() ?? null}
          dropZone={() => pileEl.current}
          onPlay={onPlay}
          onCue={cue}
          tx={tx}
        />
        <div className="me-tag">
          <EmblemBadge emblem={me.emblem} size={34} />
          <span>{me.name}</span>
          {myReaction && <span className="pc-bubble mine" key={myReaction.id}>{reactionGlyph(myReaction.key, tx)}</span>}
        </div>
      </div>

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

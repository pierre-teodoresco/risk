"use client";
// The game screen: the board fills the screen, the players' cards sit in its corners, the dice
// are thrown from a button held at the bottom, a postcard offers each city as the pawn lands on
// it, and the amounts won and paid float over the pawns. Properties, deeds and the journal live
// in a drawer on the right.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeftRight, Crown, Handshake, Lock, Menu, Plane, X, Zap } from "lucide-react";
import { useUntilClock } from "@/lib/useUntilClock";
import { fmt } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import type { Action } from "@/platform/contract";
import { BOARD, groupSquares, mortgageValue, property, unmortgageCost } from "../board";
import { JAIL_FINE, fullGroup, inGame, ownedBy, rent, type PublicGame, type PublicPlayer } from "../engine";
import { GROUP_HEX, PAWN_HEX, cardText, eventText, squareName, type GtTexts } from "../i18n";
import Board, { Pawn, flagOf, type TourBoard } from "./Board";
import { playSound } from "./sound";

const CLOCK_MS = 250;
const CARD_SHOWN_MS = 5200;
const BIDS = [10, 50, 100];
const JOURNAL_LINES = 12;
const TOAST_MS = 5000;
const RATTLE_MS = 110;
const BANNER_MS = 1600;
type Props = { game: PublicGame; tx: GtTexts; lang: Lang; act: (a: Action) => Promise<boolean>; busy: boolean };

/** A number that counts up or down to its new value. */
function Count({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = value;
    if (a === b) return;
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / 700);
      const v = Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3)));
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

/** Two little dice drawn for the roll button. */
function DiceIcon() {
  return (
    <svg viewBox="0 0 64 40" aria-hidden="true">
      <g transform="rotate(-12 18 20)">
        <rect x="2" y="4" width="32" height="32" rx="8" fill="#fff" />
        <circle cx="11" cy="13" r="3.4" fill="#e8333b" /><circle cx="18" cy="20" r="3.4" fill="#e8333b" /><circle cx="25" cy="27" r="3.4" fill="#e8333b" />
      </g>
      <g transform="rotate(14 46 20)">
        <rect x="30" y="4" width="32" height="32" rx="8" fill="#fff" />
        <circle cx="39" cy="13" r="3.4" fill="#e8333b" /><circle cx="53" cy="13" r="3.4" fill="#e8333b" /><circle cx="39" cy="27" r="3.4" fill="#e8333b" /><circle cx="53" cy="27" r="3.4" fill="#e8333b" />
      </g>
    </svg>
  );
}

export default function Table({ game, tx, lang, act, busy }: Props) {
  const [selected, setSelected] = useState<number | null>(null),
    [target, setTarget] = useState<number | null>(null),
    [trading, setTrading] = useState<string | null>(null),
    [drawer, setDrawer] = useState(false),
    [holding, setHolding] = useState(false),
    [rolling, setRolling] = useState(false),
    [arrived, setArrived] = useState(game.lastMove?.at ?? 0),
    [rolled, setRolled] = useState<{ values: [number, number]; key: number } | null>(null),
    [toasts, setToasts] = useState<{ id: string; text: string }[]>([]),
    [banner, setBanner] = useState(0);
  const skew = useMemo(() => game.serverTime - Date.now(), [game.serverTime]);
  const board = useRef<TourBoard | null>(null);
  const rattle = useRef<ReturnType<typeof setInterval> | null>(null);
  const until = Math.max(
    game.deadline && !game.paused ? game.deadline - skew : 0,
    game.endsAt && game.phase === "playing" ? game.endsAt - skew : 0,
    game.lastCard ? game.lastCard.at - skew + CARD_SHOWN_MS : 0,
  );
  const now = useUntilClock(until, CLOCK_MS);

  const me = game.players.find((p) => p.id === game.me)!;
  const active = game.players.find((p) => p.id === game.active)!;
  const colorOf = (id: string) => PAWN_HEX[game.players.find((p) => p.id === id)?.emblem ?? 0];
  const myTurn = game.active === game.me && game.phase === "playing" && !game.paused && inGame(me);
  const money = (n: number) => `₲${n.toLocaleString(lang)}`;
  const worth = (p: PublicPlayer) =>
    p.cash + ownedBy(game, p.id).reduce((s, i) => s + (game.holdings[String(i)].mortgaged ? mortgageValue(property(i)!) : property(i)!.price), 0);
  const pawns = game.players.map((p) => ({ id: p.id, emblem: p.emblem, pos: p.pos, out: !inGame(p) }));
  const rollKey = String(game.events.findLast((e) => e.key === "rolled")?.id ?? "");
  // The pawn must reach its square before the square asks anything.
  const settled = !game.lastMove || arrived >= game.lastMove.at;
  const rents = useMemo(
    () =>
      BOARD.map((s, i) => {
        const h = game.holdings[String(i)];
        if (!h || h.mortgaged) return null;
        if (s.kind === "utility") {
          const n = ownedBy(game, h.owner).filter((j) => BOARD[j].kind === "utility").length;
          return n === 2 ? "×10" : "×4";
        }
        return `₲${rent(game, i, 0)}`;
      }),
    [game],
  );

  // ---------- What happened since the last state ----------
  const last = useRef({ cash: new Map(game.players.map((p) => [p.id, p.cash])), event: game.events.at(-1)?.id ?? "", card: game.lastCard?.at ?? 0, active: game.active, step: game.step });
  useEffect(() => {
    const l = last.current;
    for (const p of game.players) {
      const before = l.cash.get(p.id);
      if (before !== undefined && before !== p.cash) {
        const d = p.cash - before;
        board.current?.float(p.id, `${d > 0 ? "+" : "−"}₲${Math.abs(d)}`, d > 0 ? "#22a356" : "#e2373f");
        if (p.id === game.me) setTimeout(() => playSound(d > 0 ? "coin" : "pay"), 250);
      }
    }
    const seen = game.events.findIndex((e) => e.id === l.event);
    const fresh = game.events.slice(seen + 1);
    if (l.event && fresh.length) {
      const lines = fresh.map((e) => ({ id: e.id, text: eventText(e.key, e.args, lang) })).filter((e) => e.text);
      if (lines.length) setToasts((t) => [...t, ...lines].slice(-3));
      if (fresh.some((e) => e.key === "jailed")) playSound("jail");
      if (fresh.some((e) => e.key === "bought" || e.key === "auctionWon")) playSound("buy");
      if (fresh.some((e) => e.key === "won")) playSound("win");
    }
    if (game.lastCard && game.lastCard.at !== l.card) setTimeout(() => playSound("card"), 400);
    if (game.active === game.me && (l.active !== game.me || l.step !== "roll") && game.step === "roll" && game.phase === "playing") {
      playSound("turn");
      if (l.active !== game.me) setBanner(Date.now());
    }
    last.current = { cash: new Map(game.players.map((p) => [p.id, p.cash])), event: game.events.at(-1)?.id ?? "", card: game.lastCard?.at ?? 0, active: game.active, step: game.step };
  }, [game, lang]);
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => setToasts((list) => list.slice(1)), TOAST_MS);
    return () => clearTimeout(t);
  }, [toasts]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(0), BANNER_MS);
    return () => clearTimeout(t);
  }, [banner]);

  // ---------- The dice ----------
  const canRoll = myTurn && game.step === "roll" && !busy && !rolling && settled;
  // A ref as well as the state: a quick click lets go before React has re-rendered the press.
  const held = useRef(false);
  function startRoll(e?: ReactPointerEvent) {
    if (!canRoll || held.current) return;
    held.current = true;
    e?.currentTarget.setPointerCapture?.(e.pointerId);
    setHolding(true);
    board.current?.hold();
    playSound("rattle");
    rattle.current = setInterval(() => playSound("rattle"), RATTLE_MS);
  }
  async function throwDice() {
    if (!held.current) return;
    held.current = false;
    setHolding(false);
    if (rattle.current) clearInterval(rattle.current);
    rattle.current = null;
    board.current?.release();
    setRolling(true);
    const ok = await act({ type: "roll" });
    if (!ok) {
      board.current?.cancel();
      setRolling(false);
    }
  }
  useEffect(() => () => {
    if (rattle.current) clearInterval(rattle.current);
  }, []);
  // The space bar works like the button.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      startRoll();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") void throwDice();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });
  const events = {
    onDice: (values: [number, number]) => {
      setRolling(false);
      setRolled({ values, key: Date.now() });
    },
    onHop: (_id: string, _i: number, k: number) => playSound("hop", k),
    onArrive: () => setArrived(game.lastMove?.at ?? Date.now()),
    onThud: (kind: "dice" | "build" | "flag") => {
      if (kind === "dice") playSound("dice");
      else if (kind === "build") playSound("build");
    },
  };
  // A jump (customs, a card) has no hops; it settles at once.
  useEffect(() => {
    if (game.lastMove?.jump) {
      const t = setTimeout(() => setArrived(game.lastMove!.at), 700);
      return () => clearTimeout(t);
    }
  }, [game.lastMove]);
  useEffect(() => {
    if (!rolled) return;
    const t = setTimeout(() => setRolled(null), 1600);
    return () => clearTimeout(t);
  }, [rolled]);

  const picking = game.active === game.me && (game.step === "travel" || game.step === "festival");
  useEffect(() => {
    setTarget(null);
  }, [game.step, game.active]);
  const timeLeft = game.endsAt && game.phase === "playing" ? Math.max(0, game.endsAt - now - skew) : null;
  const auction = game.auction;
  const remaining = game.deadline ? Math.max(0, (game.deadline - now - skew) / 1000) : 0;
  const card = game.lastCard && settled && now + skew - game.lastCard.at < CARD_SHOWN_MS ? game.lastCard : null;
  const buyable = property(me.pos);

  // ---------- The dock: what the turn asks for ----------
  let dock: React.ReactNode = null;
  if (game.phase !== "playing") dock = null;
  else if (game.step === "auction" && auction) {
    const lead = auction.bidder ? game.players.find((p) => p.id === auction.bidder) : null;
    const total = Math.max(remaining, 0.001);
    dock = (
      <div className="gt-postcard gt-auction-card" style={{ "--band": BOARD[auction.square].kind === "city" ? GROUP_HEX[(BOARD[auction.square] as { group: keyof typeof GROUP_HEX }).group] : "#3d7ff0" } as CSSProperties}>
        <header>
          <span className="gt-flag">{flagOf(auction.square) ?? "🔨"}</span>
          <b>{fmt(tx.auctionFor, { city: squareName(auction.square, lang) })}</b>
        </header>
        <p className="gt-bid">{lead ? fmt(tx.auctionLead, { name: lead.name, amount: money(auction.bid) }) : tx.auctionNoBid}</p>
        <span className="gt-timer" style={{ "--k": Math.min(1, total / 10) } as CSSProperties}><i /></span>
        {inGame(me) && (
          <div className="gt-actions">
            {BIDS.map((n) => (
              <button key={n} className="gt-btn go" disabled={busy || me.cash < auction.bid + n} onClick={() => void act({ type: "bid", amount: auction.bid + n })}>
                {fmt(tx.bid, { n })}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  } else if (game.step === "debt" && game.debt && settled) {
    const to = game.debt.to ? game.players.find((p) => p.id === game.debt!.to)?.name ?? tx.bank : tx.bank;
    dock =
      game.debt.player === game.me ? (
        <div className="gt-postcard danger">
          <header><span className="gt-flag">💸</span><b>{tx.debtTitle}</b></header>
          <p>{fmt(tx.debtText, { amount: money(game.debt.amount), to })}</p>
          <div className="gt-actions">
            <button className="gt-btn go" disabled={busy || me.cash < game.debt.amount} onClick={() => void act({ type: "payDebt" })}>{fmt(tx.payDebt, { amount: money(game.debt.amount) })}</button>
            <button className="gt-btn danger" disabled={busy} onClick={() => void act({ type: "bankrupt" })}>{tx.goBankrupt}</button>
            <button className="gt-btn ghost" onClick={() => setDrawer(true)}>{tx.myProperties}</button>
          </div>
        </div>
      ) : (
        <div className="gt-waiting"><Pawn emblem={active.emblem} size={30} />{fmt(tx.theyOwe, { name: active.name, amount: money(game.debt.amount) })}</div>
      );
  } else if (myTurn && game.step === "buy" && buyable && settled) {
    const s = BOARD[me.pos];
    const band = s.kind === "city" ? GROUP_HEX[s.group] : "#3d7ff0";
    dock = (
      <div className="gt-postcard" style={{ "--band": band } as CSSProperties} key={game.lastMove?.at}>
        <header>
          <span className="gt-flag">{flagOf(me.pos) ?? (s.kind === "airport" ? <Plane /> : <Zap />)}</span>
          <span>
            <small>{tx.forSale}</small>
            <b>{squareName(me.pos, lang)}</b>
          </span>
        </header>
        <dl>
          <div><dt>{tx.price}</dt><dd>{money(buyable.price)}</dd></div>
          {s.kind === "city" && <div><dt>{tx.baseRent}</dt><dd>{money(s.rents[0])}</dd></div>}
          {s.kind === "city" && <div><dt>{tx.rentHotel}</dt><dd>{money(s.rents[5])}</dd></div>}
          {s.kind === "airport" && <p className="gt-hint">{tx.airportRent}</p>}
          {s.kind === "utility" && <p className="gt-hint">{tx.utilityRent}</p>}
        </dl>
        <div className="gt-actions">
          <button className="gt-btn go big" disabled={busy || me.cash < buyable.price} onClick={() => void act({ type: "buy" })}>{fmt(tx.buy, { price: money(buyable.price) })}</button>
          <button className="gt-btn ghost" disabled={busy} onClick={() => void act({ type: "decline" })}>{game.options.auctions ? tx.declineAuction : tx.passTurn}</button>
        </div>
      </div>
    );
  } else if (myTurn && game.step === "buyout" && game.offer && settled) {
    const o = game.offer, s = BOARD[o.square];
    const owner = game.players.find((p) => p.id === game.holdings[String(o.square)]?.owner);
    dock = (
      <div className="gt-postcard" style={{ "--band": s.kind === "city" ? GROUP_HEX[s.group] : "#3d7ff0" } as CSSProperties} key={"bo" + o.square}>
        <header>
          <span className="gt-flag">{flagOf(o.square) ?? "🏙"}</span>
          <span><small>{tx.buyout}</small><b>{fmt(tx.buyoutTitle, { city: squareName(o.square, lang) })}</b></span>
        </header>
        <p>{fmt(tx.buyoutText, { name: owner?.name ?? "", price: money(o.price) })}</p>
        <div className="gt-actions">
          <button className="gt-btn go big" disabled={busy || me.cash < o.price} onClick={() => void act({ type: "buyout" })}>{fmt(tx.buyoutGo, { price: money(o.price) })}</button>
          <button className="gt-btn ghost" disabled={busy} onClick={() => void act({ type: "skip" })}>{tx.skip}</button>
        </div>
      </div>
    );
  } else if (myTurn && (game.step === "travel" || game.step === "festival") && settled) {
    const travel = game.step === "travel";
    const ok = target !== null && (travel ? target !== me.pos && (!game.holdings[String(target)] || game.holdings[String(target)].owner === me.id) : BOARD[target].kind === "city" && game.holdings[String(target)]?.owner === me.id && !game.holdings[String(target)].mortgaged);
    dock = (
      <div className="gt-postcard" style={{ "--band": travel ? "#3d7ff0" : "#ff8a1f" } as CSSProperties}>
        <header>
          <span className="gt-flag">{travel ? <Plane /> : "🎉"}</span>
          <span><b>{travel ? tx.travelTitle : tx.festivalTitle}</b></span>
        </header>
        <p>{travel ? tx.travelText : tx.festivalText}</p>
        <div className="gt-actions">
          <button className="gt-btn go big" disabled={busy || !ok} onClick={() => void act(travel ? { type: "travel", square: target } : { type: "festival", square: target })}>
            {ok ? fmt(travel ? tx.travelGo : tx.festivalGo, { city: squareName(target!, lang) }) : travel ? tx.travelTitle : tx.festivalTitle}
          </button>
          <button className="gt-btn ghost" disabled={busy} onClick={() => void act({ type: "skip" })}>{tx.skip}</button>
        </div>
      </div>
    );
  } else if (myTurn && game.step === "roll") {
    dock = (
      <div className="gt-roll-dock">
        {me.jailed && (
          <div className="gt-jail-options">
            <span><Lock size={14} /> {tx.inJail} · {fmt(tx.inJailTurns, { n: me.jailTurns + 1 })}</span>
            <div className="gt-actions">
              <button className="gt-btn ghost small" disabled={busy || me.cash < JAIL_FINE} onClick={() => void act({ type: "jailPay" })}>{fmt(tx.jailPay, { amount: money(JAIL_FINE) })}</button>
              {me.jailCards > 0 && <button className="gt-btn ghost small" disabled={busy} onClick={() => void act({ type: "jailCard" })}>{tx.jailCard}</button>}
            </div>
          </div>
        )}
        <button
          className={"gt-roll" + (holding ? " held" : "")}
          disabled={!canRoll && !holding}
          onPointerDown={startRoll}
          onPointerUp={() => void throwDice()}
          onPointerCancel={() => void throwDice()}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={tx.roll}
        >
          <span className="gt-roll-ring" aria-hidden="true" />
          <DiceIcon />
          <b>{rolling ? tx.rolling : game.again ? tx.rollAgain : tx.roll}</b>
        </button>
        <small className="gt-roll-hint">{tx.holdToRoll}</small>
      </div>
    );
  } else if (!myTurn) {
    dock = (
      <div className="gt-waiting" style={{ "--pc": colorOf(active.id) } as CSSProperties}>
        <Pawn emblem={active.emblem} size={30} />
        {active.jailed ? fmt(tx.theyAreInJail, { name: active.name }) : game.step === "roll" ? fmt(tx.theyRoll, { name: active.name }) : fmt(tx.theirTurn, { name: active.name })}
        {game.step === "roll" && <span className="gt-dots" aria-hidden="true"><i /><i /><i /></span>}
      </div>
    );
  }

  // ---------- Seats around the board ----------
  const seats = [...game.players];
  const mine = seats.findIndex((p) => p.id === game.me);
  const order = [...seats.slice(mine), ...seats.slice(0, mine)];
  const incoming = game.trades.filter((t) => t.to === game.me);
  const outgoing = game.trades.filter((t) => t.from === game.me);
  const properties = ownedBy(game, game.me);
  const journal = useMemo(
    () => game.events.map((e) => ({ id: e.id, text: eventText(e.key, e.args, lang) })).filter((e) => e.text).slice(-JOURNAL_LINES).reverse(),
    [game.events, lang],
  );

  return (
    <div className="gt-play">
      <Board
        lang={lang}
        holdings={game.holdings}
        pawns={pawns}
        move={game.lastMove}
        ownerColor={colorOf}
        selected={selected}
        onSelect={(i) => {
          setSelected(i);
          // Picking a destination or a festival city chooses the square; otherwise it opens its deed.
          if (picking) setTarget(i);
          else setDrawer(true);
        }}
        dice={game.dice ? { values: game.dice, key: rollKey } : null}
        active={game.phase === "playing" ? game.active : null}
        pot={game.options.parkingPot ? game.pot : 0}
        rents={rents}
        card={game.lastCard ? { deck: game.lastCard.deck, at: game.lastCard.at } : null}
        events={events}
        onReady={(b) => (board.current = b)}
      />

      <div className="gt-seats">
        {order.map((p, k) => (
          <section
            key={p.id}
            className={`gt-seat s${k}` + (p.id === game.active && game.phase === "playing" ? " on" : "") + (inGame(p) ? "" : " out")}
            style={{ "--pc": colorOf(p.id) } as CSSProperties}
          >
            <span className="gt-seat-face"><Pawn emblem={p.emblem} size={46} /></span>
            <span className="gt-seat-name">
              {p.name}
              {p.id === game.me && <small>{tx.you}</small>}
            </span>
            <span className="gt-seat-cash">
              {p.bankrupt ? tx.bankrupt : p.left ? tx.left : <Count value={p.cash} format={money} />}
            </span>
            <span className="gt-seat-meta">
              {ownedBy(game, p.id).length} ⌂{p.jailed && <Lock size={12} aria-label={tx.square.jail} />}
              {p.jailCards > 0 && <i title={tx.jailCards}>🎟 {p.jailCards}</i>}
            </span>
            {p.id !== game.me && inGame(p) && inGame(me) && game.phase === "playing" && (
              <button className="gt-seat-trade" aria-label={fmt(tx.tradeWith, { name: p.name })} title={fmt(tx.tradeWith, { name: p.name })} onClick={() => setTrading(p.id)}>
                <ArrowLeftRight size={15} />
              </button>
            )}
          </section>
        ))}
      </div>

      {timeLeft !== null && (
        <span className={"gt-timeleft" + (timeLeft < 60000 ? " low" : "")}>
          ⏱ {fmt(tx.timeLeft, { t: `${Math.floor(timeLeft / 60000)}:${String(Math.floor((timeLeft % 60000) / 1000)).padStart(2, "0")}` })}
        </span>
      )}
      <div className={"gt-toasts" + (timeLeft !== null ? " below" : "")} aria-live="polite">
        {toasts.map((t) => <p key={t.id}>{t.text}</p>)}
      </div>

      {banner > 0 && <div className="gt-banner" key={banner}>{tx.yourTurnBig}</div>}
      {rolled && (
        <div className="gt-rolled" key={rolled.key}>
          <b>{rolled.values[0] + rolled.values[1]}</b>
          {rolled.values[0] === rolled.values[1] && <small>{tx.rollAgain.split(" ")[0]}</small>}
        </div>
      )}
      {card && (
        <div className={"gt-drawn " + card.deck} key={card.at}>
          <span>{card.deck === "chance" ? "?" : "✦"}</span>
          <small>{tx.square[card.deck]}</small>
          <p>{cardText(card.deck, card.id, lang)}</p>
        </div>
      )}
      {game.options.parkingPot && game.pot > 0 && <span className="gt-pot">💰 {tx.pot} · {money(game.pot)}</span>}

      <div className="gt-dock">{dock}</div>

      {incoming.length > 0 && (
        <div className="gt-offers">
          {incoming.map((t) => {
            const from = game.players.find((p) => p.id === t.from)!;
            return (
              <div className="gt-offer" key={t.id} style={{ "--pc": colorOf(from.id) } as CSSProperties}>
                <b><Handshake size={16} /> {fmt(tx.tradeIncoming, { name: from.name })}</b>
                <Bundle label={tx.tradeGet} b={t.give} lang={lang} money={money} tx={tx} />
                <Bundle label={tx.tradeGive} b={t.want} lang={lang} money={money} tx={tx} />
                <div className="gt-actions">
                  <button className="gt-btn go small" disabled={busy} onClick={() => void act({ type: "tradeAnswer", id: t.id, accept: true })}>{tx.accept}</button>
                  <button className="gt-btn ghost small" disabled={busy} onClick={() => void act({ type: "tradeAnswer", id: t.id, accept: false })}>{tx.refuse}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button className="gt-drawer-btn" aria-label={tx.menu} title={tx.menu} aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>
        {drawer ? <X /> : <Menu />}
        {properties.length > 0 && !drawer && <i>{properties.length}</i>}
      </button>
      {drawer && (
        <aside className="gt-drawer">
          {selected !== null && <SquareCard i={selected} game={game} tx={tx} lang={lang} act={act} busy={busy} money={money} onClose={() => setSelected(null)} />}
          {outgoing.length > 0 && (
            <section className="gt-panel">
              {outgoing.map((t) => (
                <div className="gt-offer mine" key={t.id}>
                  <span>{fmt(tx.tradeOutgoing, { name: game.players.find((p) => p.id === t.to)?.name ?? "" })}</span>
                  <button className="gt-btn ghost small" disabled={busy} onClick={() => void act({ type: "tradeCancel", id: t.id })}>{tx.cancel}</button>
                </div>
              ))}
            </section>
          )}
          <section className="gt-panel">
            <h3>{tx.myProperties}</h3>
            {properties.length ? (
              <ul className="gt-deeds">
                {properties.map((i) => {
                  const s = BOARD[i], h = game.holdings[String(i)];
                  return (
                    <li key={i}>
                      <button className={h.mortgaged ? "mortgaged" : ""} style={{ "--band": s.kind === "city" ? GROUP_HEX[s.group] : "#8d8996" } as CSSProperties} onClick={() => setSelected(i)}>
                        {flagOf(i) ?? ""} {squareName(i, lang)}
                        {h.houses > 0 && <small>{h.houses === 5 ? "🏨" : "⌂".repeat(h.houses)}</small>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="gt-hint">{tx.noProperties}</p>
            )}
            {me.jailCards > 0 && <p className="gt-hint">{tx.jailCards} · {me.jailCards}</p>}
          </section>
          <section className="gt-panel gt-journal">
            <h3>{tx.journal}</h3>
            <ul>{journal.map((e) => <li key={e.id}>{e.text}</li>)}</ul>
          </section>
        </aside>
      )}

      {trading && (
        <TradeDialog game={game} to={trading} tx={tx} lang={lang} money={money} busy={busy} onClose={() => setTrading(null)} onSend={async (give, want) => {
          if (await act({ type: "offer", to: trading, give, want })) setTrading(null);
        }} />
      )}

      {game.phase === "finished" && (
        <div className="gt-veil" role="dialog" aria-modal="true" aria-labelledby="gt-winner">
          <div className="gt-dialog gt-end">
            <Crown size={44} />
            <h2 id="gt-winner">{fmt(tx.winnerTitle, { name: game.players.find((p) => p.id === game.winner)?.name ?? "" })}</h2>
            <p className="gt-hint">{tx.winReason[(game.winReason ?? "bankrupt") as keyof GtTexts["winReason"]] ?? tx.winnerText}</p>
            <ol className="gt-ranking">
              {game.players.toSorted((a, b) => (b.id === game.winner ? 1 : 0) - (a.id === game.winner ? 1 : 0) || worth(b) - worth(a)).map((p) => (
                <li key={p.id}>
                  <Pawn emblem={p.emblem} size={28} />
                  <b>{p.name}</b>
                  <span>{p.id === game.winner ? money(worth(p)) : tx.bankrupt}</span>
                </li>
              ))}
            </ol>
            {game.host === game.me ? (
              <button className="gt-btn go big" disabled={busy} onClick={() => void act({ type: "again" })}>{tx.again}</button>
            ) : (
              <p className="gt-hint">{tx.waitAgain}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Bundle({ label, b, lang, money, tx }: { label: string; b: { cash: number; squares: number[] }; lang: Lang; money: (n: number) => string; tx: GtTexts }) {
  const parts = [...b.squares.map((i) => squareName(i, lang)), ...(b.cash ? [money(b.cash)] : [])];
  return <p className="gt-bundle"><small>{label}</small>{parts.length ? parts.join(", ") : tx.nothing}</p>;
}

/** The deed of square `i`: price, rents, owner, and its owner's building and mortgage buttons. */
function SquareCard({ i, game, tx, lang, act, busy, money, onClose }: {
  i: number; game: PublicGame; tx: GtTexts; lang: Lang; act: (a: Action) => Promise<boolean>; busy: boolean; money: (n: number) => string; onClose: () => void;
}) {
  const s = BOARD[i], h = game.holdings[String(i)], p = property(i);
  const owner = h ? game.players.find((x) => x.id === h.owner) : null;
  const mine = h?.owner === game.me && game.phase === "playing";
  const band = s.kind === "city" ? GROUP_HEX[s.group] : "#2a2830";
  const groupHouses = s.kind === "city" ? groupSquares(s.group).map((j) => game.holdings[String(j)]?.houses ?? 0) : [];
  const free = game.options.freeBuild === true;
  const canBuild = mine && s.kind === "city" && h.houses < 5 && (free ? !h.mortgaged : fullGroup(game, i, game.me) && h.houses <= Math.min(...groupHouses));
  const hint = s.kind === "tax" ? tx.squareHint[s.label] : !p ? tx.squareHint[s.kind as keyof GtTexts["squareHint"]] : null;
  return (
    <section className="gt-panel gt-deed" style={{ "--band": band } as CSSProperties}>
      <header>
        <b>{squareName(i, lang)}</b>
        <button className="gt-icon-btn" aria-label={tx.close} onClick={onClose}><X size={16} /></button>
      </header>
      {hint && <p className="gt-hint">{hint}</p>}
      {p && (
        <dl>
          <div><dt>{tx.price}</dt><dd>{money(p.price)}</dd></div>
          {s.kind === "city" && (
            <>
              <div><dt>{tx.rent}</dt><dd>{money(s.rents[0])}</dd></div>
              <div><dt>{tx.rentFull}</dt><dd>{money(s.rents[0] * 2)}</dd></div>
              {[1, 2, 3, 4].map((n) => <div key={n}><dt>{fmt(tx.rentHouses, { n })}</dt><dd>{money(s.rents[n])}</dd></div>)}
              <div><dt>{tx.rentHotel}</dt><dd>{money(s.rents[5])}</dd></div>
              <div><dt>{tx.houseCost}</dt><dd>{money(s.house)}</dd></div>
            </>
          )}
          {s.kind === "airport" && <p className="gt-hint">{tx.airportRent}</p>}
          {s.kind === "utility" && <p className="gt-hint">{tx.utilityRent}</p>}
          <div><dt>{tx.mortgageValue}</dt><dd>{money(mortgageValue(p))}</dd></div>
          <div><dt>{tx.owner}</dt><dd>{owner ? owner.name : tx.bankOwned}{h?.mortgaged ? ` · ${tx.mortgaged}` : ""}</dd></div>
        </dl>
      )}
      {mine && p && (
        <div className="gt-actions">
          {s.kind === "city" && !h.mortgaged && (free || fullGroup(game, i, game.me)) && (
            <button className="gt-btn ghost small" disabled={busy || !canBuild} onClick={() => void act({ type: "build", square: i })}>{fmt(tx.build, { cost: money(s.house) })}</button>
          )}
          {s.kind === "city" && h.houses > 0 && (
            <button className="gt-btn ghost small" disabled={busy} onClick={() => void act({ type: "sell", square: i })}>{fmt(tx.sell, { gain: money(s.house / 2) })}</button>
          )}
          {!h.mortgaged && (free ? !h.houses : !groupHouses.some(Boolean)) && (
            <button className="gt-btn ghost small" disabled={busy} onClick={() => void act({ type: "mortgage", square: i })}>{fmt(tx.mortgage, { gain: money(mortgageValue(p)) })}</button>
          )}
          {h.mortgaged && (
            <button className="gt-btn ghost small" disabled={busy} onClick={() => void act({ type: "unmortgage", square: i })}>{fmt(tx.unmortgage, { cost: money(unmortgageCost(p)) })}</button>
          )}
        </div>
      )}
    </section>
  );
}

/** Pick what each side hands over; squares in a colour with houses are left out. */
function TradeDialog({ game, to, tx, lang, money, busy, onClose, onSend }: {
  game: PublicGame; to: string; tx: GtTexts; lang: Lang; money: (n: number) => string; busy: boolean;
  onClose: () => void; onSend: (give: { cash: number; squares: number[] }, want: { cash: number; squares: number[] }) => void;
}) {
  const [give, setGive] = useState<number[]>([]),
    [want, setWant] = useState<number[]>([]),
    [giveCash, setGiveCash] = useState(0),
    [wantCash, setWantCash] = useState(0);
  const other = game.players.find((p) => p.id === to)!, me = game.players.find((p) => p.id === game.me)!;
  const tradable = (owner: string) =>
    ownedBy(game, owner).filter((i) => {
      const s = BOARD[i];
      return s.kind !== "city" || !groupSquares(s.group).some((j) => game.holdings[String(j)]?.houses);
    });
  const toggle = (list: number[], set: (v: number[]) => void, i: number) => set(list.includes(i) ? list.filter((x) => x !== i) : [...list, i]);
  const side = (owner: string, list: number[], set: (v: number[]) => void, cash: number, setCash: (n: number) => void, max: number, title: string, id: string) => (
    <fieldset className="gt-trade-side">
      <legend>{title}</legend>
      <ul>
        {tradable(owner).map((i) => {
          const s = BOARD[i];
          return (
            <li key={i}>
              <label style={{ "--band": s.kind === "city" ? GROUP_HEX[s.group] : "#8d8996" } as CSSProperties}>
                <input type="checkbox" checked={list.includes(i)} onChange={() => toggle(list, set, i)} />
                {squareName(i, lang)}
                {game.holdings[String(i)].mortgaged && <small>{tx.mortgaged}</small>}
              </label>
            </li>
          );
        })}
      </ul>
      <label className="gt-cash-input" htmlFor={id}>
        {tx.tradeCash}
        <input id={id} type="number" min={0} max={max} step={10} value={cash} onChange={(e) => setCash(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))} />
      </label>
    </fieldset>
  );
  const empty = !give.length && !want.length && !giveCash && !wantCash;
  return (
    <div className="gt-veil" role="dialog" aria-modal="true" aria-labelledby="gt-trade-title" onClick={onClose}>
      <div className="gt-dialog gt-trade" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="gt-trade-title">{fmt(tx.tradeWith, { name: other.name })}</h2>
          <button className="gt-icon-btn" aria-label={tx.close} onClick={onClose}><X size={18} /></button>
        </header>
        <div className="gt-trade-grid">
          {side(game.me, give, setGive, giveCash, setGiveCash, me.cash, tx.tradeGive, "gt-give-cash")}
          {side(to, want, setWant, wantCash, setWantCash, other.cash, tx.tradeGet, "gt-want-cash")}
        </div>
        <button className="gt-btn go big" disabled={busy || empty} onClick={() => onSend({ cash: giveCash, squares: give }, { cash: wantCash, squares: want })}>{tx.tradeSend}</button>
      </div>
    </div>
  );
}

"use client";
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowRight, Check, Clock3 } from "lucide-react";
import EmblemBadge from "@/components/EmblemBadge";
import AnimatedCard from "@/games/cards/AnimatedCard";
import { CardBack, CardFace } from "@/games/cards/CardFace";
import type { Card } from "@/games/cards/standard";
import type { Action } from "@/platform/contract";
import type { Lang } from "@/lib/world";
import { fmt } from "@/lib/i18n";
import { BET_STEP, MAX_BET, MIN_BET, STARTING_BANK, handValue, type Hand, type PublicGame, type PublicPlayer } from "../engine";
import { cardLabel, eventText, type BlackjackTexts } from "../i18n";
type Props = { game: PublicGame; tx: BlackjackTexts; lang: Lang; busy: boolean; act: (a: Action) => Promise<boolean> };
const signed = (n: number, lang: Lang) => `${n > 0 ? "+" : ""}${n.toLocaleString(lang)}`;
function CardRow({ cards, tx, handKey, origin, interactive = false }: { cards: readonly (Card | null)[]; tx: BlackjackTexts; handKey: string; origin?: () => DOMRect | null; interactive?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <div className="bj-card-row" style={{ "--count": Math.max(1, cards.length), gridTemplateColumns: cards.length > 1 ? `repeat(${cards.length - 1}, minmax(0, 1fr)) var(--card-width)` : "var(--card-width)" } as CSSProperties}>{cards.map((card, i) => <AnimatedCard key={`${handKey}-${i}`} front={card ? <CardFace card={card} /> : <CardBack />} back={<CardBack />} revealed={!!card} label={card ? cardLabel(card, tx) : tx.hidden} index={i} origin={origin} selected={!!card && selected === card.id} onSelect={interactive && card ? () => setSelected((old) => old === card.id ? null : card.id) : undefined} />)}</div>;
}
function Total({ cards, tx }: { cards: Card[]; tx: BlackjackTexts }) {
  if (!cards.length) return null;
  const value = handValue(cards);
  return <span className={"bj-total" + (value.bust ? " is-bust" : "")} aria-label={`${tx.total} ${value.total}${value.soft ? `, ${tx.soft}` : ""}`}>
    {value.soft ? <>{value.low}<small> / </small>{value.total}</> : value.total}{value.soft && <small> {tx.soft}</small>}
  </span>;
}
const HandView = memo(function HandView({ h, index, active, tx, lang, origin, large = false }: { h: Hand; index: number; active: boolean; tx: BlackjackTexts; lang: Lang; origin: () => DOMRect | null; large?: boolean }) {
  return <div className={"bj-hand" + (active ? " is-active" : "") + (h.outcome ? ` is-${h.outcome}` : "") + (large ? " is-large" : "")}>
    <div className="bj-hand-label"><span>{tx.hand} {index + 1}</span><Total cards={h.cards} tx={tx} /></div>
    <CardRow cards={h.cards} tx={tx} handKey={h.id} origin={origin} interactive={large} />
    <div className="bj-hand-caption"><span>{tx.wager} <b>{h.wager}</b>{h.doubled && <small title={tx.doubleStake}> ×2</small>}</span>
      <b>{h.outcome ? tx.outcomes[h.outcome] : tx.statuses[h.status]}</b></div>
    {h.outcome && <strong className="bj-hand-profit">{signed(h.returned - h.wager, lang)}</strong>}
  </div>;
});
const Seat = memo(function Seat({ p, game, tx, lang, origin }: { p: PublicPlayer; game: PublicGame; tx: BlackjackTexts; lang: Lang; origin: () => DOMRect | null }) {
  const active = game.active === p.id && game.phase === "playing", mine = p.id === game.me;
  const status = p.resigned ? tx.out : game.step === "betting" ? !p.canBet && !p.hands.length ? tx.out : p.wager === null ? tx.otherBet : p.wager ? `${tx.wager} ${p.wager} ✓` : tx.skip : "";
  return <section className={"bj-seat" + (active ? " is-active" : "") + (mine ? " is-me" : "") + (p.resigned ? " is-out" : "")} aria-label={`${p.name}, ${p.bank} ${tx.chips}${active ? `, ${fmt(tx.waiting, { name: p.name })}` : ""}`}>
    <header><EmblemBadge emblem={p.emblem} size={32} /><div><b title={p.name}>{p.name}{mine && <small> · {tx.you}</small>}</b><strong>{p.bank.toLocaleString(lang)}</strong></div>{!p.online && <span className="bj-away" title={tx.offline}>○</span>}</header>
    {status && <p className="bj-seat-status">{status}</p>}
    {p.hands.length > 0 && <div className="bj-seat-hands">{p.hands.map((h, i) => <HandView key={h.id} h={h} index={i} active={active && h.id === game.activeHand} tx={tx} lang={lang} origin={origin} />)}</div>}
  </section>;
});
function Betting({ game, tx, busy, act, amount, setAmount }: Omit<Props, "lang"> & { amount: string; setAmount: (n: string) => void }) {
  const me = game.players.find((p) => p.id === game.me)!, n = Number(amount), max = Math.min(MAX_BET, Math.floor(me.bank / BET_STEP) * BET_STEP);
  const valid = Number.isSafeInteger(n) && n >= MIN_BET && n <= max && n % BET_STEP === 0;
  function submit(e: FormEvent) { e.preventDefault(); if (valid && !busy) void act({ type: "bet", amount: n }); }
  if (!me.canBet && me.wager === null) return <p>{tx.noFunds}</p>;
  if (me.wager !== null) return <div className="bj-confirmed" role="status"><Check /><b>{me.wager ? `${tx.betConfirmed} · ${me.wager}` : me.canBet ? tx.skipped : tx.noFunds}</b></div>;
  return <form className="bj-betting" onSubmit={submit} aria-busy={busy}>
    <div className="bj-bet-heading"><label htmlFor="bj-bet">{tx.wager}</label><small>{MIN_BET}–{max}</small></div>
    <div className="bj-bet-row"><input id="bj-bet" type="number" inputMode="numeric" min={MIN_BET} max={max} step={BET_STEP} value={amount} disabled={busy} aria-invalid={!valid} onChange={(e) => setAmount(e.target.value)} /><button className="ui-button is-primary" disabled={busy || !valid}>{tx.bet} {valid ? n : ""}<ArrowRight size={16} /></button><button className="ui-button" type="button" disabled={busy} onClick={() => void act({ type: "skip" })}>{tx.skip}</button></div>
    <div className="bj-bet-presets" role="group" aria-label={tx.wager}>{[10, 20, 50, 100, 200].map((value) => <button className="ui-button is-small" key={value} type="button" disabled={busy || value > max} aria-pressed={n === value} onClick={() => setAmount(String(value))}>{value}</button>)}</div>
    <p className="bj-muted">{tx.bettingHint}</p>
  </form>;
}
function FinalSummary({ game, tx, lang, busy, act }: Props) {
  const reason = { rounds: tx.endedRounds, funds: tx.endedFunds, host: tx.endedHost, resigned: tx.endedResigned }[game.finishReason ?? "rounds"];
  return <section className="bj-final ui-panel" role="region" aria-labelledby="bj-final-title"><span className="bj-eyebrow">{tx.sessionOver}</span><h2 id="bj-final-title">{reason}</h2><p className="bj-muted">{tx.sessionIntro}</p>
    <div className="bj-summary-table"><table><thead><tr><th scope="col">{tx.players}</th><th scope="col">{tx.finalBank}</th><th scope="col">{tx.net}</th></tr></thead><tbody>{game.players.map((p) => <tr key={p.id}><th scope="row">{p.name}{p.id === game.me && <small> · {tx.you}</small>}{p.resigned && <small> · {tx.statuses.forfeit}</small>}</th><td>{p.bank.toLocaleString(lang)}</td><td className={p.bank >= STARTING_BANK ? "is-positive" : "is-negative"}>{signed(p.bank - STARTING_BANK, lang)}</td></tr>)}</tbody></table></div>
    {game.host === game.me ? <button className="ui-button is-primary is-large" disabled={busy} onClick={() => void act({ type: "again" })}>{tx.again}</button> : <p>{tx.waitAgain}</p>}
  </section>;
}
export default function Table({ game: g, tx, lang, busy, act }: Props) {
  const [now, setNow] = useState(() => Date.now()), [offset, setOffset] = useState(0), [amount, setAmount] = useState("20");
  const shoe = useRef<HTMLDivElement>(null);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  useEffect(() => { setOffset(g.serverTime - Date.now()); }, [g.serverTime]);
  const seconds = g.deadline ? Math.max(0, Math.ceil((g.deadline - now - offset) / 1000)) : 0;
  const origin = useCallback(() => shoe.current?.getBoundingClientRect() ?? null, []);
  const me = g.players.find((p) => p.id === g.me)!, activeName = g.players.find((p) => p.id === g.active)?.name ?? "";
  const dealerKnown = g.dealer.filter((c): c is Card => c !== null), dealerTotal = handValue(dealerKnown);
  const showDealerBJ = g.dealerRevealed && g.dealer.length === 2 && dealerTotal.total === 21;
  const confirmed = g.players.filter((p) => !p.left && !p.resigned && p.wager !== null).length;
  const seated = g.players.filter((p) => !p.left);
  const status = g.paused ? tx.paused : g.step === "betting" ? tx.awaitingBets : g.step === "dealing" ? tx.dealing : g.step === "dealer" ? tx.waitDealer : g.step === "result" ? `${tx.nextRound} ${seconds}s` : g.active === g.me ? tx.yourTurn : fmt(tx.waiting, { name: activeName });
  return <main className="bj-game"><div className="bj-game-meta"><span>{tx.round} <b>{g.round || "—"}</b>{g.options.rounds > 0 && <> {tx.of} {g.options.rounds}</>} <i>·</i> {tx.steps[g.step]}</span><span>{g.finishRequested ? tx.finishing : g.options.rounds ? tx.twenty : tx.freeTable}</span></div>
    {g.phase === "finished" && <FinalSummary game={g} tx={tx} lang={lang} busy={busy} act={act} />}
    <div className="bj-table"><div className="bj-table-top"><span className="bj-table-brand" aria-hidden="true">tablée <b>21</b></span><div className="bj-shoe" ref={shoe}><span aria-hidden="true"><CardBack /></span><small>{tx.shoe} · {g.shoeCount || 312}</small></div></div>
      <section className="bj-dealer" aria-label={tx.dealer}><span className="bj-felt-label">{tx.house}</span><p>{tx.dealerRule}</p>
        <div className="bj-dealer-cards">{g.dealer.length ? <CardRow cards={g.dealer} tx={tx} handKey={`${g.round}-dealer`} origin={origin} /> : <div className="bj-dealer-placeholders" aria-hidden="true"><span>♠</span><span>♠</span></div>}</div>
        {g.dealer.length > 0 && <div className="bj-dealer-total">{g.dealerRevealed ? <><Total cards={dealerKnown} tx={tx} />{showDealerBJ && <b>{tx.dealerBlackjack}</b>}</> : <span>{tx.visibleCard} · {dealerTotal.total}</span>}</div>}
      </section>
      <div className="bj-table-status" role="status"><b>{g.phase === "finished" ? tx.sessionOver : status}</b>{g.phase === "playing" && g.step !== "dealing" && !g.paused && <span><Clock3 size={14} /> {seconds}s</span>}{g.step === "betting" && g.phase === "playing" && <small>{tx.betsReady} {confirmed}/{seated.filter((p) => !p.resigned).length}</small>}</div>
      <div className="bj-seats" style={{ "--seats": seated.length, "--tablet-seats": Math.min(seated.length, 4), "--phone-seats": Math.min(seated.length, 2) } as CSSProperties}>{seated.map((p) => <Seat key={p.id} p={p} game={g} tx={tx} lang={lang} origin={origin} />)}</div>
    </div>
    {g.phase === "playing" && <section className="bj-dock ui-panel"><div className="bj-bank"><span className="bj-eyebrow">{tx.bank}</span><strong>{me.bank.toLocaleString(lang)}</strong>{me.hands.some((h) => h.outcome === null) && <small>{tx.currentWager} · {me.hands.reduce((s, h) => s + h.wager, 0)}</small>}</div>
      <div className="bj-controls">{me.resigned ? <p className="bj-muted">{tx.spectating}</p> : g.paused ? <p>{tx.paused}</p> : g.step === "betting" ? <Betting game={g} tx={tx} busy={busy} act={act} amount={amount} setAmount={setAmount} /> : g.legal ? <div className="bj-player-actions" aria-label={tx.yourTurn} aria-busy={busy}><b>{tx.yourTurn} · {tx.hand} {me.hands.findIndex((h) => h.id === g.activeHand) + 1}</b><div><button className="ui-button is-primary is-large" disabled={busy || !g.legal.hit} onClick={() => void act({ type: "hit" })}>{tx.hit}</button><button className="ui-button is-large" disabled={busy} onClick={() => void act({ type: "stand" })}>{tx.stand}</button><button className="ui-button" disabled={busy || !g.legal.double} title={g.legal.double ? tx.doubleHint : tx.noDouble} onClick={() => void act({ type: "double" })}>{tx.double}</button><button className="ui-button" disabled={busy || !g.legal.split} title={g.legal.split ? tx.splitHint : tx.noSplit} onClick={() => void act({ type: "split" })}>{tx.split}</button></div></div> : <div className="bj-dock-status" role="status"><b>{status}</b>{me.wager === 0 && <small>{tx.skipped}</small>}</div>}</div>
    </section>}
    {me.hands.length > 0 && <section className="bj-own-hands" aria-label={tx.yourHands}>{me.hands.map((h, i) => <HandView key={h.id} h={h} index={i} active={g.activeHand === h.id} tx={tx} lang={lang} origin={origin} large />)}</section>}
    <details className="bj-journal ui-panel is-compact"><summary>{tx.journal}</summary><ol>{g.events.toReversed().map((e) => <li key={e.id}>{eventText(e.key, e.args, tx)}</li>)}</ol></details>
  </main>;
}

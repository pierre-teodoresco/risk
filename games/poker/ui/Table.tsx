"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Trophy } from "lucide-react";
import EmblemBadge from "@/components/EmblemBadge";
import AnimatedCard from "@/games/cards/AnimatedCard";
import { fanSlot } from "@/platform/cards";
import type { Action } from "@/platform/contract";
import type { Lang } from "@/lib/world";
import { fmt } from "@/lib/i18n";
import { blindAmounts, type PublicGame, type PublicPlayer } from "../engine";
import { currentCategory, type Card } from "../cards";
import { cardLabel, eventText, type PokerTexts } from "../i18n";
import { CardBack, CardFace } from "./CardFace";
type Props = { game: PublicGame; tx: PokerTexts; lang: Lang; busy: boolean; act: (a: Action) => Promise<boolean> };
const timeText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
function Cards({ cards, count, tx, hand, origin, fan = false, interactive = false, indexBase = 0 }: { cards: Card[]; count: number; tx: PokerTexts; hand: number; origin?: () => DOMRect | null; fan?: boolean; interactive?: boolean; indexBase?: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  return <div className={"pk-cards" + (fan ? " pk-fan" : "")}>{Array.from({ length: count }, (_, i) => {
    const card = cards[i];
    return <AnimatedCard key={`${hand}-${i}`} index={i + indexBase} origin={origin} front={card ? <CardFace card={card} /> : <CardBack />} back={<CardBack />} revealed={!!card} label={card ? cardLabel(card, tx) : tx.hidden}
      rotation={fan ? fanSlot(i, count, 240, 80).rot * 2 : 0} selected={selected === i} onSelect={interactive && card ? () => setSelected((old) => old === i ? null : i) : undefined} />;
  })}</div>;
}
function Seat({ p, game, tx, x, y, origin, seconds }: { p: PublicPlayer; game: PublicGame; tx: PokerTexts; x: number; y: number; origin: () => DOMRect | null; seconds: number }) {
  const active = game.active === p.id && game.phase === "playing", me = p.id === game.me, won = game.result?.awards[p.id] ?? 0;
  const status = p.resigned ? tx.actions.resigned : p.eliminated ? tx.eliminated : p.folded ? tx.folded : p.inHand && !p.stack ? tx.allIn : tx.actions[p.lastAction as keyof typeof tx.actions] ?? "";
  return <section className={"pk-seat" + (active ? " is-active" : "") + (p.folded || p.eliminated ? " is-out" : "") + (me ? " is-me" : "")} style={{ left: `${x}%`, top: `${y}%` } as CSSProperties} aria-label={`${p.name}, ${p.stack} ${tx.chips}${active ? `, ${me ? tx.yourTurn : fmt(tx.waiting, { name: p.name })}` : ""}`}>
    <div className="pk-seat-head"><EmblemBadge emblem={p.emblem} size={34} /><div><b title={p.name}>{p.name}{me && <small> · {tx.you}</small>}</b><strong>{p.stack.toLocaleString()}</strong></div>
      {game.dealer === p.id && <span className="pk-dealer" title={tx.dealer}>D</span>}
      {!p.online && <span className="pk-away" title={tx.offline}>○</span>}
    </div>
    {(active || status) && <div className="pk-seat-status">{active ? <><span className="pk-clock">{seconds}s</span> {me ? tx.yourTurn : tx.noAction}</> : status}</div>}
    {!me && p.cardCount > 0 && <Cards cards={p.hand} count={p.cardCount} tx={tx} hand={game.handNumber} origin={origin} fan />}
    {p.bet > 0 && <span className="pk-seat-bet"><i className="pk-chip" />{p.bet}{p.id === game.smallBlind && game.street === "preflop" ? " · SB" : p.id === game.bigBlind && game.street === "preflop" ? " · BB" : ""}</span>}
    {won > 0 && <span className="pk-award">+{won}</span>}
  </section>;
}
function Betting({ game, tx, busy, act }: Omit<Props, "lang">) {
  const [draft, setDraft] = useState<string | null>(null);
  const legal = game.legal;
  if (!legal) return null;
  const min = Math.min(legal.min, legal.max), amount = draft === null ? min : Number(draft);
  const valid = Number.isSafeInteger(amount) && amount >= min && amount <= legal.max;
  const clamp = (v: number) => Math.min(legal.max, Math.max(min, Math.floor(v)));
  const betVerb = game.currentBet ? tx.raise : tx.bet;
  return <div className="pk-betting" aria-label={tx.yourTurn} aria-busy={busy}>
    <div className="pk-primary-actions"><button className="ui-button" disabled={busy} onClick={() => void act({ type: "fold" })}>{tx.fold}</button>
      <button className="ui-button is-primary" disabled={busy} onClick={() => void act({ type: legal.check ? "check" : "call" })}>{legal.check ? tx.check : `${tx.call} ${legal.call}`}</button>
      <button className="ui-button" disabled={busy || (!legal.canRaise && legal.max > game.currentBet)} onClick={() => void act({ type: "allIn" })}>{tx.allIn} · {game.players.find((p) => p.id === game.me)!.stack}</button></div>
    {legal.canRaise ? <div className="pk-raise-controls"><label htmlFor="pk-bet">{tx.raiseTo}</label><div className="pk-amount-row"><input id="pk-bet" type="number" inputMode="numeric" min={min} max={legal.max} step="1" value={draft ?? min} aria-invalid={!valid} disabled={busy} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && valid && !busy) { e.preventDefault(); void act({ type: "raise", amount }); } }} /><button className="ui-button is-primary" disabled={busy || !valid} onClick={() => void act({ type: "raise", amount })}>{betVerb} {valid ? amount : ""}</button></div>
      <input type="range" aria-label={tx.raiseTo} min={min} max={legal.max} value={clamp(amount || min)} disabled={busy} onChange={(e) => setDraft(e.target.value)} />
      <div className="pk-presets"><button className="ui-button is-small" disabled={busy} onClick={() => setDraft(String(min))}>{tx.minRaise}</button>{[.5, 1].map((ratio) => <button className="ui-button is-small" key={ratio} disabled={busy} onClick={() => setDraft(String(clamp(game.currentBet + (game.pot + legal.call) * ratio)))}>{ratio === .5 ? tx.halfPot : tx.fullPot}</button>)}</div><small className="pk-muted">{tx.totalHint}</small>
    </div> : legal.max > game.currentBet && <small className="pk-muted">{tx.raisingClosed}</small>}
  </div>;
}
export default function Table({ game: g, tx, lang, busy, act }: Props) {
  const [now, setNow] = useState(() => Date.now()), [offset, setOffset] = useState(0);
  const deck = useRef<HTMLDivElement>(null);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  useEffect(() => { setOffset(g.serverTime - Date.now()); }, [g.serverTime]);
  const seconds = g.deadline ? Math.max(0, Math.ceil((g.deadline - now - offset) / 1000)) : 0;
  const seats = g.players.filter((p) => !p.left), me = g.players.find((p) => p.id === g.me)!, myIndex = seats.findIndex((p) => p.id === g.me);
  const origin = () => deck.current?.getBoundingClientRect() ?? null;
  const blind = blindAmounts(g.level), nextBlind = blindAmounts(g.level + 1);
  const levelSeconds = Math.max(0, Math.ceil(((g.level + 1) * g.options.levelMinutes * 60000 + g.startedAt - now - offset) / 1000));
  const activeName = g.players.find((p) => p.id === g.active)?.name ?? "";
  const resultPot = g.result?.pots.reduce((s, p) => s + p.amount, 0) ?? 0;
  return <main className="pk-game">
    <div className="pk-game-meta"><span>{tx.hand} <b>{g.handNumber}</b> <i>·</i> {tx.streets[g.street]}</span><span>{tx.blinds} <b>{blind.small}/{blind.big}</b> <i>·</i> {tx.nextLevel} {nextBlind.small}/{nextBlind.big} <small>{timeText(levelSeconds)}</small></span></div>
    <div className="pk-table-wrap"><div className="pk-felt"><span className="pk-table-mark" aria-hidden="true">tablée ♠</span></div>
      <div className="pk-board-area"><div className="pk-pot"><i className="pk-chip pk-chip-gold" /><span>{tx.pot}<strong>{(g.result ? resultPot : g.pot).toLocaleString(lang)}</strong></span></div>
        <div className="pk-board" role="group" aria-label={tx.board}>{Array.from({ length: 5 }, (_, i) => <div className="pk-board-slot" key={i}>{g.board[i] ? <Cards cards={[g.board[i]]} count={1} tx={tx} hand={g.handNumber} origin={origin} indexBase={i} /> : <span aria-hidden="true">♠</span>}</div>)}</div>
        <div className="pk-deck" ref={deck} aria-hidden="true"><CardBack /></div>
        <div className="pk-table-status" role="status">{g.result ? <><b>{g.result.showdown ? tx.showdown : tx.uncontested}</b>{Object.entries(g.result.awards).map(([id, amount]) => <span key={id}>{fmt(tx.wonPot, { name: g.players.find((p) => p.id === id)?.name ?? "", amount })}</span>)}{g.phase !== "finished" && <small>{tx.nextHand} {seconds}s</small>}</> : g.paused ? tx.paused : g.active === g.me ? tx.yourTurn : fmt(tx.waiting, { name: activeName })}</div>
      </div>
      {seats.map((p, i) => { const angle = Math.PI / 2 + ((i - myIndex + seats.length) % seats.length) / seats.length * Math.PI * 2; return <Seat key={p.id} p={p} game={g} tx={tx} x={50 + Math.cos(angle) * 40} y={50 + Math.sin(angle) * 40} origin={origin} seconds={seconds} />; })}
    </div>
    <section className="pk-dock ui-panel is-compact"><div className="pk-pocket" role="group" aria-label={tx.pocket}><Cards key={g.handNumber} cards={me.hand} count={me.cardCount} tx={tx} hand={g.handNumber} origin={origin} fan interactive /><div><span className="pk-eyebrow">{tx.pocket}</span>{me.hand.length > 0 && <b>{tx.categories[currentCategory([...me.hand, ...g.board])]}</b>}{me.folded && <small>{tx.folded}</small>}</div></div>
      {g.phase === "finished" ? <div className="pk-tournament-result" role="status"><Trophy /><h2>{g.winner === g.me ? tx.youWon : fmt(tx.champion, { name: g.players.find((p) => p.id === g.winner)?.name ?? "" })}</h2>{g.host === g.me ? <button className="ui-button is-primary" disabled={busy || seats.length < 2} onClick={() => void act({ type: "again" })}>{tx.again}</button> : <p>{tx.waitAgain}</p>}</div>
        : me.eliminated || me.resigned ? <p className="pk-muted">{tx.spectating}</p>
        : g.legal ? <Betting key={`${g.handNumber}-${g.street}`} game={g} tx={tx} busy={busy} act={act} />
        : <div className="pk-dock-wait"><b>{g.paused ? tx.paused : g.result ? tx.nextHand + ` ${seconds}s` : fmt(tx.waiting, { name: activeName })}</b>{me.folded && <span className="pk-muted">{tx.folded}</span>}</div>}
    </section>
    {g.result && g.result.pots.length > 1 && <div className="pk-pots">{g.result.pots.map((pot, i) => <span key={i}>{i === 0 ? tx.mainPot : `${tx.sidePot} ${i}`} · {pot.amount} → {pot.winners.map((id) => g.players.find((p) => p.id === id)?.name).join(", ")}{pot.category !== null && ` · ${tx.categories[pot.category]}`}</span>)}</div>}
    <details className="pk-journal ui-panel is-compact"><summary>{tx.journal}</summary><ol>{g.events.toReversed().map((e) => <li key={e.id}>{eventText(e.key, e.args, tx)}</li>)}</ol></details>
  </main>;
}

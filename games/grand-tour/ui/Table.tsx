"use client";
// The game screen: the board on the left with the turn's actions in its centre, and on the
// right the players, the selected square, my properties, trade offers and the journal.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeftRight, Crown, Handshake, Lock, X } from "lucide-react";
import { fmt } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import type { Action } from "@/platform/contract";
import { BOARD, groupSquares, mortgageValue, property, unmortgageCost } from "../board";
import { JAIL_FINE, fullGroup, inGame, ownedBy, type PublicGame, type PublicPlayer } from "../engine";
import { GROUP_HEX, PAWN_HEX, cardText, eventText, squareName, type GtTexts } from "../i18n";
import Board, { Pawn } from "./Board";

const CLOCK_MS = 250;
const CARD_SHOWN_MS = 5000;
const BIDS = [10, 50, 100];
const JOURNAL_LINES = 7;
type Props = { game: PublicGame; tx: GtTexts; lang: Lang; act: (a: Action) => Promise<boolean>; busy: boolean };

export default function Table({ game, tx, lang, act, busy }: Props) {
  const [now, setNow] = useState(() => Date.now()),
    [selected, setSelected] = useState<number | null>(null),
    [trading, setTrading] = useState<string | null>(null);
  const skew = useRef(0);
  useEffect(() => {
    skew.current = game.serverTime - Date.now();
  }, [game.serverTime]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(t);
  }, []);

  const me = game.players.find((p) => p.id === game.me)!;
  const active = game.players.find((p) => p.id === game.active)!;
  const colorOf = (id: string) => PAWN_HEX[game.players.find((p) => p.id === id)?.emblem ?? 0];
  const myTurn = game.active === game.me && game.phase === "playing" && !game.paused && inGame(me);
  const money = (n: number) => `${n.toLocaleString(lang)} ₲`;
  const worth = (p: PublicPlayer) =>
    p.cash + ownedBy(game, p.id).reduce((s, i) => s + (game.holdings[String(i)].mortgaged ? mortgageValue(property(i)!) : property(i)!.price), 0);

  const pawns = game.players.map((p) => ({ id: p.id, emblem: p.emblem, pos: p.pos, out: !inGame(p) }));
  const here = BOARD[me.pos];
  const buyable = property(me.pos);
  const auction = game.auction;
  const remaining = game.deadline ? Math.max(0, Math.ceil((game.deadline - now - skew.current) / 1000)) : 0;
  const card = game.lastCard && now + skew.current - game.lastCard.at < CARD_SHOWN_MS ? game.lastCard : null;
  const rollKey = String(game.events.findLast((e) => e.key === "rolled")?.id ?? "");

  // ---------- Centre: what the turn asks for ----------
  let status: string;
  let actions: React.ReactNode = null;
  if (game.step === "auction" && auction) {
    const lead = auction.bidder ? game.players.find((p) => p.id === auction.bidder) : null;
    status = fmt(tx.auctionFor, { city: squareName(auction.square, lang) });
    actions = (
      <div className="gt-auction">
        <b>{lead ? fmt(tx.auctionLead, { name: lead.name, amount: money(auction.bid) }) : tx.auctionNoBid}</b>
        <small>{fmt(tx.auctionEnds, { s: remaining })}</small>
        {inGame(me) && (
          <div className="gt-actions">
            {BIDS.map((n) => (
              <button key={n} className="gt-btn ghost" disabled={busy || me.cash < auction.bid + n} onClick={() => void act({ type: "bid", amount: auction.bid + n })}>
                {fmt(tx.bid, { n })}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  } else if (game.step === "debt" && game.debt) {
    const to = game.debt.to ? game.players.find((p) => p.id === game.debt!.to)?.name ?? tx.bank : tx.bank;
    if (game.debt.player === game.me) {
      status = tx.debtTitle;
      actions = (
        <>
          <p className="gt-hint">{fmt(tx.debtText, { amount: money(game.debt.amount), to })}</p>
          <div className="gt-actions">
            <button className="gt-btn go" disabled={busy || me.cash < game.debt.amount} onClick={() => void act({ type: "payDebt" })}>
              {fmt(tx.payDebt, { amount: money(game.debt.amount) })}
            </button>
            <button className="gt-btn danger" disabled={busy} onClick={() => void act({ type: "bankrupt" })}>{tx.goBankrupt}</button>
          </div>
        </>
      );
    } else status = fmt(tx.theyOwe, { name: active.name, amount: money(game.debt.amount) });
  } else if (!myTurn) {
    status = active.jailed ? fmt(tx.theyAreInJail, { name: active.name }) : fmt(tx.theirTurn, { name: active.name });
  } else if (game.step === "roll") {
    status = me.jailed ? tx.inJail : game.dice && game.dice[0] === game.dice[1] ? tx.rollAgain : tx.yourTurn;
    actions = (
      <div className="gt-actions">
        <button className="gt-btn go big" disabled={busy} onClick={() => void act({ type: "roll" })}>{tx.roll}</button>
        {me.jailed && (
          <>
            <button className="gt-btn ghost" disabled={busy || me.cash < JAIL_FINE} onClick={() => void act({ type: "jailPay" })}>{fmt(tx.jailPay, { amount: money(JAIL_FINE) })}</button>
            {me.jailCards > 0 && <button className="gt-btn ghost" disabled={busy} onClick={() => void act({ type: "jailCard" })}>{tx.jailCard}</button>}
          </>
        )}
      </div>
    );
    if (me.jailed) status += " · " + fmt(tx.inJailTurns, { n: me.jailTurns + 1 });
  } else if (game.step === "buy" && buyable) {
    status = fmt(tx.buyPrompt, { city: squareName(me.pos, lang) });
    actions = (
      <div className="gt-actions">
        <button className="gt-btn go" disabled={busy || me.cash < buyable.price} onClick={() => void act({ type: "buy" })}>
          {fmt(tx.buy, { price: money(buyable.price) })}
        </button>
        <button className="gt-btn ghost" disabled={busy} onClick={() => void act({ type: "decline" })}>
          {game.options.auctions ? tx.declineAuction : tx.decline}
        </button>
      </div>
    );
  } else {
    status = here.kind === "jail" && me.jailed ? tx.inJail : tx.yourTurn;
    actions = (
      <div className="gt-actions">
        <button className="gt-btn go" disabled={busy} onClick={() => void act({ type: "end" })}>{tx.endTurn}</button>
      </div>
    );
  }

  // ---------- Selected square ----------
  const detail = selected !== null ? <SquareCard i={selected} game={game} tx={tx} lang={lang} act={act} busy={busy} money={money} onClose={() => setSelected(null)} /> : null;
  const incoming = game.trades.filter((t) => t.to === game.me);
  const outgoing = game.trades.filter((t) => t.from === game.me);
  const mine = ownedBy(game, game.me);
  const journal = useMemo(
    () => game.events.map((e) => ({ id: e.id, text: eventText(e.key, e.args, lang) })).filter((e) => e.text).slice(-JOURNAL_LINES).reverse(),
    [game.events, lang],
  );

  return (
    <div className="gt-table">
      <div className="gt-board-wrap">
        <Board
          lang={lang}
          holdings={game.holdings}
          pawns={pawns}
          move={game.lastMove}
          ownerColor={colorOf}
          selected={selected}
          onSelect={setSelected}
          dice={game.dice ? { values: game.dice, key: rollKey } : null}
        >
          <div className="gt-turn" style={{ "--pc": colorOf(active.id) } as CSSProperties}>
            <Pawn emblem={active.emblem} size={26} />
            <span>{fmt(tx.turn, { n: game.turnNumber })}</span>
          </div>
          <p className="gt-status" aria-live="polite">{status}</p>
          {actions}
          {card && (
            <div className={"gt-card " + card.deck} key={card.at}>
              <small>{tx.square[card.deck]}</small>
              <p>{cardText(card.deck, card.id, lang)}</p>
            </div>
          )}
          {game.options.parkingPot && game.pot > 0 && <span className="gt-pot">{tx.pot} · {money(game.pot)}</span>}
        </Board>
      </div>

      <aside className="gt-side">
        <section className="gt-panel">
          <ul className="gt-players">
            {game.players.map((p) => (
              <li key={p.id} className={(p.id === game.active ? "active " : "") + (inGame(p) ? "" : "out")} style={{ "--pc": colorOf(p.id) } as CSSProperties}>
                <Pawn emblem={p.emblem} size={34} />
                <span className="gt-who">
                  <b>{p.name}{p.id === game.me && <small>{tx.you}</small>}</b>
                  <small>
                    {p.bankrupt ? tx.bankrupt : p.left ? tx.left : `${ownedBy(game, p.id).length} ${tx.properties.toLowerCase()}`}
                    {p.jailed && <Lock size={12} aria-label={tx.square.jail} />}
                  </small>
                </span>
                <span className="gt-cash">{money(p.cash)}</span>
                {p.id !== game.me && inGame(p) && inGame(me) && game.phase === "playing" && (
                  <button className="gt-icon-btn" aria-label={fmt(tx.tradeWith, { name: p.name })} title={fmt(tx.tradeWith, { name: p.name })} onClick={() => setTrading(p.id)}>
                    <ArrowLeftRight size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {(incoming.length > 0 || outgoing.length > 0) && (
          <section className="gt-panel">
            {incoming.map((t) => {
              const from = game.players.find((p) => p.id === t.from)!;
              return (
                <div className="gt-offer" key={t.id}>
                  <b><Handshake size={16} /> {fmt(tx.tradeIncoming, { name: from.name })}</b>
                  <Bundle label={tx.tradeGet} b={t.give} lang={lang} money={money} tx={tx} />
                  <Bundle label={tx.tradeGive} b={t.want} lang={lang} money={money} tx={tx} />
                  <div className="gt-actions">
                    <button className="gt-btn go" disabled={busy} onClick={() => void act({ type: "tradeAnswer", id: t.id, accept: true })}>{tx.accept}</button>
                    <button className="gt-btn ghost" disabled={busy} onClick={() => void act({ type: "tradeAnswer", id: t.id, accept: false })}>{tx.refuse}</button>
                  </div>
                </div>
              );
            })}
            {outgoing.map((t) => (
              <div className="gt-offer mine" key={t.id}>
                <span>{fmt(tx.tradeOutgoing, { name: game.players.find((p) => p.id === t.to)?.name ?? "" })}</span>
                <button className="gt-btn ghost small" disabled={busy} onClick={() => void act({ type: "tradeCancel", id: t.id })}>{tx.cancel}</button>
              </div>
            ))}
          </section>
        )}

        {detail}

        <section className="gt-panel">
          <h3>{tx.myProperties}</h3>
          {mine.length ? (
            <ul className="gt-deeds">
              {mine.map((i) => {
                const s = BOARD[i], h = game.holdings[String(i)];
                return (
                  <li key={i}>
                    <button className={h.mortgaged ? "mortgaged" : ""} style={{ "--band": s.kind === "city" ? GROUP_HEX[s.group] : "#8d8996" } as CSSProperties} onClick={() => setSelected(i)}>
                      {squareName(i, lang)}
                      {h.houses > 0 && <small>{h.houses === 5 ? "H" : "⌂".repeat(h.houses)}</small>}
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

      {trading && (
        <TradeDialog game={game} to={trading} tx={tx} lang={lang} money={money} busy={busy} onClose={() => setTrading(null)} onSend={async (give, want) => {
          if (await act({ type: "offer", to: trading, give, want })) setTrading(null);
        }} />
      )}

      {game.phase === "finished" && (
        <div className="gt-veil" role="dialog" aria-modal="true" aria-labelledby="gt-winner">
          <div className="gt-dialog gt-end">
            <Crown size={40} />
            <h2 id="gt-winner">{fmt(tx.winnerTitle, { name: game.players.find((p) => p.id === game.winner)?.name ?? "" })}</h2>
            <p className="gt-hint">{tx.winnerText}</p>
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
  const canBuild = mine && s.kind === "city" && fullGroup(game, i, game.me) && h.houses < 5 && h.houses <= Math.min(...groupHouses);
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
          {s.kind === "city" && !h.mortgaged && fullGroup(game, i, game.me) && (
            <button className="gt-btn ghost small" disabled={busy || !canBuild} onClick={() => void act({ type: "build", square: i })}>{fmt(tx.build, { cost: money(s.house) })}</button>
          )}
          {s.kind === "city" && h.houses > 0 && (
            <button className="gt-btn ghost small" disabled={busy} onClick={() => void act({ type: "sell", square: i })}>{fmt(tx.sell, { gain: money(s.house / 2) })}</button>
          )}
          {!h.mortgaged && !groupHouses.some(Boolean) && (
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

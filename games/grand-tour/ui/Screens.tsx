"use client";
// Around a game: the entrance (create or join), the waiting room and the rules panel.
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, Link2, X } from "lucide-react";
import { fmt } from "@/lib/i18n";
import type { Action } from "@/platform/contract";
import { EMBLEM_COUNT, MIN_PLAYERS, START_CASH, type PublicGame } from "../engine";
import { PAWN_HEX, type GtTexts } from "../i18n";
import Board, { Pawn } from "./Board";
import type { Lang } from "@/lib/world";

/** A board mid-game for the entrance: a few owned squares and pawns on their way. */
export const DEMO = {
  holdings: {
    "1": { owner: "a", houses: 2, mortgaged: false },
    "3": { owner: "a", houses: 2, mortgaged: false },
    "11": { owner: "b", houses: 0, mortgaged: false },
    "16": { owner: "c", houses: 1, mortgaged: false },
    "18": { owner: "c", houses: 1, mortgaged: false },
    "19": { owner: "c", houses: 1, mortgaged: false },
    "24": { owner: "b", houses: 0, mortgaged: true },
    "25": { owner: "a", houses: 0, mortgaged: false },
    "31": { owner: "b", houses: 0, mortgaged: false },
    "37": { owner: "c", houses: 5, mortgaged: false },
    "39": { owner: "c", houses: 5, mortgaged: false },
  },
  pawns: [
    { id: "a", emblem: 0, pos: 6, out: false },
    { id: "b", emblem: 1, pos: 18, out: false },
    { id: "c", emblem: 5, pos: 34, out: false },
  ],
};
export const DEMO_COLOR = (id: string) => PAWN_HEX[DEMO.pawns.find((p) => p.id === id)!.emblem];

function TokenPicker({ value, taken, onPick, label }: { value: number; taken: number[]; onPick: (e: number) => void; label: string }) {
  return (
    <div className="gt-tokens" role="group" aria-label={label}>
      {Array.from({ length: EMBLEM_COUNT }, (_, e) => (
        <button key={e} type="button" aria-pressed={value === e} aria-label={`${label} ${e + 1}`} disabled={taken.includes(e)} onClick={() => onPick(e)}>
          <Pawn emblem={e} size={34} />
          {value === e && <span className="gt-check"><Check size={11} /></span>}
        </button>
      ))}
    </div>
  );
}

export function Home({ tx, lang, busy, room, setRoom, preview, recent, hasRecent, onEnter }: {
  tx: GtTexts;
  lang: Lang;
  busy: boolean;
  room: string;
  setRoom: (code: string) => void;
  preview: { players: unknown[] } | null;
  recent: string;
  hasRecent: boolean;
  onEnter: (code: string | null, name: string, emblem: number) => void;
}) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("grand-tour.name") ?? localStorage.getItem("pioche.name") ?? "";
    } catch {
      return "";
    }
  });
  const taken = ((preview?.players ?? []) as { emblem: number }[]).map((p) => p.emblem);
  const [emblem, setEmblem] = useState(() => Array.from({ length: EMBLEM_COUNT }, (_, i) => i).find((i) => !taken.includes(i)) ?? 0);
  const submit = (code: string | null) => (e: FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("grand-tour.name", name.trim());
    } catch {}
    onEnter(code, name, emblem);
  };
  const named = name.trim().length >= 2;
  return (
    <main className="gt-entrance">
      <section className="gt-entrance-hero">
        <h1 className="gt-logo">grand tour</h1>
        <p>{tx.tagline}</p>
        <div className="gt-entrance-board" aria-hidden="true">
          <Board lang={lang} holdings={DEMO.holdings} pawns={DEMO.pawns} move={null} ownerColor={DEMO_COLOR} interactive={false} autoRotate showcase />
        </div>
      </section>
      <section className="gt-card-panel">
        <form onSubmit={submit(preview ? room : null)}>
          <label htmlFor="gt-name">{tx.yourName}</label>
          <input id="gt-name" value={name} maxLength={20} autoComplete="nickname" placeholder={tx.namePlaceholder} onChange={(e) => setName(e.target.value)} required />
          <span className="gt-label">{tx.emblem}</span>
          <TokenPicker value={emblem} taken={taken} onPick={setEmblem} label={tx.emblem} />
          <button className="gt-btn go big" disabled={busy || !named}>
            {preview ? tx.join : tx.create} <ArrowRight size={18} />
          </button>
        </form>
        {!preview && (
          <form className="gt-join-row" onSubmit={submit(room)}>
            <span>{tx.or}</span>
            <input aria-label={tx.code} placeholder="ABC234" value={room} maxLength={6} onChange={(e) => setRoom(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} />
            <button className="gt-btn ghost" disabled={busy || !named || room.length !== 6}>{tx.join}</button>
          </form>
        )}
        {hasRecent && !preview && (
          <button className="gt-link" onClick={() => onEnter(recent, name, emblem)}>{tx.resume} · {recent}</button>
        )}
      </section>
    </main>
  );
}

export function Lobby({ game, tx, busy, act, copied, onCopy }: {
  game: PublicGame;
  tx: GtTexts;
  busy: boolean;
  act: (a: Action) => Promise<boolean>;
  copied: boolean;
  onCopy: () => void;
}) {
  const isHost = game.host === game.me;
  const me = game.players.find((p) => p.id === game.me)!;
  return (
    <main className="gt-lobby">
      <section className="gt-card-panel">
        <span className="gt-label mono">{tx.lobby}</span>
        <div className="gt-code">{game.code}</div>
        <button className="gt-btn ghost" onClick={onCopy}><Link2 size={16} /> {copied ? tx.copied : tx.invite}</button>
        <h2>{tx.players} · {game.players.length}</h2>
        <ul className="gt-lobby-players">
          {game.players.map((p) => (
            <li key={p.id}>
              <Pawn emblem={p.emblem} size={32} />
              <span>{p.name}</span>
              {p.id === game.host && <small>{tx.host}</small>}
              {p.id === game.me && <small>{tx.you}</small>}
              {isHost && p.id !== game.me && (
                <button className="gt-icon-btn" aria-label={`${tx.kick} ${p.name}`} disabled={busy} onClick={() => void act({ type: "kick", player: p.id })}><X size={14} /></button>
              )}
            </li>
          ))}
        </ul>
        {game.players.length < MIN_PLAYERS && <p className="gt-hint">{tx.invitePlayers}</p>}
        <span className="gt-label">{tx.emblem}</span>
        <TokenPicker
          value={me.emblem}
          taken={game.players.filter((p) => p.id !== game.me).map((p) => p.emblem)}
          onPick={(e) => void act({ type: "profile", emblem: e })}
          label={tx.emblem}
        />
      </section>

      <section className="gt-card-panel">
        <h2>{tx.rules}</h2>
        <div className="gt-option">
          <div><b>{tx.startCash}</b><small>{tx.startCashHint}</small></div>
          <div className="gt-seg" role="group" aria-label={tx.startCash}>
            {START_CASH.map((c) => (
              <button key={c} aria-pressed={game.options.startCash === c} disabled={!isHost || busy} onClick={() => void act({ type: "options", startCash: c })}>{c}</button>
            ))}
          </div>
        </div>
        {([["auctions", tx.auctions, tx.auctionsHint], ["parkingPot", tx.parkingPot, tx.parkingPotHint]] as const).map(([key, title, hint]) => (
          <div className="gt-option" key={key}>
            <div><b>{title}</b><small>{hint}</small></div>
            <button className="gt-switch" aria-pressed={game.options[key]} aria-label={title} disabled={!isHost || busy} onClick={() => void act({ type: "options", [key]: !game.options[key] })} />
          </div>
        ))}
        {isHost ? (
          <button className="gt-btn go big" disabled={busy || game.players.length < MIN_PLAYERS} onClick={() => void act({ type: "start" })}>
            {tx.start} <ArrowRight size={18} />
          </button>
        ) : (
          <p className="gt-hint">{tx.waitHost}</p>
        )}
        {isHost && game.players.length < MIN_PLAYERS && <p className="gt-hint">{tx.needPlayers}</p>}
      </section>
    </main>
  );
}

export function Rules({ tx, game, onClose }: { tx: GtTexts; game: PublicGame | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const sections: [string, string][] = [
    [tx.ruleTurnTitle, tx.ruleTurn],
    [tx.ruleBuyTitle, tx.ruleBuy],
    [tx.ruleRentTitle, tx.ruleRent],
    [tx.ruleBuildTitle, tx.ruleBuild],
    [tx.ruleMortgageTitle, tx.ruleMortgage],
    [tx.ruleJailTitle, tx.ruleJail],
    [tx.ruleTradeTitle, tx.ruleTrade],
    [tx.ruleDebtTitle, tx.ruleDebt],
  ];
  return (
    <div className="gt-veil" onClick={onClose}>
      <section className="gt-dialog gt-rules" role="dialog" aria-modal="true" aria-labelledby="gt-rules-title" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="gt-rules-title">{tx.rulesTitle}</h2>
          <button className="gt-icon-btn" aria-label={tx.close} onClick={onClose} autoFocus><X size={18} /></button>
        </header>
        <p className="gt-hint">{tx.rulesIntro}</p>
        <ol>
          {sections.map(([title, body]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
        {game && (
          <>
            <h3>{tx.optionsTitle}</h3>
            <ul className="gt-rule-options">
              <li><b>{tx.startCash}</b><span>{fmt("{n}", { n: game.options.startCash })}</span></li>
              <li><b>{tx.auctions}</b><span>{game.options.auctions ? tx.optionOn : tx.optionOff}</span></li>
              <li><b>{tx.parkingPot}</b><span>{game.options.parkingPot ? tx.optionOn : tx.optionOff}</span></li>
            </ul>
          </>
        )}
        <button className="gt-btn go big" onClick={onClose}>{tx.rulesDone}</button>
      </section>
    </div>
  );
}

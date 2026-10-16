"use client";
// Everything around a round: the entrance (create or join), the waiting room and the round result.
import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Link2, X } from "lucide-react";
import EmblemBadge from "@/components/EmblemBadge";
import { fmt } from "@/lib/i18n";
import type { Action } from "@/platform/contract";
import { CARD_POINTS, EMBLEM_COUNT, MIN_PLAYERS, TIMERS, type PublicGame } from "../engine";
import { type PiocheTexts } from "../i18n";
import { CardFace, SKINS, type Skin } from "./CardFace";

const FAN_SPREAD_DEG = 5;

function EmblemPicker({ value, taken, onPick, label }: { value: number; taken: number[]; onPick: (e: number) => void; label: string }) {
  return (
    <div className="emblems" role="group" aria-label={label}>
      {Array.from({ length: EMBLEM_COUNT }, (_, e) => (
        <button
          key={e}
          type="button"
          className="emblem-choice"
          aria-pressed={value === e}
          aria-label={`${label} ${e + 1}`}
          disabled={taken.includes(e)}
          onClick={() => onPick(e)}
        >
          <EmblemBadge emblem={e} />
          {value === e && <span className="emblem-check"><Check size={12} /></span>}
        </button>
      ))}
    </div>
  );
}

export function Home({ tx, busy, room, setRoom, preview, recent, hasRecent, onEnter }: {
  tx: PiocheTexts;
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
      return localStorage.getItem("pioche.name") ?? "";
    } catch {
      return "";
    }
  });
  const taken = ((preview?.players ?? []) as { emblem: number }[]).map((p) => p.emblem);
  const [emblem, setEmblem] = useState(() => Array.from({ length: EMBLEM_COUNT }, (_, i) => i).find((i) => !taken.includes(i)) ?? 0);
  const submit = (code: string | null) => (e: FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("pioche.name", name.trim());
    } catch {}
    onEnter(code, name, emblem);
  };
  const named = name.trim().length >= 2;
  return (
    <main className="entrance">
      <section className="entrance-hero">
        <h1 className="pc-logo">pioche<span>.</span></h1>
        <p>{tx.tagline}</p>
        <div className="entrance-cards" aria-hidden="true">
          {(["red-7a", "yellow-skipa", "green-draw2a", "blue-reversea", "draw4-1"] as const).map((id, i) => (
            <span key={id} style={{ "--i": i - 2, "--n": i } as React.CSSProperties}>
              <CardFace card={{ id, ...DEMO[id] }} />
            </span>
          ))}
        </div>
      </section>
      <section className="entrance-panel panel">
        <form onSubmit={submit(preview ? room : null)}>
          <label htmlFor="pioche-name" className="eyebrow">{tx.yourName}</label>
          <input id="pioche-name" value={name} maxLength={20} autoComplete="nickname" placeholder={tx.namePlaceholder} onChange={(e) => setName(e.target.value)} required />
          <span className="eyebrow">{tx.emblem}</span>
          <EmblemPicker value={emblem} taken={taken} onPick={setEmblem} label={tx.emblem} />
          <button className="btn go wide" disabled={busy || !named}>
            {preview ? tx.join : tx.create} <ArrowRight size={18} />
          </button>
        </form>
        {!preview && (
          <form className="join-row" onSubmit={submit(room)}>
            <span className="divider">{tx.or}</span>
            <input aria-label={tx.code} placeholder="ABC234" value={room} maxLength={6} onChange={(e) => setRoom(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} />
            <button className="btn ghost" disabled={busy || !named || room.length !== 6}>{tx.join}</button>
          </form>
        )}
        {hasRecent && !preview && (
          <button className="restore" onClick={() => onEnter(recent, name, emblem)}>{tx.resume} · {recent}</button>
        )}
      </section>
    </main>
  );
}

const DEMO: Record<string, { kind: "number" | "skip" | "draw2" | "reverse" | "draw4"; color: "red" | "yellow" | "green" | "blue" | null; value: number | null }> = {
  "red-7a": { kind: "number", color: "red", value: 7 },
  "yellow-skipa": { kind: "skip", color: "yellow", value: null },
  "green-draw2a": { kind: "draw2", color: "green", value: null },
  "blue-reversea": { kind: "reverse", color: "blue", value: null },
  "draw4-1": { kind: "draw4", color: null, value: null },
};

export function Lobby({ game, tx, busy, act, copied, onCopy, skin, onSkin }: {
  game: PublicGame;
  tx: PiocheTexts;
  busy: boolean;
  act: (a: Action) => Promise<boolean>;
  copied: boolean;
  onCopy: () => void;
  skin: Skin;
  onSkin: (s: Skin) => void;
}) {
  const isHost = game.host === game.me;
  const me = game.players.find((p) => p.id === game.me)!;
  const toggles = [
    ["stacking", tx.stacking, tx.stackingHint],
    ["drawUntilPlayable", tx.drawUntilPlayable, tx.drawUntilPlayableHint],
    ["sevenZero", tx.sevenZero, tx.sevenZeroHint],
    ["combos", tx.combos, tx.combosHint],
  ] as const;
  return (
    <main className="pc-lobby">
      <section className="lobby-panel panel">
        <div className="eyebrow">{tx.lobby}</div>
        <div className="lobby-code">{game.code}</div>
        <button className="btn ghost wide" onClick={onCopy}><Link2 size={16} /> {copied ? tx.copied : tx.invite}</button>

        <h2>{tx.players} · {game.players.length}</h2>
        <ul className="lobby-players">
          {game.players.map((p) => (
            <li key={p.id}>
              <EmblemBadge emblem={p.emblem} size={36} />
              <span>{p.name}</span>
              {p.id === game.host && <small>{tx.host}</small>}
              {p.id === game.me && <small>{tx.you}</small>}
              {isHost && p.id !== game.me && (
                <button className="x static" aria-label={`${tx.kick} ${p.name}`} disabled={busy} onClick={() => void act({ type: "kick", player: p.id })}><X size={14} /></button>
              )}
            </li>
          ))}
        </ul>
        <span className="eyebrow">{tx.emblem}</span>
        <EmblemPicker
          value={me.emblem}
          taken={game.players.filter((p) => p.id !== game.me).map((p) => p.emblem)}
          onPick={(e) => void act({ type: "profile", emblem: e })}
          label={tx.emblem}
        />
        <span className="eyebrow">{tx.skin}</span>
        <div className="skin-picker" role="group" aria-label={tx.skin}>
          {SKINS.map((k) => (
            <button key={k} className={"skin-choice " + k} aria-pressed={skin === k} onClick={() => onSkin(k)}>
              <span className="skin-swatch" aria-hidden="true" />
              {tx.skins[k]}
            </button>
          ))}
        </div>
        <p className="note">{tx.skinHint}</p>
      </section>

      <section className="lobby-panel panel">
        <h2>{tx.rules}</h2>
        {toggles.map(([key, title, hint]) => (
          <div className="option" key={key}>
            <div>
              <b>{title}</b>
              <small>{hint}</small>
            </div>
            <button
              className="switch"
              aria-pressed={game.options[key]}
              aria-label={title}
              disabled={!isHost || busy}
              onClick={() => void act({ type: "options", [key]: !game.options[key] })}
            />
          </div>
        ))}
        <div className="option">
          <b>{tx.timer}</b>
          <div className="seg" role="group" aria-label={tx.timer}>
            {TIMERS.map((t) => (
              <button key={t} aria-pressed={game.options.timer === t} disabled={!isHost || busy} onClick={() => void act({ type: "options", timer: t })}>
                {t ? `${t} s` : tx.timerOff}
              </button>
            ))}
          </div>
        </div>
        {isHost ? (
          <button className="btn go wide deal" disabled={busy || game.players.length < MIN_PLAYERS} onClick={() => void act({ type: "start" })}>
            {tx.start} <ArrowRight size={18} />
          </button>
        ) : (
          <p className="note">{tx.waitHost}</p>
        )}
        {isHost && game.players.length < MIN_PLAYERS && <p className="note">{tx.needPlayers}</p>}
      </section>
    </main>
  );
}

export function RoundEnd({ game, tx, busy, act }: { game: PublicGame; tx: PiocheTexts; busy: boolean; act: (a: Action) => Promise<boolean> }) {
  const winner = game.players.find((p) => p.id === game.winner);
  const points = (p: (typeof game.players)[number]) =>
    p.hand.reduce((s, c) => s + (c.kind === "number" ? c.value! : CARD_POINTS[c.kind]), 0);
  const others = game.players.filter((p) => p.id !== game.winner && !p.left).toSorted((a, b) => points(a) - points(b));
  return (
    <div className="round-end" role="dialog" aria-modal="true" aria-labelledby="round-end-title">
      <section className="round-end-card panel">
        {winner && <EmblemBadge emblem={winner.emblem} size={96} className="winner-badge" />}
        <h2 id="round-end-title">{winner?.id === game.me ? tx.youWon : fmt(tx.won, { name: winner?.name ?? "" })}</h2>
        <ul className="round-hands">
          {others.map((p) => (
            <li key={p.id}>
              <EmblemBadge emblem={p.emblem} size={30} />
              <span className="who">{p.name}</span>
              <small>{fmt(tx.pointsLeft, { n: points(p) })}</small>
              <span className="mini-hand" aria-hidden="true">
                {p.hand.map((c, i) => (
                  <span key={c.id} style={{ "--r": `${(i - (p.hand.length - 1) / 2) * FAN_SPREAD_DEG}deg` } as React.CSSProperties}>
                    <CardFace card={c} />
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
        {game.host === game.me ? (
          <button className="btn go wide" disabled={busy} onClick={() => void act({ type: "again" })}>{tx.again}</button>
        ) : (
          <p className="note">{tx.waitAgain}</p>
        )}
      </section>
    </div>
  );
}

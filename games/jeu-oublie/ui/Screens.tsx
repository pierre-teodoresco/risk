"use client";
// Entry, waiting room and results of the forgotten game.
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowRight, BookOpen, Check, Crown, Link2, X } from "lucide-react";
import type { Action } from "@/platform/contract";
import type { Preview } from "@/platform/useRoom";
import { BASE_STATS, COLORS, FACTIONS, FACTION_IDS, type FactionId, type Stats } from "../factions";
import { MAX_PLAYERS, MIN_PLAYERS, type PublicGame } from "../engine";
import { TICK_MS, WARMUP } from "../sim";
import { fill, type JeuTexts } from "../i18n";
import { drawPortrait } from "./render";

export function Portrait({ faction, color, size = 56 }: { faction: FactionId; color: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawPortrait(ref.current, faction, color); }, [faction, color]);
  return <canvas ref={ref} className="jo-portrait" style={{ width: size, height: size }} aria-hidden="true" />;
}

// Bars relative to the best faction for each stat; spawn is shown as a rate (shorter wait = longer bar).
const STAT_KEYS: (keyof Stats)[] = ["spawn", "speed", "hp", "damage"];
const statValue = (k: keyof Stats, s: Stats) => (k === "spawn" ? 1 / s.spawn : s[k]);
const best = Object.fromEntries(STAT_KEYS.map((k) => [k, Math.max(...FACTION_IDS.map((f) => statValue(k, FACTIONS[f].stats)))])) as Record<keyof Stats, number>;

function FactionPicker({ value, onPick, tx, color, busy = false, compact = false }: {
  value: FactionId; onPick: (f: FactionId) => void; tx: JeuTexts; color: string; busy?: boolean; compact?: boolean;
}) {
  return <div className={`jo-factions${compact ? " is-compact" : ""}`} role="radiogroup" aria-label={tx.faction}>
    {FACTION_IDS.map((id) => {
      const f = FACTIONS[id], t = tx.factions[id];
      return <button key={id} type="button" role="radio" aria-checked={value === id} disabled={busy} className="jo-faction" onClick={() => onPick(id)}>
        <Portrait faction={id} color={color} size={compact ? 44 : 60} />
        <span className="jo-faction-text">
          <b>{t.name}{value === id && <Check size={14} aria-hidden="true" />}</b>
          <small>{t.motto}</small>
          {!compact && <span className="jo-stats">{STAT_KEYS.map((k) => {
            const ratio = statValue(k, f.stats) / best[k], base = statValue(k, BASE_STATS) / best[k];
            return <span key={k} className={f.strength === k ? "is-strength" : statValue(k, f.stats) < statValue(k, BASE_STATS) ? "is-weak" : ""}>
              <em>{tx.stats[k]}</em><i style={{ "--w": `${Math.round(ratio * 100)}%`, "--b": `${Math.round(base * 100)}%` } as CSSProperties} />
            </span>;
          })}</span>}
        </span>
      </button>;
    })}
  </div>;
}

function visitorNumber() {
  // Changes every day, always suspiciously round.
  const d = new Date();
  return String(((d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) * 7919) % 99000 + 1000).padStart(6, "0");
}

export function Home({ tx, busy, code, setCode, preview, recent, hasRecent, enter }: {
  tx: JeuTexts; busy: boolean; code: string; setCode: (c: string) => void; preview: Preview | null; recent: string; hasRecent: boolean;
  enter: (c: string | null, input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState(""), [faction, setFaction] = useState<FactionId>("escargots"), [visitor, setVisitor] = useState("");
  useEffect(() => setVisitor(visitorNumber()), []);
  async function submit(e: FormEvent, target: string | null) { e.preventDefault(); await enter(target, { name, faction }); }
  const color = COLORS[preview ? Math.min(preview.players.length, 3) : 0];
  return <main className="jo-home">
    <section className="jo-hero">
      <span className="jo-new">{tx.newBadge}</span>
      <h1>{tx.fullName}</h1>
      <p className="jo-tagline">{tx.tagline}</p>
      <p className="jo-muted">{tx.subtitle}</p>
      <div className="jo-hero-art" aria-hidden="true">{FACTION_IDS.map((id, i) => <Portrait key={id} faction={id} color={COLORS[i]} size={72} />)}</div>
      {visitor && <p className="jo-counter">{fill(tx.visitor, { n: visitor })}</p>}
      <p className="jo-muted jo-small">{tx.bestViewed}</p>
    </section>
    <section className="jo-window jo-entry">
      <div className="jo-titlebar"><span>{preview ? `${tx.join} · ${code}` : tx.create}</span></div>
      <div className="jo-window-body">
        <form onSubmit={(e) => void submit(e, preview ? code : null)}>
          <label htmlFor="jo-name">{tx.yourName}</label>
          <input id="jo-name" value={name} maxLength={20} autoComplete="nickname" placeholder={tx.namePlaceholder} required minLength={2} onChange={(e) => setName(e.target.value)} />
          <span className="jo-label">{tx.faction}</span>
          <FactionPicker value={faction} onPick={setFaction} tx={tx} color={color} compact />
          {preview && <p className="jo-muted">{tx.players} · {preview.players.length}/{MAX_PLAYERS} · {code}</p>}
          <button className="jo-chunky is-primary is-large" disabled={busy || name.trim().length < 2 || (!!preview && preview.phase !== "lobby")}>{preview ? tx.join : tx.create}<ArrowRight size={18} /></button>
        </form>
        {!preview && <form className="jo-join" onSubmit={(e) => void submit(e, code)}>
          <span className="jo-muted">{tx.or}</span>
          <label htmlFor="jo-code">{tx.code}</label>
          <div><input id="jo-code" value={code} placeholder="ABC234" maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} />
            <button className="jo-chunky" disabled={busy || name.trim().length < 2 || code.length !== 6}>{tx.join}</button></div>
        </form>}
        {hasRecent && !preview && <button className="jo-chunky" disabled={busy} onClick={() => void enter(recent, { name, faction })}>{tx.resume} · {recent}</button>}
      </div>
    </section>
  </main>;
}

export function Lobby({ game, tx, busy, act, copied, copy, openRules }: {
  game: PublicGame; tx: JeuTexts; busy: boolean; act: (a: Action) => Promise<boolean>; copied: boolean; copy: () => void; openRules: () => void;
}) {
  const index = game.players.findIndex((p) => p.id === game.me), me = game.players[index], host = game.host === game.me;
  const enough = game.players.length >= MIN_PLAYERS;
  return <main className="jo-lobby">
    <section className="jo-window">
      <div className="jo-titlebar"><span>{tx.lobby}</span></div>
      <div className="jo-window-body">
        <h1 className="jo-room-code">{game.code}</h1>
        <div className="jo-lobby-actions">
          <button className="jo-chunky" onClick={copy}><Link2 size={16} />{copied ? tx.copied : tx.invite}</button>
          <button className="jo-chunky is-primary" onClick={openRules}><BookOpen size={16} />{tx.booklet.open}</button>
        </div>
        <h2>{tx.players} · {game.players.length}/{MAX_PLAYERS}</h2>
        <ul className="jo-lobby-players">{game.players.map((p, i) => <li key={p.id} style={{ "--c": COLORS[i] } as CSSProperties}>
          <Portrait faction={p.faction} color={COLORS[i]} size={40} />
          <span><b>{p.name}</b><small>{tx.factions[p.faction].name}</small></span>
          {p.id === game.host && <small className="jo-tag">{tx.host}</small>}
          {p.id === game.me && <small className="jo-tag">{tx.you}</small>}
          {host && p.id !== game.me && <button className="ui-icon-button" aria-label={`${tx.kick} ${p.name}`} disabled={busy} onClick={() => void act({ type: "kick", player: p.id })}><X size={16} /></button>}
        </li>)}</ul>
        <p className="jo-muted jo-small">{tx.colorHint}</p>
        {game.result && <Summary game={game} tx={tx} />}
      </div>
    </section>
    <section className="jo-window">
      <div className="jo-titlebar"><span>{tx.faction}</span></div>
      <div className="jo-window-body">
        {me && <FactionPicker value={me.faction} tx={tx} color={COLORS[index]} busy={busy} onPick={(faction) => void act({ type: "profile", faction })} />}
        {!enough && <p className="jo-muted">{tx.needPlayers}</p>}
        {host ? <button className="jo-chunky is-primary is-large" disabled={busy || !enough} onClick={() => void act({ type: "start" })}>{tx.start}<ArrowRight size={18} /></button>
          : <p className="jo-muted">{tx.waitHost}</p>}
      </div>
    </section>
  </main>;
}

const score = (s: { tiles: number; kills: number }, winner: boolean) => s.tiles * 10 + s.kills * 5 + (winner ? 500 : 0);
const duration = (ticks: number) => { const ms = Math.max(0, ticks - WARMUP) * TICK_MS; return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`; };

function Summary({ game, tx }: { game: PublicGame; tx: JeuTexts }) {
  const r = game.result!, winner = game.players.find((p) => p.id === r.winner);
  return <p className="jo-muted jo-small"><b>{tx.lastResult} :</b> {winner ? fill(tx.winnerIs, { a: winner.name }) : tx.nobody} · {duration(r.ticks)}</p>;
}

export function Results({ game, tx, busy, act }: { game: PublicGame; tx: JeuTexts; busy: boolean; act: (a: Action) => Promise<boolean> }) {
  const r = game.result;
  const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? "?";
  const inRoster = game.roster.some((s) => s.id === game.me);
  const line = !r || !inRoster ? tx.watchLine : r.winner === game.me ? tx.winLine : tx.loseLine;
  const rows = (r?.stats ?? []).map((s, seat) => ({ ...s, seat, score: score(s, r!.winner === s.id) }));
  const board = [...tx.fakeScores.map(([n, sc]) => ({ name: n, score: sc, real: false })), ...rows.map((x) => ({ name: name(x.id), score: x.score, real: true }))]
    .sort((a, b) => b.score - a.score);
  return <main className="jo-results">
    <section className="jo-window">
      <div className="jo-titlebar"><span>{r?.winner === game.me ? tx.victory : tx.gameOver}</span></div>
      <div className="jo-window-body">
        <p className="jo-over-title">{r?.winner === game.me ? tx.victory : inRoster && r?.winner ? tx.defeat : tx.gameOver}</p>
        <p className="jo-tagline">{line}</p>
        <p className="jo-muted">{r?.winner ? fill(tx.winnerIs, { a: name(r.winner) }) : tx.nobody}{r ? ` · ${tx.duration} ${duration(r.ticks)}` : ""}</p>
        <table className="jo-table">
          <thead><tr><th>{tx.players}</th><th>{tx.tiles}</th><th>{tx.kills}</th><th>{tx.lost}</th><th>{tx.score}</th></tr></thead>
          <tbody>{rows.map((x) => <tr key={x.id} style={{ "--c": COLORS[x.seat] } as CSSProperties}>
            <td><i className="jo-swatch" />{name(x.id)}{x.id === r?.winner && <Crown size={14} aria-label={tx.victory} />}</td>
            <td>{x.tiles}</td><td>{x.kills}</td><td>{x.lost}</td><td><b>{x.score}</b></td>
          </tr>)}</tbody>
        </table>
        {game.host === game.me ? <button className="jo-chunky is-primary is-large" disabled={busy} onClick={() => void act({ type: "again" })}>{tx.again}<ArrowRight size={18} /></button>
          : <p className="jo-muted">{tx.waitAgain}</p>}
      </div>
    </section>
    <section className="jo-window jo-hiscore">
      <div className="jo-titlebar"><span>★ {tx.hiscore} ★</span></div>
      <div className="jo-window-body">
        <ol>{board.map((b, i) => <li key={b.name + i} className={b.real ? "is-real" : ""}><span>{String(i + 1).padStart(2, "0")}.</span><b>{b.name}</b><em>{String(b.score).padStart(6, "0")}</em></li>)}</ol>
      </div>
    </section>
  </main>;
}

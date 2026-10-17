"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Link2, X } from "lucide-react";
import EmblemBadge from "@/components/EmblemBadge";
import type { Action } from "@/platform/contract";
import type { Preview } from "@/platform/useRoom";
import { LEVEL_MINUTES, TIMERS, type PublicGame } from "../engine";
import type { PokerTexts } from "../i18n";
import { CardFace } from "./CardFace";
const demo = [{ id: "s14", rank: 14, suit: "s" }, { id: "h14", rank: 14, suit: "h" }] as const;
function Emblems({ value, taken = [], label, onPick, busy = false }: { value: number; taken?: number[]; label: string; onPick: (e: number) => void; busy?: boolean }) {
  return <div className="pk-emblems" role="group" aria-label={label}>{Array.from({ length: 8 }, (_, e) => <button className="ui-icon-button" type="button" key={e} aria-label={`${label} ${e + 1}`} aria-pressed={value === e} disabled={busy || taken.includes(e)} onClick={() => onPick(e)}><EmblemBadge emblem={e} size={30} />{value === e && <Check size={13} className="pk-emblem-check" />}</button>)}</div>;
}
export function Home({ tx, busy, code, setCode, preview, recent, hasRecent, enter }: {
  tx: PokerTexts; busy: boolean; code: string; setCode: (c: string) => void; preview: Preview | null; recent: string; hasRecent: boolean;
  enter: (c: string | null, input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState(""), [emblem, setEmblem] = useState(0);
  const taken = (preview?.players as { emblem: number }[] | undefined)?.map((p) => p.emblem) ?? [];
  const chosenEmblem = taken.includes(emblem) ? Array.from({ length: 8 }, (_, i) => i).find((i) => !taken.includes(i)) ?? emblem : emblem;
  async function submit(e: FormEvent, target: string | null) { e.preventDefault(); await enter(target, { name, emblem: chosenEmblem }); }
  return <main className="pk-home">
    <section className="pk-hero"><span className="pk-eyebrow">{tx.subtitle}</span><h1>poker<span>♠</span></h1><p className="pk-tagline">{tx.tagline}</p>
      <div className="pk-showcase" aria-hidden="true">{demo.map((card) => <span key={card.id}><CardFace card={card} /></span>)}<i className="pk-chip" /><i className="pk-chip pk-chip-gold" /></div><p className="pk-muted">{tx.fictional}</p></section>
    <section className="ui-panel pk-entry"><form onSubmit={(e) => void submit(e, preview ? code : null)}>
      <label htmlFor="pk-name">{tx.yourName}</label><input id="pk-name" value={name} maxLength={20} autoComplete="nickname" placeholder={tx.namePlaceholder} required minLength={2} onChange={(e) => setName(e.target.value)} />
      <span>{tx.emblem}</span><Emblems value={chosenEmblem} taken={taken} label={tx.emblem} onPick={setEmblem} />
      {preview && <p className="pk-muted">{tx.players} · {preview.players.length}/8 · {code}</p>}
      <button className="ui-button is-primary is-large" disabled={busy || name.trim().length < 2 || (!!preview && preview.phase !== "lobby")}>{preview ? tx.join : tx.create}<ArrowRight size={18} /></button>
    </form>{!preview && <form className="pk-join" onSubmit={(e) => void submit(e, code)}><span className="pk-muted">{tx.or}</span><label htmlFor="pk-code">{tx.code}</label><div><input id="pk-code" value={code} placeholder="ABC234" maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} /><button className="ui-button" disabled={busy || name.trim().length < 2 || code.length !== 6}>{tx.join}</button></div></form>}
    {hasRecent && !preview && <button className="ui-button" disabled={busy} onClick={() => void enter(recent, { name, emblem })}>{tx.resume} · {recent}</button>}</section>
  </main>;
}
export function Options({ game, tx, busy, act }: { game: PublicGame; tx: PokerTexts; busy: boolean; act: (a: Action) => Promise<boolean> }) {
  const disabled = game.me !== game.host || game.phase !== "lobby" || busy;
  return <div className="pk-options"><div><b>{tx.timer}</b><div className="ui-choice" role="group" aria-label={tx.timer}>{TIMERS.map((t) => <button key={t} aria-pressed={game.options.timer === t} disabled={disabled} onClick={() => void act({ type: "options", timer: t })}>{t} s</button>)}</div></div>
    <div><b>{tx.levelMinutes}</b><div className="ui-choice" role="group" aria-label={tx.levelMinutes}>{LEVEL_MINUTES.map((n) => <button key={n} aria-pressed={game.options.levelMinutes === n} disabled={disabled} onClick={() => void act({ type: "options", levelMinutes: n })}>{n} {tx.minutes}</button>)}</div></div></div>;
}
export function Lobby({ game, tx, busy, act, copied, copy }: { game: PublicGame; tx: PokerTexts; busy: boolean; act: (a: Action) => Promise<boolean>; copied: boolean; copy: () => void }) {
  const me = game.players.find((p) => p.id === game.me)!, host = game.host === game.me;
  return <main className="pk-lobby"><section className="ui-panel"><span className="pk-eyebrow">{tx.lobby}</span><h1 className="pk-room-code">{game.code}</h1><button className="ui-button" onClick={copy}><Link2 size={16} />{copied ? tx.copied : tx.invite}</button>
    <h2>{tx.players} · {game.players.length}/8</h2><ul className="pk-lobby-players">{game.players.map((p) => <li key={p.id}><EmblemBadge emblem={p.emblem} size={36} /><b>{p.name}</b>{p.id === game.host && <small>{tx.host}</small>}{p.id === game.me && <small>{tx.you}</small>}{host && p.id !== game.me && <button className="ui-icon-button" aria-label={`${tx.kick} ${p.name}`} disabled={busy} onClick={() => void act({ type: "kick", player: p.id })}><X size={16} /></button>}</li>)}</ul>
    <span>{tx.emblem}</span><Emblems value={me.emblem} taken={game.players.filter((p) => p.id !== me.id).map((p) => p.emblem)} label={tx.emblem} busy={busy} onPick={(emblem) => void act({ type: "profile", emblem })} />
    </section><section className="ui-panel"><span className="pk-eyebrow">TEXAS HOLD’EM</span><h2>{tx.format}</h2><p>{tx.formatHint}</p><Options game={game} tx={tx} busy={busy} act={act} /><p className="pk-muted">{tx.durationHint}</p>
    {host ? <><button className="ui-button is-primary is-large" disabled={busy || game.players.length < 2} onClick={() => void act({ type: "start" })}>{tx.start}<ArrowRight size={18} /></button>{game.players.length < 2 && <p className="pk-muted">{tx.needPlayers}</p>}</> : <p className="pk-muted">{tx.waitHost}</p>}</section></main>;
}

"use client";
// Shared screen of the two-player games: top bar, entrance, waiting room, and the table with the
// players' clocks, the move list and the game's actions. Each game draws its own board (`Play`).
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { ArrowRight, BookOpen, Check, Flag, Handshake, LayoutGrid, Link2, LogOut, Pause, Play as PlayIcon, Trophy, WifiOff, X } from "lucide-react";
import EmblemBadge from "@/components/EmblemBadge";
import { LANG_KEY, fmt } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import type { Action } from "@/platform/contract";
import { useRoom } from "@/platform/useRoom";
import { CLOCKS, EMBLEM_COUNT, INCREMENTS, type DuelView, type Side } from "../engine";
import { duelTexts, errorText, reasonText, type DuelTexts } from "../i18n";

export type PlayProps<P> = { game: DuelView<P>; side: Side | null; act: (a: Action) => Promise<boolean>; busy: boolean; lang: Lang; tx: DuelTexts };
export type TableProps<P> = PlayProps<P>;
export type DuelConfig<P> = {
  id: string;
  path: string;
  logo: string;
  tagline: Record<Lang, string>;
  rulesTitle: Record<Lang, string>;
  rules: Record<Lang, [string, string][]>;
  /** The board during a game. */
  Play: (props: PlayProps<P>) => ReactNode;
  /** A slowly turning board for the entrance. */
  Showcase: () => ReactNode;
  /** A game's own table, in place of the shared one (board, seats, moves and result). */
  Table?: (props: TableProps<P>) => ReactNode;
  /** Extra class on the page, for a game's own skin. */
  className?: string;
  /** Extra buttons in the top bar. */
  Nav?: (props: { lang: Lang }) => ReactNode;
};

const COPIED_MS = 2500;
const CONFIRM_MS = 3000;
const CLOCK_TICK_MS = 200;

export function clockText(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
}

function EmblemPicker({ value, taken, onPick, label }: { value: number; taken: number[]; onPick: (e: number) => void; label: string }) {
  return (
    <div className="gt-tokens" role="group" aria-label={label}>
      {Array.from({ length: EMBLEM_COUNT }, (_, e) => (
        <button key={e} type="button" aria-pressed={value === e} aria-label={`${label} ${e + 1}`} disabled={taken.includes(e)} onClick={() => onPick(e)}>
          <EmblemBadge emblem={e} size={34} />
          {value === e && <span className="gt-check"><Check size={11} /></span>}
        </button>
      ))}
    </div>
  );
}

/** Both players' remaining time, counted down locally between server updates. */
export function useClocks<P>(game: DuelView<P>) {
  const [now, setNow] = useState(() => Date.now());
  const skew = useRef(0);
  useEffect(() => {
    skew.current = game.serverTime - Date.now();
  }, [game.serverTime]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(t);
  }, []);
  // Both games keep the side to move on their position.
  const turn = (game.position as { turn: Side }).turn;
  const running = game.phase === "playing" && !game.paused && game.options.clock > 0;
  const remaining = (s: Side) => game.clocks[s] - (running && turn === s ? now + skew.current - game.turnStart : 0);
  return { turn, running, remaining };
}

export default function DuelScreen<P>({ config }: { config: DuelConfig<P> }) {
  const [lang, setLang] = useState<Lang>("fr"),
    [copied, setCopied] = useState(false),
    [leaving, setLeaving] = useState(false),
    [rules, setRules] = useState(false);
  const room = useRoom<DuelView<P>>(config.id, config.path);
  const tx = duelTexts(lang);
  const g = room.state;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "fr" || saved === "en") setLang(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {}
  }, [lang]);

  async function copy() {
    if (!g) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}${config.path}?room=${g.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      room.setError("serverError");
    }
  }
  function leave() {
    if (!leaving) {
      setLeaving(true);
      setTimeout(() => setLeaving(false), CONFIRM_MS);
      return;
    }
    setLeaving(false);
    void room.act({ type: "leave" });
  }

  const me = g?.players.find((p) => p.id === g.me);
  return (
    <div className={"gt du" + (config.className ? " " + config.className : "")}>
      <header className="gt-top">
        <nav>
          <a className="gt-orb" href="/" aria-label={tx.allGames} title={tx.allGames}><LayoutGrid /></a>
          <button className="gt-orb" aria-label={tx.howToPlay} title={tx.howToPlay} aria-expanded={rules} onClick={() => setRules(true)}><BookOpen /></button>
          {g && <button className="gt-orb" aria-label={copied ? tx.copied : tx.invite} title={copied ? tx.copied : tx.invite} onClick={copy}><Link2 /></button>}
          {g && g.host === g.me && g.phase === "playing" && (
            <button className="gt-orb" aria-label={g.paused ? tx.resume2 : tx.pause} title={g.paused ? tx.resume2 : tx.pause} onClick={() => void room.act({ type: "pause" })}>
              {g.paused ? <PlayIcon /> : <Pause />}
            </button>
          )}
          {config.Nav && <config.Nav lang={lang} />}
          <div className="gt-seg" role="group" aria-label={tx.language}>
            <button aria-pressed={lang === "fr"} onClick={() => setLang("fr")}>FR</button>
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          </div>
          {g && <button className={"gt-orb" + (leaving ? " danger" : "")} aria-label={leaving ? tx.leaveConfirm : tx.leave} title={leaving ? tx.leaveConfirm : tx.leave} onClick={leave}><LogOut /></button>}
        </nav>
      </header>

      {room.loading ? (
        <main className="gt-loading" role="status">
          <span className="gt-loader" aria-hidden="true"><i /><i /></span>
          {tx.loading}
        </main>
      ) : !g ? (
        <Home config={config} tx={tx} lang={lang} room={room} />
      ) : g.phase === "lobby" ? (
        <Lobby game={g} tx={tx} busy={room.busy} act={room.act} copied={copied} onCopy={copy} />
      ) : (
        <>
          {config.Table ? (
            <config.Table game={g} side={me?.side ?? null} tx={tx} lang={lang} act={room.act} busy={room.busy} />
          ) : (
            <Table config={config} game={g} side={me?.side ?? null} tx={tx} lang={lang} act={room.act} busy={room.busy} />
          )}
          {g.paused && (
            <div className="gt-veil soft" role="status">
              <div className="gt-dialog">
                <h2>{tx.paused}</h2>
                {g.pauseReason === "offline" && (
                  <p className="gt-hint">{fmt(tx.pausedOffline, { name: g.players.find((p) => p.side === (g.position as { turn: Side }).turn)?.name ?? "" })}</p>
                )}
                {g.host === g.me && <button className="gt-btn go" disabled={room.busy} onClick={() => void room.act({ type: "pause" })}><PlayIcon size={18} /> {tx.resume2}</button>}
              </div>
            </div>
          )}
        </>
      )}

      {rules && (
        <div className="gt-veil" onClick={() => setRules(false)}>
          <section className="gt-dialog gt-rules" role="dialog" aria-modal="true" aria-labelledby="du-rules-title" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2 id="du-rules-title">{config.rulesTitle[lang]}</h2>
              <button className="gt-icon-btn" aria-label={tx.close} onClick={() => setRules(false)} autoFocus><X size={18} /></button>
            </header>
            <ol>
              {config.rules[lang].map(([title, body]) => (
                <li key={title}><h3>{title}</h3><p>{body}</p></li>
              ))}
            </ol>
            <button className="gt-btn go big" onClick={() => setRules(false)}>{tx.close}</button>
          </section>
        </div>
      )}
      {room.lost && <div className="gt-note lost"><WifiOff size={16} /> {tx.connectionLost}</div>}
      {room.error && <div className="gt-note error" role="alert" onClick={() => room.setError("")}>{errorText(room.error, lang)}</div>}
    </div>
  );
}

function Home<P>({ config, tx, lang, room }: { config: DuelConfig<P>; tx: DuelTexts; lang: Lang; room: ReturnType<typeof useRoom<DuelView<P>>> }) {
  const key = `${config.id}.name`;
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(key) ?? localStorage.getItem("grand-tour.name") ?? localStorage.getItem("pioche.name") ?? "";
    } catch {
      return "";
    }
  });
  const taken = ((room.preview?.players ?? []) as { emblem: number }[]).map((p) => p.emblem);
  const [emblem, setEmblem] = useState(() => Array.from({ length: EMBLEM_COUNT }, (_, i) => i).find((i) => !taken.includes(i)) ?? 0);
  const submit = (code: string | null) => (e: FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(key, name.trim());
    } catch {}
    void room.enter(code, { name, emblem });
  };
  const named = name.trim().length >= 2;
  const Showcase = config.Showcase;
  return (
    <main className="gt-entrance">
      <section className="gt-entrance-hero">
        <h1 className="gt-logo">{config.logo}<span>.</span></h1>
        <p>{config.tagline[lang]}</p>
        <div className="gt-entrance-board" aria-hidden="true"><Showcase /></div>
      </section>
      <section className="gt-card-panel">
        <form onSubmit={submit(room.preview ? room.room : null)}>
          <label htmlFor="du-name">{tx.yourName}</label>
          <input id="du-name" value={name} maxLength={20} autoComplete="nickname" placeholder={tx.namePlaceholder} onChange={(e) => setName(e.target.value)} required />
          <span className="gt-label">{tx.emblem}</span>
          <EmblemPicker value={emblem} taken={taken} onPick={setEmblem} label={tx.emblem} />
          <button className="gt-btn go big" disabled={room.busy || !named}>{room.preview ? tx.join : tx.create} <ArrowRight size={18} /></button>
        </form>
        {!room.preview && (
          <form className="gt-join-row" onSubmit={submit(room.room)}>
            <span>{tx.or}</span>
            <input aria-label={tx.code} placeholder="ABC234" value={room.room} maxLength={6} onChange={(e) => room.setRoom(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} />
            <button className="gt-btn ghost" disabled={room.busy || !named || room.room.length !== 6}>{tx.join}</button>
          </form>
        )}
        {!!room.recent && room.hasSession(room.recent) && !room.preview && (
          <button className="gt-link" onClick={() => void room.enter(room.recent, { name, emblem })}>{tx.resume} · {room.recent}</button>
        )}
      </section>
    </main>
  );
}

function Lobby<P>({ game, tx, busy, act, copied, onCopy }: { game: DuelView<P>; tx: DuelTexts; busy: boolean; act: (a: Action) => Promise<boolean>; copied: boolean; onCopy: () => void }) {
  const isHost = game.host === game.me;
  const me = game.players.find((p) => p.id === game.me)!;
  return (
    <main className="gt-lobby">
      <section className="gt-card-panel">
        <span className="gt-label mono">{tx.lobby}</span>
        <div className="gt-code">{game.code}</div>
        <button className="gt-btn ghost" onClick={onCopy}><Link2 size={16} /> {copied ? tx.copied : tx.invite}</button>
        <h2>{tx.players} · {game.players.length} / 2</h2>
        <ul className="gt-lobby-players">
          {game.players.map((p) => (
            <li key={p.id}>
              <EmblemBadge emblem={p.emblem} size={32} />
              <span>{p.name}</span>
              {p.id === game.host && <small>{tx.host}</small>}
              {p.id === game.me && <small>{tx.you}</small>}
              {isHost && p.id !== game.me && <button className="gt-icon-btn" aria-label={`${tx.kick} ${p.name}`} disabled={busy} onClick={() => void act({ type: "kick", player: p.id })}><X size={14} /></button>}
            </li>
          ))}
        </ul>
        {game.players.length < 2 && <p className="gt-hint">{tx.waitOpponent}</p>}
        <span className="gt-label">{tx.emblem}</span>
        <EmblemPicker value={me.emblem} taken={game.players.filter((p) => p.id !== game.me).map((p) => p.emblem)} onPick={(e) => void act({ type: "profile", emblem: e })} label={tx.emblem} />
      </section>
      <section className="gt-card-panel">
        <h2>{tx.rules}</h2>
        <div className="gt-option">
          <div><b>{tx.clock}</b><small>{tx.clockHint}</small></div>
          <div className="gt-seg" role="group" aria-label={tx.clock}>
            {CLOCKS.map((c) => (
              <button key={c} aria-pressed={game.options.clock === c} disabled={!isHost || busy} onClick={() => void act({ type: "options", clock: c })}>{c ? c : tx.noClock}</button>
            ))}
          </div>
        </div>
        {game.options.clock > 0 && (
          <div className="gt-option">
            <div><b>{tx.increment}</b><small>{tx.incrementHint}</small></div>
            <div className="gt-seg" role="group" aria-label={tx.increment}>
              {INCREMENTS.map((c) => (
                <button key={c} aria-pressed={game.options.increment === c} disabled={!isHost || busy} onClick={() => void act({ type: "options", increment: c })}>+{c}</button>
              ))}
            </div>
          </div>
        )}
        <p className="gt-hint">{tx.colorsHint}</p>
        {isHost ? (
          <button className="gt-btn go big" disabled={busy || game.players.length < 2} onClick={() => void act({ type: "start" })}>{tx.start} <ArrowRight size={18} /></button>
        ) : (
          <p className="gt-hint">{tx.waitHost}</p>
        )}
      </section>
    </main>
  );
}

function Table<P>({ config, game, side, tx, lang, act, busy }: { config: DuelConfig<P>; game: DuelView<P>; side: Side | null; tx: DuelTexts; lang: Lang; act: (a: Action) => Promise<boolean>; busy: boolean }) {
  const [confirmResign, setConfirmResign] = useState(false);
  const { turn, running, remaining } = useClocks(game);
  const seat = (s: Side) => game.players.find((p) => p.side === s);
  const mine = side ?? "w";
  const order: Side[] = [mine === "w" ? "b" : "w", mine];
  const pairs: string[][] = [];
  for (let k = 0; k < game.moves.length; k += 2) pairs.push(game.moves.slice(k, k + 2));
  const listEnd = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listEnd.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [game.moves.length]);
  const Play = config.Play;
  const playing = game.phase === "playing" && !!side;
  const opponent = seat(side === "w" ? "b" : "w");

  return (
    <div className="gt-table du-table">
      <div className="gt-board-wrap">
        <div className="gt-board3d"><Play game={game} side={side} act={act} busy={busy} lang={lang} tx={tx} /></div>
      </div>
      <aside className="gt-side">
        {order.map((s) => {
          const p = seat(s);
          const ms = remaining(s);
          return (
            <section key={s} className={"gt-panel du-seat" + (turn === s && game.phase === "playing" ? " active" : "")}>
              <span className={"du-stone " + s} aria-hidden="true" />
              {p && <EmblemBadge emblem={p.emblem} size={34} />}
              <span className="gt-who">
                <b>{p?.name ?? "—"}{p?.id === game.me && <small>{tx.you}</small>}</b>
                <small>{s === "w" ? tx.white : tx.black}</small>
              </span>
              {game.options.clock > 0 && (
                <span className={"du-clock" + (turn === s && running ? " running" : "") + (ms < 20000 ? " low" : "")} style={{ "--pct": `${Math.max(0, Math.min(1, ms / (game.options.clock * 60000))) * 100}%` } as CSSProperties}>
                  {clockText(ms)}
                </span>
              )}
            </section>
          );
        })}

        <section className="gt-panel">
          <p className="du-status" aria-live="polite">
            {game.phase === "finished" ? "" : side ? (turn === side ? tx.yourTurn : fmt(tx.theirTurn, { name: seat(turn)?.name ?? "" })) : tx.spectating}
          </p>
          {playing && game.drawOffer && game.drawOffer !== side && (
            <div className="gt-offer">
              <b><Handshake size={16} /> {fmt(tx.drawIncoming, { name: opponent?.name ?? "" })}</b>
              <div className="gt-actions">
                <button className="gt-btn go small" disabled={busy} onClick={() => void act({ type: "answerDraw", accept: true })}>{tx.accept}</button>
                <button className="gt-btn ghost small" disabled={busy} onClick={() => void act({ type: "answerDraw", accept: false })}>{tx.refuse}</button>
              </div>
            </div>
          )}
          {playing && (
            <div className="gt-actions du-actions">
              <button className="gt-btn ghost small" disabled={busy || game.drawOffer === side} onClick={() => void act({ type: "offerDraw" })}>
                <Handshake size={15} /> {game.drawOffer === side ? tx.drawOffered : tx.offerDraw}
              </button>
              <button
                className={"gt-btn small " + (confirmResign ? "danger" : "ghost")}
                disabled={busy}
                onClick={() => {
                  if (!confirmResign) {
                    setConfirmResign(true);
                    setTimeout(() => setConfirmResign(false), CONFIRM_MS);
                  } else void act({ type: "resign" });
                }}
              >
                <Flag size={15} /> {confirmResign ? tx.resignConfirm : tx.resign}
              </button>
            </div>
          )}
        </section>

        <section className="gt-panel du-moves">
          <h3>{tx.moves}</h3>
          {pairs.length ? (
            <ol ref={listEnd}>
              {pairs.map(([w, b], k) => (
                <li key={k}><small>{k + 1}.</small><span>{w}</span><span>{b ?? ""}</span></li>
              ))}
            </ol>
          ) : (
            <p className="gt-hint">{tx.noMoves}</p>
          )}
        </section>
      </aside>

      {game.phase === "finished" && game.result && (
        <div className="gt-veil soft du-result" role="dialog" aria-modal="true" aria-labelledby="du-result">
          <div className="gt-dialog gt-end">
            {game.result.winner ? <Trophy size={40} /> : <Handshake size={40} />}
            <h2 id="du-result">
              {!game.result.winner ? tx.draw : side ? (game.result.winner === side ? tx.youWon : tx.youLost) : fmt(tx.won, { name: seat(game.result.winner)?.name ?? "" })}
            </h2>
            <p className="gt-hint">{reasonText(game.result.reason, lang)}</p>
            {game.players.filter((p) => !p.left).length === 2 && side && (
              <button className="gt-btn go big" disabled={busy} onClick={() => void act({ type: "again" })}>{tx.again}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

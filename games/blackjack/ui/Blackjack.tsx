"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Flag, LayoutGrid, Link2, LogOut, Pause, Play, Square, Volume2, VolumeX, WifiOff } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import ConfirmAction from "@/components/ConfirmAction";
import { LANG_KEY, confirmationTexts } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import { SOUND_KEY, soundEnabled, setSoundEnabled } from "@/lib/sound";
import { useRoom } from "@/platform/useRoom";
import { playCue } from "@/games/cards/sound";
import type { PublicGame } from "../engine";
import { errorText, blackjackTexts } from "../i18n";
import { Home, Lobby } from "./Screens";
const Table = dynamic(() => import("./Table"));
const Rules = dynamic(() => import("./Rules"));
export default function Blackjack() {
  const [lang, setLang] = useState<Lang>("fr"), [audio, setAudio] = useState(false), [rules, setRules] = useState(false), [copied, setCopied] = useState(false), [confirm, setConfirm] = useState<"leave" | "resign" | "finish" | null>(null);
  const previous = useRef<PublicGame | null>(null);
  const room = useRoom<PublicGame>("blackjack", "/blackjack"), g = room.state, tx = blackjackTexts(lang);
  useEffect(() => {
    try { const saved = localStorage.getItem(LANG_KEY); if (saved === "fr" || saved === "en") setLang(saved); } catch {}
    const on = soundEnabled(undefined, false); setAudio(on);
  }, []);
  useEffect(() => {
    const update = (e: StorageEvent) => { if (e.key === SOUND_KEY) { const on = soundEnabled(undefined, false); setAudio(on); } };
    window.addEventListener("storage", update); return () => window.removeEventListener("storage", update);
  }, []);
  function language(next: Lang) { setLang(next); try { localStorage.setItem(LANG_KEY, next); } catch {} }
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    const old = previous.current; previous.current = g;
    if (!g || !old || old.code !== g.code) return;
    // Read the common switch at playback time too, so another game's mute takes effect.
    if (!soundEnabled(undefined, false)) return;
    const mine = g.result?.players.find((p) => p.id === g.me);
    const count = (state: PublicGame) => state.dealer.length + state.players.reduce((sum, p) => sum + p.hands.reduce((n, h) => n + h.cards.length, 0), 0);
    if (mine && g.result?.at !== old.result?.at && mine.profit > 0) playCue("win");
    else if (count(g) > count(old) || (!old.dealerRevealed && g.dealerRevealed)) playCue("draw");
    else if (g.active === g.me && (old.active !== g.me || old.activeHand !== g.activeHand)) playCue("turn");
    else if (g.events.at(-1)?.id !== old.events.at(-1)?.id) playCue("play");
  }, [g]);
  const copy = useCallback(async () => {
    if (!g) return;
    try { await navigator.clipboard.writeText(`${location.origin}/blackjack?room=${g.code}`); setCopied(true); } catch { room.setError("serverError"); }
  }, [g?.code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!copied) return; const id = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(id); }, [copied]);
  const me = g?.players.find((p) => p.id === g.me);
  return <div className="bj-blackjack"><header className="bj-top">{g && <span className="bj-room-tag">{g.code}</span>}<nav aria-label={tx.rules}>
    <a className="orb small" href="/" aria-label={tx.allGames} title={tx.allGames}><LayoutGrid /></a><ThemeToggle lang={lang} />
    <button className="ui-icon-button" aria-label={tx.howToPlay} title={tx.howToPlay} aria-expanded={rules} onClick={() => setRules(true)}><BookOpen /></button>
    {g && <button className="ui-icon-button" aria-label={copied ? tx.copied : tx.invite} title={copied ? tx.copied : tx.invite} onClick={() => void copy()}><Link2 /></button>}
    {g?.phase === "playing" && g.host === g.me && <button className="ui-icon-button" aria-label={g.paused ? tx.resumeGame : tx.pause} disabled={room.busy} onClick={() => void room.act({ type: "pause" })}>{g.paused ? <Play /> : <Pause />}</button>}
    {g?.phase === "playing" && g.host === g.me && !g.finishRequested && <button className="ui-icon-button" aria-label={tx.finish} title={tx.finish} onClick={() => setConfirm("finish")}><Square /></button>}
    <button className="ui-icon-button" aria-label={tx.sound} aria-pressed={audio} onClick={() => { const on = !audio; setAudio(on); setSoundEnabled(on); if (on) playCue("select"); }}>{audio ? <Volume2 /> : <VolumeX />}</button>
    <div className="ui-choice" role="group" aria-label={tx.language}>{(["fr", "en"] as const).map((l) => <button key={l} aria-pressed={lang === l} onClick={() => language(l)}>{l.toUpperCase()}</button>)}</div>
    {g?.phase === "playing" && me && !me.resigned && <button className="ui-icon-button" aria-label={tx.resign} title={tx.resign} onClick={() => setConfirm("resign")}><Flag /></button>}
    {g && <button className="ui-icon-button" aria-label={tx.leave} title={tx.leave} onClick={() => setConfirm("leave")}><LogOut /></button>}
    </nav></header>
    {room.loading ? <main className="bj-loading" role="status">{tx.loading}</main> : !g ? <Home tx={tx} busy={room.busy} code={room.room} setCode={room.setRoom} preview={room.preview} recent={room.recent} hasRecent={!!room.recent && room.hasSession(room.recent)} enter={room.enter} />
      : g.phase === "lobby" ? <Lobby game={g} tx={tx} busy={room.busy} act={room.act} copy={() => void copy()} copied={copied} /> : <Table game={g} tx={tx} lang={lang} busy={room.busy} act={room.act} />}
    {g?.paused && <div className="bj-pause-veil" role="status"><div className="ui-panel"><h2>{tx.paused}</h2>{g.pauseReason === "offline" && <p>{tx.offlinePause}</p>}{g.host === g.me && <button className="ui-button is-primary" disabled={room.busy} onClick={() => void room.act({ type: "pause" })}>{tx.resumeGame}</button>}</div></div>}
    {rules && <Rules tx={tx} game={g} busy={room.busy} act={room.act} onClose={() => setRules(false)} />}
    {g && confirm && <ConfirmAction key={confirm} lang={lang} title={confirm === "leave" ? tx.leave : confirm === "finish" ? tx.finish : tx.resign} description={confirm === "leave" ? confirmationTexts(lang).leave : confirm === "finish" ? tx.finishConfirm : tx.resignConfirm} busy={room.busy} error={room.error ? errorText(room.error, lang) : undefined} onConfirm={() => room.act({ type: confirm })} onCancel={() => setConfirm(null)} />}
    {room.lost && <div className="bj-network" role="status"><WifiOff size={16} />{tx.connectionLost}</div>}
    {room.error && <div className="bj-error" role="alert"><span>{errorText(room.error, lang)}</span><button className="ui-icon-button" aria-label={tx.close} onClick={() => room.setError("")}>×</button></div>}
  </div>;
}

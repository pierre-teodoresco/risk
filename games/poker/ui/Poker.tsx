"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Flag, LayoutGrid, Link2, LogOut, Pause, Play, Volume2, VolumeX, WifiOff } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import ConfirmAction from "@/components/ConfirmAction";
import { LANG_KEY, confirmationTexts } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import { SOUND_KEY, soundEnabled, setSoundEnabled } from "@/lib/sound";
import { useRoom } from "@/platform/useRoom";
import { playCue } from "@/games/cards/sound";
import type { PublicGame } from "../engine";
import { errorText, pokerTexts } from "../i18n";
import { Home, Lobby } from "./Screens";
const Table = dynamic(() => import("./Table"));
const Rules = dynamic(() => import("./Rules"));
export default function Poker() {
  const [lang, setLang] = useState<Lang>("fr"), [audio, setAudio] = useState(false), [rules, setRules] = useState(false), [copied, setCopied] = useState(false), [confirm, setConfirm] = useState<"leave" | "resign" | null>(null);
  const audioRef = useRef(false), previous = useRef<PublicGame | null>(null);
  const room = useRoom<PublicGame>("poker", "/poker"), g = room.state, tx = pokerTexts(lang);
  useEffect(() => {
    try { const saved = localStorage.getItem(LANG_KEY); if (saved === "fr" || saved === "en") setLang(saved); } catch {}
    const on = soundEnabled(undefined, false); setAudio(on); audioRef.current = on;
  }, []);
  useEffect(() => {
    const update = (e: StorageEvent) => { if (e.key === SOUND_KEY) { const on = soundEnabled(undefined, false); setAudio(on); audioRef.current = on; } };
    window.addEventListener("storage", update); return () => window.removeEventListener("storage", update);
  }, []);
  function language(next: Lang) { setLang(next); try { localStorage.setItem(LANG_KEY, next); } catch {} }
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    const old = previous.current; previous.current = g;
    if (!g || !old || old.code !== g.code) return;
    // Read the common switch at playback time too, so another game's mute takes effect.
    if (!soundEnabled(undefined, false)) return;
    if (g.phase === "finished" && old.phase !== "finished" && g.winner === g.me) playCue("win");
    else if (g.handNumber !== old.handNumber || g.board.length !== old.board.length) playCue("draw");
    else if (g.active === g.me && old.active !== g.me) playCue("turn");
    else if (g.events.at(-1)?.id !== old.events.at(-1)?.id) playCue("play");
  }, [g]);
  const copy = useCallback(async () => {
    if (!g) return;
    try { await navigator.clipboard.writeText(`${location.origin}/poker?room=${g.code}`); setCopied(true); } catch { room.setError("serverError"); }
  }, [g?.code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!copied) return; const id = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(id); }, [copied]);
  const me = g?.players.find((p) => p.id === g.me);
  return <div className="pk-poker"><header className="pk-top">{g && <span className="pk-room-tag">{g.code}</span>}<nav aria-label={tx.rules}>
    <a className="orb small" href="/" aria-label={tx.allGames} title={tx.allGames}><LayoutGrid /></a><ThemeToggle lang={lang} />
    <button className="ui-icon-button" aria-label={tx.howToPlay} title={tx.howToPlay} aria-expanded={rules} onClick={() => setRules(true)}><BookOpen /></button>
    {g && <button className="ui-icon-button" aria-label={copied ? tx.copied : tx.invite} title={copied ? tx.copied : tx.invite} onClick={() => void copy()}><Link2 /></button>}
    {g?.phase === "playing" && g.host === g.me && <button className="ui-icon-button" aria-label={g.paused ? tx.resumeGame : tx.pause} disabled={room.busy} onClick={() => void room.act({ type: "pause" })}>{g.paused ? <Play /> : <Pause />}</button>}
    <button className="ui-icon-button" aria-label={tx.sound} aria-pressed={audio} onClick={() => { const on = !audio; setAudio(on); audioRef.current = on; setSoundEnabled(on); if (on) playCue("select"); }}>{audio ? <Volume2 /> : <VolumeX />}</button>
    <div className="ui-choice" role="group" aria-label={tx.language}>{(["fr", "en"] as const).map((l) => <button key={l} aria-pressed={lang === l} onClick={() => language(l)}>{l.toUpperCase()}</button>)}</div>
    {g?.phase === "playing" && me && !me.eliminated && !me.resigned && <button className="ui-icon-button" aria-label={tx.resign} title={tx.resign} onClick={() => setConfirm("resign")}><Flag /></button>}
    {g && <button className="ui-icon-button" aria-label={tx.leave} title={tx.leave} onClick={() => setConfirm("leave")}><LogOut /></button>}
    </nav></header>
    {room.loading ? <main className="pk-loading" role="status">{tx.loading}</main> : !g ? <Home tx={tx} busy={room.busy} code={room.room} setCode={room.setRoom} preview={room.preview} recent={room.recent} hasRecent={!!room.recent && room.hasSession(room.recent)} enter={room.enter} />
      : g.phase === "lobby" ? <Lobby game={g} tx={tx} busy={room.busy} act={room.act} copy={() => void copy()} copied={copied} /> : <Table game={g} tx={tx} lang={lang} busy={room.busy} act={room.act} />}
    {g?.paused && <div className="pk-pause-veil" role="status"><div className="ui-panel"><h2>{tx.paused}</h2>{g.pauseReason === "offline" && <p>{tx.offlinePause}</p>}{g.host === g.me && <button className="ui-button is-primary" disabled={room.busy} onClick={() => void room.act({ type: "pause" })}>{tx.resumeGame}</button>}</div></div>}
    {rules && <Rules tx={tx} game={g} busy={room.busy} act={room.act} onClose={() => setRules(false)} />}
    {g && confirm && <ConfirmAction key={confirm} lang={lang} title={confirm === "leave" ? tx.leave : tx.resign} description={confirm === "leave" ? confirmationTexts(lang).leave : tx.resignConfirm} busy={room.busy} error={room.error ? errorText(room.error, lang) : undefined} onConfirm={() => room.act({ type: confirm })} onCancel={() => setConfirm(null)} />}
    {room.lost && <div className="pk-network" role="status"><WifiOff size={16} />{tx.connectionLost}</div>}
    {room.error && <div className="pk-error" role="alert"><span>{errorText(room.error, lang)}</span><button className="ui-icon-button" aria-label={tx.close} onClick={() => room.setError("")}>×</button></div>}
  </div>;
}

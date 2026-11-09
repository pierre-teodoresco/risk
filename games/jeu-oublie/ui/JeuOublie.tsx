"use client";
// Shell of the forgotten game: top bar, room session (useRoom) and the screen for each phase.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Flag, LayoutGrid, Link2, LogOut, Square, Volume2, VolumeX, WifiOff } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import ConfirmAction from "@/components/ConfirmAction";
import { LANG_KEY, confirmationTexts } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import { SOUND_KEY, soundEnabled, setSoundEnabled } from "@/lib/sound";
import { useRoom } from "@/platform/useRoom";
import type { PublicGame } from "../engine";
import type { Cmd } from "../sim";
import { errorText, jeuTexts } from "../i18n";
import { Home, Lobby, Results } from "./Screens";
import { play } from "./sound";
const Battle = dynamic(() => import("./Battle"), { ssr: false });
const Rules = dynamic(() => import("./Rules"));

export default function JeuOublie() {
  const [lang, setLang] = useState<Lang>("fr"), [audio, setAudio] = useState(false), [rules, setRules] = useState(false), [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"leave" | "resign" | "abort" | null>(null);
  const room = useRoom<PublicGame>("jeu-oublie", "/jeu-oublie"), g = room.state, tx = jeuTexts(lang);
  const orderRef = useRef<((c: Cmd) => void) | null>(null);
  useEffect(() => {
    try { const saved = localStorage.getItem(LANG_KEY); if (saved === "fr" || saved === "en") setLang(saved); } catch {}
    setAudio(soundEnabled(undefined, false));
    const update = (e: StorageEvent) => { if (e.key === SOUND_KEY) setAudio(soundEnabled(undefined, false)); };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  // The booklet opens by itself the first time this browser reaches a waiting room.
  useEffect(() => {
    if (g?.phase !== "lobby") return;
    try { if (!localStorage.getItem("jeu-oublie.booklet")) { localStorage.setItem("jeu-oublie.booklet", "seen"); setRules(true); } } catch {}
  }, [g?.phase]);
  function language(next: Lang) { setLang(next); try { localStorage.setItem(LANG_KEY, next); } catch {} }
  const copy = useCallback(async () => {
    if (!g) return;
    try { await navigator.clipboard.writeText(`${location.origin}/jeu-oublie?room=${g.code}`); setCopied(true); } catch { room.setError("serverError"); }
  }, [g?.code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!copied) return; const id = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(id); }, [copied]);
  const me = g?.players.find((p) => p.id === g.me);
  const seated = !!g?.roster.some((s) => s.id === g.me);
  const battle = g?.phase === "playing";

  async function confirmed() {
    if (!confirm) return false;
    // Resigning or leaving mid-battle also tells the other browsers, so the base falls for everyone.
    if (battle && confirm !== "abort") orderRef.current?.({ k: "rs" });
    return room.act({ type: confirm });
  }

  return <div className={`jo-root${battle ? " is-battle" : ""}`}>
    <header className="jo-top">{g && !battle && <span className="jo-room-tag">{g.code}</span>}<nav aria-label={tx.howToPlay}>
      <a className="orb small" href="/" aria-label={tx.allGames} title={tx.allGames}><LayoutGrid /></a><ThemeToggle lang={lang} />
      <button className="ui-icon-button" aria-label={tx.howToPlay} title={tx.howToPlay} aria-expanded={rules} onClick={() => setRules(true)}><BookOpen /></button>
      {g && <button className="ui-icon-button" aria-label={copied ? tx.copied : tx.invite} title={copied ? tx.copied : tx.invite} onClick={() => void copy()}><Link2 /></button>}
      {battle && g.host === g.me && <button className="ui-icon-button" aria-label={tx.abort} title={tx.abort} onClick={() => setConfirm("abort")}><Square /></button>}
      <button className="ui-icon-button" aria-label={tx.sound} title={tx.sound} aria-pressed={audio} onClick={() => { const on = !audio; setAudio(on); setSoundEnabled(on); if (on) play("select"); }}>{audio ? <Volume2 /> : <VolumeX />}</button>
      <div className="ui-choice" role="group" aria-label={tx.language}>{(["fr", "en"] as const).map((l) => <button key={l} aria-pressed={lang === l} onClick={() => language(l)}>{l.toUpperCase()}</button>)}</div>
      {battle && seated && me && !me.resigned && <button className="ui-icon-button" aria-label={tx.resign} title={tx.resign} onClick={() => setConfirm("resign")}><Flag /></button>}
      {g && <button className="ui-icon-button" aria-label={tx.leave} title={tx.leave} onClick={() => setConfirm("leave")}><LogOut /></button>}
    </nav></header>
    {room.loading ? <main className="jo-loading" role="status">{tx.loading}</main>
      : !g ? <Home tx={tx} busy={room.busy} code={room.room} setCode={room.setRoom} preview={room.preview} recent={room.recent} hasRecent={!!room.recent && room.hasSession(room.recent)} enter={room.enter} />
      : g.phase === "lobby" ? <Lobby game={g} tx={tx} busy={room.busy} act={room.act} copy={() => void copy()} copied={copied} openRules={() => setRules(true)} />
      : g.phase === "playing" ? <Battle key={g.match} game={g} tx={tx} lang={lang} act={room.act} orderRef={orderRef} openRules={() => setRules(true)} />
      : <Results game={g} tx={tx} busy={room.busy} act={room.act} />}
    {rules && <Rules tx={tx} lang={lang} onClose={() => setRules(false)} />}
    {g && confirm && <ConfirmAction key={confirm} lang={lang} title={confirm === "leave" ? tx.leave : confirm === "abort" ? tx.abort : tx.resign}
      description={confirm === "leave" ? confirmationTexts(lang).leave : confirm === "abort" ? tx.abortConfirm : tx.resignConfirm}
      busy={room.busy} error={room.error ? errorText(room.error, lang) : undefined} onConfirm={confirmed} onCancel={() => setConfirm(null)} />}
    {room.lost && <div className="jo-toast" role="status"><WifiOff size={16} />{tx.connectionLost}</div>}
    {room.error && !confirm && <div className="jo-toast is-error" role="alert"><span>{errorText(room.error, lang)}</span><button className="ui-icon-button" aria-label={tx.close} onClick={() => room.setError("")}>×</button></div>}
  </div>;
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, LayoutGrid, Link2, LogOut, Pause, Play, Volume2, VolumeX, WifiOff } from "lucide-react";
import { LANG_KEY, fmt } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import { gamePath } from "@/games/registry";
import { useRoom } from "@/platform/useRoom";
import type { PublicGame } from "../engine";
import { errorText, piocheTexts } from "../i18n";
import { CardDefs } from "./CardFace";
import Rules from "./Rules";
import { Home, Lobby, RoundEnd } from "./Screens";
import Table from "./Table";
import { playCue, type Cue } from "./sound";

const PATH = gamePath("pioche");
const AUDIO_KEY = "pioche.audio";
const COPIED_MS = 2500;
const LEAVE_CONFIRM_MS = 3000;

export default function Pioche() {
  const [lang, setLang] = useState<Lang>("fr"),
    [audio, setAudio] = useState(false),
    [copied, setCopied] = useState(false),
    [leaving, setLeaving] = useState(false),
    [rules, setRules] = useState(false);
  const room = useRoom<PublicGame>("pioche", PATH);
  const audioRef = useRef(false);
  const tx = piocheTexts(lang);
  const g = room.state;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "fr" || saved === "en") setLang(saved);
      // Sound stays off until the player turns it on.
      const on = localStorage.getItem(AUDIO_KEY) === "on";
      setAudio(on);
      audioRef.current = on;
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {}
  }, [lang]);
  useEffect(() => {
    if (g?.phase === "finished" && g.winner === g.me && audioRef.current) playCue("win");
  }, [g?.phase, g?.winner, g?.me]);

  const cue = useCallback((c: Cue) => {
    if (audioRef.current) playCue(c);
  }, []);
  function toggleAudio() {
    const next = !audio;
    setAudio(next);
    audioRef.current = next;
    try {
      localStorage.setItem(AUDIO_KEY, next ? "on" : "off");
    } catch {}
    if (next) playCue("select");
  }
  async function copy() {
    if (!g) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}${PATH}?room=${g.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      room.setError("serverError");
    }
  }
  function leave() {
    if (!leaving) {
      setLeaving(true);
      setTimeout(() => setLeaving(false), LEAVE_CONFIRM_MS);
      return;
    }
    setLeaving(false);
    void room.act({ type: "leave" });
  }

  const pausedBy = g?.paused ? g.players.find((p) => p.id === g.active) : null;
  return (
    <div className="pioche">
      <CardDefs />
      <header className="pioche-top">
        <a className="pioche-brand" href="/" aria-label={tx.allGames}>
          <LayoutGrid size={18} aria-hidden="true" />
          pioche<span>.</span>
        </a>
        {g && g.phase !== "lobby" && <span className="round-tag">{fmt(tx.round, { n: g.round })} · {g.code}</span>}
        <nav>
          <button className="orb small" aria-label={tx.howToPlay} title={tx.howToPlay} aria-expanded={rules} onClick={() => setRules(true)}>
            <BookOpen />
          </button>
          {g && (
            <button className="orb small" aria-label={copied ? tx.copied : tx.invite} title={copied ? tx.copied : tx.invite} onClick={copy}>
              <Link2 />
            </button>
          )}
          {g && g.host === g.me && g.phase === "playing" && (
            <button className="orb small" aria-label={g.paused ? tx.resume2 : tx.pause} onClick={() => void room.act({ type: "pause" })}>
              {g.paused ? <Play /> : <Pause />}
            </button>
          )}
          <button className="orb small" aria-label={tx.sound} aria-pressed={audio} onClick={toggleAudio}>
            {audio ? <Volume2 /> : <VolumeX />}
          </button>
          <div className="seg" role="group" aria-label={tx.language}>
            <button aria-pressed={lang === "fr"} onClick={() => setLang("fr")}>FR</button>
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          </div>
          {g && (
            <button className={"orb small" + (leaving ? " danger" : "")} aria-label={tx.leave} title={tx.leave} onClick={leave}>
              <LogOut />
            </button>
          )}
        </nav>
      </header>

      {room.loading ? (
        <main className="center-note"><div className="spinner" />{tx.loading}</main>
      ) : !g ? (
        <Home
          tx={tx}
          busy={room.busy}
          room={room.room}
          setRoom={room.setRoom}
          preview={room.preview}
          recent={room.recent}
          hasRecent={!!room.recent && room.hasSession(room.recent)}
          onEnter={(code, name, emblem) => void room.enter(code, { name, emblem })}
        />
      ) : g.phase === "lobby" ? (
        <Lobby game={g} tx={tx} busy={room.busy} act={room.act} copied={copied} onCopy={copy} />
      ) : (
        <>
          <Table game={g} tx={tx} lang={lang} act={room.act} busy={room.busy} cue={cue} />
          {g.phase === "finished" && <RoundEnd game={g} tx={tx} busy={room.busy} act={room.act} />}
          {g.paused && (
            <div className="paused-veil" role="status">
              <b>{tx.paused}</b>
              {g.pauseReason === "offline" && pausedBy && <span>{fmt(tx.pausedOffline, { name: pausedBy.name })}</span>}
            </div>
          )}
        </>
      )}

      {rules && <Rules tx={tx} game={g} busy={room.busy} act={room.act} onClose={() => setRules(false)} />}
      {room.lost && <div className="lost-note"><WifiOff size={16} /> {tx.connectionLost}</div>}
      {room.error && (
        <div className="error-note" role="alert" onClick={() => room.setError("")}>
          {errorText(room.error, lang)}
        </div>
      )}
    </div>
  );
}

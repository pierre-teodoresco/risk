"use client";
import ThemeToggle from "@/components/ThemeToggle";
// Grand Tour's screen: the top bar, then the entrance, the waiting room or the table.
import { useEffect, useState } from "react";
import { BookOpen, Flag, LayoutGrid, Link2, LogOut, Pause, Play, Volume2, VolumeX, WifiOff } from "lucide-react";
import { LANG_KEY, fmt } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import { gamePath } from "@/games/registry";
import { useRoom } from "@/platform/useRoom";
import type { PublicGame } from "../engine";
import { errorText, gtTexts } from "../i18n";
import { Home, Lobby, Rules } from "./Screens";
import Table from "./Table";
import { setSound, soundOn } from "./sound";

const PATH = gamePath("grand-tour");
const COPIED_MS = 2500;
const LEAVE_CONFIRM_MS = 3000;

export default function GrandTour() {
  const [lang, setLang] = useState<Lang>("fr"),
    [copied, setCopied] = useState(false),
    [leaving, setLeaving] = useState(false),
    [resigning, setResigning] = useState(false),
    [rules, setRules] = useState(false),
    [sound, setSoundState] = useState(true);
  const room = useRoom<PublicGame>("grand-tour", PATH);
  const tx = gtTexts(lang);
  const g = room.state;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "fr" || saved === "en") setLang(saved);
    } catch {}
    setSoundState(soundOn());
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
      await navigator.clipboard.writeText(`${location.origin}${PATH}?room=${g.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      room.setError("serverError");
    }
  }
  function resign() {
    if (!resigning) {
      setResigning(true);
      setTimeout(() => setResigning(false), LEAVE_CONFIRM_MS);
      return;
    }
    setResigning(false);
    void room.act({ type: "resign" });
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
    <div className="gt gt-tour">
      <header className="gt-top">
        <nav>
          <ThemeToggle lang={lang} />
          <a className="gt-orb" href="/" aria-label={tx.allGames} title={tx.allGames}><LayoutGrid /></a>
          <button className="gt-orb" aria-label={tx.howToPlay} title={tx.howToPlay} aria-expanded={rules} onClick={() => setRules(true)}><BookOpen /></button>
          {g && (
            <button className="gt-orb" aria-label={copied ? tx.copied : tx.invite} title={copied ? tx.copied : tx.invite} onClick={copy}><Link2 /></button>
          )}
          {g && g.host === g.me && g.phase === "playing" && (
            <button className="gt-orb" aria-label={g.paused ? tx.resume2 : tx.pause} title={g.paused ? tx.resume2 : tx.pause} onClick={() => void room.act({ type: "pause" })}>
              {g.paused ? <Play /> : <Pause />}
            </button>
          )}
          <button className="gt-orb" aria-label={sound ? tx.sound : tx.soundOff} title={sound ? tx.sound : tx.soundOff} aria-pressed={!sound} onClick={() => {
            setSound(!sound);
            setSoundState(!sound);
          }}>
            {sound ? <Volume2 /> : <VolumeX />}
          </button>
          <div className="gt-seg" role="group" aria-label={tx.language}>
            <button aria-pressed={lang === "fr"} onClick={() => setLang("fr")}>FR</button>
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          </div>
          {g && g.phase === "playing" && (() => {
            const me = g.players.find((p) => p.id === g.me);
            return me && !me.bankrupt && !me.left;
          })() && (
            <button className={"gt-orb" + (resigning ? " danger" : "")} aria-label={resigning ? tx.resignConfirm : tx.resign} title={resigning ? tx.resignConfirm : tx.resign} onClick={resign}>
              <Flag />
            </button>
          )}
          {g && (
            <button className={"gt-orb" + (leaving ? " danger" : "")} aria-label={leaving ? tx.leaveConfirm : tx.leave} title={leaving ? tx.leaveConfirm : tx.leave} onClick={leave}><LogOut /></button>
          )}
        </nav>
      </header>

      {room.loading ? (
        <main className="gt-loading" role="status">
          <span className="gt-loader" aria-hidden="true"><i /><i /></span>
          {tx.loading}
        </main>
      ) : !g ? (
        <Home
          tx={tx}
          lang={lang}
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
          <Table game={g} tx={tx} lang={lang} act={room.act} busy={room.busy} />
          {g.paused && (
            <div className="gt-veil soft" role="status">
              <div className="gt-dialog">
                <h2>{tx.paused}</h2>
                {g.pauseReason === "offline" && pausedBy && <p className="gt-hint">{fmt(tx.pausedOffline, { name: pausedBy.name })}</p>}
                {g.host === g.me && (
                  <button className="gt-btn go" disabled={room.busy} onClick={() => void room.act({ type: "pause" })}><Play size={18} /> {tx.resume2}</button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {rules && <Rules tx={tx} game={g} onClose={() => setRules(false)} />}
      {room.lost && <div className="gt-note lost"><WifiOff size={16} /> {tx.connectionLost}</div>}
      {room.error && (
        <div className="gt-note error" role="alert" onClick={() => room.setError("")}>{errorText(room.error, lang)}</div>
      )}
    </div>
  );
}

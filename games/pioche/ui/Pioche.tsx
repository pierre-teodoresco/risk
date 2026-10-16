"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { BookOpen, LayoutGrid, Link2, LogOut, Palette, Pause, Play, Volume2, VolumeX, WifiOff } from "lucide-react";
import { LANG_KEY, fmt } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import { gamePath } from "@/games/registry";
import { useRoom } from "@/platform/useRoom";
import type { PublicGame } from "../engine";
import { errorText, piocheTexts } from "../i18n";
import { CARD_HEX, CardDefs, SKINS, SkinContext, type Skin } from "./CardFace";
import Rules from "./Rules";
import { Home, Lobby, RoundEnd } from "./Screens";
import Table from "./Table";
import { setSoundEnabled, soundEnabled } from "@/lib/sound";
import { playCue, type Cue } from "./sound";

const PATH = gamePath("pioche");
const AUDIO_KEY = "pioche.audio";
/** Each player picks their own table; it changes nothing for the others. */
const SKIN_KEY = "pioche.skin";
const COPIED_MS = 2500;
const LEAVE_CONFIRM_MS = 3000;

export default function Pioche() {
  const [lang, setLang] = useState<Lang>("fr"),
    [audio, setAudio] = useState(false),
    [copied, setCopied] = useState(false),
    [leaving, setLeaving] = useState(false),
    [rules, setRules] = useState(false),
    [skin, setSkinState] = useState<Skin>("arcade");
  const room = useRoom<PublicGame>("pioche", PATH);
  const audioRef = useRef(false);
  const tx = piocheTexts(lang);
  const g = room.state;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "fr" || saved === "en") setLang(saved);
      // Sound stays off until the player turns it on.
      const on = soundEnabled(AUDIO_KEY, false);
      setAudio(on);
      audioRef.current = on;
      const savedSkin = localStorage.getItem(SKIN_KEY);
      if (SKINS.includes(savedSkin as Skin)) setSkinState(savedSkin as Skin);
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
    setSoundEnabled(next);
    if (next) playCue("select");
  }
  function setSkin(next: Skin) {
    setSkinState(next);
    try {
      localStorage.setItem(SKIN_KEY, next);
    } catch {}
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
    <SkinContext.Provider value={skin}>
    {/* The Arcade table glows in the colour to play; Bistrot keeps its wood whatever happens. */}
    <div className="pioche" data-skin={skin} style={{ "--play": g?.color ? CARD_HEX[g.color] : "#6a4cff" } as CSSProperties}>
      <CardDefs />
      <header className="pioche-top">
        {g && g.phase !== "lobby" && <span className="round-tag">{fmt(tx.round, { n: g.round })} · {g.code}</span>}
        <nav>
          <a className="orb small" href="/" aria-label={tx.allGames} title={tx.allGames}>
            <LayoutGrid />
          </a>
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
          <button
            className="orb small"
            aria-label={`${tx.skin} : ${tx.skins[skin]}`}
            title={`${tx.skin} : ${tx.skins[skin]}`}
            onClick={() => setSkin(SKINS[(SKINS.indexOf(skin) + 1) % SKINS.length])}
          >
            <Palette />
          </button>
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
        <main className="center-note pc-loading" role="status">
          <span className="pc-loader" aria-hidden="true"><i /><i /><i /></span>
          {tx.loading}
        </main>
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
        <Lobby game={g} tx={tx} busy={room.busy} act={room.act} copied={copied} onCopy={copy} skin={skin} onSkin={setSkin} />
      ) : (
        <>
          <Table game={g} tx={tx} lang={lang} act={room.act} busy={room.busy} cue={cue} />
          {g.phase === "finished" && <RoundEnd game={g} tx={tx} busy={room.busy} act={room.act} />}
          {g.paused && (
            <div className="paused-veil" role="status">
              <b>{tx.paused}</b>
              {g.pauseReason === "offline" && pausedBy && <span>{fmt(tx.pausedOffline, { name: pausedBy.name })}</span>}
              {g.host === g.me && (
                <button className="btn go" disabled={room.busy} onClick={() => void room.act({ type: "pause" })}>
                  <Play size={18} /> {tx.resume2}
                </button>
              )}
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
    </SkinContext.Provider>
  );
}

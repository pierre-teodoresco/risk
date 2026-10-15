"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownUp,
  BookOpen,
  Check,
  Clock,
  Copy,
  Crown,
  HelpCircle,
  LockKeyhole,
  LogOut,
  Send,
  Swords,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import Crest from "./Crest";
import GameScreen from "./GameScreen";
import type { BoardOptions, Lands } from "./board/engine";
import { COLORS, WORLD, type Lang } from "@/lib/world";
import { type PublicGame, type Action } from "@/lib/game";
import { texts, errorText } from "@/lib/i18n";

const Board3D = dynamic(() => import("./Board3D"), {
  ssr: false,
  loading: () => <div className="board3d" />,
});
type Preview = {
  code: string;
  phase: string;
  players: { name: string; color: number }[];
  timer: number;
};
const sessionKey = (code: string) => "mappa.session." + code;
function sound(kind = "click") {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator(),
      gain = ctx.createGain();
    o.connect(gain);
    gain.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(kind === "battle" ? 360 : 540, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      kind === "battle" ? 180 : 800,
      ctx.currentTime + 0.1,
    );
    gain.gain.setValueAtTime(0.045, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    o.start();
    o.stop(ctx.currentTime + 0.16);
    o.onended = () => void ctx.close();
  } catch {}
}
// Decorative board for the home page and the lobby: continents in player colours.
const DEMO_COLORS: Record<string, number> = { na: 0, sa: 3, eu: 4, af: 1, as: 2, oc: 5 };
const DEMO_LANDS: Lands = Object.fromEntries(
  WORLD.map((w, i) => [
    w.id,
    { color: DEMO_COLORS[w.continent], troops: 1 + ((i * 7 + 3) % 6) },
  ]),
);

export default function Mappa() {
  const [lang, setLang] = useState<Lang>("fr"),
    [game, setGame] = useState<PublicGame | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [room, setRoom] = useState(""),
    [name, setName] = useState(""),
    [color, setColor] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [lost, setLost] = useState(false),
    [loading, setLoading] = useState(true),
    [rules, setRules] = useState(false),
    [audio, setAudio] = useState(false),
    [copied, setCopied] = useState(false),
    [draft, setDraft] = useState(""),
    [now, setNow] = useState(Date.now()),
    [confirm, setConfirm] = useState<{ type: string; player?: string } | null>(
      null,
    ),
    [recent, setRecent] = useState("");
  const token = useRef(""),
    gameRef = useRef<PublicGame | null>(null),
    busyRef = useRef(false),
    audioRef = useRef(false),
    requestRunning = useRef(false);
  const t = texts(lang);
  const me = game?.players.find((p) => p.id === game.me);
  const isHost = game?.host === game?.me;
  const accept = useCallback((next: PublicGame) => {
    const old = gameRef.current;
    if (old && next.revision < old.revision) return;
    if (
      old &&
      audioRef.current &&
      (next.active !== old.active || next.lastBattle?.at !== old.lastBattle?.at)
    )
      sound(next.lastBattle?.at !== old.lastBattle?.at ? "battle" : "click");
    gameRef.current = next;
    setGame(next);
    setLost(false);
  }, []);
  const fetchState = useCallback(
    async (code: string, heartbeat = false) => {
      if (requestRunning.current) return;
      requestRunning.current = true;
      try {
        const res = await fetch("/api/rooms/" + code, {
          method: heartbeat ? "POST" : "GET",
          headers: {
            Authorization: "Bearer " + token.current,
            ...(heartbeat ? { "Content-Type": "application/json" } : {}),
          },
          ...(heartbeat ? { body: JSON.stringify({ type: "heartbeat" }) } : {}),
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        accept(data.game);
      } catch {
        setLost(true);
      } finally {
        requestRunning.current = false;
      }
    },
    [accept],
  );
  useEffect(() => {
    const savedLang = localStorage.getItem("mappa.lang");
    if (savedLang === "fr" || savedLang === "en") setLang(savedLang);
    // Sound stays off unless the player turned it on.
    if (localStorage.getItem("mappa.audio") === "on") {
      setAudio(true);
      audioRef.current = true;
    }
    setName(localStorage.getItem("mappa.name") ?? "");
    const code =
      new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
    setRoom(code);
    setRecent(localStorage.getItem("mappa.recent") ?? "");
    if (code) {
      const saved = localStorage.getItem(sessionKey(code));
      if (saved) {
        token.current = saved;
        fetchState(code, true).finally(() => setLoading(false));
      } else {
        fetch("/api/rooms/" + code)
          .then((r) => r.json())
          .then((d) => {
            if (d.error) setError(d.error);
            else {
              setPreview(d);
              const used = d.players.map((p: { color: number }) => p.color);
              setColor([0, 1, 2, 3, 4, 5].find((c) => !used.includes(c)) ?? 0);
            }
          })
          .catch(() => setError("serverError"))
          .finally(() => setLoading(false));
      }
    } else setLoading(false);
  }, [fetchState]);
  useEffect(() => {
    const it = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(it);
  }, []);
  useEffect(() => {
    if (!game) return;
    const code = game.code;
    const poll = setInterval(() => void fetchState(code, true), 10000);
    const focus = () => void fetchState(code, true);
    window.addEventListener("online", focus);
    window.addEventListener("focus", focus);
    let remove = () => {};
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (url && key) {
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const channel = supabase
        .channel("mappa:" + game.channel)
        .on("broadcast", { event: "change" }, () => void fetchState(code))
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void fetchState(code);
        });
      remove = () => {
        void supabase.removeChannel(channel);
      };
    }
    return () => {
      clearInterval(poll);
      window.removeEventListener("online", focus);
      window.removeEventListener("focus", focus);
      remove();
    };
  }, [game?.code, game?.channel, fetchState]);
  useEffect(() => {
    if (
      game?.deadline &&
      !game.paused &&
      now >= game.deadline &&
      now - game.deadline < 12000
    )
      void fetchState(game.code, true);
  }, [now, game?.deadline, game?.paused, game?.code, fetchState]);
  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("mappa.lang", lang);
  }, [lang]);
  useEffect(() => {
    if (!rules && !confirm) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRules(false);
        setConfirm(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rules, confirm]);
  async function enter(joining: boolean) {
    if (busyRef.current) return;
    if (joining && !/^[A-Z2-9]{6}$/.test(room)) {
      setError("emptyCode");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      let entryColor = color;
      if (joining) {
        const saved = localStorage.getItem(sessionKey(room));
        if (saved) {
          const restored = await fetch("/api/rooms/" + room, {
            headers: { Authorization: "Bearer " + saved },
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          });
          if (restored.ok) {
            const data = await restored.json();
            token.current = saved;
            accept(data.game);
            setPreview(null);
            history.replaceState(null, "", "?room=" + room);
            return;
          }
        }
        const response = await fetch("/api/rooms/" + room, {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        const details = await response.json();
        if (!response.ok) throw new Error(details.error);
        if (details.phase !== "lobby") throw new Error("alreadyStarted");
        setPreview(details);
        const used = new Set(
          details.players.map((p: { color: number }) => p.color),
        );
        if (used.has(entryColor)) {
          const available = [0, 1, 2, 3, 4, 5].find((c) => !used.has(c));
          if (available === undefined) throw new Error("roomFull");
          entryColor = available;
          setColor(entryColor);
        }
      }
      const res = await fetch(joining ? "/api/rooms/" + room : "/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "join", name, color: entryColor }),
        signal: AbortSignal.timeout(20000),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      token.current = d.token;
      localStorage.setItem(sessionKey(d.game.code), d.token);
      localStorage.setItem("mappa.name", name.trim());
      localStorage.setItem("mappa.recent", d.game.code);
      setRecent(d.game.code);
      setRoom(d.game.code);
      history.replaceState(null, "", "?room=" + d.game.code);
      accept(d.game);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "serverError");
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  /** Sends one command; resolves to true when the server accepted it. */
  async function act(action: Action) {
    const g = gameRef.current;
    if (!g || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/rooms/" + g.code, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token.current,
        },
        body: JSON.stringify({
          ...action,
          requestId: crypto.randomUUID(),
          revision: g.revision,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      accept(d.game);
      if (action.type === "message") setDraft("");
      if (action.type === "leave") {
        localStorage.removeItem(sessionKey(g.code));
        home();
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "serverError");
      return false;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  function home() {
    setGame(null);
    gameRef.current = null;
    setPreview(null);
    setError("");
    setRoom("");
    history.pushState(null, "", "/");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        location.origin + "/?room=" + game!.code,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("serverError");
    }
  }
  function changeAudio() {
    setAudio((v) => {
      audioRef.current = !v;
      localStorage.setItem("mappa.audio", v ? "off" : "on");
      return !v;
    });
  }
  const decorOptions: BoardOptions = useMemo(
    () => ({
      view: "players",
      unitMode: "army",
      showNames: false,
      interactive: false,
      selected: "",
      target: "",
      legal: [],
      legalTone: "attack",
      highlight: [],
      arrow: null,
      lang,
      pad: { top: 40, right: 40, bottom: 40, left: 40 },
    }),
    [lang],
  );
  const palette = (
    <div className="palette" role="group" aria-label={t.color}>
      {COLORS.map((c, i) => {
        const taken = (
          game
            ? game.players.filter((p) => p.id !== game.me)
            : (preview?.players ?? [])
        ).some((p) => p.color === i);
        return (
          <button
            type="button"
            key={c}
            aria-label={`${t.color} ${i + 1}`}
            aria-pressed={(game ? me?.color : color) === i}
            disabled={taken || busy}
            className="crest-choice"
            onClick={() => {
              setColor(i);
              if (game) void act({ type: "profile", color: i });
            }}
          >
            <Crest color={i} />
            {(game ? me?.color : color) === i && (
              <span className="crest-check">
                <Check size={14} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const overlays = (
    <>
      {error && (
        <div className="toast" role="alert">
          <HelpCircle size={16} />
          <span>
            {error === "emptyCode" ? t.emptyCode : errorText(error, lang)}
          </span>
          <button aria-label={t.close} onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {rules && (
        <div className="modal-backdrop" onClick={() => setRules(false)}>
          <section
            className="rules-modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rules-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="x"
              aria-label={t.close}
              onClick={() => setRules(false)}
              autoFocus
            >
              <X size={18} />
            </button>
            <span className="eyebrow">MAPPA · {t.rules}</span>
            <h2 id="rules-title">{t.rulesTitle}</h2>
            <p className="rules-intro">{t.rulesIntro}</p>
            {[
              ["00", t.setup, t.ruleSetup],
              ["01", t.reinforce, t.ruleReinforce],
              ["02", t.attack, t.ruleAttack],
              ["03", t.fortify, t.ruleFortify],
              ["✦", t.cards, t.ruleCards],
              [
                "↗",
                lang === "fr" ? "Élimination" : "Elimination",
                t.ruleElimination,
              ],
              ["◷", t.timer, t.ruleTimer],
              ["⌁", t.connection, t.ruleConnection],
            ].map(([n, title, body]) => (
              <div className="rule-section" key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </div>
            ))}
            <button className="btn go" onClick={() => setRules(false)}>
              {lang === "fr" ? "À la conquête" : "Let’s conquer"}
            </button>
          </section>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="confirm-modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <LogOut size={26} />
            <h2 id="confirm-title">
              {confirm.type === "leave" ? t.leave : t.kick}
            </h2>
            <p>{confirm.type === "leave" ? t.leaveConfirm : t.kickConfirm}</p>
            <div className="btns">
              <button
                className="btn ghost"
                onClick={() => setConfirm(null)}
                autoFocus
              >
                {t.cancel}
              </button>
              <button
                className="btn red"
                disabled={busy}
                onClick={() => {
                  void act(confirm);
                  setConfirm(null);
                }}
              >
                {t.confirm}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );

  if (game && game.phase !== "lobby")
    return (
      <>
        <GameScreen
          game={game}
          lang={lang}
          setLang={setLang}
          busy={busy}
          act={act}
          lost={lost}
          now={now}
          audio={audio}
          toggleAudio={changeAudio}
          copyInvite={copy}
          copied={copied}
          openRules={() => setRules(true)}
          onLeave={() => setConfirm({ type: "leave" })}
          onKick={(player) => setConfirm({ type: "kick", player })}
          onHome={home}
        />
        {overlays}
      </>
    );

  return (
    <div className="stage">
      <div className="stage-board">
        <Board3D
          lands={DEMO_LANDS}
          options={decorOptions}
          onSelect={() => {}}
          onHover={() => {}}
        />
      </div>
      <header className="topbar">
        <button className="brand" onClick={home} aria-label="Mappa">
          mappa<span>.</span>
        </button>
        <nav>
          <button className="orb small" aria-label={t.rules} onClick={() => setRules(true)}>
            <BookOpen />
          </button>
          <button
            className="orb small"
            aria-label={t.sound}
            aria-pressed={audio}
            onClick={changeAudio}
          >
            {audio ? <Volume2 /> : <VolumeX />}
          </button>
          <div className="seg">
            <button aria-pressed={lang === "fr"} onClick={() => setLang("fr")}>
              FR
            </button>
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>
              EN
            </button>
          </div>
        </nav>
      </header>

      {loading ? (
        <main className="center-note">
          <div className="spinner" />
          <p>{t.reconnect}</p>
        </main>
      ) : !game ? (
        <main className="home">
          <section className="hero">
            <div className="eyebrow">{t.private}</div>
            <h1 className="outlined">
              {t.hero1} <em>{t.hero2}</em>
            </h1>
            <p>{t.intro}</p>
            <ul className="hero-facts">
              <li><Users size={16} /> {t.players}</li>
              <li><Swords size={16} /> {t.strategy}</li>
              <li><Wifi size={16} /> {t.live}</li>
            </ul>
          </section>
          <aside className="panel entry">
            <h2>
              {preview
                ? lang === "fr"
                  ? "Votre table vous attend."
                  : "Your table awaits."
                : lang === "fr"
                  ? "On joue ?"
                  : "Shall we play?"}
            </h2>
            {preview && (
              <div className="preview-players">
                {preview.players.map((p) => (
                  <span key={p.color} title={p.name}>
                    <Crest color={p.color} size={30} />
                  </span>
                ))}
                <small>
                  {preview.players.length}/6 · {preview.code}
                </small>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enter(!!preview);
              }}
            >
              <label htmlFor="nickname">{t.nickname}</label>
              <input
                id="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                maxLength={20}
                required
                placeholder={t.nicknamePlaceholder}
                autoComplete="nickname"
              />
              <label>{t.color}</label>
              {palette}
              <button
                className="btn go wide"
                disabled={busy || name.trim().length < 2}
                type="submit"
              >
                {busy ? t.loading : preview ? t.join : t.create}
                <ArrowRight size={18} />
              </button>
            </form>
            <div className="sep">
              <span>{t.or}</span>
            </div>
            <form
              className="join"
              onSubmit={(e) => {
                e.preventDefault();
                void enter(true);
              }}
            >
              <input
                id="roomCode"
                placeholder="ABC123"
                maxLength={6}
                value={room}
                onChange={(e) => {
                  setRoom(
                    e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""),
                  );
                  setPreview(null);
                }}
                aria-label={t.code}
              />
              <button
                className="btn ghost"
                disabled={busy || room.length !== 6 || name.trim().length < 2}
              >
                {t.join}
                <ArrowUpRight size={16} />
              </button>
            </form>
            {recent && !!localStorage.getItem(sessionKey(recent)) && (
              <button
                className="restore"
                onClick={() => {
                  location.href = "/?room=" + recent;
                }}
              >
                <ArrowDownUp size={14} />
                {t.restore} · {recent}
              </button>
            )}
            <div className="note">
              <LockKeyhole size={12} />
              {t.privacy}
            </div>
          </aside>
        </main>
      ) : (
        <main className="lobby">
          <section className="panel lobby-card">
            <div className="lobby-head">
              <div>
                <div className="eyebrow">{t.privateRoom}</div>
                <h1>
                  {lang === "fr" ? "Une place pour chacun." : "A seat for everyone."}
                </h1>
              </div>
              <div className="lobby-actions">
                <button className="btn ghost" onClick={copy}>
                  <Copy size={16} /> {copied ? t.copied : t.invite}
                  <span className="code">{game.code}</span>
                </button>
                <button
                  className="orb small"
                  aria-label={t.leave}
                  onClick={() => setConfirm({ type: "leave" })}
                >
                  <LogOut />
                </button>
              </div>
            </div>
            {lost && (
              <div className="lost inline">
                <Wifi size={15} /> {t.connectionLost}
              </div>
            )}
            <div className="seat-grid">
              {Array.from({ length: 6 }, (_, i) => {
                const p = game.players[i];
                return p ? (
                  <div className={"lseat" + (p.ready ? " ready" : "")} key={p.id}>
                    <Crest color={p.color} size={52} />
                    <div>
                      <b>
                        {p.name}
                        {p.id === game.me && <small> · {t.you}</small>}
                      </b>
                      <span>
                        {p.id === game.host && <Crown size={12} />}{" "}
                        {p.id === game.host ? t.host : ""}
                        {p.id === game.host ? " · " : ""}
                        {p.ready ? t.isReady : t.notReadyYet}
                      </span>
                    </div>
                    {p.ready ? <Check className="ok" size={18} /> : <span className="dots">···</span>}
                    {isHost && p.id !== game.me && (
                      <button
                        className="x static"
                        aria-label={`${t.kick} ${p.name}`}
                        onClick={() => setConfirm({ type: "kick", player: p.id })}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="lseat empty" key={i}>
                    <span className="slot">{String(i + 1).padStart(2, "0")}</span>
                    <span>{t.openSeat}</span>
                  </div>
                );
              })}
            </div>
            <div className="lobby-foot">
              <div className="row">
                {t.color}
                {palette}
              </div>
              <div className="row">
                <span>
                  <Clock size={15} /> {t.timer}
                </span>
                <select
                  id="timer"
                  value={game.timer}
                  disabled={!isHost || busy}
                  onChange={(e) =>
                    void act({ type: "timer", minutes: Number(e.target.value) })
                  }
                >
                  {[0, 2, 3, 5].map((n) => (
                    <option key={n} value={n}>
                      {n ? `${n} ${t.minutes}` : t.noTimer}
                    </option>
                  ))}
                </select>
              </div>
              <div className="btns">
                <button
                  className={"btn " + (me?.ready ? "ghost" : "go")}
                  disabled={busy}
                  onClick={() => void act({ type: "ready" })}
                >
                  <Check size={16} />
                  {me?.ready ? t.notReady : t.ready}
                </button>
                {isHost && (
                  <button
                    className="btn red"
                    disabled={
                      busy ||
                      game.players.length < 3 ||
                      game.players.some((p) => !p.ready)
                    }
                    onClick={() => void act({ type: "start" })}
                  >
                    {t.start}
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
              <p className="note">
                {game.players.length < 3 ? t.needThree : t.allReady}
              </p>
            </div>
          </section>
          <section className="panel lobby-chat" aria-label={t.chat}>
            <h3>{t.chat}</h3>
            <div className="msgs">
              {game.messages
                .filter((m) => m.to === null)
                .map((m) => {
                  const from = game.players.find((p) => p.id === m.from);
                  return (
                    <div key={m.id} className={"msg" + (m.from === game.me ? " mine" : "")}>
                      <div className="msg-head">
                        {from && <Crest color={from.color} size={18} />}
                        <b>{from?.name}</b>
                      </div>
                      <p>{m.text}</p>
                    </div>
                  );
                })}
              {!game.messages.some((m) => m.to === null) && (
                <p className="empty">{t.noMessages}</p>
              )}
            </div>
            <form
              className="chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act({ type: "message", text: draft, to: null });
              }}
            >
              <input
                aria-label={t.message}
                placeholder={t.message}
                value={draft}
                maxLength={500}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="btn go" aria-label={t.send} disabled={busy || !draft.trim()}>
                <Send size={16} />
              </button>
            </form>
          </section>
        </main>
      )}
      {overlays}
    </div>
  );
}

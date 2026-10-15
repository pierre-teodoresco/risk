"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Flag,
  Globe2,
  HelpCircle,
  LockKeyhole,
  MessageCircle,
  Pause,
  Play,
  Send,
  Shield,
  Sparkles,
  Swords,
  Users,
  Volume2,
  VolumeX,
  X,
  LogOut,
  Crown,
  Wifi,
  BookOpen,
  ArrowDownUp,
  Layers,
  Compass,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import Board from "./Board";
import {
  BY_ID,
  WORLD,
  CONTINENTS,
  COLORS,
  EMBLEMS,
  type Lang,
} from "@/lib/world";
import { connected, validSet, type PublicGame, type Action } from "@/lib/game";
import { texts, errorText, eventText, type TextKey } from "@/lib/i18n";
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
    [audio, setAudio] = useState(true),
    [copied, setCopied] = useState(false),
    [selected, setSelected] = useState(""),
    [target, setTarget] = useState(""),
    // A fresh choice uses the current legal maximum; explicit values survive polling.
    [amount, setAmount] = useState<number | null>(null),
    [cards, setCards] = useState<string[]>([]),
    [showCards, setShowCards] = useState(false),
    [focusedCardTerritory, setFocusedCardTerritory] = useState(""),
    [highlightAllCards, setHighlightAllCards] = useState(false),
    [chat, setChat] = useState(false),
    [chatTab, setChatTab] = useState<"chat" | "journal">("chat"),
    [recipient, setRecipient] = useState(""),
    [draft, setDraft] = useState(""),
    [now, setNow] = useState(Date.now()),
    [confirm, setConfirm] = useState<{ type: string; player?: string } | null>(
      null,
    ),
    [recent, setRecent] = useState("");
  const token = useRef(""),
    gameRef = useRef<PublicGame | null>(null),
    busyRef = useRef(false),
    audioRef = useRef(true),
    chatEnd = useRef<HTMLDivElement>(null),
    mapColumn = useRef<HTMLDivElement>(null),
    requestRunning = useRef(false);
  const t = texts(lang);
  const me = game?.players.find((p) => p.id === game.me),
    active = game?.players.find((p) => p.id === game.active);
  const isHost = game?.host === game?.me,
    turn = game?.active === game?.me && !me?.eliminated;
  const phase = game?.phase;
  const hasActiveTurn =
    !!phase && phase !== "lobby" && phase !== "setup" && phase !== "finished";
  const canAct =
    !!game && !game.paused && !me?.eliminated && (turn || phase === "setup");
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
    const savedAudio = localStorage.getItem("mappa.audio");
    if (savedAudio === "off") {
      setAudio(false);
      audioRef.current = false;
    }
    setName(localStorage.getItem("mappa.name") ?? "");
    const code =
      new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
    setRoom(code);
    const last = localStorage.getItem("mappa.recent") ?? "";
    setRecent(last);
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
    setSelected("");
    setTarget("");
    setCards([]);
    setAmount(null);
  }, [phase, game?.active]);
  useEffect(() => {
    if (game?.pending) {
      setAmount(null);
      setSelected(game.pending.from);
      setTarget(game.pending.to);
    }
  }, [
    game?.pending?.from,
    game?.pending?.to,
    game?.pending?.min,
    game?.pending?.max,
  ]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [game?.messages.length, chat, recipient]);
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
  async function act(action: Action) {
    const g = gameRef.current;
    if (!g || busyRef.current) return;
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
      if (["next", "fortify", "move", "attack"].includes(action.type)) {
        setSelected("");
        setTarget("");
        setAmount(null);
        if (d.game.pending) {
          setSelected(d.game.pending.from);
          setTarget(d.game.pending.to);
        }
      }
      if (action.type === "deploy" || action.type === "trade") setAmount(null);
      if (action.type === "trade") setCards([]);
      if (action.type === "leave") {
        localStorage.removeItem(sessionKey(g.code));
        home();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "serverError");
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  function home() {
    setGame(null);
    gameRef.current = null;
    setPreview(null);
    setSelected("");
    setTarget("");
    setError("");
    setRoom("");
    setChat(false);
    setFocusedCardTerritory("");
    setHighlightAllCards(false);
    history.pushState(null, "", "/");
  }
  function selectLand(id: string) {
    if (!game) return;
    if (!canAct || game.pending) {
      setSelected(id);
      return;
    }
    setAmount(null);
    const own = game.lands[id].owner === game.me;
    if (phase === "setup" || phase === "reinforce" || me!.reserve > 0) {
      setSelected(id);
      setTarget("");
      return;
    }
    if (!selected || game.lands[selected]?.owner !== game.me) {
      setSelected(id);
      setTarget("");
    } else if (selected === id) {
      setSelected("");
      setTarget("");
    } else if (phase === "attack") {
      if (own) {
        setSelected(id);
        setTarget("");
      } else setTarget(id);
    } else if (phase === "fortify") {
      if (own && id !== selected) setTarget(id);
      else {
        setSelected(id);
        setTarget("");
      }
    }
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
  const land = selected ? game?.lands[selected] : null;
  const ownLand = land?.owner === game?.me;
  const max = game?.pending
    ? game.pending.max
    : phase === "setup" || phase === "reinforce" || (me?.reserve ?? 0) > 0
      ? (me?.reserve ?? 1)
      : Math.max(1, (land?.troops ?? 1) - 1);
  const min = game?.pending?.min ?? 1;
  const actualAmount = Math.max(min, Math.min(amount ?? max, max));
  const cardTerritories =
    me?.cards.flatMap((c) => (c.territory ? [c.territory] : [])) ?? [];
  const highlightedCardTerritories = highlightAllCards
    ? cardTerritories
    : cardTerritories.filter((id) => id === focusedCardTerritory);
  const selectedCards = me?.cards.filter((c) => cards.includes(c.id)) ?? [];
  const validCards = validSet(selectedCards);
  const canAttack =
    canAct &&
    ownLand &&
    !!target &&
    BY_ID[selected]?.neighbors.includes(target) &&
    game?.lands[target].owner !== game?.me &&
    (land?.troops ?? 0) > 1;
  const canFortify =
    canAct &&
    ownLand &&
    !!target &&
    game &&
    connected(game, selected, target, game.me) &&
    (land?.troops ?? 0) > 1;
  const remaining = game?.deadline
    ? Math.max(0, Math.ceil((game.deadline - now) / 1000))
    : null;
  const phaseText = phase ? t[phase as TextKey] : "";
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
            aria-pressed={color === i}
            disabled={taken || busy}
            className={"color-choice " + (color === i ? "chosen" : "")}
            style={{ background: c }}
            onClick={() => {
              setColor(i);
              if (game) void act({ type: "profile", color: i });
            }}
          >
            {color === i ? <Check size={16} /> : EMBLEMS[i]}
          </button>
        );
      })}
    </div>
  );
  return (
    <>
      <header className="site-header">
        <button className="brand" onClick={home} aria-label="Mappa — accueil">
          <span className="brand-icon">
            <Compass size={25} strokeWidth={1.3} />
          </span>
          <span>
            mappa<span className="brand-period">.</span>
          </span>
        </button>
        <div className="header-center">
          {game ? (
            <>
              <span className="header-room">
                <LockKeyhole size={12} />
                {game.code}
              </span>
              <span className="header-divider" />
              {phase === "lobby" ? (
                t.waiting
              ) : (
                <span>
                  {t.round} <b>{game.round.toString().padStart(2, "0")}</b>
                </span>
              )}
            </>
          ) : (
            <span className="header-motto">{t.tagline}</span>
          )}
        </div>
        <nav>
          <button
            className="text-button rules-link"
            onClick={() => setRules(true)}
          >
            <BookOpen size={15} />
            {t.rules}
          </button>
          <button
            className="icon-button audio-toggle"
            aria-label={t.sound}
            aria-pressed={audio}
            onClick={changeAudio}
          >
            {audio ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <div className="language">
            <button
              className={lang === "fr" ? "active" : ""}
              onClick={() => setLang("fr")}
            >
              FR
            </button>
            <button
              className={lang === "en" ? "active" : ""}
              onClick={() => setLang("en")}
            >
              EN
            </button>
          </div>
        </nav>
      </header>
      {loading ? (
        <main className="loading">
          <Compass className="spin" size={36} />
          <p>{t.reconnect}</p>
        </main>
      ) : !game ? (
        <main className="home-page">
          <section className="hero-heading">
            <div>
              <div className="eyebrow">
                <span className="status-dot" />
                {t.private}
              </div>
              <h1>
                {t.hero1} <em>{t.hero2}</em>
              </h1>
              <p>{t.intro}</p>
            </div>
            <div className="hero-stamp">
              <Globe2 size={20} strokeWidth={1.2} />
              <span>EST. 2026</span>
              <strong>PLAY TOGETHER</strong>
            </div>
          </section>
          <section className="home-main">
            <div className="home-atlas">
              <Board lang={lang} decorative />
              <div className="atlas-legend">
                {CONTINENTS.map((c) => (
                  <span key={c.id}>
                    <i style={{ background: c.color }} />
                    {c[lang]} <b>+{c.bonus}</b>
                  </span>
                ))}
              </div>
            </div>
            <aside className="entry-panel">
              <div className="entry-top">
                <span className="eyebrow">
                  {preview
                    ? t.privateRoom
                    : lang === "fr"
                      ? "PRENEZ PLACE"
                      : "TAKE A SEAT"}
                </span>
                <span className="entry-icon">✳</span>
              </div>
              <h2>
                {preview
                  ? lang === "fr"
                    ? "Votre table vous attend."
                    : "Your table awaits."
                  : lang === "fr"
                    ? "On joue ?"
                    : "Shall we play?"}
              </h2>
              <div className="entry-facts">
                <span>
                  <Users size={13} />
                  {t.players}
                </span>
                <span>
                  <Wifi size={13} />
                  {t.live}
                </span>
              </div>
              {preview && (
                <div className="preview-players">
                  {preview.players.map((p) => (
                    <span
                      key={p.color}
                      style={{ background: COLORS[p.color] }}
                      title={p.name}
                    >
                      {EMBLEMS[p.color]}
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
                <label className="color-label">{t.color}</label>
                {palette}
                <button
                  className="primary full"
                  disabled={busy || name.trim().length < 2}
                  type="submit"
                >
                  {busy ? t.loading : preview ? t.join : t.create}
                  <ArrowRight size={17} />
                </button>
              </form>
              <div className="entry-separator">
                <span>{t.or}</span>
              </div>
              <form
                className="join-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void enter(true);
                }}
              >
                <label className="sr-only" htmlFor="roomCode">
                  {t.code}
                </label>
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
                  className="secondary"
                  disabled={busy || room.length !== 6 || name.trim().length < 2}
                >
                  {t.join}
                  <ArrowUpRight size={15} />
                </button>
              </form>
              {recent && localStorageSafe(recent) && (
                <button
                  className="restore"
                  onClick={() => {
                    location.href = "/?room=" + recent;
                  }}
                >
                  <ArrowDownUp size={13} />
                  {t.restore} · {recent}
                </button>
              )}
              <div className="entry-note">
                <LockKeyhole size={11} />
                {t.privacy}
              </div>
            </aside>
          </section>
          <section className="feature-strip">
            {[
              [Swords, t.strategy, t.strategyText],
              [Users, t.friends, t.friendsText],
              [Clock, t.pace, t.paceText],
            ].map(([Icon, title, body], i) => {
              const I = Icon as typeof Swords;
              return (
                <div key={i} className="feature">
                  <span className="feature-number">0{i + 1}</span>
                  <I size={19} strokeWidth={1.3} />
                  <div>
                    <h3>{String(title)}</h3>
                    <p>{String(body)}</p>
                  </div>
                </div>
              );
            })}
          </section>
          <footer>
            <span>
              mappa. <span className="muted">© 2026</span>
            </span>
            <span>{t.footer}</span>
            <button onClick={() => setRules(true)}>
              {t.rules}
              <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      ) : (
        <main className="room-page">
          <div className="room-heading">
            <div>
              <div className="eyebrow">
                {phase === "lobby"
                  ? t.privateRoom
                  : game.paused
                    ? t.paused
                    : turn
                      ? t.yourTurn
                      : active?.name}
              </div>
              <h1>
                {phase === "lobby"
                  ? lang === "fr"
                    ? "Une place pour chacun."
                    : "A seat for everyone."
                  : phase === "finished"
                    ? t.victoryTitle
                    : t.classic}
                <span className="small-globe">✧</span>
              </h1>
            </div>
            <div className="room-actions">
              <button className="secondary invite" onClick={copy}>
                <Copy size={14} />
                {copied ? t.copied : t.invite}
                <span>{game.code}</span>
              </button>
              {phase !== "lobby" && phase !== "finished" && isHost && (
                <button
                  className="icon-button"
                  aria-label={game.paused ? t.resume : t.pause}
                  onClick={() => void act({ type: "pause" })}
                  disabled={busy}
                >
                  {game.paused ? <Play size={17} /> : <Pause size={17} />}
                </button>
              )}
              <button
                className="icon-button leave"
                aria-label={t.leave}
                onClick={() => setConfirm({ type: "leave" })}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
          {lost && (
            <div className="connection-alert" role="status">
              <Wifi size={15} />
              {t.connectionLost}
            </div>
          )}
          {phase !== "lobby" && phase !== "finished" && (
            <div className="phase-bar">
              <div className="phase-steps">
                {(["reinforce", "attack", "fortify"] as const).map((p, i) => (
                  <div key={p} className={phase === p ? "current" : ""}>
                    <span>{i + 1}</span>
                    {t[p]}
                    {i < 2 && <ChevronRight size={14} />}
                  </div>
                ))}
              </div>
              <div
                className={"turn-label " + (turn ? "my-turn" : "")}
                role="status"
                style={
                  {
                    "--player-color": active ? COLORS[active.color] : undefined,
                  } as CSSProperties
                }
              >
                <span
                  className="dot"
                  style={{ background: active ? COLORS[active.color] : "" }}
                />
                <span className="turn-status">
                  {game.paused
                    ? t.paused
                    : phase === "setup"
                      ? t.simultaneousSetup
                      : turn
                        ? t.yourTurn
                        : t.activePlayer}
                </span>
                {phase !== "setup" && <strong>{active?.name}</strong>}
                {remaining !== null && (
                  <span className={"timer " + (remaining < 30 ? "urgent" : "")}>
                    <Clock size={13} />
                    {Math.floor(remaining / 60)}:
                    {String(remaining % 60).padStart(2, "0")}
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="play-layout">
            <div className="play-map-column" ref={mapColumn}>
              <Board
                game={game}
                lang={lang}
                selected={selected}
                target={target}
                onSelect={phase === "lobby" ? undefined : selectLand}
                cardTerritories={cardTerritories}
                highlightedCardTerritories={highlightedCardTerritories}
                highlightAllCards={highlightAllCards}
                onToggleCards={() => {
                  setHighlightAllCards(!highlightAllCards);
                  setFocusedCardTerritory("");
                }}
                onClearCardHighlight={() => {
                  setFocusedCardTerritory("");
                  setHighlightAllCards(false);
                }}
              />
              <div className="empire-strip">
                {game.players.map((p) => {
                  const isPlaying = hasActiveTurn && p.id === game.active;
                  const territoryCount = Object.values(game.lands).filter(
                    (l) => l.owner === p.id,
                  ).length;
                  const armies = Object.values(game.lands)
                    .filter((l) => l.owner === p.id)
                    .reduce((a, l) => a + l.troops, 0);
                  return (
                    <div
                      key={p.id}
                      aria-current={isPlaying ? "true" : undefined}
                      style={
                        { "--player-color": COLORS[p.color] } as CSSProperties
                      }
                      className={
                        "empire " +
                        (isPlaying ? "active" : "") +
                        (p.eliminated ? " out" : "")
                      }
                    >
                      <span
                        className="empire-emblem"
                        style={{ background: COLORS[p.color] }}
                      >
                        {EMBLEMS[p.color]}
                      </span>
                      <div>
                        <b>
                          {p.name}
                          {p.id === game.me && <small> · {t.you}</small>}
                        </b>
                        {isPlaying && (
                          <span className="empire-playing">
                            {game.paused ? t.pauseLabel : t.playingNow}
                          </span>
                        )}
                        <span>
                          {phase === "lobby"
                            ? p.ready
                              ? t.isReady
                              : t.notReadyYet
                            : `${territoryCount} ${t.territories} · ${armies} ${t.armies}`}
                        </span>
                      </div>
                      {p.id === game.host && <Crown size={12} />}
                    </div>
                  );
                })}
              </div>
              <div className="map-footnote">
                <span>
                  <Flag size={12} />
                  {t.victoryGoal}
                </span>
                <button
                  onClick={() => {
                    setChatTab("journal");
                    setChat(true);
                  }}
                >
                  <Layers size={12} />
                  {t.journal}
                  <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
            <aside
              className={
                "game-panel " +
                (canAct && phase !== "lobby" && phase !== "finished"
                  ? "can-play"
                  : "")
              }
            >
              {phase === "lobby" ? (
                <>
                  <div className="panel-label">
                    <span className="eyebrow">
                      {lang === "fr" ? "LA TABLÉE" : "YOUR TABLE"}
                    </span>
                    <span>
                      {game.players.length}
                      <span className="muted"> / 6</span>
                    </span>
                  </div>
                  <h2>{t.waiting}</h2>
                  <div className="seat-list">
                    {Array.from({ length: 6 }, (_, i) => {
                      const p = game.players[i];
                      return p ? (
                        <div className="seat" key={p.id}>
                          <span
                            className="seat-avatar"
                            style={{ background: COLORS[p.color] }}
                          >
                            {EMBLEMS[p.color]}
                          </span>
                          <div>
                            <b>
                              {p.name}
                              {p.id === game.me && <small> · {t.you}</small>}
                            </b>
                            <span>
                              {p.id === game.host
                                ? t.host
                                : p.ready
                                  ? t.isReady
                                  : t.notReadyYet}
                            </span>
                          </div>
                          {p.ready ? (
                            <Check size={16} className="ready-check" />
                          ) : (
                            <span className="seat-wait">···</span>
                          )}
                          {isHost && p.id !== game.me && (
                            <button
                              className="mini-icon"
                              aria-label={`${t.kick} ${p.name}`}
                              onClick={() =>
                                setConfirm({ type: "kick", player: p.id })
                              }
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="seat empty" key={i}>
                          <span className="seat-avatar">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span>{t.openSeat}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="timer-setting">
                    <label htmlFor="timer">{t.timer}</label>
                    <select
                      id="timer"
                      value={game.timer}
                      disabled={!isHost || busy}
                      onChange={(e) =>
                        void act({
                          type: "timer",
                          minutes: Number(e.target.value),
                        })
                      }
                    >
                      {[0, 2, 3, 5].map((n) => (
                        <option key={n} value={n}>
                          {n ? `${n} ${t.minutes}` : t.noTimer}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className={
                      "secondary full ready-button " +
                      (me?.ready ? "is-ready" : "")
                    }
                    disabled={busy}
                    onClick={() => void act({ type: "ready" })}
                  >
                    <Check size={16} />
                    {me?.ready ? t.notReady : t.ready}
                  </button>
                  {isHost && (
                    <button
                      className="primary full"
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
                  <p className="panel-note">
                    {game.players.length < 3 ? t.needThree : t.allReady}
                  </p>
                </>
              ) : phase === "finished" ? (
                <div className="victory-panel">
                  <span
                    className="victory-emblem"
                    style={{
                      background:
                        COLORS[
                          game.players.find((p) => p.id === game.winner)
                            ?.color ?? 0
                        ],
                    }}
                  >
                    <Crown size={40} />
                  </span>
                  <h2>
                    {game.players.find((p) => p.id === game.winner)?.name ??
                      "Mappa"}
                  </h2>
                  <p>{t.victoryText}</p>
                  <button className="primary full" onClick={home}>
                    {t.newGame}
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="panel-label">
                    <span className="eyebrow">
                      {t.phase}{" "}
                      {phase === "setup"
                        ? "00"
                        : String(
                            ["reinforce", "attack", "fortify"].indexOf(
                              phase ?? "",
                            ) + 1,
                          ).padStart(2, "0")}
                    </span>
                    <span className="phase-symbol">
                      {phase === "attack" ? (
                        <Swords size={19} />
                      ) : phase === "fortify" ? (
                        <Shield size={19} />
                      ) : (
                        <Flag size={19} />
                      )}
                    </span>
                  </div>
                  <h2>{phaseText}</h2>
                  {game.paused ? (
                    <div className="pause-panel">
                      <Pause size={28} />
                      <h3>{t.paused}</h3>
                      <p>
                        {game.pauseReason === "offline"
                          ? t.offlinePause
                          : t.hostPause}
                      </p>
                      {isHost && (
                        <button
                          className="primary full"
                          disabled={busy}
                          onClick={() => void act({ type: "pause" })}
                        >
                          <Play size={15} />
                          {t.resume}
                        </button>
                      )}
                    </div>
                  ) : me?.eliminated ? (
                    <p className="panel-note">{t.eliminated}</p>
                  ) : !canAct ? (
                    <div className="waiting-panel">
                      <span className="orbit-dot" />
                      <p>
                        {active?.name}{" "}
                        {lang === "fr"
                          ? "prépare son prochain coup."
                          : "is planning their next move."}
                      </p>
                      <small>
                        {lang === "fr"
                          ? "Le monde peut attendre un instant."
                          : "The world can wait a moment."}
                      </small>
                    </div>
                  ) : (
                    <>
                      <p className="action-hint">
                        {game.pending
                          ? t.moveHint
                          : phase === "setup"
                            ? me!.reserve > 0
                              ? t.setupHint
                              : t.setupDone
                            : phase === "reinforce"
                              ? t.reinforceHint
                              : phase === "attack"
                                ? t.attackHint
                                : t.fortifyHint}
                      </p>
                      {(me!.reserve > 0 ||
                        phase === "setup" ||
                        phase === "reinforce") &&
                        !game.pending && (
                          <>
                            <div className="reserve-box">
                              <strong>
                                {me!.reserve.toString().padStart(2, "0")}
                              </strong>
                              <span>{t.reserve}</span>
                              <Flag size={27} strokeWidth={1} />
                            </div>
                            {me!.reserve > 0 &&
                              !(
                                phase === "reinforce" && me!.cards.length >= 5
                              ) &&
                              !game.forcedTrade && (
                                <>
                                  <div className="selected-land">
                                    <span className="micro">
                                      {t.territoryInfo}
                                    </span>
                                    <b>
                                      {selected
                                        ? BY_ID[selected][lang]
                                        : t.select}
                                    </b>
                                  </div>
                                  {ownLand && (
                                    <Amount
                                      min={1}
                                      max={me!.reserve}
                                      value={actualAmount}
                                      set={setAmount}
                                      lang={lang}
                                    />
                                  )}
                                  <button
                                    className="primary full"
                                    disabled={busy || !ownLand}
                                    onClick={() =>
                                      void act({
                                        type: "deploy",
                                        territory: selected,
                                        amount: actualAmount,
                                      })
                                    }
                                  >
                                    {t.place}
                                    <ArrowRight size={16} />
                                  </button>
                                  <button
                                    className="text-button auto-button"
                                    disabled={busy}
                                    onClick={() => void act({ type: "auto" })}
                                  >
                                    <Sparkles size={13} />
                                    {t.auto}
                                  </button>
                                </>
                              )}
                            {phase === "reinforce" &&
                              me!.reserve === 0 &&
                              me!.cards.length < 5 && (
                                <button
                                  className="primary full"
                                  disabled={busy}
                                  onClick={() => void act({ type: "next" })}
                                >
                                  {t.nextAttack}
                                  <ArrowRight size={16} />
                                </button>
                              )}
                          </>
                        )}
                      {game.pending ? (
                        <>
                          <div className="route-box">
                            <span>{BY_ID[game.pending.from][lang]}</span>
                            <ArrowRight size={14} />
                            <b>{BY_ID[game.pending.to][lang]}</b>
                          </div>
                          <Amount
                            min={min}
                            max={max}
                            value={actualAmount}
                            set={setAmount}
                            lang={lang}
                          />
                          <button
                            className="primary full"
                            disabled={busy}
                            onClick={() =>
                              void act({ type: "move", amount: actualAmount })
                            }
                          >
                            {t.move}
                            <ArrowRight size={16} />
                          </button>
                        </>
                      ) : phase === "attack" &&
                        me!.reserve === 0 &&
                        !game.forcedTrade ? (
                        <>
                          <div className="route-selection">
                            <div>
                              <span>{t.source}</span>
                              <b>
                                {selected ? BY_ID[selected][lang] : t.select}
                              </b>
                            </div>
                            <ArrowRight size={16} />
                            <div>
                              <span>{t.target}</span>
                              <b>{target ? BY_ID[target][lang] : t.select}</b>
                            </div>
                          </div>
                          <button
                            className="primary full blitz-button"
                            disabled={busy || !canAttack}
                            onClick={() =>
                              void act({
                                type: "attack",
                                from: selected,
                                to: target,
                              })
                            }
                          >
                            <Swords size={17} />
                            {t.blitz}
                            <span>↗</span>
                          </button>
                          <small className="blitz-note">{t.blitzHint}</small>
                          <button
                            className="secondary full"
                            disabled={busy}
                            onClick={() => void act({ type: "next" })}
                          >
                            {t.nextFortify}
                            <ChevronRight size={15} />
                          </button>
                        </>
                      ) : phase === "fortify" ? (
                        <>
                          <div className="route-selection">
                            <div>
                              <span>{t.source}</span>
                              <b>
                                {selected ? BY_ID[selected][lang] : t.select}
                              </b>
                            </div>
                            <ArrowRight size={16} />
                            <div>
                              <span>{t.target}</span>
                              <b>{target ? BY_ID[target][lang] : t.select}</b>
                            </div>
                          </div>
                          {ownLand && target && (
                            <Amount
                              min={1}
                              max={max}
                              value={actualAmount}
                              set={setAmount}
                              lang={lang}
                            />
                          )}
                          <button
                            className="primary full"
                            disabled={busy || !canFortify}
                            onClick={() =>
                              void act({
                                type: "fortify",
                                from: selected,
                                to: target,
                                amount: actualAmount,
                              })
                            }
                          >
                            {t.fortifyAction}
                            <Shield size={15} />
                          </button>
                          <button
                            className="secondary full"
                            disabled={busy}
                            onClick={() => void act({ type: "next" })}
                          >
                            {t.endTurn}
                            <ArrowRight size={15} />
                          </button>
                        </>
                      ) : null}
                      {((phase === "reinforce" && me!.cards.length >= 5) ||
                        game.forcedTrade) && (
                        <div className="mandatory">
                          <Layers size={16} />
                          {t.mustTradeHint}
                          <button onClick={() => setShowCards(true)}>
                            {t.cards}
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {game.lastBattle && (
                    <div
                      className={
                        "battle-result " +
                        (game.lastBattle.conquered ? "won" : "")
                      }
                    >
                      <span>
                        {game.lastBattle.conquered ? (
                          <Flag size={14} />
                        ) : (
                          <Shield size={14} />
                        )}
                        <b>
                          {game.lastBattle.conquered
                            ? t.battleWon
                            : t.battleLost}
                        </b>
                      </span>
                      <small>
                        {BY_ID[game.lastBattle.to][lang]} · {t.losses}{" "}
                        {game.lastBattle.attackerLoss} /{" "}
                        {game.lastBattle.defenderLoss}
                      </small>
                    </div>
                  )}
                  <button
                    className="cards-toggle"
                    aria-expanded={showCards}
                    aria-controls="player-cards"
                    onClick={() => setShowCards(!showCards)}
                  >
                    <span>
                      <Layers size={17} />
                      {t.cards}
                    </span>
                    <b>{me?.cards.length ?? 0}</b>
                    <ChevronRight
                      size={14}
                      className={showCards ? "rotated" : ""}
                    />
                  </button>
                  {showCards && (
                    <div className="cards-panel" id="player-cards">
                      <p>{t.cardMapHint}</p>
                      <p>{t.tradeHint}</p>
                      <div className="hand">
                        {me?.cards.map((c) => (
                          <button
                            key={c.id}
                            className={
                              "risk-card " +
                              (cards.includes(c.id) ? "chosen" : "")
                            }
                            aria-pressed={cards.includes(c.id)}
                            onClick={() => {
                              setFocusedCardTerritory(c.territory ?? "");
                              setHighlightAllCards(false);
                              if (
                                c.territory &&
                                window.matchMedia("(max-width: 950px)").matches
                              )
                                mapColumn.current?.scrollIntoView({
                                  block: "start",
                                });
                              setCards((prev) =>
                                prev.includes(c.id)
                                  ? prev.filter((id) => id !== c.id)
                                  : prev.length < 3
                                    ? [...prev, c.id]
                                    : prev,
                              );
                            }}
                          >
                            <span>{["♟", "♞", "♜", "✦"][c.symbol]}</span>
                            <small>
                              {c.territory ? BY_ID[c.territory][lang] : t.wild}
                            </small>
                          </button>
                        ))}
                      </div>
                      <button
                        className="secondary full"
                        disabled={
                          busy ||
                          !canAct ||
                          !validCards ||
                          (phase !== "reinforce" && !game.forcedTrade)
                        }
                        onClick={() => void act({ type: "trade", cards })}
                      >
                        {t.trade}
                      </button>
                      <small>
                        {t.tradeValue} : +
                        {game.exchange < 5
                          ? 4 + 2 * game.exchange
                          : game.exchange === 5
                            ? 15
                            : 15 + (game.exchange - 5) * 5}
                      </small>
                    </div>
                  )}
                  {isHost && (
                    <div className="host-controls">
                      {game.players
                        .filter(
                          (p) =>
                            p.id !== game.me &&
                            !p.eliminated &&
                            now - p.lastSeen >= 60000,
                        )
                        .map((p) => (
                          <button
                            key={p.id}
                            className="text-button"
                            onClick={() =>
                              setConfirm({ type: "kick", player: p.id })
                            }
                          >
                            <LogOut size={12} />
                            {t.kick} {p.name}
                          </button>
                        ))}
                    </div>
                  )}
                </>
              )}
              <button
                className="panel-chat"
                onClick={() => {
                  setChat(true);
                  setChatTab("chat");
                }}
              >
                <MessageCircle size={17} />
                <span>{t.chat}</span>
                <span className="chat-count">{game.messages.length}</span>
                <ArrowUpRight size={15} />
              </button>
            </aside>
          </div>
          {chat && (
            <section className="chat-drawer" aria-label={t.chat}>
              <div className="chat-header">
                <div className="chat-tabs">
                  <button
                    className={chatTab === "chat" ? "active" : ""}
                    onClick={() => setChatTab("chat")}
                  >
                    <MessageCircle size={14} />
                    {t.chat}
                  </button>
                  <button
                    className={chatTab === "journal" ? "active" : ""}
                    onClick={() => setChatTab("journal")}
                  >
                    {t.journal}
                  </button>
                </div>
                <button
                  className="icon-button"
                  aria-label={t.close}
                  onClick={() => setChat(false)}
                >
                  <X size={17} />
                </button>
              </div>
              {chatTab === "chat" ? (
                <>
                  <div className="chat-recipient">
                    <LockKeyhole size={12} />
                    <select
                      aria-label={t.privateTo}
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                    >
                      <option value="">{t.everyone}</option>
                      {game.players
                        .filter((p) => p.id !== game.me)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {t.privateTo} {p.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="chat-messages">
                    {game.messages
                      .filter((m) =>
                        recipient
                          ? (m.from === game.me && m.to === recipient) ||
                            (m.from === recipient && m.to === game.me)
                          : m.to === null,
                      )
                      .map((m) => {
                        const sender = game.players.find(
                          (p) => p.id === m.from,
                        );
                        return (
                          <div
                            key={m.id}
                            className={
                              "chat-message " +
                              (m.from === game.me ? "mine" : "")
                            }
                          >
                            <div>
                              <span
                                className="dot"
                                style={{
                                  background: COLORS[sender?.color ?? 0],
                                }}
                              />
                              <b>{sender?.name}</b>
                              {m.to && (
                                <span className="private-badge">
                                  <LockKeyhole size={9} />
                                  {t.privateMessage}
                                </span>
                              )}
                              <time>
                                {new Date(m.at).toLocaleTimeString(lang, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </time>
                            </div>
                            <p>{m.text}</p>
                          </div>
                        );
                      })}
                    {!game.messages.some((m) =>
                      recipient
                        ? m.to === recipient || m.from === recipient
                        : m.to === null,
                    ) && <p className="chat-empty">{t.noMessages}</p>}
                    <div ref={chatEnd} />
                  </div>
                  <form
                    className="chat-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act({
                        type: "message",
                        text: draft,
                        to: recipient || null,
                      });
                    }}
                  >
                    <input
                      aria-label={t.message}
                      placeholder={t.message}
                      value={draft}
                      maxLength={500}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <button
                      className="primary icon-button"
                      aria-label={t.send}
                      disabled={busy || !draft.trim()}
                    >
                      <Send size={17} />
                    </button>
                  </form>
                  <small className="chat-privacy">
                    {recipient ? t.chatNotice : t.chatLimit}
                  </small>
                </>
              ) : (
                <div className="chat-messages journal">
                  {[...game.logs].reverse().map((l) => (
                    <div className="journal-item" key={l.id}>
                      <span className="journal-dot" />
                      <p>{eventText(l.key, l.args, lang)}</p>
                      <time>
                        {new Date(l.at).toLocaleTimeString(lang, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  ))}
                  {!game.logs.length && (
                    <p className="chat-empty">{t.noEvents}</p>
                  )}
                </div>
              )}
            </section>
          )}
        </main>
      )}
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
            className="rules-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rules-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label={t.close}
              onClick={() => setRules(false)}
              autoFocus
            >
              <X size={20} />
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
            <button className="primary" onClick={() => setRules(false)}>
              {lang === "fr" ? "À la conquête" : "Let’s conquer"}
              <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <LogOut size={26} />
            <h2 id="confirm-title">
              {confirm.type === "leave" ? t.leave : t.kick}
            </h2>
            <p>{confirm.type === "leave" ? t.leaveConfirm : t.kickConfirm}</p>
            <div>
              <button
                className="secondary"
                onClick={() => setConfirm(null)}
                autoFocus
              >
                {t.cancel}
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  void act(confirm);
                  setConfirm(null);
                }}
              >
                {t.confirm}
                <ArrowRight size={14} />
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
function Amount({
  min,
  max,
  value,
  set,
  lang,
}: {
  min: number;
  max: number;
  value: number;
  set: (n: number) => void;
  lang: Lang;
}) {
  return (
    <div className="amount-control">
      <label htmlFor="armyAmount">
        {texts(lang).armies}
        <strong>{value}</strong>
      </label>
      <input
        id="armyAmount"
        aria-label={texts(lang).armies}
        type="range"
        min={min}
        max={Math.max(min, max)}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
      />
      <div>
        <span>{min}</span>
        <input
          aria-label={lang === "fr" ? "Nombre d’armées" : "Number of armies"}
          type="number"
          min={min}
          max={Math.max(min, max)}
          value={value}
          onChange={(e) =>
            set(Math.max(min, Math.min(max, Number(e.target.value))))
          }
        />
        <span>{max}</span>
      </div>
    </div>
  );
}
function localStorageSafe(code: string) {
  return (
    typeof window !== "undefined" && !!localStorage.getItem(sessionKey(code))
  );
}

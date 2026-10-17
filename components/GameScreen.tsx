"use client";
import ThemeToggle from "@/components/ThemeToggle";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BarChart3,
  BookOpen,
  Clock,
  Globe2,
  LockKeyhole,
  Flag,
  LogOut,
  MessageCircle,
  Pause,
  Play,
  Send,
  Settings,
  Tag,
  WifiOff,
  X,
  Crown,
  Handshake,
  Link2,
  ShieldOff,
  ScrollText,
} from "lucide-react";
import Crest from "./Crest";
import type { ContinentBadge } from "./Board3D";
import type { TroopChange } from "@/lib/game-feedback";
import type { Arrow, BoardOptions, Lands } from "./board/engine";
import { BY_ID, CONTINENTS, WORLD, type Lang } from "@/lib/world";
import { connected, validSet, type Action, type PublicGame } from "@/lib/game";
import { inConversation, unreadMessages } from "@/lib/chat-inbox";
import { blitzOdds } from "@/lib/odds";
import { gameName } from "@/games/registry";
import { eventText, fmt, hudTexts, texts } from "@/lib/i18n";

const Board3D = dynamic(() => import("./Board3D"), {
  ssr: false,
  loading: () => <div className="board3d" />,
});

type Props = {
  game: PublicGame;
  lang: Lang;
  setLang: (l: Lang) => void;
  busy: boolean;
  act: (action: Action) => Promise<boolean>;
  lost: boolean;
  now: number;
  audio: boolean;
  toggleAudio: () => void;
  palette: readonly string[];
  colorblind: boolean;
  toggleColorblind: () => void;
  copyInvite: () => void;
  copied: boolean;
  openRules: () => void;
  onLeave: () => void;
  onResign: () => void;
  onKick: (player: string) => void;
  onHome: () => void;
  troopChanges: TroopChange[];
};
const icons = ["/mappa/infantry.png", "/mappa/artillery.png", "/mappa/cavalry.png"];

type Panel = "settings" | "stats" | "cards" | null;
type Toast = { id: string; text: string; elimination?: boolean };

const pref = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem("mappa." + key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
};
const savePref = (key: string, v: unknown) => {
  try {
    localStorage.setItem("mappa." + key, JSON.stringify(v));
  } catch {}
};

export default function GameScreen(props: Props) {
  const { game, lang, busy, act, now } = props;
  const t = texts(lang), h = hudTexts(lang);
  const me = game.players.find((p) => p.id === game.me)!;
  const active = game.players.find((p) => p.id === game.active);
  const phase = game.phase;
  const isHost = game.host === game.me;
  const myTurn = game.active === game.me && !me.eliminated;
  const canAct = !game.paused && !me.eliminated && (myTurn || phase === "setup") && phase !== "finished";
  const colorOf = (id: string | null) => game.players.find((p) => p.id === id)?.color ?? null;
  const nameOf = (id: string | null) => game.players.find((p) => p.id === id)?.name ?? t.neutral;
  const land = (id: string) => game.lands[id] ?? { owner: null, troops: 0 };
  const allied = (a: string, b: string | null) => !!b && game.alliances.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const terrName = (id: string) => BY_ID[id]?.[lang] ?? id;

  // ---------- Local UI state ----------
  const autoTrigger = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState(""),
    [target, setTarget] = useState(""),
    [amount, setAmount] = useState<number | null>(null),
    [cards, setCards] = useState<string[]>([]),
    [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null),
    [panel, setPanel] = useState<Panel>(null),
    [seat, setSeat] = useState<string | null>(null),
    [chat, setChat] = useState(false),
    [chatTab, setChatTab] = useState<"chat" | "journal">("chat"),
    [recipient, setRecipient] = useState(""),
    [draft, setDraft] = useState(""),
    [view, setView] = useState<"players" | "continents">("players"),
    [showNames, setShowNames] = useState(false),
    [showBonus, setShowBonus] = useState(false),
    [unitMode, setUnitMode] = useState<"army" | "city">("army"),
    [closedCard, setClosedCard] = useState(""),
    [toasts, setToasts] = useState<Toast[]>([]),
    [pulse, setPulse] = useState<{ id: string; at: number } | null>(null),
    [readIds, setReadIds] = useState<string[]>(() => {
      const saved = pref<unknown>(`read.${game.code}.${game.me}`, []);
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
    }),
    [autoConfirm, setAutoConfirm] = useState(false),
    [compact, setCompact] = useState(false),
    [waterMotion, setWaterMotion] = useState(true),
    [deferredInvite, setDeferredInvite] = useState<string[]>([]),
    [narrow, setNarrow] = useState(false);

  useEffect(() => {
    setCompact(pref("compact", false));
    setWaterMotion(pref("waterMotion", true));
    setShowNames(pref("names", false));
    setShowBonus(pref("bonus", false));
    setUnitMode(pref("units", "army"));
    const mq = matchMedia("(max-width: 900px)");
    const onMq = () => setNarrow(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  // A new phase or a new active player starts from a clean selection.
  useEffect(() => {
    setSelected("");
    setTarget("");
    setAmount(null);
    setCards([]);
  }, [phase, game.active]);
  useEffect(() => {
    if (game.pending) {
      setSelected(game.pending.from);
      setTarget(game.pending.to);
      setAmount(null);
    }
  }, [game.pending?.from, game.pending?.to, game.pending?.min, game.pending?.max]);
  useEffect(() => {
    const markVisible = () => {
      if (!chat || chatTab !== "chat" || document.visibilityState !== "visible" || !document.hasFocus()) return;
      setReadIds((previous) => {
        const retained = new Set(game.messages.map((m) => m.id));
        const next = new Set(previous.filter((id) => retained.has(id)));
        for (const m of game.messages)
          if (inConversation(m, game.me, recipient)) next.add(m.id);
        const ids = [...next];
        if (ids.length === previous.length && ids.every((id, i) => id === previous[i])) return previous;
        savePref(`read.${game.code}.${game.me}`, ids);
        return ids;
      });
    };
    markVisible();
    window.addEventListener("focus", markVisible);
    document.addEventListener("visibilitychange", markVisible);
    return () => {
      window.removeEventListener("focus", markVisible);
      document.removeEventListener("visibilitychange", markVisible);
    };
  }, [chat, chatTab, recipient, game.messages, game.code, game.me]);
  useEffect(() => { setAutoConfirm(false); }, [phase, game.active, me.reserve]);
  useEffect(() => {
    if (!autoConfirm) return;
    const origin = autoTrigger.current;
    return () => { if (origin?.isConnected) origin.focus(); };
  }, [autoConfirm]);

  // ---------- Toasts from the journal, alliance answers ----------
  const lastLog = useRef(game.logs.at(-1)?.id ?? "");
  const pushToast = (text: string, elimination = false) => {
    const id = crypto.randomUUID();
    setToasts((x) => [...x.slice(-2), { id, text, elimination }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), elimination ? 6500 : 3800);
  };
  useEffect(() => {
    const i = game.logs.findIndex((l) => l.id === lastLog.current);
    const fresh = i >= 0 ? game.logs.slice(i + 1) : [];
    lastLog.current = game.logs.at(-1)?.id ?? "";
    // Your own turn start and placements are already visible on the board.
    for (const l of fresh)
      if (!((l.key === "turn" || l.key === "deployed") && l.args[0] === me.name))
        pushToast(eventText(l.key, l.args, lang), l.key === "eliminated");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.logs.at(-1)?.id]);
  const outgoingRef = useRef<string[]>([]);
  useEffect(() => {
    const out = game.proposals.filter((p) => p.from === game.me).map((p) => p.to);
    for (const id of outgoingRef.current)
      if (!out.includes(id) && !allied(game.me, id) && game.players.some((p) => p.id === id && !p.eliminated))
        pushToast(fmt(h.allyRefused, { name: nameOf(id) }));
    outgoingRef.current = out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.proposals.map((p) => p.from + p.to).join()]);
  const incoming = game.proposals.filter((p) => p.to === game.me).map((p) => p.from);
  const outgoing = game.proposals.filter((p) => p.from === game.me).map((p) => p.to);

  // ---------- Board data ----------
  const lands: Lands = useMemo(() => {
    const out: Lands = {};
    for (const w of WORLD) {
      const l = game.lands[w.id];
      out[w.id] = { color: l ? colorOf(l.owner) : null, troops: l?.troops ?? 0 };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.revision, game.code]);

  const reserve = me.reserve;
  const deploying = canAct && !game.pending && reserve > 0 && !game.forcedTrade && !(phase === "reinforce" && me.cards.length >= 5) && (phase === "setup" || phase === "reinforce" || phase === "attack");
  const attacking = canAct && phase === "attack" && !game.pending && reserve === 0 && !game.forcedTrade;
  const fortifying = canAct && phase === "fortify" && !game.pending;
  const selLand = selected ? land(selected) : null;
  const legal = useMemo(() => {
    if (!selected || selLand?.owner !== game.me) return [];
    if (attacking && selLand.troops > 1)
      return BY_ID[selected].neighbors.filter((n) => land(n).owner !== game.me);
    if (fortifying && selLand.troops > 1)
      return WORLD.map((w) => w.id).filter((id) => id !== selected && connected(game, selected, id, game.me));
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, attacking, fortifying, game.revision]);

  const arrow: Arrow = game.pending
    ? { from: game.pending.from, to: game.pending.to, ghost: false }
    : selected && target && (attacking || fortifying)
      ? { from: selected, to: target, ghost: false }
      : selected && hover && legal.includes(hover.id) && attacking
        ? { from: selected, to: hover.id, ghost: true }
        : null;
  const myCardLands = me.cards.flatMap((c) => (c.territory ? [c.territory] : []));
  const highlight = panel === "cards" ? (cards.length ? me.cards.filter((c) => cards.includes(c.id) && c.territory).map((c) => c.territory!) : myCardLands) : [];
  const pad = narrow ? { top: 150, right: 100, bottom: 210, left: 20 } : { top: 95, right: 170, bottom: 170, left: 100 };
  const options: BoardOptions = useMemo(
    // During the advance after a conquest the target is already ours: no red target tint.
    () => ({ view, unitMode, showNames, interactive: true, selected, target: game.pending ? "" : target, legal, legalTone: fortifying ? "move" : "attack", highlight, arrow, lang, pad, waterMotion, palette: props.palette, emblems: props.colorblind }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, unitMode, showNames, selected, target, !!game.pending, fortifying, legal.join(), highlight.join(), arrow?.from, arrow?.to, arrow?.ghost, lang, narrow, waterMotion, props.palette, props.colorblind],
  );
  const battle = game.lastBattle ? { ...game.lastBattle } : null;

  const badges: ContinentBadge[] | null =
    view === "continents" || showBonus
      ? CONTINENTS.map((c) => {
          const ts = WORLD.filter((w) => w.continent === c.id);
          const mine = ts.filter((w) => land(w.id).owner === game.me).length;
          const holder = game.players.find((p) => ts.every((w) => land(w.id).owner === p.id));
          const pct = Math.round((mine / ts.length) * 100);
          return {
            id: c.id,
            bonus: c.bonus,
            name: c[lang],
            detail: holder && holder.id !== game.me ? fmt(h.heldBy, { name: holder.name }) : `${mine}/${ts.length} (${pct} %)`,
            share: holder ? 100 : pct,
            ring: holder ? `var(--pc${holder.color})` : "#fff",
          };
        })
      : null;

  // ---------- Actions ----------
  const run = async (action: Action) => {
    const ok = await act(action);
    if (!ok) return false;
    if (["next", "fortify", "move", "attack"].includes(action.type)) {
      setSelected("");
      setTarget("");
      setAmount(null);
    }
    if (action.type === "deploy") {
      setPulse({ id: action.territory as string, at: Date.now() });
      setAmount(null);
    }
    if (action.type === "trade") {
      setCards([]);
      setAmount(null);
    }
    if (action.type === "fortify") setPulse({ id: action.to as string, at: Date.now() });
    return true;
  };

  function selectLand(id: string) {
    const l = land(id), own = l.owner === game.me;
    if (busy || game.pending) return;
    if (!canAct) {
      setSelected(id === selected ? "" : id);
      setTarget("");
      return;
    }
    setAmount(null);
    if (deploying) {
      setSelected(own ? id : "");
      setTarget("");
      if (!own) pushToast(h.deployOwnOnly);
      return;
    }
    if (attacking) {
      if (own) {
        setSelected(id === selected ? "" : id);
        setTarget("");
      } else if (legal.includes(id)) {
        // Betraying an ally always goes through the warning card, never a quick second click.
        if (target === id && !busy && !allied(game.me, l.owner)) void run({ type: "attack", from: selected, to: id });
        else setTarget(id);
      } else {
        setTarget("");
        if (selected) pushToast(h.notNeighbour);
        else setSelected(id);
      }
      return;
    }
    if (fortifying) {
      if (!own) return;
      if (!selected || id === selected) {
        setSelected(id === selected ? "" : id);
        setTarget("");
      } else if (legal.includes(id)) setTarget(id);
      else {
        setSelected(id);
        setTarget("");
      }
    }
  }

  // ---------- Context card ----------
  const remaining = game.deadline ? Math.max(0, Math.ceil((game.deadline - now) / 1000)) : null;
  const max = game.pending
    ? game.pending.max
    : deploying
      ? reserve
      : Math.max(1, (selLand?.troops ?? 1) - 1);
  const min = game.pending?.min ?? 1;
  const value = Math.max(min, Math.min(amount ?? max, max));
  const amountControl = (labelFrom: string, labelTo: string, from: number, to: number) => (
    <div className="move">
      <div className="side">
        <small>{labelFrom}</small>
        <b>{from}</b>
      </div>
      <div className="ctrl">
        <button className="step" aria-label={h.less} onClick={() => setAmount(Math.max(min, value - 1))} disabled={value <= min}>−</button>
        <input type="range" min={min} max={Math.max(min, max)} value={value} onChange={(e) => setAmount(Number(e.target.value))} aria-label={t.armies} />
        <button className="step" aria-label={h.more} onClick={() => setAmount(Math.min(max, value + 1))} disabled={value >= max}>+</button>
      </div>
      <div className="side">
        <small>{labelTo}</small>
        <b>{to}</b>
      </div>
    </div>
  );
  const quick = (
    <div className="quick">
      <button onClick={() => setAmount(min)}>{fmt(h.min, { n: min })}</button>
      <button onClick={() => setAmount(Math.max(min, Math.round((min + max) / 2)))}>{h.half}</button>
      <button onClick={() => setAmount(max)}>{fmt(h.max, { n: max })}</button>
    </div>
  );

  let cardKey = "", cardBody: React.ReactNode = null;
  const infoCard = (id: string) => {
    const l = land(id), owner = game.players.find((p) => p.id === l.owner);
    cardKey = "info:" + id;
    cardBody = (
      <div className="invite">
        {owner ? <Crest color={owner.color} size={52} /> : null}
        <div>
          <div className="eyebrow">{owner ? (owner.id === game.me ? h.yourTerritory : allied(game.me, owner.id) ? h.ally : h.enemyTerritory) : t.neutral}</div>
          <h2>{terrName(id)}</h2>
          <p>{fmt(l.troops > 1 ? h.heldWithN : h.heldWith1, { name: owner?.name ?? t.neutral, n: l.troops })}</p>
        </div>
      </div>
    );
  };
  const firstInvite = incoming.find((id) => !deferredInvite.includes(id));
  if (phase === "finished") {
    const winner = game.players.find((p) => p.id === game.winner);
    cardKey = "finished";
    cardBody = (
      <div className="victory">
        {winner && <Crest color={winner.color} size={84} />}
        <div className="eyebrow">{t.victoryTitle}</div>
        <h2>{winner?.name ?? gameName("mappa")}</h2>
        <p>{winner?.name} {t.victoryText}</p>
        <div className="btns"><button className="btn go" onClick={props.onHome}>{t.newGame}</button></div>
      </div>
    );
  } else if (firstInvite && !game.pending && !busy) {
    const p = game.players.find((x) => x.id === firstInvite)!;
    cardKey = "invite:" + firstInvite;
    cardBody = (
      <>
        <div className="invite">
          <Crest color={p.color} size={56} />
          <div>
            <div className="eyebrow">{h.allyProposal}</div>
            <h2>{fmt(h.proposes, { name: p.name })}</h2>
          </div>
        </div>
        <p>{h.allyRules}</p>
        <div className="btns">
          <button className="btn go" disabled={busy} onClick={() => run({ type: "allyAnswer", player: p.id, accept: true })}>{h.accept}</button>
          <button className="btn ghost" disabled={busy} onClick={() => run({ type: "allyAnswer", player: p.id, accept: false })}>{h.refuse}</button>
        </div>
        <button className="later" onClick={() => setDeferredInvite((x) => [...x, p.id])}>{h.later}</button>
      </>
    );
  } else if (game.paused) {
    cardKey = "paused";
    cardBody = (
      <>
        <div className="eyebrow">{h.pausedEyebrow}</div>
        <h2>{t.paused}</h2>
        <p>{game.pauseReason === "offline" ? t.offlinePause : t.hostPause}</p>
        {isHost && <div className="btns"><button className="btn go" disabled={busy} onClick={() => run({ type: "pause" })}><Play size={16} /> {t.resume}</button></div>}
      </>
    );
  } else if (me.eliminated) {
    cardKey = "eliminated";
    cardBody = (<><div className="eyebrow"><ShieldOff size={14} /> {t.eliminated}</div><h2>{t.defeatTitle}</h2><p>{t.defeatSpectator}</p></>);
  } else if (game.pending && myTurn) {
    const m = game.pending, total = land(m.from).troops;
    cardKey = "move:" + m.to;
    cardBody = (
      <>
        <div className="eyebrow">{t.battleWon}{game.lastBattle ? ` · ${t.losses} ${game.lastBattle.attackerLoss} / ${game.lastBattle.defenderLoss}` : ""}</div>
        <h2>{h.howMany}</h2>
        {amountControl(terrName(m.from), terrName(m.to), total - value, value)}
        {quick}
        <div className="btns"><button className="btn go" disabled={busy} onClick={() => run({ type: "move", amount: value })}>{fmt(value > 1 ? h.moveN : h.move1, { n: value })}</button></div>
      </>
    );
  } else if ((phase === "reinforce" && myTurn && me.cards.length >= 5) || (game.forcedTrade && myTurn)) {
    cardKey = "trade";
    cardBody = (
      <>
        <div className="eyebrow">{t.cards}</div>
        <h2>{t.mustTradeHint}</h2>
        <p>{t.tradeHint}</p>
        <div className="btns"><button className="btn go" onClick={() => setPanel("cards")}>{h.openCards}</button></div>
      </>
    );
  } else if (deploying) {
    cardKey = "deploy:" + selected;
    cardBody = selected && selLand?.owner === game.me ? (
      <>
        <div className="eyebrow">{phase === "setup" ? t.setup : t.reinforce} · {fmt(h.leftToPlace, { n: reserve })}</div>
        <h2>{terrName(selected)}</h2>
        {amountControl(h.reserveLabel, terrName(selected), reserve - value, selLand.troops + value)}
        {quick}
        <div className="btns">
          <button className="btn go" disabled={busy} onClick={() => run({ type: "deploy", territory: selected, amount: value })}>{fmt(value > 1 ? h.placeN : h.place1, { n: value })}</button>
          <button className="btn ghost auto-place" disabled={busy} onClick={(e) => { autoTrigger.current = e.currentTarget; setAutoConfirm(true); }}>{h.auto}</button>
        </div>
      </>
    ) : (
      <>
        <div className="eyebrow">{phase === "setup" ? t.setup : t.reinforce}</div>
        <h2>{fmt(reserve > 1 ? h.placeYourN : h.placeYour1, { n: reserve })}</h2>
        <p>{phase === "setup" ? t.setupHint : h.deployHint}</p>
        <div className="btns"><button className="btn ghost auto-place" disabled={busy} onClick={(e) => { autoTrigger.current = e.currentTarget; setAutoConfirm(true); }}>{h.auto}</button></div>
      </>
    );
  } else if (phase === "setup") {
    cardKey = "setupDone";
    cardBody = (<><div className="eyebrow">{t.setup}</div><h2>{h.waitOthers}</h2><p>{t.setupDone}</p></>);
  } else if (attacking) {
    if (selected && target) {
      const o = blitzOdds(land(selected).troops, land(target).troops);
      const tone = o.win >= 0.65 ? "good" : o.win >= 0.4 ? "mid" : "bad";
      const pct = o.win > 0.995 ? ">99" : o.win < 0.005 ? "<1" : String(Math.round(o.win * 100));
      const victim = land(target).owner;
      const betrayal = allied(game.me, victim);
      cardKey = `odds:${selected}:${target}`;
      cardBody = (
        <>
          <div className="eyebrow">{betrayal ? h.betrayal : h.forecast}</div>
          <h2>{terrName(selected)} → {terrName(target)}</h2>
          <div className={"odds " + tone}><b>{pct} %</b><span>{o.win >= 0.9 ? h.crushing : o.win >= 0.65 ? h.favourable : o.win >= 0.4 ? h.close : o.win >= 0.15 ? h.risky : h.suicidal}</span></div>
          <div className="odds-bar"><i style={{ width: `${o.win * 100}%` }} /></div>
          <p>{fmt(h.oddsDetail, { a: land(selected).troops, d: land(target).troops, la: o.attackerLoss.toFixed(1), ld: o.defenderLoss.toFixed(1), name: nameOf(land(target).owner) })}{o.win > 0.005 ? " " + fmt(h.oddsLeft, { n: o.survivors.toFixed(1) }) : ""}</p>
          {betrayal && <p className="betrayal-warning" role="alert">{fmt(h.betrayalWarning, { name: nameOf(victim) })}</p>}
          <div className="btns">
            <button className="btn red" disabled={busy} onClick={() => run({ type: "attack", from: selected, to: target })}>{betrayal ? h.betray : t.blitz}</button>
            <button className="btn ghost" onClick={() => setTarget("")}>{t.cancel}</button>
          </div>
        </>
      );
    } else if (selected && selLand?.owner === game.me) {
      cardKey = "base:" + selected;
      cardBody = (
        <>
          <div className="eyebrow">{h.baseChosen}</div>
          <h2>{terrName(selected)} · {selLand.troops} {t.armies}</h2>
          <p>{selLand.troops < 2 ? h.needTwo : legal.length ? fmt(h.targets, { list: legal.map(terrName).join(", ") }) : h.noTargets}</p>
        </>
      );
    } else if (selected) {
      infoCard(selected);
    } else {
      cardKey = "attackIdle";
      cardBody = (<><div className="eyebrow">{fmt(h.roundPhase, { n: game.round, phase: h.phaseAttack })}</div><h2>{h.chooseBase}</h2><p>{h.attackHelp}</p></>);
    }
  } else if (fortifying) {
    if (selected && target) {
      cardKey = `fortify:${selected}:${target}`;
      cardBody = (
        <>
          <div className="eyebrow">{h.phaseFortify}</div>
          <h2>{terrName(selected)} → {terrName(target)}</h2>
          {amountControl(terrName(selected), terrName(target), land(selected).troops - value, land(target).troops + value)}
          {quick}
          <div className="btns"><button className="btn go" disabled={busy} onClick={() => run({ type: "fortify", from: selected, to: target, amount: value })}>{t.fortifyAction}</button></div>
        </>
      );
    } else {
      cardKey = "fortifyIdle:" + selected;
      cardBody = (<><div className="eyebrow">{fmt(h.roundPhase, { n: game.round, phase: h.phaseFortify })}</div><h2>{selected ? terrName(selected) : h.fortifyTitle}</h2><p>{selected ? (legal.length ? h.fortifyPickTarget : h.fortifyNoTarget) : t.fortifyHint}</p></>);
    }
  } else if (phase === "reinforce" && myTurn) {
    cardKey = "reinforceDone";
    cardBody = (<><div className="eyebrow">{t.reinforce}</div><h2>{h.allPlaced}</h2><p>{h.goAttack}</p></>);
  } else if (selected && !canAct) {
    infoCard(selected);
  }

  // ---------- Turn bar ----------
  const phaseIndex = phase === "setup" ? 0 : phase === "reinforce" ? 0 : phase === "attack" ? 1 : 2;
  const phaseName = phase === "setup" ? h.phaseSetup : phase === "reinforce" ? h.phaseReinforce : phase === "attack" ? h.phaseAttack : phase === "fortify" ? h.phaseFortify : t.finished;
  const nextLabel = phase === "reinforce" ? h.toAttack : phase === "attack" ? h.toFortify : h.endTurn;
  const nextDisabled = !myTurn || busy || game.paused || !!game.pending || reserve > 0 || phase === "setup" || phase === "finished" || (phase === "reinforce" && me.cards.length >= 5) || game.forcedTrade;

  const unread = unreadMessages(game.messages, game.me, readIds);
  const privateUnread = unread.filter((m) => m.to === game.me);
  const latestPrivate = privateUnread.at(-1);
  const openConversation = (id: string) => {
    setRecipient(id);
    setChatTab("chat");
    setChat(true);
  };
  const mandatoryCard = !!game.pending && myTurn || cardKey === "trade";
  const showCard = !!cardBody && (mandatoryCard || closedCard !== cardKey);

  const togglePanel = (p: Panel) => setPanel(panel === p ? null : p);
  const stats = (id: string) => {
    const owned = WORLD.filter((w) => land(w.id).owner === id);
    return { terr: owned.length, armies: owned.reduce((s, w) => s + land(w.id).troops, 0) };
  };
  const reinforcementOf = (id: string) => {
    const n = stats(id).terr;
    return Math.max(3, Math.floor(n / 3)) + CONTINENTS.filter((c) => WORLD.filter((w) => w.continent === c.id).every((w) => land(w.id).owner === id)).reduce((s, c) => s + c.bonus, 0);
  };
  const heldBy = (id: string) => CONTINENTS.filter((c) => WORLD.filter((w) => w.continent === c.id).every((w) => land(w.id).owner === id));
  const seatPlayer = seat ? game.players.find((p) => p.id === seat) : null;
  const exchangeValue = game.exchange < 5 ? 4 + 2 * game.exchange : game.exchange === 5 ? 15 : 15 + (game.exchange - 5) * 5;
  const selectedCards = me.cards.filter((c) => cards.includes(c.id));
  const symbolIcon = (s: number) => (s === 3 ? null : icons[[0, 2, 1][s]]);

  const hoverLand = hover ? land(hover.id) : null;
  const hoverOdds = hover && attacking && selected && legal.includes(hover.id) ? blitzOdds(land(selected).troops, land(hover.id).troops).win : null;

  return (
    <div className={"game" + (compact ? " compact" : "")}>
      <Board3D
        lands={lands}
        options={options}
        battle={battle}
        pulse={pulse}
        badges={badges}
        changes={props.troopChanges}
        onSelect={selectLand}
        onHover={(id, x, y) => setHover(id ? { id, x, y } : null)}
      />

      {/* Orbs */}
      <div className="hud orbs">
        <button className="orb" aria-expanded={panel === "settings"} aria-label={h.settings} onClick={() => togglePanel("settings")}><Settings /></button>
        <button className="orb" aria-label={t.rules} onClick={props.openRules}><BookOpen /></button>
        <button className="orb" aria-pressed={view === "continents"} aria-label={h.continentView} onClick={() => setView(view === "continents" ? "players" : "continents")}><Globe2 /></button>
        <button className="orb" aria-pressed={showNames} aria-label={h.names} onClick={() => { setShowNames(!showNames); savePref("names", !showNames); }}><Tag /></button>
        <button className="orb" aria-pressed={chat} aria-label={unread.length ? fmt(h.unreadMessages, { n: unread.length }) : t.chat} onClick={() => { setChat(!chat); setChatTab("chat"); }}>
          <MessageCircle />
          {unread.length > 0 && <span className="orb-badge">{unread.length}</span>}
        </button>
        <ThemeToggle lang={lang} />
      </div>
      <button className="hud journal-shortcut" aria-expanded={chat && chatTab === "journal"} onClick={() => { setChat(true); setChatTab("journal"); }}><ScrollText size={17} /> {t.journal}</button>
      {latestPrivate && (
        <button className="hud message-alert" onClick={() => openConversation(latestPrivate.from)}>
          <MessageCircle size={18} aria-hidden="true" />
          <span role="status">{fmt(h.newPrivateMessage, { name: nameOf(latestPrivate.from), n: privateUnread.length })}</span>
        </button>
      )}
      {props.lost && <div className="hud lost"><WifiOff size={16} /> {t.connectionLost}</div>}

      {panel === "settings" && (
        <section className="hud panel drop" aria-label={h.settings}>
          <button className="x" aria-label={t.close} onClick={() => setPanel(null)}><X /></button>
          <h3>{h.settings}</h3>
          <div className="row">{h.interfaceSize}<div className="seg" role="group" aria-label={h.interfaceSize}>
            <button aria-pressed={!compact} onClick={() => { setCompact(false); savePref("compact", false); }}>{h.sizeNormal}</button>
            <button aria-pressed={compact} onClick={() => { setCompact(true); savePref("compact", true); }}>{h.sizeCompact}</button>
          </div></div>
          <div className="row">{h.waterAnimation}<button className="switch" aria-pressed={waterMotion} aria-label={h.waterAnimation} onClick={() => { setWaterMotion(!waterMotion); savePref("waterMotion", !waterMotion); }} /></div>
          <div className="row">{h.armiesLook}<div className="seg">
            <button aria-pressed={unitMode === "army"} onClick={() => { setUnitMode("army"); savePref("units", "army"); }}>{h.soldiers}</button>
            <button aria-pressed={unitMode === "city"} onClick={() => { setUnitMode("city"); savePref("units", "city"); }}>{h.cities}</button>
          </div></div>
          <div className="row">{h.bonusOnMap}<button className="switch" aria-pressed={showBonus} aria-label={h.bonusOnMap} onClick={() => { setShowBonus(!showBonus); savePref("bonus", !showBonus); }} /></div>
          <div className="row">{t.colorblind}<button className="switch" aria-pressed={props.colorblind} aria-label={t.colorblind} onClick={props.toggleColorblind} /></div>
          <div className="row">{t.sound}<button className="switch" aria-pressed={props.audio} aria-label={t.sound} onClick={props.toggleAudio} /></div>
          <div className="row">{h.language}<div className="seg">
            <button aria-pressed={lang === "fr"} onClick={() => props.setLang("fr")}>FR</button>
            <button aria-pressed={lang === "en"} onClick={() => props.setLang("en")}>EN</button>
          </div></div>
          <div className="row">{h.room} <span className="code"><LockKeyhole size={13} /> {game.code}</span></div>
          <button className="btn ghost wide" onClick={props.copyInvite}><Link2 size={16} /> {props.copied ? t.copied : t.invite}</button>
          {isHost && phase !== "finished" && (
            <button className="btn ghost wide" disabled={busy} onClick={() => run({ type: "pause" })}>{game.paused ? <Play size={16} /> : <Pause size={16} />} {game.paused ? t.resume : t.pause}</button>
          )}
          {!me.eliminated && phase !== "finished" && (
            <button className="btn ghost wide danger" disabled={busy} onClick={props.onResign}><Flag size={16} /> {t.resign}</button>
          )}
          <button className="btn ghost wide danger" onClick={props.onLeave}><LogOut size={16} /> {t.leave}</button>
        </section>
      )}

      {panel === "stats" && (
        <section className="hud panel drop low" aria-label={h.ranking}>
          <button className="x" aria-label={t.close} onClick={() => setPanel(null)}><X /></button>
          <h3>{h.ranking}</h3>
          {(() => {
            const rows = game.players.map((p) => ({ p, ...stats(p.id) })).sort((a, b) => b.terr - a.terr || b.armies - a.armies);
            const top = Math.max(1, ...rows.map((r) => r.armies));
            return rows.map((r, i) => (
              <div className="rank" key={r.p.id}>
                <span className="outlined">{i + 1}</span>
                <Crest color={r.p.color} size={34} />
                <div>
                  <div>{r.p.name}{r.p.id === game.me ? ` · ${t.you}` : ""}</div>
                  <div className="odds-bar thin"><i style={{ width: `${(r.armies / top) * 100}%`, background: `var(--pc${r.p.color})` }} /></div>
                </div>
                <small>{r.terr} {h.terrShort}<br />{r.armies} {t.armies}</small>
              </div>
            ));
          })()}
        </section>
      )}

      {panel === "cards" && (
        <section className="hud panel drop low cards-panel" aria-label={t.cards}>
          <button className="x" aria-label={t.close} onClick={() => setPanel(null)}><X /></button>
          <h3>{t.cards}</h3>
          <p>{me.cards.length ? t.tradeHint : h.noCards}</p>
          <div className="hand">
            {me.cards.map((c) => (
              <button key={c.id} className={"rcard" + (cards.includes(c.id) ? " chosen" : "") + (c.territory && land(c.territory).owner === game.me ? " owned" : "")} aria-pressed={cards.includes(c.id)}
                onClick={() => setCards((x) => (x.includes(c.id) ? x.filter((y) => y !== c.id) : x.length < 3 ? [...x, c.id] : x))}>
                {symbolIcon(c.symbol) ? <img src={symbolIcon(c.symbol)!} alt="" /> : <span className="wild">★</span>}
                <small>{c.territory ? terrName(c.territory) : t.wild}</small>
              </button>
            ))}
          </div>
          <small className="hint">{t.tradeValue}{lang === "fr" ? " : " : ": "}+{exchangeValue} · {t.landBonus}</small>
          <div className="btns">
            <button className="btn go" disabled={busy || !canAct || !validSet(selectedCards) || (phase !== "reinforce" && !game.forcedTrade)} onClick={() => run({ type: "trade", cards })}>{t.trade}</button>
          </div>
        </section>
      )}

      {/* Player medallions */}
      <aside className="hud seats" aria-label={h.players}>
        {game.players.map((p) => {
          const s = stats(p.id), offline = now - p.lastSeen >= 60000 && !p.eliminated;
          const isActive = p.id === game.active && phase !== "setup" && phase !== "finished";
          return (
            <div key={p.id} className={"seat" + (isActive ? " active" : "") + (p.eliminated ? " out" : "") + (offline ? " away" : "")} style={{ "--c": `var(--pc${p.color})` } as CSSProperties}>
              {incoming.includes(p.id) && <button className="bubble" onClick={() => { setDeferredInvite((x) => x.filter((y) => y !== p.id)); setClosedCard(""); }}>{h.allyBubble}</button>}
              <div className="stats">
                <span><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.5" /><path d="M8 21v-6l-1.5-4.5L12 9l5.5 1.5L16 15v6" /></svg>{s.armies}</span>
                <span><svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>{s.terr}</span>
              </div>
              <button className="medal" aria-label={fmt(h.seatOf, { name: p.name })} onClick={() => setSeat(seat === p.id ? null : p.id)}>
                <Crest color={p.color} />
              </button>
              {p.cardCount > 0 && <span className="cardnum">{p.cardCount}</span>}
              {allied(game.me, p.id) && <span className="ally-pin" title={h.ally}><Handshake size={14} /></span>}
              {p.id === game.host && <span className="host-pin" title={t.host}><Crown size={12} /></span>}
              {p.id === game.me && <span className="you">{h.youTag}</span>}
              {offline && <span className="you away-tag">{t.offline}</span>}
            </div>
          );
        })}
      </aside>

      {seatPlayer && (
        <section className="hud panel pop" style={{ "--c": `var(--pc${seatPlayer.color})` } as CSSProperties} aria-label={seatPlayer.name}>
          <button className="x" aria-label={t.close} onClick={() => setSeat(null)}><X /></button>
          <div className="who">
            <Crest color={seatPlayer.color} size={54} />
            <div>
              <h3>{seatPlayer.name}{seatPlayer.id === game.me ? ` (${t.you})` : ""}</h3>
              <small>{seatPlayer.eliminated ? t.eliminated : allied(game.me, seatPlayer.id) ? h.ally : seatPlayer.id === game.active ? t.playingNow : seatPlayer.id === game.me ? "" : h.opponent}</small>
            </div>
          </div>
          <div className="grid3">
            <div><b>{stats(seatPlayer.id).terr}</b><small>{h.terrShort}</small></div>
            <div><b>{stats(seatPlayer.id).armies}</b><small>{t.armies}</small></div>
            <div><b>+{reinforcementOf(seatPlayer.id)}</b><small>{h.reinforcements}</small></div>
          </div>
          {heldBy(seatPlayer.id).length > 0 && (
            <div className="badges">{heldBy(seatPlayer.id).map((c) => <span key={c.id} style={{ background: c.color }}>{c[lang]} +{c.bonus}</span>)}</div>
          )}
          {seatPlayer.id !== game.me && !seatPlayer.eliminated && !me.eliminated && phase !== "finished" && (
            <div className="btns col">
              {allied(game.me, seatPlayer.id) ? (
                <button className="btn red" disabled={busy} onClick={() => run({ type: "allyBreak", player: seatPlayer.id })}>{h.breakAlliance}</button>
              ) : incoming.includes(seatPlayer.id) ? (
                <div className="btns">
                  <button className="btn go" disabled={busy} onClick={() => run({ type: "allyAnswer", player: seatPlayer.id, accept: true })}>{h.accept}</button>
                  <button className="btn ghost" disabled={busy} onClick={() => run({ type: "allyAnswer", player: seatPlayer.id, accept: false })}>{h.refuse}</button>
                </div>
              ) : outgoing.includes(seatPlayer.id) ? (
                <button className="btn ghost" disabled={busy} onClick={() => run({ type: "allyCancel", player: seatPlayer.id })}>{h.cancelRequest}</button>
              ) : (
                <button className="btn go" disabled={busy} onClick={() => run({ type: "ally", player: seatPlayer.id }).then((ok) => ok && pushToast(fmt(h.requestSent, { name: seatPlayer.name })))}>{h.proposeAlliance}</button>
              )}
              {outgoing.includes(seatPlayer.id) && <p className="note">{h.waitingAnswer}</p>}
              <button className="btn ghost" onClick={() => { setRecipient(seatPlayer.id); setChatTab("chat"); setChat(true); setSeat(null); }}><MessageCircle size={16} /> {h.privateMessage}</button>
              {isHost && <button className="btn ghost danger" onClick={() => props.onKick(seatPlayer.id)}><LogOut size={16} /> {t.kick}</button>}
            </div>
          )}
        </section>
      )}

      {/* Bottom-left tiles */}
      <div className="hud tiles">
        <button className="tile" aria-label={h.ranking} aria-expanded={panel === "stats"} onClick={() => togglePanel("stats")}><BarChart3 /></button>
        <button className="tile" aria-label={t.cards} aria-expanded={panel === "cards"} onClick={() => togglePanel("cards")}><span className="deck">{me.cards.length}</span></button>
      </div>

      {/* Turn bar */}
      {phase !== "finished" && (
        <div className="hud turnbar">
          <div className="big-medal" style={{ "--c": `var(--pc${(phase === "setup" ? me : active ?? me).color})` } as CSSProperties}>
            <span className="turn-no">{game.round}</span>
            <Crest color={(phase === "setup" ? me : active ?? me).color} />
            <span className="count who-plays">{phase === "setup" ? h.everyone : myTurn ? h.youTag : active?.name}</span>
          </div>
          <div className="plate">
            <div className="phase-name outlined">{phaseName}</div>
            <div className="steps">{[0, 1, 2].map((i) => <i key={i} className={phase === "setup" ? "" : i < phaseIndex ? "done" : i === phaseIndex ? "on" : ""} />)}</div>
            {myTurn && phase !== "setup" ? (
              <button className="btn go" disabled={nextDisabled} onClick={() => run({ type: "next" })}>{nextLabel}</button>
            ) : (
              <div className="plate-note">{phase === "setup" ? (reserve > 0 ? fmt(h.leftToPlace, { n: reserve }) : h.waitOthers) : fmt(h.theirTurn, { name: active?.name ?? "" })}</div>
            )}
            {remaining !== null && !game.paused && (
              <span className={"clock" + (remaining < 30 ? " urgent" : "")}><Clock size={13} /> {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span>
            )}
          </div>
          <div className="big-medal" aria-label={reserve > 0 ? fmt(h.leftToPlace, { n: reserve }) : phaseName}>
            {icons.length > 0 && <img className="figure" src={icons[phaseIndex]} alt="" />}
            {reserve > 0 && <span className="count">{reserve}</span>}
          </div>
        </div>
      )}

      {/* Context card */}
      {showCard && (
        <div className="hud panel card" aria-live="polite">
          {!mandatoryCard && <button className="x" aria-label={t.close} onClick={() => setClosedCard(cardKey)}><X /></button>}
          <div className="card-body">{cardBody}</div>
        </div>
      )}

      {cardBody && !showCard && <button className="hud reopen-action" onClick={() => setClosedCard("")}>{h.showAction}</button>}
      {autoConfirm && deploying && (
        <div className="modal-backdrop" onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) setAutoConfirm(false);
          if (e.key === "Tab") {
            const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (buttons.length) {
              e.preventDefault();
              buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
            }
          }
        }}>
          <section className="panel confirm-modal auto-confirm" role="dialog" aria-modal="true" aria-labelledby="auto-title" aria-describedby="auto-description">
            <h2 id="auto-title">{h.auto}</h2>
            <p id="auto-description">{fmt(h.autoConfirm, { n: reserve })}</p>
            <div className="btns">
              <button className="btn ghost" autoFocus disabled={busy} onClick={() => setAutoConfirm(false)}>{t.cancel}</button>
              <button className="btn go" disabled={busy} onClick={async () => { if (await run({ type: "auto" })) setAutoConfirm(false); }}>{t.confirm}</button>
            </div>
          </section>
        </div>
      )}
      {/* Toasts */}
      <div className="hud toasts" aria-live="polite">
        {toasts.map((x) =>
          x.elimination ? (
            <div key={x.id} className="toast-chip elimination">
              <ShieldOff size={18} aria-hidden="true" />
              <span><b>{t.playerEliminated}</b>{x.text}</span>
            </div>
          ) : (
            <div key={x.id} className="toast-chip">{x.text}</div>
          ),
        )}
      </div>

      {/* Hover tooltip */}
      {hover && hoverLand && (
        <div className="tip panel" style={{ left: hover.x, top: hover.y }}>
          {terrName(hover.id)}
          <small>
            {fmt(hoverLand.troops > 1 ? h.heldWithN : h.heldWith1, { name: nameOf(hoverLand.owner), n: hoverLand.troops })}
            {allied(game.me, hoverLand.owner) ? ` · ${h.ally}` : ""}
            {hoverOdds !== null && <b> · {hoverOdds > 0.995 ? ">99" : Math.round(hoverOdds * 100)} % {h.toWin}</b>}
          </small>
        </div>
      )}

      {/* Chat drawer */}
      {chat && (
        <section className="hud panel chat" aria-label={t.chat}>
          <div className="chat-head">
            <div className="seg">
              <button aria-pressed={chatTab === "chat"} onClick={() => setChatTab("chat")}>{t.chat}</button>
              <button aria-pressed={chatTab === "journal"} onClick={() => setChatTab("journal")}>{t.journal}</button>
            </div>
            <button className="x static" aria-label={t.close} onClick={() => setChat(false)}><X /></button>
          </div>
          {chatTab === "chat" ? (
            <>
              <label className="to">
                <LockKeyhole size={13} />
                <select aria-label={t.privateTo} value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                  <option value="">{t.everyone}{unread.some((m) => m.to === null) ? ` (${unread.filter((m) => m.to === null).length})` : ""}</option>
                  {game.players.filter((p) => p.id !== game.me).map((p) => <option key={p.id} value={p.id}>{t.privateTo} {p.name}{unread.some((m) => m.from === p.id && m.to === game.me) ? ` (${unread.filter((m) => m.from === p.id && m.to === game.me).length})` : ""}</option>)}
                </select>
              </label>
              <div className="msgs">
                {game.messages
                  .filter((m) => inConversation(m, game.me, recipient))
                  .map((m) => {
                    const from = game.players.find((p) => p.id === m.from);
                    return (
                      <div key={m.id} className={"msg" + (m.from === game.me ? " mine" : "")}>
                        <div className="msg-head">
                          {from && <Crest color={from.color} size={18} />}
                          <b>{from?.name}</b>
                          {m.to && <span className="priv"><LockKeyhole size={10} /> {t.privateMessage}</span>}
                          <time>{new Date(m.at).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}</time>
                        </div>
                        <p>{m.text}</p>
                      </div>
                    );
                  })}
              </div>
              <form className="chat-form" onSubmit={async (e) => {
                e.preventDefault();
                if (await run({ type: "message", text: draft, to: recipient || null })) setDraft("");
              }}>
                <input aria-label={t.message} placeholder={t.message} value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} />
                <button className="btn go" aria-label={t.send} disabled={busy || !draft.trim()}><Send size={16} /></button>
              </form>
            </>
          ) : (
            <div className="msgs journal">
              {[...game.logs].reverse().map((l) => (
                <div key={l.id} className={"log" + (l.key === "eliminated" ? " out" : "")}>
                  <p>
                    {l.key === "eliminated" && <b><ShieldOff size={14} /> {t.playerEliminated}</b>}
                    {eventText(l.key, l.args, lang)}
                  </p>
                  <time>{new Date(l.at).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
              ))}
              {!game.logs.length && <p className="empty">{t.noEvents}</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

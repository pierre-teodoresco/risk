"use client";
// The rules booklet: one page per topic, with a small drawing each. Numbers come from the game
// constants, so the booklet follows any rebalancing without touching the texts.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { BASE_STATS, COLORS, FACTIONS, FACTION_IDS } from "../factions";
import { BASE_HP, BONUS_MAX, BONUS_PER_TILE, CAP, CRATE_EVERY, CRATE_KINDS, IGNORE_TICKS, TPS, captureRate } from "../sim";
import type { Lang } from "@/lib/world";
import { fill, type JeuTexts } from "../i18n";
import { Portrait } from "./Screens";

const INK = "#2b2118", BEIGE = "#f6e9c4", GRASS = "#8fd36a";
const iso = (x: number, y: number, s = 26) => [130 + (x - y) * s, 20 + (x + y) * s / 2] as const;
function Tile({ x, y, fill: color, dashed = false, s = 26 }: { x: number; y: number; fill: string; dashed?: boolean; s?: number }) {
  const p = [iso(x, y, s), iso(x + 1, y, s), iso(x + 1, y + 1, s), iso(x, y + 1, s)];
  return <path d={"M" + p.map(([a, b]) => `${a} ${b}`).join("L") + "Z"} fill={color} stroke={INK} strokeOpacity={dashed ? 1 : 0.25} strokeWidth={dashed ? 1.5 : 1} strokeDasharray={dashed ? "4 3" : undefined} />;
}
function Board({ n, color }: { n: number; color: (x: number, y: number) => string | null }) {
  const tiles: ReactNode[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) tiles.push(<Tile key={`${x}-${y}`} x={x} y={y} fill={color(x, y) ?? ((x + y) % 2 ? GRASS : BEIGE)} />);
  return <>{tiles}</>;
}
function Dude({ x, y, color, s = 26 }: { x: number; y: number; color: string; s?: number }) {
  const [a, b] = iso(x, y, s);
  return <g transform={`translate(${a} ${b})`}><ellipse rx="6" ry="3" fill="#000" opacity=".25" /><path d="M-5 0L-3-11H3L5 0Z" fill={color} stroke={INK} strokeWidth="1.2" /><circle cy="-14" r="4" fill="#f2d2b6" stroke={INK} strokeWidth="1.2" /></g>;
}
const Bubble = ({ x, y, text }: { x: number; y: number; text: string }) =>
  <text x={x} y={y} textAnchor="middle" fontSize="16" fontWeight="900" fill="#ffd600" stroke={INK} strokeWidth="3" paintOrder="stroke" fontFamily="'Comic Sans MS','Comic Neue',cursive">{text}</text>;

function Art({ kind }: { kind: string }) {
  const [R, B, Y, G] = COLORS;
  let body: ReactNode = null;
  if (kind === "goal") body = <Board n={5} color={(x, y) => (x < 1 && y < 1 ? R : x > 3 && y < 1 ? B : x > 3 && y > 3 ? Y : x < 1 && y > 3 ? G : null)} />;
  else if (kind === "board") body = <><Board n={5} color={() => null} /><Bubble x={130} y={150} text="?" /></>;
  else if (kind === "capture") body = <><Board n={5} color={(x, y) => (x === 2 && y === 2 ? R : null)} /><Dude x={2.3} y={2.5} color={R} /><Dude x={2.7} y={2.4} color={R} /><Dude x={2.5} y={2.8} color={R} /><Bubble x={130} y={30} text="⏳" /></>;
  else if (kind === "linked") body = <><Board n={5} color={(x, y) => (x === 0 && y === 0 ? "#b02020" : (x === y && x > 0 && x < 3) ? R : x === 4 && y === 0 ? "#f3a1a1" : null)} /><Tile x={4} y={0} fill="#f3a1a1" dashed /></>;
  else if (kind === "fight") body = <><Board n={5} color={() => null} /><Dude x={2} y={2.4} color={R} /><Dude x={2.6} y={2.1} color={B} /><Bubble x={130} y={70} text="PAF !" /></>;
  else if (kind === "base") body = <><Board n={5} color={(x, y) => (x < 2 && y < 2 ? "#b02020" : null)} /><g transform="translate(130 40)"><rect x="-18" y="-10" width="36" height="34" fill="#d6c6a0" stroke={INK} strokeWidth="1.5" /><path d="M-22-10L0-36L22-10Z" fill={R} stroke={INK} strokeWidth="1.5" /><path d="M0-36V-52L14-47L0-42" fill={R} stroke={INK} strokeWidth="1.5" /></g><Dude x={2.6} y={2.4} color={B} /><Bubble x={190} y={70} text="PIOU" /></>;
  else if (kind === "crates") body = <><Board n={5} color={() => null} /><g transform="translate(130 86)"><path d="M0-30L18-21L0-12L-18-21Z" fill="#e3a75a" stroke={INK} strokeWidth="1.5" /><path d="M-18-21L0-12V8L-18-1Z" fill="#c98a3d" stroke={INK} strokeWidth="1.5" /><path d="M18-21L0-12V8L18-1Z" fill="#a96f2a" stroke={INK} strokeWidth="1.5" /><text x="-9" y="0" fontSize="14" fontWeight="900" fill="#fff">?</text><path d="M-20-40A20 20 0 0 1 20-40Z" fill="#ff5d8f" stroke={INK} /><path d="M-20-40L0-30L20-40" fill="none" stroke={INK} /></g></>;
  else if (kind === "end") body = <><Board n={5} color={(x, y) => (x + y) % 2 ? null : x + y < 4 ? R : B} /><Bubble x={130} y={40} text="GG !" /></>;
  if (!body) return null;
  return <svg className="jo-booklet-art" viewBox="0 0 260 160" aria-hidden="true">{body}</svg>;
}

export default function Rules({ tx, lang, onClose }: { tx: JeuTexts; lang: Lang; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0);
  const b = tx.booklet, pages = b.pages, current = pages[page];
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = dialog.current!;
    el.showModal();
    return () => { el.close(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  const go = (n: number) => setPage(Math.max(0, Math.min(pages.length - 1, n)));
  const num = (v: number) => v.toLocaleString(lang, { maximumFractionDigits: 1 });
  const values = {
    capOne: num(CAP / captureRate(1) / TPS), capMin: num(CAP / captureRate(99) / TPS), spawn: num(BASE_STATS.spawn), speed: num(BASE_STATS.speed),
    hp: BASE_STATS.hp, damage: BASE_STATS.damage, bonus: num(BONUS_PER_TILE * 100), bonusMax: Math.round(BONUS_MAX * 100),
    ignore: num(IGNORE_TICKS / TPS), baseHp: BASE_HP.toLocaleString(lang), crate: Math.round(CRATE_EVERY / TPS),
  };
  const delta = (k: keyof typeof BASE_STATS, v: number) => {
    const base = BASE_STATS[k], pct = Math.round(((k === "spawn" ? base / v : v / base) - 1) * 100);
    return pct === 0 ? "=" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)} %`;
  };
  return <dialog className="jo-window jo-rules" ref={dialog} aria-labelledby="jo-rules-title"
    onCancel={(e) => { e.preventDefault(); onClose(); }}
    onKeyDown={(e) => { if (e.key === "ArrowRight") go(page + 1); else if (e.key === "ArrowLeft") go(page - 1); }}
    onClick={(e) => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div className="jo-titlebar"><span id="jo-rules-title">📖 {b.title}</span><button aria-label={tx.close} onClick={onClose} autoFocus><X size={16} /></button></div>
    <div className="jo-window-body jo-booklet">
      <p className="jo-booklet-cover">{b.cover}</p>
      <div className="jo-booklet-page" aria-live="polite">
        <h3><span>{page + 1}.</span> {current.title}</h3>
        <Art kind={current.art} />
        {current.body.map((line) => <p key={line}>{fill(line, values)}</p>)}
        {current.art === "crates" && <ul className="jo-booklet-list">{CRATE_KINDS.map((k) => <li key={k}><b>{tx.crates[k].name}</b> — {tx.crates[k].desc}</li>)}</ul>}
        {current.art === "factions" && <ul className="jo-booklet-factions">{FACTION_IDS.map((id, i) => <li key={id}>
          <Portrait faction={id} color={COLORS[i]} size={52} />
          <div><b>{tx.factions[id].name}</b> <small>· {tx.strength} : {tx.stats[FACTIONS[id].strength].toLowerCase()}</small><p>{tx.factions[id].desc}</p>
            <span className="jo-booklet-stats">{(Object.keys(BASE_STATS) as (keyof typeof BASE_STATS)[]).map((k) => <span key={k} className={FACTIONS[id].strength === k ? "is-strength" : ""}>{tx.stats[k]} {delta(k, FACTIONS[id].stats[k])}</span>)}</span></div>
        </li>)}</ul>}
        {current.art === "controls" && <>
          <dl className="jo-booklet-keys">{tx.keys.map(([k, d]) => <div key={k}><dt>{k}</dt><dd>{d}</dd></div>)}</dl>
          <p>{b.touchTitle}</p>
          <dl className="jo-booklet-keys">{b.touchKeys.map(([k, d]) => <div key={k}><dt>{k}</dt><dd>{d}</dd></div>)}</dl>
        </>}
      </div>
      <nav className="jo-booklet-nav" aria-label={b.title}>
        <button className="jo-chunky" onClick={() => go(page - 1)} disabled={page === 0} aria-label={b.prev}><ChevronLeft size={18} /></button>
        <span className="jo-booklet-dots">{pages.map((p, i) => <button key={p.title} aria-label={`${i + 1}. ${p.title}`} aria-current={i === page ? "step" : undefined} onClick={() => go(i)} />)}</span>
        {page < pages.length - 1
          ? <button className="jo-chunky is-primary" onClick={() => go(page + 1)} aria-label={b.next}><ChevronRight size={18} /></button>
          : <button className="jo-chunky is-primary" onClick={onClose}>{b.done}</button>}
      </nav>
      <p className="jo-muted jo-small jo-booklet-count">{fill(b.page, { n: page + 1, total: pages.length })}</p>
    </div>
  </dialog>;
}

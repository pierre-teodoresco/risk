"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Action } from "@/platform/contract";
import type { PublicGame } from "../engine";
import type { PokerTexts } from "../i18n";
import { Options } from "./Screens";
export default function Rules({ tx, game, busy, act, onClose }: { tx: PokerTexts; game: PublicGame | null; busy: boolean; act: (a: Action) => Promise<boolean>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = dialog.current!; el.showModal();
    return () => { el.close(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  return <dialog className="ui-panel pk-rules" ref={dialog} aria-labelledby="pk-rules-title" onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <button className="ui-icon-button pk-close" aria-label={tx.close} onClick={onClose} autoFocus><X /></button><span className="pk-eyebrow">TEXAS HOLD’EM</span><h2 id="pk-rules-title">{tx.ruleTitle}</h2><p>{tx.ruleIntro}</p>
    <ol className="pk-rule-sections">{tx.ruleSections.map(([title, body]) => <li key={title}><h3>{title}</h3><p>{body}</p></li>)}</ol>
    <ol className="pk-hand-ranking" reversed>{tx.categories.toReversed().map((c) => <li key={c}>{c}</li>)}</ol>
    {game && <><h3>{tx.rules}</h3><Options game={game} tx={tx} busy={busy} act={act} /></>}
    <button className="ui-button is-primary" onClick={onClose}>{tx.close}</button>
  </dialog>;
}

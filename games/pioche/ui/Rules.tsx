"use client";
// How-to-play panel, built like Mappa's: numbered sections, the special cards drawn as on the
// table, and the table options with their current state. The host may toggle them in the lobby.
import { useEffect } from "react";
import { X } from "lucide-react";
import type { Action } from "@/platform/contract";
import { TIMERS, type Card, type PublicGame } from "../engine";
import type { PiocheTexts } from "../i18n";
import { CardFace } from "./CardFace";

const SPECIALS: { card: Card; text: keyof PiocheTexts }[] = [
  { card: { id: "rules-skip", kind: "skip", color: "yellow", value: null }, text: "ruleSkip" },
  { card: { id: "rules-reverse", kind: "reverse", color: "blue", value: null }, text: "ruleReverse" },
  { card: { id: "rules-draw2", kind: "draw2", color: "green", value: null }, text: "ruleDraw2" },
  { card: { id: "rules-wild", kind: "wild", color: null, value: null }, text: "ruleWild" },
  { card: { id: "rules-draw4", kind: "draw4", color: null, value: null }, text: "ruleDraw4" },
];
const OPTIONS = [
  ["stacking", "stacking", "stackingHint"],
  ["drawUntilPlayable", "drawUntilPlayable", "drawUntilPlayableHint"],
  ["sevenZero", "sevenZero", "sevenZeroHint"],
  ["combos", "combos", "combosHint"],
] as const;

export default function Rules({ tx, game, busy, act, onClose }: {
  tx: PiocheTexts;
  /** The current table, if any: its options are shown, and editable by the host in the lobby. */
  game: PublicGame | null;
  busy: boolean;
  act: (a: Action) => Promise<boolean>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const editable = !!game && game.host === game.me && game.phase !== "playing";
  const sections: [string, string, string][] = [
    ["01", tx.ruleSetupTitle, tx.ruleSetup],
    ["02", tx.ruleMatchTitle, tx.ruleMatch],
    ["03", tx.ruleDrawTitle, tx.ruleDraw],
  ];
  const after: [string, string, string][] = [
    ["!", tx.ruleCallTitle, tx.ruleCall],
    ["★", tx.ruleEndTitle, tx.ruleEnd],
    ["◷", tx.ruleTimeTitle, tx.ruleTime],
  ];
  const section = ([n, title, body]: [string, string, string]) => (
    <div className="rule-section" key={n}>
      <span>{n}</span>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="rules-modal panel pioche-rules" role="dialog" aria-modal="true" aria-labelledby="pioche-rules-title" onClick={(e) => e.stopPropagation()}>
        <button className="x" aria-label={tx.close} onClick={onClose} autoFocus>
          <X size={18} />
        </button>
        <span className="eyebrow">PIOCHE · {tx.howToPlay}</span>
        <h2 id="pioche-rules-title">{tx.rulesTitle}</h2>
        <p className="rules-intro">{tx.rulesIntro}</p>
        {sections.map(section)}

        <div className="rule-section">
          <span>✦</span>
          <div>
            <h3>{tx.ruleSpecialTitle}</h3>
            <ul className="rule-cards">
              {SPECIALS.map(({ card, text }) => (
                <li key={card.id}>
                  <span className="rule-card" aria-hidden="true"><CardFace card={card} /></span>
                  <span>
                    <b>{tx.kinds[card.kind]}</b>
                    {tx[text] as string}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {after.map(section)}

        <div className="rule-section">
          <span>⚙</span>
          <div>
            <h3>{tx.optionsTitle}</h3>
            <p>{game?.phase === "playing" ? tx.optionsLocked : tx.optionsHostHint}</p>
            <ul className="rule-options">
              {OPTIONS.map(([key, title, hint]) => (
                <li key={key}>
                  <div>
                    <b>{tx[title]}</b>
                    <small>{tx[hint]}</small>
                    {key === "combos" && (
                      <ul className="rule-details">
                        {tx.combosRules.map((line) => <li key={line}>{line}</li>)}
                      </ul>
                    )}
                  </div>
                  {game ? (
                    <button
                      className="switch"
                      aria-pressed={game.options[key]}
                      aria-label={`${tx[title]} : ${game.options[key] ? tx.optionOn : tx.optionOff}`}
                      disabled={!editable || busy}
                      onClick={() => void act({ type: "options", [key]: !game.options[key] })}
                    />
                  ) : null}
                </li>
              ))}
              {game && (
                <li>
                  <div>
                    <b>{tx.timer}</b>
                  </div>
                  <div className="seg" role="group" aria-label={tx.timer}>
                    {TIMERS.map((t) => (
                      <button key={t} aria-pressed={game.options.timer === t} disabled={!editable || busy} onClick={() => void act({ type: "options", timer: t })}>
                        {t ? `${t} s` : tx.timerOff}
                      </button>
                    ))}
                  </div>
                </li>
              )}
            </ul>
          </div>
        </div>

        <button className="btn go" onClick={onClose}>{tx.rulesDone}</button>
      </section>
    </div>
  );
}

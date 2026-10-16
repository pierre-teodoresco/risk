"use client";
import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Clock, Users } from "lucide-react";
import { fmt, hallTexts, LANG_KEY } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import { GAMES, HUB_NAME, gamePath, type GameEntry } from "@/games/registry";
import { CardDefs, CardFace } from "@/games/pioche/ui/CardFace";
import type { Card } from "@/games/pioche/engine";

type HallTexts = ReturnType<typeof hallTexts>;
type Recent = { game: GameEntry; code: string };

const CODE_LENGTH = 6;
const LIVE = GAMES.filter((g) => g.status === "live");
const SOON = GAMES.filter((g) => g.status === "soon");

// Pioche shows its real cards rather than a drawing of them.
const HAND: Card[] = [
  { id: "a", kind: "number", color: "red", value: 7 },
  { id: "b", kind: "skip", color: "yellow", value: null },
  { id: "c", kind: "draw2", color: "green", value: null },
  { id: "d", kind: "reverse", color: "blue", value: null },
  { id: "e", kind: "draw4", color: null, value: null },
];
function PiocheVisual() {
  return (
    <svg className="poster-pioche" viewBox="0 0 320 200" aria-hidden="true">
      {HAND.map((card, i) => (
        <foreignObject key={card.id} x="128" y="38" width="64" height="96" transform={`rotate(${(i - 2) * 13} 160 250)`}>
          <CardFace card={card} />
        </foreignObject>
      ))}
    </svg>
  );
}

function Poster({ game, art, lang, h }: { game: GameEntry; art: ReactNode; lang: Lang; h: HallTexts }) {
  return (
    <a className="poster" href={gamePath(game.id)} style={{ "--accent": game.accent } as CSSProperties} title={game.pitch[lang]}>
      <span className={"poster-visual " + game.id}>{game.id === "pioche" ? <PiocheVisual /> : art}</span>
      <span className="poster-info">
        <span className="poster-text">
          <span className="poster-name">{game.name}</span>
          <span className="poster-tagline">{game.tagline[lang]}</span>
        </span>
        <span className="poster-meta">
          <span><Users size={14} aria-hidden="true" />{fmt(h.players, game.players)}</span>
          <span><Clock size={14} aria-hidden="true" />{fmt(h.minutes, game.minutes)}</span>
        </span>
        <span className="poster-play">{h.play}<ArrowRight size={16} aria-hidden="true" /></span>
      </span>
    </a>
  );
}

export default function Hub({ arts }: { arts: Record<string, ReactNode> }) {
  const [lang, setLang] = useState<Lang>("fr"),
    [code, setCode] = useState(""),
    [joining, setJoining] = useState(false),
    [notFound, setNotFound] = useState(false),
    [recent, setRecent] = useState<Recent[]>([]);
  const h = hallTexts(lang);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "fr" || saved === "en") setLang(saved);
      // A table counts as "yours" while this browser still holds its seat.
      setRecent(
        LIVE.flatMap((game) => {
          const c = localStorage.getItem(`${game.id}.recent`);
          return c && localStorage.getItem(`${game.id}.session.${c}`) ? [{ game, code: c }] : [];
        }),
      );
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  function changeLang(next: Lang) {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {}
  }

  // Room codes do not say which game they belong to: ask each live game until one knows it.
  async function join(e: FormEvent) {
    e.preventDefault();
    if (code.length !== CODE_LENGTH || joining) return;
    setJoining(true);
    setNotFound(false);
    for (const game of LIVE) {
      try {
        const res = await fetch(`/api/rooms/${code}?game=${game.id}`, { cache: "no-store" });
        if (res.ok) {
          location.href = `${gamePath(game.id)}?room=${code}`;
          return;
        }
      } catch {}
    }
    setJoining(false);
    setNotFound(true);
  }

  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? "");
  return (
    <div className="hall">
      <CardDefs />
      <header className="hall-top">
        <a className="hall-brand" href="/">{HUB_NAME}<span>.</span></a>
        <div className="seg" role="group" aria-label={h.language}>
          <button aria-pressed={lang === "fr"} onClick={() => changeLang("fr")}>FR</button>
          <button aria-pressed={lang === "en"} onClick={() => changeLang("en")}>EN</button>
        </div>
      </header>
      <main>
        <section className="hall-hero">
          <p className="hall-eyebrow">{h.eyebrow}</p>
          <h1>{h.titleStart}<em>{h.titleWord}</em>{h.titleEnd}</h1>
          <div className="hall-hero-side">
            <p className="hall-lead">{h.lead}</p>
            <form className="hall-join" onSubmit={join}>
              <label htmlFor="hall-code">{h.joinTitle}</label>
              <div className="hall-code">
                {/* One real input under six painted cells: typing, pasting and the keyboard all just work. */}
                <input
                  id="hall-code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH));
                    setNotFound(false);
                  }}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={CODE_LENGTH}
                  aria-describedby={notFound ? "hall-code-error" : undefined}
                />
                <span className="hall-tiles" aria-hidden="true">
                  {cells.map((c, i) => (
                    <span key={i} className={c ? "on" : i === code.length ? "caret" : ""}>{c}</span>
                  ))}
                </span>
                <button className="hall-join-go" disabled={code.length !== CODE_LENGTH || joining} aria-label={h.join}>
                  <ArrowRight size={20} />
                </button>
              </div>
              {notFound && <p id="hall-code-error" className="hall-error" role="alert">{h.notFound}</p>}
              {recent.length > 0 && (
                <div className="hall-recent">
                  <span>{h.yourTables}</span>
                  {recent.map((r) => (
                    <a key={r.game.id} href={`${gamePath(r.game.id)}?room=${r.code}`} style={{ "--accent": r.game.accent } as CSSProperties}>
                      <i aria-hidden="true" />{r.game.name} {r.code}<ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              )}
            </form>
          </div>
        </section>

        <section className="hall-shelf" aria-labelledby="hall-shelf-title">
          <h2 id="hall-shelf-title" className="hall-label">{h.shelf}</h2>
          <ul className="hall-posters">
            {LIVE.map((g) => (
              <li key={g.id}><Poster game={g} art={arts[g.id]} lang={lang} h={h} /></li>
            ))}
          </ul>
          <h3 className="hall-label">{h.soon}</h3>
          <ul className="hall-soon">
            {SOON.map((g) => (
              <li key={g.id} style={{ "--accent": g.accent } as CSSProperties} title={g.pitch[lang]}>
                <b>{g.name}</b>
                <span>{g.tagline[lang]}</span>
                <small>{fmt(h.players, g.players)}</small>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="hall-foot">
        <span className="hall-brand small">{HUB_NAME}<span>.</span></span>
        {h.footer}
      </footer>
    </div>
  );
}

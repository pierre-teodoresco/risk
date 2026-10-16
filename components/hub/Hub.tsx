"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Clock, Users } from "lucide-react";
import { fmt, hallTexts, LANG_KEY } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import { GAMES, HUB_NAME, gamePath, type GameEntry } from "@/games/registry";

type HallTexts = ReturnType<typeof hallTexts>;

function BoxBody({ game, art, lang, h }: { game: GameEntry; art: ReactNode; lang: Lang; h: HallTexts }) {
  return (
    <>
      <div className="box-lid">
        {art}
        <span className="box-name">{game.name}</span>
        {game.status === "soon" && <span className="box-ribbon">{h.soon}</span>}
      </div>
      <div className="box-label">
        <p className="box-tagline">{game.tagline[lang]}</p>
        <p className="box-pitch">{game.pitch[lang]}</p>
        <div className="box-meta">
          <span><Users size={15} aria-hidden="true" />{fmt(h.players, game.players)}</span>
          <span><Clock size={15} aria-hidden="true" />{fmt(h.minutes, game.minutes)}</span>
          {game.status === "live" && <span className="box-cta">{h.play}<ArrowRight size={15} aria-hidden="true" /></span>}
        </div>
      </div>
    </>
  );
}

function GameBox(props: { game: GameEntry; art: ReactNode; lang: Lang; h: HallTexts }) {
  const style = { "--accent": props.game.accent } as CSSProperties;
  return props.game.status === "live" ? (
    <a className="box live" href={gamePath(props.game.id)} style={style}>
      <BoxBody {...props} />
    </a>
  ) : (
    <article className="box soon" aria-disabled="true" style={style}>
      <BoxBody {...props} />
    </article>
  );
}

// Decorative game pieces floating beside the headline.
function TableProps() {
  return (
    <div className="hall-props" aria-hidden="true">
      <svg className="prop prop-die" viewBox="0 0 64 64">
        <rect x="4" y="4" width="56" height="56" rx="12" fill="#fff7e3" stroke="#1a1030" strokeWidth="4" />
        {[[20, 20], [44, 20], [32, 32], [20, 44], [44, 44]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="#1a1030" />)}
      </svg>
      <svg className="prop prop-card" viewBox="0 0 64 92">
        <rect x="3" y="3" width="58" height="86" rx="9" fill="#fff" stroke="#1a1030" strokeWidth="4" />
        <rect x="9" y="9" width="46" height="74" rx="6" fill="#e2483d" />
        <ellipse cx="32" cy="46" rx="15" ry="24" transform="rotate(28 32 46)" fill="#fff" />
        <text x="32" y="55" textAnchor="middle" fontFamily="Paytone One, sans-serif" fontSize="24" fill="#e2483d">+2</text>
      </svg>
      <svg className="prop prop-pawn" viewBox="0 0 64 80">
        <path d="M32 6a12 12 0 0 1 7 21.7L44 52h6a6 6 0 0 1 6 6v8H8v-8a6 6 0 0 1 6-6h6l5-24.3A12 12 0 0 1 32 6Z" fill="#ffd24d" stroke="#1a1030" strokeWidth="4" strokeLinejoin="round" />
      </svg>
      <svg className="prop prop-house" viewBox="0 0 64 64">
        <path d="M8 30 32 8l24 22v26H8Z" fill="#4cbb4f" stroke="#1a1030" strokeWidth="4" strokeLinejoin="round" />
        <rect x="26" y="38" width="12" height="18" fill="#1a1030" />
      </svg>
    </div>
  );
}

export default function Hub({ arts }: { arts: Record<string, ReactNode> }) {
  const [lang, setLang] = useState<Lang>("fr");
  const h = hallTexts(lang);
  const featured = GAMES.find((g) => g.status === "live");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "fr" || saved === "en") setLang(saved);
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

  return (
    <div className="hall">
      <header className="hall-top">
        <a className="hall-brand" href="/">{HUB_NAME}<span>.</span></a>
        <div className="seg" role="group" aria-label={h.language}>
          <button aria-pressed={lang === "fr"} onClick={() => changeLang("fr")}>FR</button>
          <button aria-pressed={lang === "en"} onClick={() => changeLang("en")}>EN</button>
        </div>
      </header>
      <main>
        <section className="hall-hero">
          <div className="hall-hero-text">
            <p className="eyebrow">{h.eyebrow}</p>
            <h1>{h.title}</h1>
            <p className="hall-lead">{h.lead}</p>
            {featured && (
              <a className="btn go hall-start" href={gamePath(featured.id)}>
                {h.play} · {featured.name}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            )}
          </div>
          <TableProps />
        </section>

        <section className="hall-shelf" aria-labelledby="hall-shelf-title">
          <div className="hall-section-head">
            <h2 id="hall-shelf-title">{h.shelf}</h2>
            <p>{fmt(h.shelfNote, { n: GAMES.filter((g) => g.status === "live").length })}</p>
          </div>
          <ul className="hall-boxes">
            {GAMES.map((g) => (
              <li key={g.id}>
                <GameBox game={g} art={arts[g.id]} lang={lang} h={h} />
              </li>
            ))}
          </ul>
        </section>

        <section className="hall-how" aria-labelledby="hall-how-title">
          <div className="hall-section-head">
            <h2 id="hall-how-title">{h.how}</h2>
          </div>
          <ol className="hall-steps">
            {[[h.step1, h.step1Text], [h.step2, h.step2Text], [h.step3, h.step3Text]].map(([title, text]) => (
              <li key={title}>
                <b>{title}</b>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer className="hall-foot">
        <span className="hall-brand small">{HUB_NAME}<span>.</span></span>
        {h.footer}
      </footer>
    </div>
  );
}

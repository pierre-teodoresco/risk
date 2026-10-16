// Card artwork in one 100×150 coordinate space, so shared gradients and clips are defined once.
// Two decks share the layout: "arcade" (chunky toy cards, ink outlines) and "bistrot" (printed
// cards on paper). The deck follows the table the player picked, through SkinContext.
import { createContext, useContext } from "react";
import type { Card, CardColor } from "../engine";

export const SKINS = ["arcade", "bistrot"] as const;
export type Skin = (typeof SKINS)[number];
export const SkinContext = createContext<Skin>("arcade");

export const CARD_HEX: Record<CardColor, string> = {
  red: "#e5483f",
  yellow: "#f6b928",
  green: "#2fa864",
  blue: "#2c7fdb",
};
/** Bistrot inks: a little deeper, as printed on paper. */
const PRINT_HEX: Record<CardColor, string> = {
  red: "#cf3b2b",
  yellow: "#e3a12a",
  green: "#2f8a52",
  blue: "#2a5ea8",
};
const PAPER = "#fbf5e8";
const PRINT_INK = "#2b1d14";
const PRINT_BACK = "#1d3557";
const BRASS = "#c9a45c";
const INK = "#1a1030";
const CREAM = "#fff7e8";
const WILD_PANEL = "#211a35";
const QUARTERS: [CardColor, number, number][] = [
  ["red", 0, 0],
  ["blue", 50, 0],
  ["yellow", 0, 75],
  ["green", 50, 75],
];

/** Gradients and clips shared by every card; render once per page. */
export function CardDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <linearGradient id="pc-gloss" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".34" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".18" />
        </linearGradient>
        <clipPath id="pc-oval" clipPathUnits="userSpaceOnUse">
          <ellipse cx="50" cy="75" rx="30" ry="50" transform="rotate(28 50 75)" />
        </clipPath>
        <pattern id="pc-dots" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r=".9" fill="#fff" fillOpacity=".16" />
        </pattern>
        <linearGradient id="pc-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset=".3" stopColor="#fff" stopOpacity="0" />
          <stop offset=".75" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".1" />
        </linearGradient>
        <pattern id="pc-back-stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="8" height="8" fill="#241a40" />
          <rect width="3" height="8" fill="#2d2150" />
        </pattern>
      </defs>
    </svg>
  );
}

function Symbol({ card, fill, size, ink = INK, font = "'Paytone One', sans-serif" }: {
  card: Card; fill: string; size: number; ink?: string; font?: string;
}) {
  const INK = ink;
  const text = (label: string) => (
    <text
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily={font}
      fontSize={size}
      fill={fill}
      stroke={INK}
      strokeWidth={INK === "none" ? 0 : size / 12}
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {label}
    </text>
  );
  if (card.kind === "number")
    return (
      <g>
        {text(String(card.value))}
        {/* 6 and 9 read the same upside down. */}
        {(card.value === 6 || card.value === 9) && (
          <rect x={-size * 0.22} y={size * 0.36} width={size * 0.44} height={size * 0.07} rx={size * 0.03} fill={fill} stroke={INK} strokeWidth={INK === "none" ? 0 : size / 30} />
        )}
      </g>
    );
  if (card.kind === "draw2") return text("+2");
  if (card.kind === "draw4") return text("+4");
  const s = size / 40;
  if (card.kind === "skip")
    return (
      <g transform={`scale(${s})`} fill="none" stroke={INK} strokeLinecap="round">
        {(INK === "none" ? [6] : [9, 5]).map((w, i, all) => (
          <g key={w} stroke={i || all.length === 1 ? fill : INK} strokeWidth={w}>
            <circle r="14" />
            <path d="M-10 10 10-10" />
          </g>
        ))}
      </g>
    );
  if (card.kind === "reverse") {
    const arrow = "M-13 6V-3a7 7 0 0 1 7-7H8M3-16l6 6-6 6";
    return (
      <g transform={`scale(${s})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {(INK === "none" ? [6] : [9, 5]).map((w, i, all) => (
          <g key={w} stroke={i || all.length === 1 ? fill : INK} strokeWidth={w}>
            <path d={arrow} transform="translate(-1 -3)" />
            <path d={arrow} transform="rotate(180) translate(-1 -3)" />
          </g>
        ))}
      </g>
    );
  }
  // Wild: a small four-colour pinwheel.
  return (
    <g transform={`scale(${s})`} stroke={INK === "none" ? PAPER : INK} strokeWidth="2.5">
      {QUARTERS.map(([c], i) => (
        <path key={c} d="M0 0V-15A15 15 0 0 1 15 0Z" fill={CARD_HEX[c]} transform={`rotate(${i * 90})`} />
      ))}
    </g>
  );
}

/** A printed card: paper border, halftone panel, a big centred symbol with a soft ink offset. */
function PrintedFace({ card, tint }: { card: Card; tint: CardColor | null }) {
  const wild = !card.color;
  const panel = wild ? (tint ? PRINT_HEX[tint] : PRINT_INK) : PRINT_HEX[card.color!];
  const font = "'Bagel Fat One', 'Paytone One', sans-serif";
  const size = card.kind === "number" ? 62 : 40;
  return (
    <svg className="card-face" viewBox="0 0 100 150" aria-hidden="true">
      <rect x=".75" y=".75" width="98.5" height="148.5" rx="9" fill={PAPER} stroke="#0000001f" strokeWidth="1.5" />
      <rect x="6" y="6" width="88" height="138" rx="5.5" fill={panel} />
      <rect x="6" y="6" width="88" height="138" rx="5.5" fill="url(#pc-dots)" />
      {wild && (
        <g transform="translate(50 75)">
          <circle r="27" fill={PAPER} />
          {QUARTERS.map(([c], i) => (
            <path key={c} d="M0 0V-23A23 23 0 0 1 23 0Z" fill={PRINT_HEX[c]} transform={`rotate(${i * 90})`} />
          ))}
        </g>
      )}
      {!(wild && card.kind === "wild") && (
        <>
          <g transform="translate(53 79)" opacity=".28">
            <Symbol card={card} fill="#000" size={size} ink="none" font={font} />
          </g>
          <g transform="translate(50 76)">
            <Symbol card={card} fill={PAPER} size={size} ink="none" font={font} />
          </g>
        </>
      )}
      <g transform="translate(17 20)">
        <Symbol card={card} fill={PAPER} size={16} ink="none" font={font} />
      </g>
      <g transform="translate(83 130) rotate(180)">
        <Symbol card={card} fill={PAPER} size={16} ink="none" font={font} />
      </g>
      <rect x=".75" y=".75" width="98.5" height="148.5" rx="9" fill="url(#pc-paper)" />
    </svg>
  );
}

/** `tint` paints a wild in the colour chosen for it, keeping its four-colour centre. */
export function CardFace({ card, tint = null }: { card: Card; tint?: CardColor | null }) {
  const skin = useContext(SkinContext);
  if (skin === "bistrot") return <PrintedFace card={card} tint={tint} />;
  const wild = !card.color;
  const panel = wild ? (tint ? CARD_HEX[tint] : WILD_PANEL) : CARD_HEX[card.color!];
  const ink = wild ? CREAM : panel;
  return (
    <svg className="card-face" viewBox="0 0 100 150" aria-hidden="true">
      <rect x="2" y="2" width="96" height="146" rx="11" fill={CREAM} stroke={INK} strokeWidth="4" />
      <rect x="7.5" y="7.5" width="85" height="135" rx="7" fill={panel} />
      {wild ? (
        <g clipPath="url(#pc-oval)">
          {QUARTERS.map(([c, x, y]) => (
            <rect key={c} x={x} y={y} width="50" height="75" fill={CARD_HEX[c]} />
          ))}
        </g>
      ) : (
        <ellipse cx="50" cy="75" rx="30" ry="50" transform="rotate(28 50 75)" fill={CREAM} />
      )}
      <ellipse cx="50" cy="75" rx="30" ry="50" transform="rotate(28 50 75)" fill="none" stroke={INK} strokeWidth="2" />
      <g transform="translate(50 75)">
        <Symbol card={card} fill={wild && card.kind === "wild" ? CREAM : ink} size={card.kind === "number" ? 50 : 34} />
      </g>
      <g transform="translate(18 22)">
        <Symbol card={card} fill={CREAM} size={18} />
      </g>
      <g transform="translate(82 128) rotate(180)">
        <Symbol card={card} fill={CREAM} size={18} />
      </g>
      <rect x="7" y="7" width="86" height="136" rx="7.5" fill="url(#pc-gloss)" />
    </svg>
  );
}

export function CardBack() {
  const skin = useContext(SkinContext);
  if (skin === "bistrot")
    return (
      <svg className="card-face" viewBox="0 0 100 150" aria-hidden="true">
        <rect x=".75" y=".75" width="98.5" height="148.5" rx="9" fill={PAPER} stroke="#0000001f" strokeWidth="1.5" />
        <rect x="6" y="6" width="88" height="138" rx="5.5" fill={PRINT_BACK} />
        <rect x="6" y="6" width="88" height="138" rx="5.5" fill="url(#pc-dots)" />
        <rect x="11" y="11" width="78" height="128" rx="3.5" fill="none" stroke={BRASS} strokeWidth="1.2" />
        <rect x="14" y="14" width="72" height="122" rx="2.5" fill="none" stroke={BRASS} strokeOpacity=".5" strokeWidth=".8" />
        <text x="50" y="80" textAnchor="middle" dominantBaseline="central" fontFamily="'Bagel Fat One', sans-serif" fontSize="44" fill={BRASS}>P</text>
        <rect x=".75" y=".75" width="98.5" height="148.5" rx="9" fill="url(#pc-paper)" />
      </svg>
    );
  return (
    <svg className="card-face" viewBox="0 0 100 150" aria-hidden="true">
      <rect x="1.5" y="1.5" width="97" height="147" rx="11" fill={CREAM} stroke={INK} strokeWidth="2.5" />
      <rect x="7" y="7" width="86" height="136" rx="7.5" fill="url(#pc-back-stripes)" />
      <rect x="11" y="11" width="78" height="128" rx="5" fill="none" stroke="#ffd24d" strokeOpacity=".55" strokeWidth="1.5" />
      <ellipse cx="50" cy="75" rx="30" ry="50" transform="rotate(28 50 75)" fill={CARD_HEX.red} stroke={INK} strokeWidth="2" />
      <text
        x="50"
        y="75"
        textAnchor="middle"
        dominantBaseline="central"
        transform="rotate(-62 50 75)"
        fontFamily="'Paytone One', sans-serif"
        fontSize="21"
        fill={CREAM}
        stroke={INK}
        strokeWidth="2.6"
        paintOrder="stroke"
      >
        pioche<tspan fill="#ffd24d">.</tspan>
      </text>
      <rect x="7" y="7" width="86" height="136" rx="7.5" fill="url(#pc-gloss)" />
    </svg>
  );
}

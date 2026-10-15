"use client";
import { useEffect, useState } from "react";
import { Minus, Plus, LocateFixed, Globe2, Layers, X } from "lucide-react";
import {
  WORLD,
  BY_ID,
  COLORS,
  CONTINENTS,
  EMBLEMS,
  type Lang,
} from "@/lib/world";
import type { PublicGame } from "@/lib/game";
import { texts } from "@/lib/i18n";
export default function Board({
  game,
  lang,
  selected,
  target,
  onSelect,
  decorative = false,
  cardTerritories = [],
  highlightedCardTerritories = [],
  highlightAllCards = false,
  onToggleCards,
  onClearCardHighlight,
}: {
  game?: PublicGame;
  lang: Lang;
  selected?: string;
  target?: string;
  onSelect?: (id: string) => void;
  decorative?: boolean;
  cardTerritories?: string[];
  highlightedCardTerritories?: string[];
  highlightAllCards?: boolean;
  onToggleCards?: () => void;
  onClearCardHighlight?: () => void;
}) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [drag, setDrag] = useState<{
      x: number;
      y: number;
      px: number;
      py: number;
    } | null>(null),
    [hover, setHover] = useState(""),
    [showContinents, setShowContinents] = useState(false),
    [focusedContinent, setFocusedContinent] = useState("");
  const highlightKey = highlightedCardTerritories.join(",");
  useEffect(() => {
    if (highlightKey) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [highlightKey]);
  const t = texts(lang);
  const canAct =
    game && !game.paused && (game.active === game.me || game.phase === "setup");
  const neighbors = selected ? BY_ID[selected].neighbors : [];
  const label =
    hover ||
    (highlightedCardTerritories.length === 1
      ? highlightedCardTerritories[0]
      : "") ||
    target ||
    selected;
  const territory = label ? BY_ID[label] : undefined;
  const continent = CONTINENTS.find((c) => c.id === territory?.continent);
  const land = label ? game?.lands[label] : undefined;
  const owner = game?.players.find((p) => p.id === land?.owner);
  return (
    <div className={"board " + (decorative ? "decorative" : "")}>
      <div className="board-top">
        <span className="micro">
          {t.world} <span className="tiny-diamond">◆</span> 01
        </span>
        <span className="board-world">{t.classic}</span>
        <span className="board-caption">
          42 {t.territories} <span>·</span> 6 {t.continents}
        </span>
      </div>
      {!decorative && (
        <div className="map-tools" role="group" aria-label={t.mapName}>
          <button
            className={showContinents ? "enabled" : ""}
            aria-pressed={showContinents}
            aria-expanded={showContinents}
            aria-controls="continent-legend"
            onClick={() => {
              setShowContinents(!showContinents);
              setFocusedContinent("");
            }}
          >
            <Globe2 size={15} /> {t.continentView}
          </button>
          {cardTerritories.length > 0 && onToggleCards && (
            <button
              className={highlightAllCards ? "enabled" : ""}
              aria-pressed={highlightAllCards}
              onClick={onToggleCards}
            >
              <Layers size={15} /> {t.cardTerritories}
              <span>{cardTerritories.length}</span>
            </button>
          )}
          {highlightedCardTerritories.length > 0 && onClearCardHighlight && (
            <button onClick={onClearCardHighlight}>
              <X size={14} /> {t.clearCardHighlight}
            </button>
          )}
        </div>
      )}
      {showContinents && (
        <div className="continent-legend" id="continent-legend">
          <div
            className="continent-options"
            role="group"
            aria-label={t.continents}
          >
            <button
              aria-pressed={!focusedContinent}
              onClick={() => setFocusedContinent("")}
            >
              {t.continentFilter}
            </button>
            {CONTINENTS.map((c) => (
              <button
                key={c.id}
                aria-pressed={focusedContinent === c.id}
                onClick={() =>
                  setFocusedContinent(focusedContinent === c.id ? "" : c.id)
                }
              >
                <span className="dot" style={{ background: c.color }} />
                {c[lang]} <strong>+{c.bonus}</strong>
              </button>
            ))}
          </div>
          <p>{t.continentBonusHint}</p>
        </div>
      )}
      <svg
        className="world-map"
        viewBox="0 0 1220 680"
        role={onSelect ? "group" : "img"}
        aria-label={t.mapName}
        onPointerDown={(e) => {
          if (zoom > 1 && e.target === e.currentTarget) {
            setDrag({ x: e.clientX, y: e.clientY, px: pan.x, py: pan.y });
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }}
        onPointerMove={(e) => {
          if (drag)
            setPan({
              x: drag.px + (e.clientX - drag.x) * 1.3,
              y: drag.py + (e.clientY - drag.y) * 1.3,
            });
        }}
        onPointerUp={() => setDrag(null)}
      >
        <defs>
          <pattern
            id="seaDots"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".7" fill="#9ab8b5" opacity=".32" />
          </pattern>
          <filter id="paperShadow" x="-15%" y="-15%" width="140%" height="150%">
            <feDropShadow
              dx="0"
              dy="3"
              stdDeviation="1"
              floodColor="#4d6b65"
              floodOpacity=".14"
            />
          </filter>
        </defs>
        <rect
          width="1220"
          height="680"
          fill="url(#seaDots)"
          pointerEvents="none"
        />
        <g
          transform={`translate(${610 - 610 * zoom + pan.x},${340 - 340 * zoom + pan.y}) scale(${zoom})`}
        >
          <g
            className="sea-lines"
            fill="none"
            stroke="#95b4b5"
            strokeWidth="1.4"
            strokeDasharray="5 6"
            opacity=".7"
          >
            <path d="M 105 125 Q 25 70 10 80 M 1210 80 Q 1170 125 1125 127" />
            <path d="M 416 88 Q 480 52 540 126" />
            <path d="M 415 455 Q 462 354 571 391" />
            <path d="M 550 206 Q 588 180 629 218" />
            <path d="M 982 406 Q 957 462 993 503" />
            <path d="M 1142 279 Q 1108 263 1001 250" />
            <path d="M 701 441 Q 799 472 756 558" />
          </g>
          {WORLD.map((ter, i) => {
            const l = game?.lands[ter.id],
              pl = game?.players.find((p) => p.id === l?.owner);
            const continent = CONTINENTS.find((c) => c.id === ter.continent)!;
            const cardHighlighted = highlightedCardTerritories.includes(ter.id);
            const dimmed =
              (showContinents &&
                focusedContinent &&
                focusedContinent !== ter.continent) ||
              (highlightedCardTerritories.length > 0 && !cardHighlighted);
            const fill =
              !showContinents && game && Object.keys(game.lands).length
                ? pl
                  ? COLORS[pl.color]
                  : "#c6cbc7"
                : continent.color;
            const sel = selected === ter.id,
              tar = target === ter.id,
              legal =
                canAct && neighbors.includes(ter.id) && l?.owner !== game?.me;
            const troops =
              l?.troops ??
              (decorative
                ? [3, 1, 2, 5, 1, 2, 3, 1, 2, 4, 1, 2, 3, 1][i % 14]
                : 0);
            return (
              <g
                key={ter.id}
                className={
                  "territory " +
                  (sel ? "selected " : "") +
                  (tar ? "target " : "") +
                  (legal ? "legal " : "") +
                  (cardHighlighted ? "card-highlighted " : "") +
                  (dimmed ? "dimmed " : "")
                }
                data-testid={"territory-" + ter.id}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={`${ter[lang]}, ${continent[lang]}, ${t.bonus} +${continent.bonus}${l ? `, ${pl?.name ?? t.neutral}, ${troops} ${t.armies}` : ""}`}
                data-continent={ter.continent}
                aria-pressed={sel || tar}
                onClick={() => onSelect?.(ter.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.(ter.id);
                  }
                }}
                onMouseEnter={() => setHover(ter.id)}
                onMouseLeave={() => setHover("")}
              >
                <polygon
                  points={ter.points}
                  fill={fill}
                  stroke="#f7f5e9"
                  strokeWidth="4"
                  strokeLinejoin="round"
                  filter="url(#paperShadow)"
                />
                <polygon
                  className="territory-outline"
                  points={ter.points}
                  fill="none"
                  stroke={sel || tar ? "#30493e" : "#597369"}
                  strokeWidth={sel || tar ? 3 : showContinents ? 2 : 1}
                  strokeOpacity={sel || tar || showContinents ? 1 : 0.32}
                  strokeLinejoin="round"
                />
                {legal && (
                  <polygon
                    points={ter.points}
                    fill="none"
                    stroke="#334f42"
                    strokeWidth="2"
                    strokeDasharray="3 4"
                  />
                )}
                {cardHighlighted && (
                  <polygon
                    className="card-territory-outline"
                    points={ter.points}
                    fill="none"
                    stroke="#80500b"
                    strokeWidth="5"
                    strokeDasharray="9 4"
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                )}
                {troops > 0 && (
                  <g
                    className="troop-token"
                    transform={`translate(${ter.x},${ter.y})`}
                  >
                    <circle
                      r="14"
                      fill="#faf9f1"
                      stroke={
                        sel || tar
                          ? "#2b493a"
                          : pl
                            ? COLORS[pl.color]
                            : "#ffffff"
                      }
                      strokeWidth={showContinents ? 5 : 2}
                    />
                    <text
                      textAnchor="middle"
                      y="4.5"
                      fill="#34483e"
                      fontSize="13"
                      fontWeight="700"
                    >
                      {troops}
                    </text>
                    {pl && (
                      <text
                        textAnchor="middle"
                        y="-19"
                        fontSize="9"
                        fill="#354e42"
                      >
                        {EMBLEMS[pl.color]}
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}
          <g
            className="ocean-labels"
            fontFamily="Georgia, serif"
            fontStyle="italic"
            fontSize="17"
            fill="#6d918f"
            opacity=".75"
          >
            <text x="65" y="445" transform="rotate(-12 65 445)">
              {lang === "fr" ? "Océan Pacifique" : "Pacific Ocean"}
            </text>
            <text x="441" y="285" transform="rotate(73 441 285)">
              {lang === "fr" ? "Océan Atlantique" : "Atlantic Ocean"}
            </text>
            <text x="814" y="535" transform="rotate(-10 814 535)">
              {lang === "fr" ? "Océan Indien" : "Indian Ocean"}
            </text>
          </g>
          <g
            transform="translate(109 564)"
            stroke="#668e86"
            fill="none"
            opacity=".65"
          >
            <circle r="36" strokeWidth=".8" />
            <circle r="29" strokeWidth=".5" />
            <path
              d="M0,-48 7,-7 0,48 -7,7Z M-48,0 -7,-7 48,0 7,7Z"
              fill="#b3cac0"
              strokeWidth=".8"
            />
            <path d="M0,-48 7,-7 0,0Z" fill="#547d70" />
            <text
              x="0"
              y="-57"
              textAnchor="middle"
              fill="#547d70"
              stroke="none"
              fontSize="11"
            >
              N
            </text>
          </g>
        </g>
      </svg>
      <div className="board-bottom">
        <span className="map-tip">
          {territory ? (
            <>
              <span
                style={{ background: owner ? COLORS[owner.color] : "#c2d0c7" }}
                className="dot"
              />
              {territory[lang]}{" "}
              {owner && <span className="muted">· {owner.name}</span>}
              {continent && (
                <span className="territory-bonus">
                  {continent[lang]} · +{continent.bonus}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="mini-compass">✧</span>
              {decorative ? t.homeTip : t.mapHelp}
            </>
          )}
        </span>
        <div className="zoom-controls">
          <button
            aria-label={t.zoomOut}
            onClick={() => setZoom((z) => Math.max(1, z - 0.3))}
          >
            <Minus size={15} />
          </button>
          <button
            aria-label={t.resetMap}
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            <LocateFixed size={16} />
          </button>
          <button
            aria-label={t.zoomIn}
            onClick={() => setZoom((z) => Math.min(2.8, z + 0.3))}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

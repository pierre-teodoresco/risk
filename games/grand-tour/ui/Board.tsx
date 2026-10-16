"use client";
// The board, drawn in 3D by engine3d.ts. Pawn() is the flat token used in the players' cards.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAppFontReady } from "@/lib/useAppFontReady";
import { EmblemShapes } from "@/components/Crest";
import { EMBLEM_INK, EMBLEM_OUTLINE, emblemOf } from "@/lib/emblems";
import type { Lang } from "@/lib/world";
import { BOARD } from "../board";
import { GROUP_HEX, PAWN_HEX, squareName } from "../i18n";
import { TourBoard, type TourCallbacks, type TourMove } from "./engine3d";

export type BoardHolding = { owner: string; houses: number; mortgaged: boolean };
export type BoardPawn = { id: string; emblem: number; pos: number; out: boolean };
export type BoardMove = TourMove;
export type { TourBoard };

export function Pawn({ emblem, size = 30 }: { emblem: number; size?: number }) {
  return (
    <svg className="gt-pawn-face" viewBox="-2 -2 68 68" width={size} height={size} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill={PAWN_HEX[emblem % PAWN_HEX.length]} stroke="#ffffff" strokeWidth="4" />
      <g transform="translate(32 33) scale(.82)" fill="#fff" stroke={EMBLEM_INK} strokeWidth={EMBLEM_OUTLINE} strokeLinejoin="round">
        <EmblemShapes emblem={emblemOf(emblem)} />
      </g>
    </svg>
  );
}

/** The country of each city, drawn on its square. */
const FLAGS: Record<string, string> = {
  "Le Caire": "🇪🇬", Marrakech: "🇲🇦", Lima: "🇵🇪", Bogotá: "🇨🇴", Mexico: "🇲🇽", Hanoï: "🇻🇳", Manille: "🇵🇭", Bangkok: "🇹🇭",
  Athènes: "🇬🇷", Istanbul: "🇹🇷", Rome: "🇮🇹", "Buenos Aires": "🇦🇷", Rio: "🇧🇷", Sydney: "🇦🇺", Berlin: "🇩🇪", Amsterdam: "🇳🇱",
  Barcelone: "🇪🇸", Séoul: "🇰🇷", Singapour: "🇸🇬", "Hong Kong": "🇭🇰", "New York": "🇺🇸", Paris: "🇫🇷",
};
export const flagOf = (i: number) => {
  const s = BOARD[i];
  return s?.kind === "city" ? FLAGS[s.name] ?? null : null;
};
const PRICES = BOARD.map((s) => (s.kind === "city" || s.kind === "airport" || s.kind === "utility" ? s.price : s.kind === "tax" ? s.amount : null));
const GROUPS = BOARD.map((s) => (s.kind === "city" ? GROUP_HEX[s.group] : null));
const FLAG_LIST = BOARD.map((_, i) => flagOf(i));
const NO_RENTS: (string | null)[] = BOARD.map(() => null);

export default function Board({ lang, holdings, pawns, move, ownerColor, selected = null, onSelect, dice = null, interactive = true, autoRotate = false, showcase = false, active = null, pot = 0, rents = NO_RENTS, card = null, events, onReady, children }: {
  lang: Lang;
  holdings: Record<string, BoardHolding>;
  pawns: BoardPawn[];
  move: BoardMove;
  /** Colour of a player id, for the owner's flag and buildings. */
  ownerColor: (id: string) => string;
  selected?: number | null;
  onSelect?: (i: number) => void;
  dice?: { values: [number, number]; key: string } | null;
  interactive?: boolean;
  autoRotate?: boolean;
  showcase?: boolean;
  active?: string | null;
  pot?: number;
  rents?: (string | null)[];
  card?: { deck: "chance" | "chest"; at: number } | null;
  events?: Omit<TourCallbacks, "onSelect">;
  /** Gives the engine to the table, for the dice and the floating amounts. */
  onReady?: (board: TourBoard | null) => void;
  children?: ReactNode;
}) {
  const fontReady = useAppFontReady();
  const host = useRef<HTMLDivElement>(null),
    board = useRef<TourBoard | null>(null),
    select = useRef(onSelect),
    handlers = useRef(events);
  select.current = onSelect;
  handlers.current = events;
  const labels = useMemo(() => BOARD.map((_, i) => squareName(i, lang)), [lang]);
  const tokens = pawns.map((p) => ({ id: p.id, color: PAWN_HEX[p.emblem % PAWN_HEX.length], pos: p.pos, out: p.out }));
  const pawnKey = JSON.stringify(tokens);
  const state = () => ({ holdings, pawns: tokens, move, ownerColor, dice, selected, labels, prices: PRICES, rents, groupColors: GROUPS, flags: FLAG_LIST, active, pot, card });

  useEffect(() => {
    if (!fontReady) return;
    const b = new TourBoard(
      host.current!,
      {
        onSelect: (i) => select.current?.(i),
        onDice: (v) => handlers.current?.onDice?.(v),
        onHop: (id, i, k) => handlers.current?.onHop?.(id, i, k),
        onArrive: (id, i) => handlers.current?.onArrive?.(id, i),
        onThud: (k) => handlers.current?.onThud?.(k),
      },
      { interactive, autoRotate, showcase },
    );
    board.current = b;
    onReady?.(b);
    return () => {
      onReady?.(null);
      b.dispose();
      board.current = null;
    };
    // One engine for the component's life; later props flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontReady]);
  useEffect(() => {
    board.current?.setOptions({ interactive, autoRotate, showcase });
  }, [fontReady, interactive, autoRotate, showcase]);
  useEffect(() => {
    board.current?.setState(state());
    // Compared by value: the server sends fresh objects with every state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontReady, JSON.stringify(holdings), pawnKey, move?.at, dice?.key, selected, labels, active, pot, rents.join(), card?.at]);

  return (
    <div className="gt-board3d">
      <div className="gt-canvas" ref={host} />
      {children}
    </div>
  );
}

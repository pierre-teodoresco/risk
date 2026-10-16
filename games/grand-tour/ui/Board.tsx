"use client";
// The board, drawn in 3D by engine3d.ts. The centre of the board hosts the turn's actions,
// as plain HTML floating over the canvas. Pawn() is the flat token used in the side panels.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { EmblemShapes } from "@/components/Crest";
import { EMBLEM_INK, EMBLEM_OUTLINE, emblemOf } from "@/lib/emblems";
import type { Lang } from "@/lib/world";
import { BOARD } from "../board";
import { GROUP_HEX, PAWN_HEX, squareName } from "../i18n";
import { TourBoard, type TourMove } from "./engine3d";

export type BoardHolding = { owner: string; houses: number; mortgaged: boolean };
export type BoardPawn = { id: string; emblem: number; pos: number; out: boolean };
export type BoardMove = TourMove;

export function Pawn({ emblem, size = 30 }: { emblem: number; size?: number }) {
  return (
    <svg className="gt-pawn-face" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill={PAWN_HEX[emblem % PAWN_HEX.length]} stroke="#0e0d11" strokeWidth="4" />
      <g transform="translate(32 33) scale(.82)" fill="#fff" stroke={EMBLEM_INK} strokeWidth={EMBLEM_OUTLINE} strokeLinejoin="round">
        <EmblemShapes emblem={emblemOf(emblem)} />
      </g>
    </svg>
  );
}

const PRICES = BOARD.map((s) => (s.kind === "city" || s.kind === "airport" || s.kind === "utility" ? s.price : s.kind === "tax" ? s.amount : null));
const GROUPS = BOARD.map((s) => (s.kind === "city" ? GROUP_HEX[s.group] : null));

export default function Board({ lang, holdings, pawns, move, ownerColor, selected = null, onSelect, dice = null, interactive = true, autoRotate = false, showcase = false, children }: {
  lang: Lang;
  holdings: Record<string, BoardHolding>;
  pawns: BoardPawn[];
  move: BoardMove;
  /** Colour of a player id, for the owner chip. */
  ownerColor: (id: string) => string;
  selected?: number | null;
  onSelect?: (i: number) => void;
  dice?: { values: [number, number]; key: string } | null;
  interactive?: boolean;
  autoRotate?: boolean;
  showcase?: boolean;
  children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null),
    board = useRef<TourBoard | null>(null),
    select = useRef(onSelect);
  select.current = onSelect;
  const labels = useMemo(() => BOARD.map((_, i) => squareName(i, lang)), [lang]);
  const tokens = pawns.map((p) => ({ id: p.id, color: PAWN_HEX[p.emblem % PAWN_HEX.length], pos: p.pos, out: p.out }));
  const pawnKey = JSON.stringify(tokens);

  useEffect(() => {
    const b = new TourBoard(host.current!, { onSelect: (i) => select.current?.(i) }, { interactive, autoRotate, showcase });
    board.current = b;
    return () => {
      b.dispose();
      board.current = null;
    };
    // One engine for the component's life; later props flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    board.current?.setOptions({ interactive, autoRotate, showcase });
  }, [interactive, autoRotate]);
  useEffect(() => {
    board.current?.setState({ holdings, pawns: tokens, move, ownerColor, dice, selected, labels, prices: PRICES, groupColors: GROUPS });
    // Compared by value: the server sends fresh objects with every state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(holdings), pawnKey, move?.at, dice?.key, selected, labels]);
  // Fonts load after the first paint; redraw the square names once they are in.
  useEffect(() => {
    document.fonts?.ready.then(() => board.current?.setState({ holdings, pawns: tokens, move, ownerColor, dice, selected, labels: [...labels], prices: PRICES, groupColors: GROUPS }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="gt-board3d">
      <div className="gt-canvas" ref={host} />
      {children && <div className="gt-overlay"><div className="gt-centre">{children}</div></div>}
    </div>
  );
}

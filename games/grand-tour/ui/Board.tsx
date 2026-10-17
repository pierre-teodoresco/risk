"use client";
// The board, drawn in 3D by engine3d.ts. Pawn() is the flat token used in the players' cards.
import { useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAppFontReady } from "@/lib/useAppFontReady";
import type { Lang } from "@/lib/world";
import { BOARD } from "../board";
import { GROUP_HEX, PAWN_HEX, squareName } from "../i18n";
import { TourBoard, type TourCallbacks, type TourMove } from "./engine3d";
import { PawnFaces } from "./PawnFaces";
export { Pawn } from "./Pawn";

export type BoardHolding = { owner: string; houses: number; mortgaged: boolean };
export type BoardPawn = { id: string; emblem: number; pos: number; out: boolean };
export type BoardMove = TourMove;
export type { TourBoard };

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
  const faces = useContext(PawnFaces);
  const host = useRef<HTMLDivElement>(null),
    board = useRef<TourBoard | null>(null),
    select = useRef(onSelect),
    handlers = useRef(events);
  select.current = onSelect;
  handlers.current = events;
  const labels = useMemo(() => BOARD.map((_, i) => squareName(i, lang)), [lang]);
  const tokens = useMemo(() => pawns.map((p) => ({ id: p.id, color: PAWN_HEX[p.emblem % PAWN_HEX.length], pos: p.pos, out: p.out, face: faces[p.emblem % faces.length] })), [pawns, faces]);
  // Compare the short source data, rather than serializing the SVG URLs on every clock tick.
  const pawnKey = JSON.stringify(pawns);
  const state = () => ({ holdings, pawns: tokens, move, ownerColor, dice, selected, labels, prices: PRICES, rents, groupColors: GROUPS, flags: FLAG_LIST, active, pot, card });

  useEffect(() => {
    if (!fontReady || !faces.length) return;
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
  }, [fontReady, faces]);
  useEffect(() => {
    board.current?.setOptions({ interactive, autoRotate, showcase });
  }, [fontReady, interactive, autoRotate, showcase]);
  useEffect(() => {
    board.current?.setState(state());
    // Compared by value: the server sends fresh objects with every state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontReady, faces, JSON.stringify(holdings), pawnKey, move?.at, dice?.key, selected, labels, active, pot, rents.join(), card?.at]);

  return (
    <div className="gt-board3d">
      <div className="gt-canvas" ref={host} />
      {children}
    </div>
  );
}

"use client";
// The chess board as players know it from the big chess sites: green and cream squares with the
// coordinates inside, the last move in yellow, dots for the legal moves, drag and drop or two
// clicks, sliding pieces, the promotion column, and right-click marks and arrows.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import { file, rank, type Cell, type Kind, type Move, type Position } from "../rules";
import Piece from "./Piece";

type Arrow = { from: number; to: number; color: string };
const ARROW = "rgba(255, 170, 0, .8)", ARROW_ALT = "rgba(159, 207, 63, .8)";
const MARK = "rgba(235, 97, 80, .8)";
/** Pixels the pointer moves before a press becomes a drag. */
const DRAG_START = 4;
const PROMO_ORDER: Kind[] = ["q", "n", "r", "b"];

/** Keeps an id per piece across positions, so a piece that moves keeps its element and slides. */
function trackIds(prev: { board: Cell[]; ids: number[] } | null, board: Cell[], next: { n: number }) {
  const ids: number[] = Array(64).fill(-1);
  if (!prev) {
    board.forEach((c, i) => c && (ids[i] = next.n++));
    return ids;
  }
  const vacated: number[] = [];
  for (let i = 0; i < 64; i++) {
    if (prev.board[i] && prev.board[i] === board[i]) ids[i] = prev.ids[i];
    else if (prev.board[i]) vacated.push(i);
  }
  const dist = (a: number, b: number) => Math.abs(file(a) - file(b)) + Math.abs(rank(a) - rank(b));
  for (let i = 0; i < 64; i++) {
    const c = board[i];
    if (!c || ids[i] >= 0) continue;
    // The same piece first, then a piece of the same colour (a promoted pawn).
    const pick = (ok: (s: number) => boolean) => vacated.filter(ok).sort((a, b) => dist(a, i) - dist(b, i))[0];
    const from = pick((s) => prev.board[s] === c) ?? pick((s) => prev.board[s]![0] === c[0] && prev.board[s]![1] === "p");
    if (from !== undefined) {
      vacated.splice(vacated.indexOf(from), 1);
      ids[i] = prev.ids[from];
    } else ids[i] = next.n++;
  }
  return ids;
}

function arrowPath({ from, to }: Arrow, flipped: boolean) {
  const xy = (s: number) => {
    const x = flipped ? 7 - file(s) : file(s), y = flipped ? rank(s) : 7 - rank(s);
    return [x * 100 + 50, y * 100 + 50];
  };
  const [x0, y0] = xy(from), [x1, y1] = xy(to);
  const dx = x1 - x0, dy = y1 - y0;
  // A knight's jump bends: along the long side first, then the short one.
  const knight = (Math.abs(dx) === 100 && Math.abs(dy) === 200) || (Math.abs(dx) === 200 && Math.abs(dy) === 100);
  const points = knight ? (Math.abs(dy) > Math.abs(dx) ? [[x0, y0], [x0, y1], [x1, y1]] : [[x0, y0], [x1, y0], [x1, y1]]) : [[x0, y0], [x1, y1]];
  const [ax, ay] = points[points.length - 2];
  const len = Math.hypot(x1 - ax, y1 - ay);
  const ux = (x1 - ax) / len, uy = (y1 - ay) / len;
  const head = 34, half = 22;
  const bx = x1 - ux * head, by = y1 - uy * head;
  const start = points[0];
  const sLen = Math.hypot(points[1][0] - start[0], points[1][1] - start[1]);
  // Starts a little off the centre of the first square, like a pointer leaving the piece.
  const sx = start[0] + ((points[1][0] - start[0]) / sLen) * 18, sy = start[1] + ((points[1][1] - start[1]) / sLen) * 18;
  const line = [[sx, sy], ...points.slice(1, -1), [bx, by]].map(([x, y]) => `${x},${y}`).join(" ");
  const tip = `${x1},${y1} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}`;
  return { line, tip };
}

export type BoardProps = {
  position: Position;
  flipped: boolean;
  /** Moves the viewer may play now; empty when the board is only shown. */
  moves: Move[];
  last: [number, number] | null;
  check: number | null;
  onMove?: (m: Move) => void;
  /** Called on any press, e.g. to leave the history and come back to the game. */
  onPress?: () => void;
  coords?: boolean;
};

export default function Board2D({ position, flipped, moves, last, check, onMove, onPress, coords = true }: BoardProps) {
  const board = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(null),
    [drag, setDrag] = useState<{ from: number; x: number; y: number; moving: boolean } | null>(null),
    [hover, setHover] = useState<number | null>(null),
    [promo, setPromo] = useState<{ from: number; to: number } | null>(null),
    [marks, setMarks] = useState<number[]>([]),
    [arrows, setArrows] = useState<Arrow[]>([]),
    [dropped, setDropped] = useState<number | null>(null);
  const rightFrom = useRef<number | null>(null);
  const press = useRef<{ x: number; y: number; wasSelected: boolean } | null>(null);

  // Piece identities, recomputed only when the position changes.
  const track = useRef<{ key: string; board: Cell[]; ids: number[] } | null>(null),
    counter = useRef({ n: 0 });
  const key = position.board.map((c) => c ?? ".").join("");
  if (track.current?.key !== key) track.current = { key, board: position.board, ids: trackIds(track.current, position.board, counter.current) };
  const ids = track.current.ids;
  // Turning the board round places the pieces at once instead of sliding them all across.
  const [turned, setTurned] = useState(false);
  const wasFlipped = useRef(flipped);
  if (wasFlipped.current !== flipped) {
    wasFlipped.current = flipped;
    if (!turned) setTurned(true);
  }
  useEffect(() => {
    if (!turned) return;
    const t = requestAnimationFrame(() => setTurned(false));
    return () => cancelAnimationFrame(t);
  }, [turned]);

  // A new position drops any selection that no longer holds.
  useEffect(() => {
    setSelected((s) => (s !== null && moves.some((m) => m.from === s) ? s : null));
    setPromo(null);
  }, [moves]);
  useEffect(() => {
    if (dropped === null) return;
    const t = requestAnimationFrame(() => setDropped(null));
    return () => cancelAnimationFrame(t);
  }, [dropped]);

  const from = drag?.from ?? selected;
  const targets = useMemo(() => (from === null ? [] : moves.filter((m) => m.from === from)), [moves, from]);
  const toXY = (s: number) => ({ x: flipped ? 7 - file(s) : file(s), y: flipped ? rank(s) : 7 - rank(s) });
  function squareAt(clientX: number, clientY: number) {
    const r = board.current!.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * 8), y = Math.floor(((clientY - r.top) / r.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    const f = flipped ? 7 - x : x, rk = flipped ? y : 7 - y;
    return rk * 8 + f;
  }
  function attempt(f: number, t: number, fromDrop: boolean) {
    const options = moves.filter((m) => m.from === f && m.to === t);
    if (!options.length) return false;
    setSelected(null);
    if (options.some((m) => m.promo)) {
      setPromo({ from: f, to: t });
      return true;
    }
    if (fromDrop) setDropped(ids[f]);
    onMove?.(options[0]);
    return true;
  }

  function down(e: ReactPointerEvent) {
    onPress?.();
    const s = squareAt(e.clientX, e.clientY);
    if (s === null) return;
    if (e.button === 2) {
      rightFrom.current = s;
      return;
    }
    if (e.button !== 0) return;
    setMarks([]);
    setArrows([]);
    if (promo) {
      setPromo(null);
      return;
    }
    if (selected !== null && selected !== s && attempt(selected, s, false)) return;
    if (moves.some((m) => m.from === s)) {
      press.current = { x: e.clientX, y: e.clientY, wasSelected: selected === s };
      setSelected(s);
      const r = board.current!.getBoundingClientRect();
      setDrag({ from: s, x: e.clientX - r.left, y: e.clientY - r.top, moving: false });
      board.current!.setPointerCapture(e.pointerId);
    } else setSelected(null);
  }
  function move(e: ReactPointerEvent) {
    if (!drag || !press.current) return;
    const r = board.current!.getBoundingClientRect();
    const moving = drag.moving || Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > DRAG_START;
    setDrag({ ...drag, x: e.clientX - r.left, y: e.clientY - r.top, moving });
    setHover(moving ? squareAt(e.clientX, e.clientY) : null);
  }
  function up(e: ReactPointerEvent) {
    const s = squareAt(e.clientX, e.clientY);
    if (e.button === 2) {
      const a = rightFrom.current;
      rightFrom.current = null;
      if (a === null || s === null) return;
      if (a === s) setMarks((m) => (m.includes(s) ? m.filter((x) => x !== s) : [...m, s]));
      else {
        const color = e.shiftKey || e.ctrlKey || e.altKey ? ARROW_ALT : ARROW;
        setArrows((list) => (list.some((x) => x.from === a && x.to === s) ? list.filter((x) => !(x.from === a && x.to === s)) : [...list, { from: a, to: s, color }]));
      }
      return;
    }
    if (!drag) return;
    const d = drag;
    setDrag(null);
    setHover(null);
    if (s !== null && s !== d.from && attempt(d.from, s, d.moving)) return;
    // A plain click on the piece that was already selected lets it go.
    if (s === d.from && !d.moving && press.current?.wasSelected) setSelected(null);
    press.current = null;
  }

  const pieces = position.board.flatMap((c, i) => (c ? [{ c, i, id: ids[i] }] : [])).sort((a, b) => a.id - b.id);
  const lightOf = (s: number) => (file(s) + rank(s)) % 2 === 1;
  const promoCol = promo && toXY(promo.to);
  const promoColor = promo && position.board[promo.from]![0];
  const fromTop = promoCol ? promoCol.y === 0 : true;

  return (
    <div
      className={"cc-board" + (turned ? " turned" : "")}
      ref={board}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        setDrag(null);
        setHover(null);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {coords && (
        <svg className="cc-coords" viewBox="0 0 100 100" aria-hidden="true">
          {Array.from({ length: 8 }, (_, k) => {
            const rk = flipped ? k : 7 - k, f = flipped ? 7 - k : k;
            return (
              <g key={k}>
                <text x="0.75" y={k * 12.5 + 0.8} className={lightOf(rk * 8 + (flipped ? 7 : 0)) ? "on-light" : "on-dark"}>{rk + 1}</text>
                <text x={k * 12.5 + 11.8} y="99.2" textAnchor="end" className={lightOf((flipped ? 7 : 0) * 8 + f) ? "on-light" : "on-dark"}>{"abcdefgh"[f]}</text>
              </g>
            );
          })}
        </svg>
      )}
      {last && last.map((s) => <i key={"l" + s} className="cc-hl" style={{ "--x": toXY(s).x, "--y": toXY(s).y } as React.CSSProperties} />)}
      {from !== null && <i className="cc-hl" style={{ "--x": toXY(from).x, "--y": toXY(from).y } as React.CSSProperties} />}
      {marks.map((s) => <i key={"m" + s} className="cc-mark" style={{ "--x": toXY(s).x, "--y": toXY(s).y, background: MARK } as React.CSSProperties} />)}
      {check !== null && <i className="cc-check" style={{ "--x": toXY(check).x, "--y": toXY(check).y } as React.CSSProperties} />}
      {hover !== null && <i className="cc-hover" style={{ "--x": toXY(hover).x, "--y": toXY(hover).y } as React.CSSProperties} />}

      {pieces.map(({ c, i, id }) => {
        const { x, y } = toXY(i);
        const dragging = drag?.moving && drag.from === i;
        const style = dragging
          ? { transform: `translate(calc(${drag.x}px - 50%), calc(${drag.y}px - 50%))` }
          : { transform: `translate(${x * 100}%, ${y * 100}%)` };
        return (
          <div key={id} className={"cc-piece" + (dragging ? " dragging" : "") + (dropped === id ? " still" : "")} style={style}>
            <Piece cell={c} />
          </div>
        );
      })}

      {[...new Set(targets.map((m) => m.to))].map((t) => {
        const take = !!position.board[t] || targets.some((m) => m.to === t && m.ep);
        return <i key={"t" + t} className={take ? "cc-ring" : "cc-dot"} style={{ "--x": toXY(t).x, "--y": toXY(t).y } as React.CSSProperties} />;
      })}

      {!!arrows.length && (
        <svg className="cc-arrows" viewBox="0 0 800 800" aria-hidden="true">
          {arrows.map((a) => {
            const { line, tip } = arrowPath(a, flipped);
            return (
              <g key={`${a.from}-${a.to}`} fill={a.color} stroke={a.color}>
                <polyline points={line} fill="none" strokeWidth="19" strokeLinejoin="miter" />
                <polygon points={tip} stroke="none" />
              </g>
            );
          })}
        </svg>
      )}

      {promo && promoCol && promoColor && (
        <div
          className={"cc-promo" + (fromTop ? "" : " up")}
          style={{ "--x": promoCol.x } as React.CSSProperties}
          onPointerDown={(e) => e.stopPropagation()}
          role="group"
          aria-label="Promotion"
        >
          {PROMO_ORDER.map((k) => (
            <button
              key={k}
              aria-label={k}
              onClick={() => {
                setPromo(null);
                onMove?.(moves.find((m) => m.from === promo.from && m.to === promo.to && m.promo === k)!);
              }}
            >
              <Piece cell={`${promoColor}${k}` as Exclude<Cell, null>} />
            </button>
          ))}
          <button className="cc-promo-x" aria-label="✕" onClick={() => setPromo(null)}><X /></button>
        </div>
      )}
    </div>
  );
}

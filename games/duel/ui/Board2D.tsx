"use client";
// The board of the two-player games, as players know it from the big chess sites: green and
// cream squares, coordinates inside, the last move in yellow, dots for the legal moves, drag and
// drop or two clicks, sliding pieces, a promotion column, right-click marks and arrows, and the
// premoves in red. Any square board: chess on 8 × 8, draughts on 10 × 10.
// The board is sized to a whole number of device pixels per square and placed on the pixel grid,
// so the squares stay sharp and the pieces centred on fractional display scales (Windows at
// 125 % or 150 %).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { X } from "lucide-react";

export type BoardCell = string | null;
/** A move as the board sees it: where a piece starts and stops. `id` points to the game's move. */
export type BoardMove = { from: number; to: number; capture?: boolean; promo?: string; id: number };
type Arrow = { from: number; to: number; color: string };
const ARROW = "rgba(255, 170, 0, .8)", ARROW_ALT = "rgba(159, 207, 63, .8)";
const MARK = "rgba(235, 97, 80, .8)";
/** Pixels the pointer moves before a press becomes a drag. */
const DRAG_START = 4;

/** Keeps an id per piece across positions, so a piece that moves keeps its element and slides. */
function trackIds(prev: { board: BoardCell[]; ids: number[] } | null, board: BoardCell[], size: number, next: { n: number }) {
  const ids: number[] = Array(board.length).fill(-1);
  if (!prev || prev.board.length !== board.length) {
    board.forEach((c, i) => c && (ids[i] = next.n++));
    return ids;
  }
  const vacated: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (prev.board[i] && prev.board[i] === board[i]) ids[i] = prev.ids[i];
    else if (prev.board[i]) vacated.push(i);
  }
  const dist = (a: number, b: number) => Math.abs((a % size) - (b % size)) + Math.abs(Math.floor(a / size) - Math.floor(b / size));
  for (let i = 0; i < board.length; i++) {
    const c = board[i];
    if (!c || ids[i] >= 0) continue;
    // The same piece first, then a piece of the same colour (a promotion).
    const pick = (ok: (s: number) => boolean) => vacated.filter(ok).sort((a, b) => dist(a, i) - dist(b, i))[0];
    const from = pick((s) => prev.board[s] === c) ?? pick((s) => prev.board[s]![0] === c[0]);
    if (from !== undefined) {
      vacated.splice(vacated.indexOf(from), 1);
      ids[i] = prev.ids[from];
    } else ids[i] = next.n++;
  }
  return ids;
}

export type BoardProps = {
  size: number;
  /** Index = rank × size + file, rank 0 on White's side. A piece is a string starting with its colour. */
  cells: BoardCell[];
  flipped: boolean;
  /** Moves the viewer may play now (or premove); empty when the board is only shown. */
  moves: BoardMove[];
  last: number[] | null;
  check?: number | null;
  /** Squares of the premoves waiting, in red. */
  premoves?: number[];
  onMove?: (m: BoardMove) => void;
  /** Called on any press, e.g. to leave the history and come back to the game. */
  onPress?: () => void;
  /** A right click or a click on an empty square: the premoves are dropped. */
  onCancel?: () => void;
  renderPiece: (cell: string) => ReactNode;
  /** "edges": letters and numbers along two edges; "squares": a number on each dark square. */
  coords?: "edges" | "squares" | false;
  squareLabel?: (i: number) => string | null;
  promoOrder?: string[];
};

export default function Board2D({ size, cells, flipped, moves, last, check = null, premoves = [], onMove, onPress, onCancel, renderPiece, coords = "edges", squareLabel, promoOrder = [] }: BoardProps) {
  const outer = useRef<HTMLDivElement>(null),
    grid = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(null),
    [drag, setDrag] = useState<{ from: number; x: number; y: number; moving: boolean } | null>(null),
    [hover, setHover] = useState<number | null>(null),
    [promo, setPromo] = useState<{ from: number; to: number } | null>(null),
    [marks, setMarks] = useState<number[]>([]),
    [arrows, setArrows] = useState<Arrow[]>([]),
    [dropped, setDropped] = useState<number | null>(null),
    [fit, setFit] = useState<{ side: number; left: number; top: number } | null>(null);
  const rightFrom = useRef<number | null>(null);
  const press = useRef<{ x: number; y: number; wasSelected: boolean } | null>(null);
  const n = size, pct = 100 / n;

  // Whole device pixels per square, the board's corner on a device pixel.
  useLayoutEffect(() => {
    const el = outer.current!;
    const measure = () => {
      const r = el.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth, h = el.clientHeight;
      const sq = Math.floor((w * dpr) / n);
      if (sq <= 0) return;
      const side = (sq * n) / dpr;
      // Under a 3D transform (the hub poster) the screen box is not the layout box: only centre.
      const flat = Math.abs(r.width - w) < 0.5;
      const left = flat ? Math.round((r.left + (w - side) / 2) * dpr) / dpr - r.left : (w - side) / 2;
      const top = flat ? Math.round((r.top + (h - side) / 2) * dpr) / dpr - r.top : (h - side) / 2;
      setFit((f) => (f && f.side === side && f.left === left && f.top === top ? f : { side, left, top }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    // The page around the board can move it without resizing it.
    const t = setInterval(measure, 1500);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      clearInterval(t);
    };
  }, [n]);

  // Piece identities, recomputed only when the position changes.
  const track = useRef<{ key: string; board: BoardCell[]; ids: number[] } | null>(null),
    counter = useRef({ n: 0 });
  const key = cells.map((c) => c ?? ".").join(",");
  if (track.current?.key !== key) track.current = { key, board: cells, ids: trackIds(track.current, cells, n, counter.current) };
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
  const toXY = (s: number) => {
    const f = s % n, r = Math.floor(s / n);
    return { x: flipped ? n - 1 - f : f, y: flipped ? r : n - 1 - r };
  };
  const at = (s: number) => ({ "--x": toXY(s).x, "--y": toXY(s).y }) as CSSProperties;
  function squareAt(clientX: number, clientY: number) {
    const r = grid.current!.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * n), y = Math.floor(((clientY - r.top) / r.height) * n);
    if (x < 0 || x >= n || y < 0 || y >= n) return null;
    const f = flipped ? n - 1 - x : x, rk = flipped ? y : n - 1 - y;
    return rk * n + f;
  }
  function attempt(f: number, t: number, fromDrop: boolean) {
    const options = moves.filter((m) => m.from === f && m.to === t);
    if (!options.length) return false;
    setSelected(null);
    if (options.length > 1 && options.some((m) => m.promo)) {
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
      // Right click drops the premoves first, like on the big sites.
      if (premoves.length) {
        onCancel?.();
        rightFrom.current = null;
        return;
      }
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
      const r = grid.current!.getBoundingClientRect();
      setDrag({ from: s, x: e.clientX - r.left, y: e.clientY - r.top, moving: false });
      outer.current!.setPointerCapture(e.pointerId);
    } else {
      setSelected(null);
      if (!cells[s] || cells[s]![0] !== cells[moves[0]?.from ?? -1]?.[0]) onCancel?.();
    }
  }
  function move(e: ReactPointerEvent) {
    if (!drag || !press.current) return;
    const r = grid.current!.getBoundingClientRect();
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

  const sq = fit ? fit.side / n : null;
  const pieces = cells.flatMap((c, i) => (c ? [{ c, i, id: ids[i] }] : [])).sort((a, b) => a.id - b.id);
  const dark = (s: number) => ((s % n) + Math.floor(s / n)) % 2 === 0;
  const promoCol = promo && toXY(promo.to);
  const promoColor = promo && cells[promo.from]![0];
  const fromTop = promoCol ? promoCol.y === 0 : true;
  const promoOptions = promo ? moves.filter((m) => m.from === promo.from && m.to === promo.to).sort((a, b) => promoOrder.indexOf(a.promo ?? "") - promoOrder.indexOf(b.promo ?? "")) : [];
  const gridStyle: CSSProperties = fit ? { width: fit.side, height: fit.side, left: fit.left, top: fit.top } : { inset: 0 };
  const lines = (s: number) => {
    const { x, y } = toXY(s);
    return { x: x * 100 + 50, y: y * 100 + 50 };
  };

  return (
    <div
      className={"cc-board" + (turned ? " turned" : "")}
      ref={outer}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        setDrag(null);
        setHover(null);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="cc-grid" ref={grid} style={{ ...gridStyle, "--n": n } as CSSProperties}>
        <svg className="cc-squares" viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" aria-hidden="true">
          <rect width={n} height={n} className="light" />
          {Array.from({ length: n * n }, (_, s) => (dark(s) ? <rect key={s} x={toXY(s).x} y={toXY(s).y} width="1" height="1" className="dark" /> : null))}
        </svg>
        {coords === "edges" && (
          <svg className="cc-coords" viewBox="0 0 100 100" aria-hidden="true">
            {Array.from({ length: n }, (_, k) => {
              const rk = flipped ? k : n - 1 - k, f = flipped ? n - 1 - k : k;
              const left = rk * n + (flipped ? n - 1 : 0), bottom = (flipped ? n - 1 : 0) * n + f;
              return (
                <g key={k}>
                  <text x="0.75" y={k * pct + 0.8} className={dark(left) ? "on-dark" : "on-light"}>{rk + 1}</text>
                  <text x={k * pct + pct - 0.7} y="99.2" textAnchor="end" className={dark(bottom) ? "on-dark" : "on-light"}>{"abcdefghijkl"[f]}</text>
                </g>
              );
            })}
          </svg>
        )}
        {coords === "squares" && squareLabel && (
          <svg className="cc-coords" viewBox="0 0 100 100" aria-hidden="true">
            {cells.map((_, s) => {
              const label = squareLabel(s);
              if (!label) return null;
              const { x, y } = toXY(s);
              return <text key={s} x={x * pct + 0.6} y={y * pct + 0.6} className="on-dark small">{label}</text>;
            })}
          </svg>
        )}
        {last && last.map((s) => <i key={"l" + s} className="cc-hl" style={at(s)} />)}
        {premoves.map((s, k) => <i key={"p" + k + "-" + s} className="cc-pre" style={at(s)} />)}
        {from !== null && <i className={premoves.length || moves[0]?.id === -1 ? "cc-pre" : "cc-hl"} style={at(from)} />}
        {marks.map((s) => <i key={"m" + s} className="cc-mark" style={{ ...at(s), background: MARK }} />)}
        {check !== null && <i className="cc-check" style={at(check)} />}
        {hover !== null && <i className="cc-hover" style={at(hover)} />}

        {pieces.map(({ c, i, id }) => {
          const { x, y } = toXY(i);
          const dragging = drag?.moving && drag.from === i;
          const style: CSSProperties = dragging
            ? { transform: `translate(${drag.x - (sq ?? 0) / 2}px, ${drag.y - (sq ?? 0) / 2}px)` }
            : sq
              ? { transform: `translate(${x * sq}px, ${y * sq}px)` }
              : { transform: `translate(${x * 100}%, ${y * 100}%)` };
          return (
            <div key={id} className={"cc-piece" + (dragging ? " dragging" : "") + (dropped === id ? " still" : "")} style={style}>
              {renderPiece(c)}
            </div>
          );
        })}

        {[...new Set(targets.map((m) => m.to))].map((t) => {
          const take = !!cells[t] || targets.some((m) => m.to === t && m.capture);
          return <i key={"t" + t} className={take ? "cc-ring" : "cc-dot"} style={at(t)} />;
        })}

        {!!arrows.length && (
          <svg className="cc-arrows" viewBox={`0 0 ${n * 100} ${n * 100}`} aria-hidden="true">
            {arrows.map((a) => {
              const p0 = lines(a.from), p1 = lines(a.to);
              const dx = p1.x - p0.x, dy = p1.y - p0.y;
              // A knight's jump bends: along the long side first, then the short one.
              const knight = n === 8 && ((Math.abs(dx) === 100 && Math.abs(dy) === 200) || (Math.abs(dx) === 200 && Math.abs(dy) === 100));
              const pts = knight ? (Math.abs(dy) > Math.abs(dx) ? [p0, { x: p0.x, y: p1.y }, p1] : [p0, { x: p1.x, y: p0.y }, p1]) : [p0, p1];
              const prev = pts[pts.length - 2];
              const len = Math.hypot(p1.x - prev.x, p1.y - prev.y);
              const ux = (p1.x - prev.x) / len, uy = (p1.y - prev.y) / len;
              const bx = p1.x - ux * 34, by = p1.y - uy * 34;
              const sLen = Math.hypot(pts[1].x - p0.x, pts[1].y - p0.y);
              const start = { x: p0.x + ((pts[1].x - p0.x) / sLen) * 18, y: p0.y + ((pts[1].y - p0.y) / sLen) * 18 };
              const line = [start, ...pts.slice(1, -1), { x: bx, y: by }].map((p) => `${p.x},${p.y}`).join(" ");
              const tip = `${p1.x},${p1.y} ${bx - uy * 22},${by + ux * 22} ${bx + uy * 22},${by - ux * 22}`;
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
          <div className={"cc-promo" + (fromTop ? "" : " up")} style={{ "--x": promoCol.x } as CSSProperties} onPointerDown={(e) => e.stopPropagation()} role="group" aria-label="Promotion">
            {promoOptions.map((m) => (
              <button
                key={m.id}
                aria-label={m.promo}
                onClick={() => {
                  setPromo(null);
                  onMove?.(m);
                }}
              >
                {renderPiece(`${promoColor}${m.promo}`)}
              </button>
            ))}
            <button className="cc-promo-x" aria-label="✕" onClick={() => setPromo(null)}><X /></button>
          </div>
        )}
      </div>
    </div>
  );
}

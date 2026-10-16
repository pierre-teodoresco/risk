"use client";
// The table of the two-player games, laid out like the big chess sites: the opponent's bar above
// the board and yours below (name, pieces taken, material, clock), the move list on the side with
// arrows to look back through the game, draw and resign underneath, and the result over the
// board. Each game plugs its rules in through a `Game2D`; chess also allows premoves.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Flag, Handshake, Timer, Trophy, X } from "lucide-react";
import EmblemBadge from "@/components/EmblemBadge";
import { fmt } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import type { Action } from "@/platform/contract";
import { clockText, useClocks, type TableProps } from "./DuelScreen";
import { reasonText } from "../i18n";
import type { Side } from "../engine";
import Board2D, { type BoardCell, type BoardMove, type BoardProps } from "./Board2D";
import { playSound, type Sound } from "./sound";

const CONFIRM_MS = 3000;
const LOW_MS = 20000;

export type Game2D<P, M> = {
  size: number;
  start: () => P;
  cells: (p: P) => BoardCell[];
  turn: (p: P) => Side;
  legal: (p: P) => M[];
  play: (p: P, m: M) => P;
  /** The move in the notation the server records, to rebuild the history. */
  notation: (p: P, m: M) => string;
  /** Start, end, capture and promotion, for the board. */
  ends: (m: M) => { from: number; to: number; capture: boolean; promo?: string };
  /** What the server expects in the `move` action. */
  action: (m: M) => Record<string, unknown>;
  /** Squares lit after the move. */
  highlight: (m: M) => number[];
  check?: (p: P) => number | null;
  sound: (before: P, m: M, after: P) => Sound;
  soundOf: (notation: string) => Sound;
  Piece: (props: { cell: string; className?: string }) => ReactNode;
  /** Pieces taken by `by`, as [piece kind, count], and the material balance (White − Black). */
  material: (cells: BoardCell[]) => { taken: (by: Side) => [string, number][]; score: number };
  /** The move as written in the list. */
  Notation?: (props: { text: string }) => ReactNode;
  board: Pick<BoardProps, "coords" | "squareLabel" | "promoOrder">;
  /** Premoves: where a piece could go if the board stays as it is, and how a queued premove changes the board. */
  premove?: {
    targets: (cells: BoardCell[], from: number, real: P) => number[];
    apply: (cells: BoardCell[], from: number, to: number) => BoardCell[];
    /** The legal move a premove becomes once it is the player's turn, if it still is legal. */
    resolve: (p: P, from: number, to: number) => M | null;
  };
};

const TEXTS = {
  fr: {
    untimed: "Sans pendule",
    bullet: "Bullet",
    blitz: "Blitz",
    rapid: "Rapide",
    first: "Premier coup",
    previous: "Coup précédent",
    next: "Coup suivant",
    latest: "Dernier coup",
    whiteWon: "Victoire des Blancs",
    blackWon: "Victoire des Noirs",
    review: "Revoir la partie",
    newRound: "Revanche",
    gameOver: "Partie terminée",
    vs: "vs",
    premoves: "{n} prémove(s) en attente · clic droit pour annuler",
  },
  en: {
    untimed: "Untimed",
    bullet: "Bullet",
    blitz: "Blitz",
    rapid: "Rapid",
    first: "First move",
    previous: "Previous move",
    next: "Next move",
    latest: "Latest move",
    whiteWon: "White won",
    blackWon: "Black won",
    review: "Review the game",
    newRound: "Rematch",
    gameOver: "Game over",
    vs: "vs",
    premoves: "{n} premove(s) queued · right-click to cancel",
  },
};

type Replay<P, M> = { moves: string[]; positions: P[]; played: (M | null)[] };
/** Rebuilds every position of the game from its notation; extends the last result when the list only grew. */
function replay<P, M>(g: Game2D<P, M>, moves: string[], previous?: Replay<P, M>): Replay<P, M> {
  const keep = previous && previous.moves.length <= moves.length && previous.moves.every((m, k) => m === moves[k]) ? previous : null;
  const positions = keep ? [...keep.positions] : [g.start()];
  const played = keep ? [...keep.played] : [null];
  for (let k = positions.length - 1; k < moves.length; k++) {
    const p = positions[k];
    const m = g.legal(p).find((x) => g.notation(p, x) === moves[k]);
    // A list that does not replay (should not happen) stops where it breaks.
    if (!m) break;
    positions.push(g.play(p, m));
    played.push(m);
  }
  return { moves: [...moves], positions, played };
}

export default function Table2D<P, M>({ rules, game, side, tx, lang, act, busy }: TableProps<P> & { rules: Game2D<P, M> }) {
  const t = TEXTS[lang];
  const R = rules;
  const { turn, running, remaining } = useClocks(game);
  const [pending, setPending] = useState<{ move: M; base: number } | null>(null),
    [ply, setPly] = useState<number | null>(null),
    [confirmResign, setConfirmResign] = useState(false),
    [dismissed, setDismissed] = useState<number | null>(null),
    [queue, setQueue] = useState<{ from: number; to: number }[]>([]);

  const cache = useRef<Replay<P, M> | undefined>(undefined);
  const history = useMemo(() => (cache.current = replay(R, game.moves, cache.current)), [R, game.moves]);

  // A move sent and not yet confirmed shows at once; the server's answer replaces it.
  useEffect(() => {
    setPending(null);
    setPly(null);
  }, [game.moves.length, game.round]);
  useEffect(() => {
    setQueue([]);
  }, [game.round, game.phase]);
  const live = ply === null || ply >= game.moves.length;
  const pendingMove = pending && pending.base === game.moves.length ? pending.move : null;
  const real = game.position;
  const shown: P = !live ? history.positions[ply!] : pendingMove ? R.play(real, pendingMove) : real;
  const lastMove = !live ? history.played[ply!] : pendingMove ?? history.played[history.played.length - 1];
  const playing = game.phase === "playing" && !game.paused && !!side;
  const myTurn = live && !pendingMove && playing && side === R.turn(real);
  const premoving = live && playing && !!R.premove && !myTurn;

  // The board as the player will have it once the queued premoves are played.
  const virtual = useMemo(() => {
    let cells = R.cells(shown);
    if (premoving) for (const q of queue) cells = R.premove!.apply(cells, q.from, q.to);
    return cells;
  }, [R, shown, premoving, queue]);

  const legal = useMemo(() => (myTurn ? R.legal(real) : []), [R, real, myTurn]);
  const boardMoves = useMemo<BoardMove[]>(() => {
    if (myTurn) return legal.map((m, id) => ({ ...R.ends(m), id }));
    if (!premoving) return [];
    const out: BoardMove[] = [];
    virtual.forEach((c, from) => {
      if (c?.[0] !== side) return;
      for (const to of R.premove!.targets(virtual, from, real)) out.push({ from, to, id: -1 });
    });
    return out;
  }, [R, myTurn, legal, premoving, virtual, side, real, queue.length]);

  // Sounds: once per move, when it first appears (the player's own move sounds on the drop).
  const heard = useRef({ count: game.moves.length, round: game.round, phase: game.phase });
  useEffect(() => {
    if (game.phase === "playing" && !game.moves.length) playSound("start");
    // Only when the table opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const h = heard.current;
    if (h.round !== game.round) playSound("start");
    else if (game.moves.length > h.count) playSound(R.soundOf(game.moves[game.moves.length - 1]));
    if (h.phase === "playing" && game.phase === "finished") setTimeout(() => playSound("end"), 160);
    heard.current = { count: Math.max(h.round === game.round ? h.count : 0, game.moves.length), round: game.round, phase: game.phase };
  }, [R, game.moves, game.round, game.phase]);

  async function send(m: M) {
    const base = game.moves.length;
    setPending({ move: m, base });
    playSound(R.sound(real, m, R.play(real, m)));
    heard.current.count = base + 1;
    if (!(await act({ type: "move", ...R.action(m) } as Action))) setPending(null);
  }

  // When the turn comes back, the first premove plays at once if it is still legal; otherwise
  // the whole queue is dropped, like on the big sites.
  useEffect(() => {
    if (!myTurn || !queue.length || !R.premove || busy) return;
    const [first, ...rest] = queue;
    const m = R.premove.resolve(real, first.from, first.to);
    setQueue(m ? rest : []);
    if (m) void send(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, game.moves.length, busy]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQueue([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Arrow keys walk through the game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const n = game.moves.length, at = ply ?? n;
      if (e.key === "ArrowLeft") setPly(Math.max(0, at - 1));
      else if (e.key === "ArrowRight") setPly(at + 1 >= n ? null : at + 1);
      else if (e.key === "ArrowUp") setPly(0);
      else if (e.key === "ArrowDown") setPly(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ply, game.moves.length]);

  // Low-time tick for the player to move.
  const mine: Side = side ?? "w";
  const myMs = remaining(mine);
  const lowRef = useRef(false);
  useEffect(() => {
    const low = running && turn === mine && myMs < LOW_MS;
    if (low && !lowRef.current) playSound("low");
    lowRef.current = low;
  }, [running, turn, mine, myMs]);

  const seat = (s: Side) => game.players.find((p) => p.side === s);
  const { taken, score } = R.material(R.cells(shown));
  const order: Side[] = [mine === "w" ? "b" : "w", mine];
  const minutes = game.options.clock;
  const category = !minutes ? t.untimed : minutes < 3 ? t.bullet : minutes < 10 ? t.blitz : t.rapid;
  const listRef = useRef<HTMLDivElement>(null);
  const current = live ? game.moves.length : ply!;
  useEffect(() => {
    listRef.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  }, [current]);
  const rows: number[] = [];
  for (let k = 0; k < game.moves.length; k += 2) rows.push(k);
  const opponent = seat(side === "w" ? "b" : "w");
  const finished = game.phase === "finished" && game.result;
  const showResult = finished && dismissed !== game.round;
  const Piece = R.Piece, Notation = R.Notation;

  const bar = (s: Side, top: boolean) => {
    const p = seat(s);
    const ms = remaining(s);
    const caps = taken(s);
    const lead = s === "w" ? score : -score;
    const active = game.phase === "playing" && turn === s;
    return (
      <div className={"cc-bar" + (top ? " top" : "")}>
        <span className="cc-avatar">{p && <EmblemBadge emblem={p.emblem} size={40} />}</span>
        <div className="cc-who">
          <b>
            {p?.name ?? "—"}
            {p?.id === game.me && <small>{tx.you}</small>}
          </b>
          <span className="cc-caps">
            {caps.map(([k, n]) => (
              <span key={k} className="cc-capgroup">
                {Array.from({ length: n }, (_, j) => <Piece key={j} cell={`${s === "w" ? "b" : "w"}${k}`} />)}
              </span>
            ))}
            {lead > 0 && <em>+{lead}</em>}
          </span>
        </div>
        {minutes > 0 && (
          <span className={`cc-clock ${s}` + (active ? " active" : "") + (active && running && ms < LOW_MS ? " low" : "")}>
            {active && running && <Timer size={16} />}
            {clockText(ms)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="cc-table">
      <div className="cc-col">
        <div className="cc-stack">
          {bar(order[0], true)}
          <div className="cc-board-box">
            <Board2D
              size={R.size}
              cells={virtual}
              flipped={side === "b"}
              moves={boardMoves}
              last={lastMove ? R.highlight(lastMove) : null}
              check={R.check?.(shown) ?? null}
              premoves={premoving ? queue.flatMap((q) => [q.from, q.to]) : []}
              onMove={(m) => {
                if (m.id >= 0) void send(legal[m.id]);
                else {
                  setQueue((q) => [...q, { from: m.from, to: m.to }]);
                  playSound("premove");
                }
              }}
              onPress={() => !live && setPly(null)}
              onCancel={() => setQueue([])}
              renderPiece={(c) => <Piece cell={c} />}
              {...R.board}
            />
            {showResult && (
              <div className="cc-result" role="dialog" aria-modal="true" aria-labelledby="cc-result-title">
                <div className="cc-result-card">
                  <button className="cc-result-x" aria-label={tx.close} onClick={() => setDismissed(game.round)}><X size={18} /></button>
                  <header className={game.result!.winner ? (game.result!.winner === side ? "win" : side ? "loss" : "win") : "draw"}>
                    {game.result!.winner ? <Trophy size={30} /> : <Handshake size={30} />}
                    <h2 id="cc-result-title">
                      {!game.result!.winner ? tx.draw : side && game.result!.winner === side ? tx.youWon : game.result!.winner === "w" ? t.whiteWon : t.blackWon}
                    </h2>
                    <p>{reasonText(game.result!.reason, lang)}</p>
                  </header>
                  <div className="cc-result-players">
                    {(["w", "b"] as Side[]).map((s, k) => {
                      const p = seat(s);
                      return (
                        <span key={s} className={"cc-result-player" + (game.result!.winner === s ? " won" : "")}>
                          {k === 1 && <i className="cc-vs">{t.vs}</i>}
                          <span className="cc-avatar big">{p && <EmblemBadge emblem={p.emblem} size={56} />}</span>
                          <b>{p?.name ?? "—"}</b>
                        </span>
                      );
                    })}
                  </div>
                  {game.players.filter((p) => !p.left).length === 2 && side && (
                    <button className="cc-btn green big" disabled={busy} onClick={() => void act({ type: "again" })}>{t.newRound}</button>
                  )}
                  <button className="cc-btn" onClick={() => setDismissed(game.round)}>{t.review}</button>
                </div>
              </div>
            )}
          </div>
          {bar(order[1], false)}
        </div>
      </div>

      <aside className="cc-side">
        <header className="cc-side-head">
          <Timer size={18} />
          <b>{minutes ? `${minutes} min${game.options.increment ? ` | ${game.options.increment}` : ""}` : t.untimed}</b>
          <span>{category}</span>
        </header>
        <div className="cc-moves" ref={listRef}>
          {rows.length ? (
            rows.map((k) => (
              <div key={k} className="cc-row">
                <span className="cc-num">{k / 2 + 1}.</span>
                {[k, k + 1].map((i) =>
                  i < game.moves.length ? (
                    <button key={i} className={"cc-move" + (current === i + 1 ? " on" : "")} onClick={() => setPly(i + 1 >= game.moves.length ? null : i + 1)}>
                      {Notation ? <Notation text={game.moves[i]} /> : game.moves[i]}
                    </button>
                  ) : (
                    <span key={i} />
                  ),
                )}
              </div>
            ))
          ) : (
            <p className="cc-empty">{finished ? "" : side ? (turn === side ? tx.yourTurn : fmt(tx.theirTurn, { name: seat(turn)?.name ?? "" })) : tx.spectating}</p>
          )}
        </div>

        {premoving && queue.length > 0 && <p className="cc-premoves">{fmt(t.premoves, { n: queue.length })}</p>}

        {playing && game.drawOffer && game.drawOffer !== side && (
          <div className="cc-offer">
            <span><Handshake size={18} /> {fmt(tx.drawIncoming, { name: opponent?.name ?? "" })}</span>
            <div>
              <button className="cc-btn green" disabled={busy} onClick={() => void act({ type: "answerDraw", accept: true })}>{tx.accept}</button>
              <button className="cc-btn" disabled={busy} onClick={() => void act({ type: "answerDraw", accept: false })}>{tx.refuse}</button>
            </div>
          </div>
        )}

        <nav className="cc-nav" aria-label={tx.moves}>
          <button aria-label={t.first} title={t.first} disabled={current === 0} onClick={() => setPly(0)}><ChevronFirst /></button>
          <button aria-label={t.previous} title={t.previous} disabled={current === 0} onClick={() => setPly(Math.max(0, current - 1))}><ChevronLeft /></button>
          <button aria-label={t.next} title={t.next} disabled={live} onClick={() => setPly(current + 1 >= game.moves.length ? null : current + 1)}><ChevronRight /></button>
          <button aria-label={t.latest} title={t.latest} disabled={live} onClick={() => setPly(null)}><ChevronLast /></button>
        </nav>

        {game.phase === "playing" && side ? (
          <div className="cc-actions">
            <button className="cc-btn" disabled={busy || game.drawOffer === side} onClick={() => void act({ type: "offerDraw" })}>
              <span className="cc-half">½</span> {game.drawOffer === side ? tx.drawOffered : tx.offerDraw}
            </button>
            <button
              className={"cc-btn" + (confirmResign ? " red" : "")}
              disabled={busy}
              onClick={() => {
                if (!confirmResign) {
                  setConfirmResign(true);
                  setTimeout(() => setConfirmResign(false), CONFIRM_MS);
                } else void act({ type: "resign" });
              }}
            >
              <Flag size={16} /> {confirmResign ? tx.resignConfirm : tx.resign}
            </button>
          </div>
        ) : (
          finished && (
            <div className="cc-actions">
              <p className="cc-over">{t.gameOver} · {reasonText(game.result!.reason, lang)}</p>
              {game.players.filter((p) => !p.left).length === 2 && side && (
                <button className="cc-btn green" disabled={busy} onClick={() => void act({ type: "again" })}>{t.newRound}</button>
              )}
            </div>
          )
        )}
      </aside>
    </div>
  );
}

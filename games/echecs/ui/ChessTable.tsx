"use client";
// The chess table, laid out like the big chess sites: the opponent's bar above the board and
// yours below (name, captured pieces, material, clock), the move list on the side with arrows
// to look back through the game, draw and resign underneath, and the result over the board.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Flag, Handshake, Timer, Trophy, X } from "lucide-react";
import EmblemBadge from "@/components/EmblemBadge";
import { fmt } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import { clockText, useClocks, type TableProps } from "@/games/duel/ui/DuelScreen";
import { reasonText } from "@/games/duel/i18n";
import type { Side } from "@/games/duel/engine";
import { inCheck, kingSquare, legalMoves, play, type Cell, type Kind, type Move, type Position } from "../rules";
import Board2D from "./Board2D";
import Piece from "./Piece";
import { replay, type Replay } from "./replay";
import { playSound, type Sound } from "./sound";

const CONFIRM_MS = 3000;
const LOW_MS = 20000;
const VALUE: Record<Kind, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT: Record<Kind, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const CAPTURE_ORDER: Kind[] = ["p", "b", "n", "r", "q"];

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
    draw: "Nulle",
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
    draw: "Draw",
  },
};

/** Pieces each side has taken, from what is missing on the board, and the material balance. */
function material(board: Cell[]) {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } };
  let score = 0;
  for (const c of board) {
    if (!c) continue;
    const s = c[0] as Side, k = c[1] as Kind;
    count[s][k]++;
    score += (s === "w" ? 1 : -1) * VALUE[k];
  }
  const taken = (by: Side) => {
    const them = by === "w" ? count.b : count.w;
    return CAPTURE_ORDER.map((k) => [k, Math.max(0, START_COUNT[k] - them[k])] as const).filter(([, n]) => n > 0);
  };
  return { taken, score };
}

function soundOf(san: string): Sound {
  if (san.includes("#") || san.includes("+")) return "check";
  if (san.startsWith("O-O")) return "castle";
  return san.includes("x") ? "capture" : "move";
}

/** Notation with the moving piece drawn instead of its letter, as on the big sites. */
function Figurine({ san, side }: { san: string; side: Side }) {
  const head = /^[KQRBN]/.test(san) ? (san[0].toLowerCase() as Kind) : null;
  const promo = san.match(/=([QRBN])/);
  const body = (head ? san.slice(1) : san).replace(/=[QRBN]/, "=");
  return (
    <>
      {head && <Piece cell={`${side}${head}`} className="cc-fig" />}
      {body}
      {promo && <Piece cell={`${side}${promo[1].toLowerCase() as Kind}`} className="cc-fig" />}
    </>
  );
}

export default function ChessTable({ game, side, tx, lang, act, busy }: TableProps<Position>) {
  const t = TEXTS[lang];
  const { turn, running, remaining } = useClocks(game);
  const [pending, setPending] = useState<{ move: Move; base: number } | null>(null),
    [ply, setPly] = useState<number | null>(null),
    [confirmResign, setConfirmResign] = useState(false),
    [dismissed, setDismissed] = useState<number | null>(null);

  // Positions of every move, for the history and the highlights.
  const cache = useRef<Replay | undefined>(undefined);
  const history = useMemo(() => (cache.current = replay(game.moves, cache.current)), [game.moves]);

  // A move sent and not yet confirmed shows at once; the server's answer replaces it.
  useEffect(() => {
    setPending(null);
  }, [game.moves.length, game.round]);
  const live = ply === null || ply >= game.moves.length;
  useEffect(() => {
    setPly(null);
  }, [game.moves.length, game.round]);

  const pendingMove = pending && pending.base === game.moves.length ? pending.move : null;
  const shown: Position = !live ? history.positions[ply!] : pendingMove ? play(game.position, pendingMove) : game.position;
  const lastMove = !live ? history.played[ply!] : pendingMove ?? history.played[history.played.length - 1];
  const myTurn = live && !pendingMove && game.phase === "playing" && !game.paused && side === game.position.turn;
  const moves = useMemo(() => (myTurn ? legalMoves(game.position) : []), [game.position, myTurn]);
  const check = inCheck(shown) ? kingSquare(shown.board, shown.turn) : null;

  // Sounds: once per move, when it first appears (the player's own move sounds on the drop).
  const heard = useRef({ count: game.moves.length, round: game.round, phase: game.phase });
  useEffect(() => {
    if (game.phase === "playing" && !game.moves.length) playSound("start");
    // Only when the table opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const h = heard.current;
    if (h.round !== game.round || (h.phase === "lobby" && game.phase === "playing")) playSound("start");
    else if (game.moves.length > h.count) playSound(soundOf(game.moves[game.moves.length - 1]));
    if (h.phase === "playing" && game.phase === "finished") setTimeout(() => playSound("end"), 160);
    heard.current = { count: Math.max(h.round === game.round ? h.count : 0, game.moves.length), round: game.round, phase: game.phase };
  }, [game.moves, game.round, game.phase]);

  async function send(m: Move) {
    const base = game.moves.length;
    setPending({ move: m, base });
    const next = play(game.position, m);
    const capture = !!game.position.board[m.to] || m.ep;
    playSound(inCheck(next) ? "check" : m.castle ? "castle" : capture ? "capture" : "move");
    heard.current.count = base + 1;
    if (!(await act({ type: "move", from: m.from, to: m.to, promo: m.promo }))) setPending(null);
  }

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
  const { taken, score } = material(shown.board);
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
  const playing = game.phase === "playing" && !!side;
  const opponent = seat(side === "w" ? "b" : "w");
  const finished = game.phase === "finished" && game.result;
  const showResult = finished && dismissed !== game.round;

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
              position={shown}
              flipped={side === "b"}
              moves={moves}
              last={lastMove ? [lastMove.from, lastMove.to] : null}
              check={check}
              onMove={(m) => void send(m)}
              onPress={() => !live && setPly(null)}
            />
            {showResult && (
              <div className="cc-result" role="dialog" aria-modal="true" aria-labelledby="cc-result-title">
                <div className="cc-result-card">
                  <button className="cc-result-x" aria-label={tx.close} onClick={() => setDismissed(game.round)}><X size={18} /></button>
                  <header className={game.result!.winner ? (game.result!.winner === side ? "win" : side ? "loss" : "win") : "draw"}>
                    {game.result!.winner ? <Trophy size={30} /> : <Handshake size={30} />}
                    <h2 id="cc-result-title">
                      {!game.result!.winner ? tx.draw : side ? (game.result!.winner === side ? tx.youWon : game.result!.winner === "w" ? t.whiteWon : t.blackWon) : game.result!.winner === "w" ? t.whiteWon : t.blackWon}
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
                      <Figurine san={game.moves[i]} side="w" />
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

        {playing ? (
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

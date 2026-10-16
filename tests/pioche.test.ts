import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  joinGame,
  makeDeck,
  publicGame,
  playable,
  type Card,
  type Game,
} from "../games/pioche/engine";

let seed = 4242;
function rand() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
const NOW = 1000;
const card = (id: string): Card => makeDeck().find((c) => c.id === id)!;

function table(n = 3, options: Partial<Game["options"]> = {}) {
  let g = createGame("PIOCHE", { name: "Alice", emblem: 0 }, "h0", NOW);
  for (let i = 1; i < n; i++) g = joinGame(g, { name: "Player " + i, emblem: i }, "h" + i, NOW);
  g = applyAction(g, g.host, { type: "options", ...options }, rand, NOW);
  return applyAction(g, g.host, { type: "start" }, rand, NOW);
}
/** Sets a known position: the active player holds `hand`, the pile shows `top`. */
function position(g: Game, hand: string[], top: string, others: string[] = ["blue-9a", "blue-8a", "blue-7a"]) {
  const s = structuredClone(g);
  for (const p of s.players) p.hand = (p.id === s.active ? hand : others).map(card);
  s.discard = [card(top)];
  s.color = card(top).color;
  s.direction = 1;
  s.drawn = null;
  return s;
}
const seat = (g: Game, offset: number) => {
  const i = g.players.findIndex((p) => p.id === g.active);
  return g.players[(i + offset + g.players.length) % g.players.length];
};

test("the deck has 108 cards with the official split", () => {
  const deck = makeDeck();
  assert.equal(deck.length, 108);
  assert.equal(new Set(deck.map((c) => c.id)).size, 108);
  assert.equal(deck.filter((c) => c.kind === "number" && c.value === 0).length, 4);
  assert.equal(deck.filter((c) => c.kind === "draw4").length, 4);
  assert.equal(deck.filter((c) => c.kind === "wild").length, 4);
  assert.equal(deck.filter((c) => c.kind === "skip").length, 8);
});

test("a round deals seven cards each and opens on a number card", () => {
  const g = table(4);
  assert.equal(g.phase, "playing");
  for (const p of g.players) assert.equal(p.hand.length, 7);
  assert.equal(g.discard.at(-1)!.kind, "number");
  assert.equal(g.deck.length + g.discard.length + 28, 108);
  assert.notEqual(g.active, g.dealer);
});

test("a card follows the colour, the number or the symbol", () => {
  const g = position(table(), [], "red-5a");
  assert.ok(playable(g, card("red-9a")));
  assert.ok(playable(g, card("blue-5a")));
  assert.ok(playable(g, card("wild1")));
  assert.ok(!playable(g, card("blue-6a")));
  assert.ok(!playable(g, card("blue-skipa")));
  const skip = position(g, [], "red-skipa");
  assert.ok(playable(skip, card("blue-skipb")));
});

test("skip, reverse and +2 move the turn as the rules say", () => {
  let g = position(table(4), ["red-skipa", "red-1a"], "red-5a");
  const after = seat(g, 2).id;
  g = applyAction(g, g.active, { type: "play", card: "red-skipa" }, rand, NOW + 1);
  assert.equal(g.active, after);

  g = position(table(4), ["red-reversea", "red-1a"], "red-5a");
  const before = seat(g, -1).id;
  g = applyAction(g, g.active, { type: "play", card: "red-reversea" }, rand, NOW + 1);
  assert.equal(g.direction, -1);
  assert.equal(g.active, before);

  g = position(table(4), ["red-draw2a", "red-1a"], "red-5a");
  const victim = seat(g, 1), afterVictim = seat(g, 2).id;
  g = applyAction(g, g.active, { type: "play", card: "red-draw2a" }, rand, NOW + 1);
  assert.equal(g.players.find((p) => p.id === victim.id)!.hand.length, 5);
  assert.equal(g.active, afterVictim);
  assert.equal(g.pendingDraw, 0);
});

test("reverse with two players works as a skip", () => {
  let g = position(table(2), ["red-reversea", "red-1a"], "red-5a");
  const me = g.active;
  g = applyAction(g, me, { type: "play", card: "red-reversea" }, rand, NOW + 1);
  assert.equal(g.active, me);
});

test("stacking passes +2 along until someone draws the total", () => {
  let g = position(table(3, { stacking: true }), ["red-draw2a", "red-1a"], "red-5a", ["blue-draw2a", "blue-1a", "blue-2a"]);
  g = applyAction(g, g.active, { type: "play", card: "red-draw2a" }, rand, NOW + 1);
  assert.equal(g.pendingDraw, 2);
  assert.throws(() => applyAction(g, g.active, { type: "play", card: "blue-1a" }, rand, NOW + 2), /notPlayable/);
  g = applyAction(g, g.active, { type: "play", card: "blue-draw2a" }, rand, NOW + 2);
  assert.equal(g.pendingDraw, 4);
  const payer = g.active;
  const before = g.players.find((p) => p.id === payer)!.hand.length;
  g = applyAction(g, payer, { type: "draw" }, rand, NOW + 3);
  assert.equal(g.players.find((p) => p.id === payer)!.hand.length, before + 4);
  assert.notEqual(g.active, payer);
  assert.equal(g.pendingDraw, 0);
});

test("a wild needs a colour and sets it", () => {
  let g = position(table(), ["wild1", "red-1a"], "red-5a");
  assert.throws(() => applyAction(g, g.active, { type: "play", card: "wild1" }, rand, NOW + 1), /chooseColor/);
  g = applyAction(g, g.active, { type: "play", card: "wild1", color: "green" }, rand, NOW + 1);
  assert.equal(g.color, "green");
  // Everyone is told which colour was chosen.
  assert.deepEqual(g.events.at(-1)!.key, "chose");
  assert.equal(g.events.at(-1)!.args[1], "green");
});

test("a challenged +4 played while holding the colour costs its player four cards", () => {
  let g = position(table(), ["draw4-1", "red-1a", "blue-2a"], "red-5a");
  const cheater = g.active;
  g = applyAction(g, cheater, { type: "play", card: "draw4-1", color: "blue" }, rand, NOW + 1);
  const victim = g.active;
  assert.deepEqual(publicGame(g, victim).challenge, { from: cheater, to: victim });
  g = applyAction(g, victim, { type: "challenge" }, rand, NOW + 2);
  assert.equal(g.players.find((p) => p.id === cheater)!.hand.length, 6);
  assert.equal(g.active, victim);
  assert.equal(g.pendingDraw, 0);
});

test("a lost challenge costs six cards and the turn", () => {
  let g = position(table(), ["draw4-1", "blue-1a", "blue-2a"], "red-5a");
  g = applyAction(g, g.active, { type: "play", card: "draw4-1", color: "blue" }, rand, NOW + 1);
  const victim = g.active;
  const before = g.players.find((p) => p.id === victim)!.hand.length;
  g = applyAction(g, victim, { type: "challenge" }, rand, NOW + 2);
  assert.equal(g.players.find((p) => p.id === victim)!.hand.length, before + 6);
  assert.notEqual(g.active, victim);
});

test("after drawing, only the drawn card may be played, else the player passes", () => {
  let g = position(table(), ["blue-1a", "blue-2a"], "red-5a");
  g.deck.push(card("red-9b"));
  const me = g.active;
  g = applyAction(g, me, { type: "draw" }, rand, NOW + 1);
  assert.equal(g.drawn, "red-9b");
  assert.equal(publicGame(g, seat(g, 1).id).drawn, null);
  assert.throws(() => applyAction(g, me, { type: "draw" }, rand, NOW + 2), /alreadyDrew/);
  g = applyAction(g, me, { type: "pass" }, rand, NOW + 2);
  assert.notEqual(g.active, me);
});

test("drawing until playable takes one card per draw and locks the hand until one fits", () => {
  let g = position(table(3, { drawUntilPlayable: true }), ["blue-1a", "red-2b"], "red-5a");
  g.deck.push(card("red-9b"), card("blue-3a"), card("green-4a"));
  const me = g.active;
  const hand = () => g.players.find((p) => p.id === me)!.hand.length;
  g = applyAction(g, me, { type: "draw" }, rand, NOW + 1);
  assert.equal(hand(), 3);
  assert.equal(g.active, me);
  assert.equal(g.drawing, true);
  // Once drawing has started, even a card that fitted before stays in hand.
  assert.throws(() => applyAction(g, me, { type: "play", card: "red-2b" }, rand, NOW + 2), /notPlayable/);
  assert.throws(() => applyAction(g, me, { type: "pass" }, rand, NOW + 2), /cannotPass/);
  g = applyAction(g, me, { type: "draw" }, rand, NOW + 3);
  assert.equal(hand(), 4);
  assert.equal(g.drawn, null);
  g = applyAction(g, me, { type: "draw" }, rand, NOW + 4);
  assert.equal(hand(), 5);
  assert.equal(g.drawn, "red-9b");
  assert.equal(g.drawing, false);
  g = applyAction(g, me, { type: "play", card: "red-9b" }, rand, NOW + 5);
  assert.notEqual(g.active, me);
});

test("drawing until playable leaves +2 penalties drawn in one go", () => {
  let g = position(table(3, { drawUntilPlayable: true }), ["red-draw2a", "red-1a"], "red-5a");
  const victim = seat(g, 1).id;
  g = applyAction(g, g.active, { type: "play", card: "red-draw2a" }, rand, NOW + 1);
  assert.equal(g.players.find((p) => p.id === victim)!.hand.length, 5);
  assert.notEqual(g.active, victim);
  assert.equal(g.drawing, false);
});

test("a timeout while drawing until playable draws once and passes", () => {
  let g = position(table(3, { drawUntilPlayable: true, timer: 15 }), ["blue-1a"], "red-5a");
  g.deck.push(card("green-4a"), card("blue-3a"));
  const me = g.active;
  g = applyAction(g, me, { type: "draw" }, rand, NOW + 1);
  assert.equal(g.drawing, true);
  g.deadline = NOW + 15000;
  for (const p of g.players) p.lastSeen = NOW + 15000;
  g = applyAction(g, seat(g, 1).id, { type: "heartbeat" }, rand, NOW + 15001);
  assert.equal(g.players.find((p) => p.id === me)!.hand.length, 3);
  assert.notEqual(g.active, me);
  assert.equal(g.drawing, false);
});

test("a player on one card can be made to draw by anyone until they call, whatever happens in between", () => {
  let g = position(table(), ["red-1a", "red-2a"], "red-5a");
  const me = g.active;
  g = applyAction(g, me, { type: "play", card: "red-1a" }, rand, NOW + 1);
  const catcher = seat(g, 1).id;
  // The next player has moved on: the player on one card is still exposed.
  g = applyAction(g, g.active, { type: "draw" }, rand, NOW + 2);
  if (g.drawn) g = applyAction(g, g.active, { type: "pass" }, rand, NOW + 3);
  const caught = applyAction(g, catcher, { type: "catch", player: me }, rand, NOW + 4);
  assert.equal(caught.players.find((p) => p.id === me)!.hand.length, 3);
  assert.throws(() => applyAction(caught, catcher, { type: "catch", player: me }, rand, NOW + 5), /tooLate/);
  assert.throws(() => applyAction(caught, me, { type: "call" }, rand, NOW + 5), /tooLate/);
});

test("calling on the last card protects it, and only with exactly one card", () => {
  let g = position(table(), ["red-1a", "red-2a"], "red-5a");
  const me = g.active, other = seat(g, 1).id;
  assert.throws(() => applyAction(g, me, { type: "call" }, rand, NOW + 1), /tooLate/);
  assert.throws(() => applyAction(g, other, { type: "catch", player: me }, rand, NOW + 1), /tooLate/);
  g = applyAction(g, me, { type: "play", card: "red-1a" }, rand, NOW + 2);
  g = applyAction(g, me, { type: "call" }, rand, NOW + 3);
  assert.throws(() => applyAction(g, other, { type: "catch", player: me }, rand, NOW + 4), /tooLate/);
  assert.throws(() => applyAction(g, me, { type: "catch", player: me }, rand, NOW + 4), /invalidAction/);
});

test("drawing after a call makes the next last card need a new call", () => {
  let g = position(table(), ["red-1a", "red-2a"], "red-5a");
  const me = g.active;
  g = applyAction(g, me, { type: "play", card: "red-1a" }, rand, NOW + 1);
  g = applyAction(g, me, { type: "call" }, rand, NOW + 2);
  // Back to this player, who cannot follow the blue 9 and draws an unplayable card.
  g.active = me;
  g.discard.push(card("blue-9b"));
  g.color = "blue";
  g.deck.push(card("green-4a"));
  g = applyAction(g, me, { type: "draw" }, rand, NOW + 3);
  const p = g.players.find((x) => x.id === me)!;
  assert.equal(p.hand.length, 2);
  assert.equal(p.called, false);
});

test("seven swaps hands with a chosen player and zero rotates them", () => {
  let g = position(table(3, { sevenZero: true }), ["red-7a", "red-1a", "red-2a"], "red-5a");
  const me = g.active, target = seat(g, 2).id;
  assert.throws(() => applyAction(g, me, { type: "play", card: "red-7a" }, rand, NOW + 1), /chooseTarget/);
  const swapped = applyAction(g, me, { type: "play", card: "red-7a", target }, rand, NOW + 1);
  assert.deepEqual(swapped.players.find((p) => p.id === me)!.hand.map((c) => c.id), ["blue-9a", "blue-8a", "blue-7a"]);
  assert.deepEqual(swapped.players.find((p) => p.id === target)!.hand.map((c) => c.id), ["red-1a", "red-2a"]);

  g = position(g, ["red-0", "red-1a"], "red-5a");
  const next = seat(g, 1).id;
  g = applyAction(g, g.active, { type: "play", card: "red-0" }, rand, NOW + 1);
  assert.deepEqual(g.players.find((p) => p.id === next)!.hand.map((c) => c.id), ["red-1a"]);
});

test("emptying the hand wins and reveals every hand", () => {
  let g = position(table(), ["red-1a"], "red-5a");
  const me = g.active;
  g = applyAction(g, me, { type: "play", card: "red-1a" }, rand, NOW + 1);
  assert.equal(g.phase, "finished");
  assert.equal(g.winner, me);
  assert.equal(publicGame(g, me).players.find((p) => p.id !== me)!.hand.length, 3);
  g = applyAction(g, g.host, { type: "again" }, rand, NOW + 2);
  assert.equal(g.phase, "playing");
  assert.equal(g.round, 2);
});

test("the public view hides other hands, the deck and a +4's legality", () => {
  let g = position(table(), ["draw4-1", "red-1a"], "red-5a");
  g = applyAction(g, g.active, { type: "play", card: "draw4-1", color: "blue" }, rand, NOW + 1);
  const viewer = seat(g, 1).id;
  const view = publicGame(g, viewer);
  for (const p of view.players) if (p.id !== viewer) assert.deepEqual(p.hand, []);
  assert.ok(!("deck" in view) || view.deck === undefined);
  assert.ok(!JSON.stringify(view).includes("illegal"));
  assert.ok(!JSON.stringify(view).includes("tokenHash"));
});

test("a timeout draws for the player, then passes", () => {
  let g = position(table(3, { timer: 15 }), ["blue-1a"], "red-5a");
  g.deck.push(card("green-4a"));
  g.deadline = NOW + 15000;
  const me = g.active;
  for (const p of g.players) p.lastSeen = NOW + 15000;
  g = applyAction(g, seat(g, 1).id, { type: "heartbeat" }, rand, NOW + 15001);
  assert.equal(g.players.find((p) => p.id === me)!.hand.length, 2);
  assert.notEqual(g.active, me);
});

test("leaving mid-round passes the turn and the last player standing wins", () => {
  let g = table(2);
  const me = g.active, other = g.players.find((p) => p.id !== me)!.id;
  g = applyAction(g, me, { type: "leave" }, rand, NOW + 1);
  assert.equal(g.phase, "finished");
  assert.equal(g.winner, other);
});

test("an offline pause lifts when the active player returns, a host pause does not", () => {
  let g = table(3);
  const active = g.active;
  const other = g.players.find((p) => p.id !== active)!.id;
  for (const p of g.players) p.lastSeen = NOW + 61000;
  g.players.find((p) => p.id === active)!.lastSeen = NOW;
  g = applyAction(g, other, { type: "heartbeat" }, rand, NOW + 61000);
  assert.equal(g.pauseReason, "offline");
  g = applyAction(g, active, { type: "heartbeat" }, rand, NOW + 62000);
  assert.equal(g.paused, false);
  g = applyAction(g, g.host, { type: "pause" }, rand, NOW + 63000);
  g = applyAction(g, active, { type: "heartbeat" }, rand, NOW + 64000);
  assert.equal(g.paused, true);
});

test("identical cards are played together only with the combo option", () => {
  const off = position(table(), ["red-3a", "blue-3a", "red-1a"], "red-5a");
  assert.throws(() => applyAction(off, off.active, { type: "play", cards: ["red-3a", "blue-3a"] }, rand, NOW + 1), /combosOff/);

  let g = position(table(3, { combos: true }), ["red-3a", "blue-3a", "green-3b", "red-1a"], "red-5a");
  const me = g.active;
  // Only the first card must fit the pile; the last one sets the colour.
  assert.throws(() => applyAction(g, me, { type: "play", cards: ["blue-3a", "red-3a"] }, rand, NOW + 1), /notPlayable/);
  assert.throws(() => applyAction(g, me, { type: "play", cards: ["red-3a", "red-1a"] }, rand, NOW + 1), /notSameCard/);
  assert.throws(() => applyAction(g, me, { type: "play", cards: ["red-3a", "red-3a"] }, rand, NOW + 1), /invalidCard/);
  g = applyAction(g, me, { type: "play", cards: ["red-3a", "green-3b", "blue-3a"] }, rand, NOW + 1);
  assert.deepEqual(g.discard.slice(-3).map((c) => c.id), ["red-3a", "green-3b", "blue-3a"]);
  assert.equal(g.color, "blue");
  assert.deepEqual(g.players.find((p) => p.id === me)!.hand.map((c) => c.id), ["red-1a"]);
  assert.deepEqual(g.lastPlay!.cards, ["red-3a", "green-3b", "blue-3a"]);
  assert.notEqual(g.active, me);
});

test("a lot of skips skips one player per card, and never past the one who played", () => {
  let g = position(table(4, { combos: true }), ["red-skipa", "blue-skipa", "red-1a"], "red-5a");
  const after = seat(g, 3).id;
  g = applyAction(g, g.active, { type: "play", cards: ["red-skipa", "blue-skipa"] }, rand, NOW + 1);
  assert.equal(g.active, after);

  g = position(table(3, { combos: true }), ["red-skipa", "blue-skipa", "green-skipa", "red-1a"], "red-5a");
  const me = g.active;
  g = applyAction(g, me, { type: "play", cards: ["red-skipa", "blue-skipa", "green-skipa"] }, rand, NOW + 1);
  assert.equal(g.active, me);
});

test("reverses cancel in pairs", () => {
  let g = position(table(4, { combos: true }), ["red-reversea", "blue-reversea", "red-1a"], "red-5a");
  const next = seat(g, 1).id;
  g = applyAction(g, g.active, { type: "play", cards: ["red-reversea", "blue-reversea"] }, rand, NOW + 1);
  assert.equal(g.direction, 1);
  assert.equal(g.active, next);
});

test("a lot of +2 adds up and can be stacked on", () => {
  let g = position(table(3, { combos: true }), ["red-draw2a", "blue-draw2a", "red-1a"], "red-5a");
  const victim = seat(g, 1).id;
  g = applyAction(g, g.active, { type: "play", cards: ["red-draw2a", "blue-draw2a"] }, rand, NOW + 1);
  assert.equal(g.players.find((p) => p.id === victim)!.hand.length, 7);

  g = position(table(3, { combos: true, stacking: true }), ["red-draw2a", "red-1a"], "red-5a", ["blue-draw2a", "green-draw2b", "blue-1a"]);
  g = applyAction(g, g.active, { type: "play", cards: ["red-draw2a"] }, rand, NOW + 1);
  g = applyAction(g, g.active, { type: "play", cards: ["blue-draw2a", "green-draw2b"] }, rand, NOW + 2);
  assert.equal(g.pendingDraw, 6);
  assert.equal(g.color, "green");
});

test("a lot of +4 is challenged as a whole", () => {
  let g = position(table(3, { combos: true }), ["draw4-1", "draw4-2", "red-1a", "blue-2a"], "red-5a");
  const cheater = g.active;
  assert.throws(() => applyAction(g, cheater, { type: "play", cards: ["draw4-1", "wild1"] }, rand, NOW + 1), /invalidCard/);
  g = applyAction(g, cheater, { type: "play", cards: ["draw4-1", "draw4-2"], color: "green" }, rand, NOW + 1);
  assert.equal(g.pendingDraw, 8);
  assert.equal(g.color, "green");
  const lost = applyAction(g, g.active, { type: "challenge" }, rand, NOW + 2);
  assert.equal(lost.players.find((p) => p.id === cheater)!.hand.length, 10);
  assert.equal(lost.events.at(-1)!.args[2], "8");
});

test("a lot of sevens swaps hands only once", () => {
  let g = position(table(3, { combos: true, sevenZero: true }), ["red-7a", "blue-7a", "red-1a"], "red-5a");
  const me = g.active, target = seat(g, 1).id;
  g = applyAction(g, me, { type: "play", cards: ["red-7a", "blue-7a"], target }, rand, NOW + 1);
  assert.deepEqual(g.players.find((p) => p.id === target)!.hand.map((c) => c.id), ["red-1a"]);
  assert.equal(g.events.filter((e) => e.key === "swapped").length, 1);
});

test("the drawn card may lead a lot, and a lot may end the round", () => {
  let g = position(table(3, { combos: true }), ["blue-9b", "green-9a"], "red-5a");
  g.deck.push(card("red-9a"));
  const me = g.active;
  g = applyAction(g, me, { type: "draw" }, rand, NOW + 1);
  assert.equal(g.drawn, "red-9a");
  assert.throws(() => applyAction(g, me, { type: "play", cards: ["blue-9b", "red-9a"] }, rand, NOW + 2), /notPlayable/);
  g = applyAction(g, me, { type: "play", cards: ["red-9a", "blue-9b", "green-9a"] }, rand, NOW + 2);
  assert.equal(g.phase, "finished");
  assert.equal(g.winner, me);
});

test("giving up a round keeps the seat for the next one", () => {
  let g = table(3);
  const quitter = seat(g, 1).id;
  g = applyAction(g, quitter, { type: "resign" }, rand, NOW + 1);
  assert.ok(g.players.find((p) => p.id === quitter)!.left);
  assert.equal(g.players.find((p) => p.id === quitter)!.hand.length, 0);
  assert.equal(g.phase, "playing");
  const leaver = g.players.find((p) => p.id !== quitter && p.id !== g.active)!.id;
  g = applyAction(g, leaver, { type: "leave" }, rand, NOW + 2);
  assert.equal(g.phase, "finished");
  g = applyAction(g, g.host, { type: "again" }, rand, NOW + 3);
  assert.ok(g.players.some((p) => p.id === quitter && !p.left));
  assert.ok(!g.players.some((p) => p.id === leaver));
});

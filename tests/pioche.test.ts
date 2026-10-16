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

test("drawing until playable keeps drawing", () => {
  let g = position(table(3, { drawUntilPlayable: true }), ["blue-1a"], "red-5a");
  g.deck.push(card("red-9b"), card("blue-3a"), card("green-4a"));
  const me = g.active;
  g = applyAction(g, me, { type: "draw" }, rand, NOW + 1);
  assert.equal(g.players.find((p) => p.id === me)!.hand.length, 4);
  assert.equal(g.drawn, "red-9b");
});

test("a forgotten call can be caught until the next player acts", () => {
  let g = position(table(), ["red-1a", "red-2a"], "red-5a");
  const me = g.active;
  g = applyAction(g, me, { type: "play", card: "red-1a" }, rand, NOW + 1);
  assert.equal(g.exposed, me);
  const catcher = seat(g, 1).id;
  const caught = applyAction(g, catcher, { type: "catch" }, rand, NOW + 2);
  assert.equal(caught.players.find((p) => p.id === me)!.hand.length, 3);
  const safe = applyAction(g, me, { type: "call" }, rand, NOW + 2);
  assert.throws(() => applyAction(safe, catcher, { type: "catch" }, rand, NOW + 3), /cannotCatch/);
  const moved = applyAction(g, g.active, { type: "draw" }, rand, NOW + 2);
  assert.equal(moved.exposed, null);
});

test("calling before the second-to-last card keeps the player safe", () => {
  let g = position(table(), ["red-1a", "red-2a"], "red-5a");
  const me = g.active;
  g = applyAction(g, me, { type: "call" }, rand, NOW + 1);
  g = applyAction(g, me, { type: "play", card: "red-1a" }, rand, NOW + 2);
  assert.equal(g.exposed, null);
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

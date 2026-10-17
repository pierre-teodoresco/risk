import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, blindAmounts, createGame, joinGame, publicGame, RESULT_MS, STARTING_STACK, type Game } from "../games/poker/engine";
import { evaluate, makeDeck, type Card } from "../games/poker/cards";
const at = 1000000;
function rng(seed = 47) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const cards = (s: string): Card[] => s.split(" ").map((id) => makeDeck().find((c) => c.id === id)!);
function room(count = 3) {
  let g = createGame("ABC234", { name: "Alice", emblem: 0 }, "secret-a", at);
  for (let n = 1; n < count; n++) g = joinGame(g, { name: "Player " + n, emblem: 0 }, "secret-" + n, at + n);
  return g;
}
const start = (count = 3) => { const g = room(count); return applyAction(g, g.host, { type: "start" }, rng(), at + 10); };
const act = (g: Game, type: string, amount?: number) => applyAction(g, g.active, { type, ...(amount !== undefined ? { amount } : {}) }, rng(), g.updated + 10);
function betting(stacks: number[], board = "s2 h3 d4 c8 s9") {
  const g = start(stacks.length);
  g.street = "river"; g.board = cards(board); g.currentBet = 0; g.minRaise = 20; g.acted = {};
  g.players.forEach((p, i) => { p.stack = stacks[i]; p.bet = p.contributed = 0; p.folded = p.eliminated = false; p.inHand = true; });
  g.pending = g.players.map((p) => p.id); g.active = g.pending[0]; g.deadline = g.updated + 30000;
  return g;
}

test("Poker: deck, wheel, all categories, kickers and best five of seven", () => {
  assert.equal(new Set(makeDeck().map((c) => c.id)).size, 52);
  const hands = ["s14 h11 d9 c5 s2", "s14 h14 d9 c5 s2", "s14 h14 d9 c9 s2", "s14 h14 d14 c5 s2", "s14 h2 d3 c4 s5", "s14 s11 s9 s5 s2", "s14 h14 d14 c5 s5", "s14 h14 d14 c14 s2", "s14 s2 s3 s4 s5"];
  hands.forEach((h, category) => assert.equal(evaluate(cards(h)).category, category));
  assert.ok(evaluate(cards("s2 h3 d4 c5 s6")).score > evaluate(cards(hands[4])).score);
  assert.ok(evaluate(cards("s14 h14 d13 c5 s2")).score > evaluate(cards("s14 h14 d12 c11 s9")).score);
  assert.equal(evaluate(cards("s14 h14 d14 c13 s13 h13 d2")).category, 6);
  assert.equal(evaluate(cards("s10 s11 s12 s13 s14 h2 d3")).category, 8);
  assert.equal(evaluate(cards("s14 s13 s12 s11 s10 h2 d3")).score, evaluate(cards("s14 s13 s12 s11 s10 h7 d8")).score);
});
test("Poker: lobby, host-only options, 8 seats, start and private allowlist", () => {
  let g = room(8);
  assert.equal(new Set(g.players.map((p) => p.emblem)).size, 8);
  assert.throws(() => joinGame(g, { name: "Ninth" }, "x", at), /roomFull/);
  assert.throws(() => applyAction(g, g.players[1].id, { type: "options", timer: 15 }), /hostOnly/);
  g = applyAction(g, g.host, { type: "options", timer: 15, levelMinutes: 2 }, rng(), at + 9);
  g = applyAction(g, g.host, { type: "start" }, rng(), at + 10);
  assert.equal(g.options.timer, 15); assert.equal(g.deck.length, 36);
  assert.equal(g.players.reduce((s, p) => s + p.stack + p.contributed, 0), 8 * STARTING_STACK);
  assert.throws(() => joinGame(g, { name: "Late" }, "x", at), /alreadyStarted/);
  g.requests = { [g.host]: ["private-request"] };
  const pub = publicGame(g, g.host), json = JSON.stringify(pub);
  for (const field of ["tokenHash", "deck", "burned", "requests", "acted", "pending"]) assert.ok(!(field in pub), field);
  assert.ok(!json.includes("secret-") && !json.includes("private-request"));
  pub.players.forEach((p) => assert.equal(p.hand.length, p.id === g.host ? 2 : 0));
});
test("Poker: heads-up button posts small blind and acts first only preflop", () => {
  let g = start(2);
  assert.equal(g.dealer, g.smallBlind); assert.equal(g.active, g.dealer);
  g = act(g, "call"); assert.equal(g.active, g.bigBlind);
  g = act(g, "check"); assert.equal(g.street, "flop"); assert.equal(g.board.length, 3); assert.equal(g.burned.length, 1);
  assert.equal(g.active, g.bigBlind);
  for (let n = 0; n < 6; n++) g = act(g, "check");
  assert.equal(g.street, "showdown"); assert.equal(g.board.length, 5); assert.equal(g.burned.length, 3);
});
test("Poker: big blind gets an option, illegal checks/raises and out-of-turn actions are rejected immutably", () => {
  let g = start(); const original = JSON.stringify(g);
  assert.throws(() => act(g, "check"), /cannotCheck/);
  assert.throws(() => act(g, "raise", 25), /invalidRaise/);
  assert.throws(() => applyAction(g, g.players.find((p) => p.id !== g.active)!.id, { type: "fold" }, rng(), g.updated + 1), /notYourTurn/);
  assert.equal(JSON.stringify(g), original);
  const big = g.bigBlind;
  g = act(g, "call"); g = act(g, "call"); assert.equal(g.active, big);
  g = act(g, "raise", 60); assert.equal(g.currentBet, 60); assert.equal(g.minRaise, 40);
  assert.equal(publicGame(g, g.active).legal?.min, 100);
});
test("Poker: unequal all-ins make main and side pots, refund unmatched chips", () => {
  let g = betting([100, 200, 300]);
  g.players[0].hand = cards("s14 h14"); g.players[1].hand = cards("s13 h13"); g.players[2].hand = cards("s12 h12");
  g = act(g, "allIn"); g = act(g, "allIn");
  // Nobody can respond to a further raise; the last player can only call 200.
  assert.equal(publicGame(g, g.active).legal?.canRaise, false);
  assert.throws(() => act(g, "allIn"), /cannotRaise/);
  g = act(g, "call");
  assert.equal(g.result?.pots.reduce((s, p) => s + p.amount, 0), 500);
  assert.deepEqual(g.players.map((p) => p.stack), [300, 200, 100]);
  assert.deepEqual(g.result?.pots.map((p) => p.amount), [300, 200]);
  assert.equal(g.players.reduce((s, p) => s + p.stack, 0), 600);
});
test("Poker: short all-in does not reopen a raise; cumulative short all-ins do", () => {
  let g = betting([1000, 150, 1000]);
  g = act(g, "raise", 100); g = act(g, "allIn"); g = act(g, "call");
  assert.equal(publicGame(g, g.active).legal?.canRaise, false);
  assert.throws(() => act(g, "raise", 250), /cannotRaise/);
  g = act(g, "call"); assert.ok(g.result);
  g = betting([1000, 150, 200, 1000]);
  g = act(g, "raise", 100); g = act(g, "allIn"); g = act(g, "allIn"); g = act(g, "call");
  assert.equal(publicGame(g, g.active).legal?.canRaise, true);
  assert.equal(publicGame(g, g.active).legal?.min, 300);
  g = act(g, "raise", 300); assert.equal(g.currentBet, 300);
});
test("Poker: a short opening all-in requires a full increment and does not reopen a prior check", () => {
  let g = betting([1000, 5, 1000]);
  g = act(g, "check"); g = act(g, "allIn");
  assert.equal(publicGame(g, g.active).legal?.min, 25);
  assert.throws(() => act(g, "raise", 20), /invalidRaise/);
  g = act(g, "call");
  assert.equal(publicGame(g, g.active).legal?.canRaise, false);
  g = act(g, "call"); assert.ok(g.result);
});
test("Poker: ties split pots; odd chips go clockwise after the dealer", () => {
  let g = betting([100, 100, 100], "s10 s11 s12 s13 s14");
  g.dealer = g.players[0].id;
  g = act(g, "raise", 21); g = act(g, "call"); g = act(g, "fold");
  assert.deepEqual(g.players.map((p) => p.stack), [100, 100, 100]);
  // Dead contribution makes an odd shared pot.
  g = betting([100, 100, 100], "s10 s11 s12 s13 s14");
  g.dealer = g.players[0].id; g.players[2].contributed = 1; g.players[2].stack--;
  g = act(g, "raise", 20); g = act(g, "call"); g = act(g, "fold");
  assert.deepEqual(g.players.map((p) => p.stack), [100, 101, 99]);
});
test("Poker: folded hands remain secret at showdown, finish and after an uncontested pot", () => {
  let g = start(); const folded = g.active;
  g = act(g, "fold"); g = act(g, "call"); g = act(g, "check");
  for (let i = 0; i < 6; i++) g = act(g, "check");
  assert.ok(g.result?.showdown);
  const observer = g.players.find((p) => p.id !== folded)!.id;
  assert.equal(publicGame(g, observer).players.find((p) => p.id === folded)!.hand.length, 0);
  assert.equal(publicGame(g, folded).players.find((p) => p.id === folded)!.hand.length, 2);
  assert.equal(publicGame({ ...g, phase: "finished" }, observer).players.find((p) => p.id === folded)!.hand.length, 0);
  g = start(2); const loser = g.active; g = act(g, "fold");
  assert.equal(g.result?.showdown, false);
  assert.equal(publicGame(g, loser).players.find((p) => p.id !== loser)!.hand.length, 0);
});
test("Poker: short blinds run out without asking a lone player to bet into an empty side pot", () => {
  let g = room(2); g = applyAction(g, g.host, { type: "start" }, rng(), at + 1);
  g.street = "preflop"; g.players.forEach((p) => { p.bet = p.contributed = 0; p.stack = p.id === g.bigBlind ? 5 : 100; });
  // Reproduce a short-stack next deal through the regular maintenance path.
  g.street = "showdown"; g.deadline = at + 2;
  g = applyAction(g, g.host, { type: "heartbeat" }, rng(), at + 3);
  assert.equal(g.street, "showdown"); assert.equal(g.board.length, 5);
  assert.equal(g.players.reduce((s, p) => s + p.stack, 0), 105);
});
test("Poker: timers check or fold; host pause preserves turn and blind clocks", () => {
  let g = start(2); const active = g.active;
  g = applyAction(g, g.host, { type: "heartbeat" }, rng(), g.deadline! + 1);
  assert.ok(g.result); assert.ok(g.players.find((p) => p.id === active)!.folded);
  g = start(2); g = act(g, "call"); const big = g.active;
  g = applyAction(g, g.host, { type: "heartbeat" }, rng(), g.deadline! + 1);
  assert.equal(g.street, "flop"); assert.ok(g.events.some((e) => e.key === "check" && e.args[0] === g.players.find((p) => p.id === big)!.name));
  g = start(); const deadline = g.deadline!, startTime = g.startedAt;
  g = applyAction(g, g.host, { type: "pause" }, rng(), g.updated + 1000);
  assert.throws(() => applyAction(g, g.active, { type: "call" }, rng(), g.updated + 10), /paused/);
  g = applyAction(g, g.host, { type: "pause" }, rng(), g.updated + 300000);
  assert.equal(g.deadline, deadline + 300000); assert.equal(g.startedAt, startTime + 300000);
});
test("Poker: everyone absent freezes before timeout; first return resumes and host transfers", () => {
  let g = start(3); const active = g.active, oldDeadline = g.deadline!;
  g.players.forEach((p) => { p.lastSeen = at; });
  const returning = g.players[1].id;
  g = applyAction(g, returning, { type: "heartbeat" }, rng(), at + 600000);
  assert.equal(g.active, active); assert.equal(g.street, "preflop"); assert.ok(g.deadline! > oldDeadline);
  assert.equal(g.host, returning);
});
test("Poker: resignation keeps spectator seat and cards out of deck; rematch restores equal stacks", () => {
  let g = start(3); const resigned = g.active, deck = g.deck.length;
  g = applyAction(g, resigned, { type: "resign" }, rng(), g.updated + 1);
  assert.ok(g.players.find((p) => p.id === resigned)!.resigned);
  assert.ok(!g.players.find((p) => p.id === resigned)!.left);
  assert.equal(g.deck.length, deck);
  const other = g.players.find((p) => p.id !== resigned)!.id;
  g = applyAction(g, other, { type: "resign" }, rng(), g.updated + 1);
  assert.equal(g.phase, "finished");
  g = applyAction(g, g.host, { type: "again" }, rng(), g.updated + 1);
  assert.ok(g.players.every((p) => !p.eliminated && !p.resigned));
  assert.ok(g.players.every((p) => p.stack + p.contributed === STARTING_STACK));
});
test("Poker: automatic next hand, blind level changes only between hands", () => {
  let g = start(2), level = g.level;
  g.players.forEach((p) => { p.lastSeen = at + 190000; }); g.deadline = at + 200000;
  g = applyAction(g, g.active, { type: "fold" }, rng(), at + 190000);
  assert.equal(g.level, level);
  const dealer = g.dealer;
  g = applyAction(g, g.host, { type: "heartbeat" }, rng(), g.result!.at + RESULT_MS + 1);
  assert.equal(g.handNumber, 2); assert.notEqual(g.dealer, dealer); assert.equal(g.level, 1);
  assert.deepEqual(blindAmounts(g.level), { small: 15, big: 30 });
});
test("Poker: deterministic random full tournaments conserve chips, unique cards and always terminate", () => {
  for (const count of [2, 3, 8]) for (let seed = 1; seed <= 6; seed++) {
    const random = rng(seed); let g = room(count), now = at + 10, steps = 0;
    g = applyAction(g, g.host, { type: "start" }, random, now);
    while (g.phase === "playing" && steps++ < 5000) {
      now += 1000; g.players.forEach((p) => { p.lastSeen = now; });
      if (g.street === "showdown") { now = g.deadline! + 1; g = applyAction(g, g.host, { type: "heartbeat" }, random, now); }
      else {
        const legal = publicGame(g, g.active).legal!;
        const roll = random();
        const type = legal.canRaise && roll < .25 ? "allIn" : roll < .35 ? "fold" : legal.check ? "check" : "call";
        g = applyAction(g, g.active, { type }, random, now);
      }
      assert.equal(g.players.reduce((s, p) => s + p.stack + p.contributed, 0) + g.forfeited, count * STARTING_STACK, `conservation ${seed}/${steps}`);
      assert.ok(g.players.every((p) => Number.isSafeInteger(p.stack) && p.stack >= 0 && p.bet >= 0 && p.contributed >= p.bet));
      const all = [...g.deck, ...g.burned, ...g.board, ...g.players.flatMap((p) => p.hand)];
      assert.equal(all.length, 52); assert.equal(new Set(all.map((c) => c.id)).size, 52);
      if (g.active) assert.ok(g.pending.includes(g.active));
    }
    assert.equal(g.phase, "finished", `termination ${count}/${seed}`); assert.ok(g.winner);
  }
});

test("Poker: dead button preserves big-blind order after either blind busts", () => {
  for (const which of ["smallBlind", "bigBlind"] as const) {
    let g = start(4); const oldBig = g.bigBlind, busted = g[which];
    const oldBigIndex = g.players.findIndex((p) => p.id === oldBig);
    g.players.forEach((p) => { p.stack += p.contributed; p.bet = p.contributed = 0; p.lastSeen = at + 100; });
    const out = g.players.find((p) => p.id === busted)!; out.stack = 0; out.eliminated = true;
    const expected = Array.from({ length: 4 }, (_, n) => g.players[(oldBigIndex + n + 1) % 4]).find((p) => !p.eliminated)!.id;
    g.street = "showdown"; g.deadline = at + 100;
    g = applyAction(g, g.host, { type: "heartbeat" }, rng(), at + 101);
    assert.equal(g.bigBlind, expected);
    assert.equal(g.smallBlind, which === "smallBlind" ? oldBig : "");
  }
});
test("Poker: a departure out of turn preserves the clock and resigning during pause creates no running deadline", () => {
  let g = start(4), active = g.active, deadline = g.deadline;
  const other = g.players.find((p) => p.id !== active)!.id;
  g = applyAction(g, other, { type: "resign" }, rng(), g.updated + 1000);
  assert.equal(g.active, active); assert.equal(g.deadline, deadline);
  g = start(4); active = g.active;
  g = applyAction(g, g.host, { type: "pause" }, rng(), g.updated + 1000);
  g = applyAction(g, active, { type: "resign" }, rng(), g.updated + 1000);
  assert.ok(g.paused); assert.equal(g.deadline, null);
  g = applyAction(g, g.host, { type: "pause" }, rng(), g.updated + 1000);
  assert.equal(g.deadline, g.updated + g.options.timer * 1000);
});

import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, createGame, joinGame, publicGame, handValue, natural, makeShoe, STARTING_BANK, DEALER_MS, RESULT_MS, type Game, type Hand } from "../games/blackjack/engine";
import { makeDeck, type Card } from "../games/cards/standard";
const at = 1000000;
function rng(seed = 47) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const cards = (text: string): Card[] => text.split(" ").map((id, i) => ({ ...makeDeck().find((c) => c.id === id)!, id: `${i}:${id}` }));
function room(count = 1) {
  let g = createGame("ABC234", { name: "QA Alice", emblem: 0 }, "private-hash", at);
  for (let n = 1; n < count; n++) g = joinGame(g, { name: `QA Player ${n}`, emblem: 0 }, `private-${n}`, at + n);
  return g;
}
function start(count = 1) { const g = room(count); return applyAction(g, g.host, { type: "start" }, rng(), at + 10); }
function action(g: Game, actor: string, type: string, extra: Record<string, unknown> = {}) { return applyAction(g, actor, { type, ...extra }, rng(), g.updated + 1); }
function tick(g: Game) {
  const now = (g.deadline ?? g.updated) + 1;
  // Keep these test clients present; absence has its own tests.
  g.players.forEach((p) => { p.lastSeen = now; });
  return applyAction(g, g.players.find((p) => !p.left)!.id, { type: "heartbeat" }, rng(), now);
}
function rigDeal(playerCards: string[], dealerCards: string, rest = "s2 h3 d4 c5 s6 h7 d8 c9") {
  let g = start(playerCards.length);
  const hands = playerCards.map(cards), dealer = cards(dealerCards), order: Card[] = [];
  for (let n = 0; n < 2; n++) { for (const hand of hands) order.push(hand[n]); order.push(dealer[n]); }
  // No shuffle at the deal: a realistic full-size shoe, with the desired next cards on top.
  g.shoe = [...makeShoe().slice(0, 250), ...[...order, ...cards(rest)].toReversed()];
  for (const p of g.players) g = action(g, p.id, "bet", { amount: 20 });
  return tick(g);
}
function resolve(g: Game) { let n = 0; while (g.phase === "playing" && g.step !== "result" && n++ < 50) g = g.step === "players" ? action(g, g.active, "stand") : tick(g); assert.ok(g.result); return g; }
function hand(list: string, wager = 20, split = false): Hand { return { id: crypto.randomUUID(), cards: cards(list), wager, split, splitAces: false, doubled: false, status: "stood", outcome: null, returned: 0 }; }
function showdown(playerCards: string, dealerCards: string, options: { split?: boolean; status?: Hand["status"]; wager?: number } = {}) {
  const g = start(); const h = hand(playerCards, options.wager ?? 20, options.split ?? false); h.status = options.status ?? "stood";
  g.players[0].bank -= h.wager; g.players[0].hands = [h]; g.dealer = cards(dealerCards); g.dealerRevealed = true; g.step = "dealer"; g.round = 1; g.deadline = g.updated + DEALER_MS;
  return tick(g);
}

test("Blackjack: soft Aces adapt, faces count ten and naturals require two unsplit cards", () => {
  assert.deepEqual(handValue(cards("s14 h6")), { total: 17, low: 7, soft: true, bust: false });
  assert.deepEqual(handValue(cards("s14 h14 d9")), { total: 21, low: 11, soft: true, bust: false });
  assert.equal(handValue(cards("s14 h6 d13")).total, 17);
  assert.equal(handValue(cards("s14 h14 d9 c10")).total, 21);
  assert.ok(handValue(cards("s13 h12 d2")).bust);
  assert.ok(natural(hand("s14 h13"))); assert.ok(!natural(hand("s14 h13", 20, true)));
  assert.ok(!natural(hand("s7 h7 d7")));
  const shoe = makeShoe(); assert.equal(shoe.length, 312); assert.equal(new Set(shoe.map((c) => c.id)).size, 312);
  assert.equal(shoe.filter((c) => c.rank === 14).length, 24);
});
test("Blackjack: one to seven seats, unique emblems, locked configuration and host rights", () => {
  let g = room(7); assert.equal(new Set(g.players.map((p) => p.emblem)).size, 7);
  assert.throws(() => joinGame(g, { name: "QA Eighth" }, "x", at), /roomFull/);
  assert.throws(() => action(g, g.players[1].id, "options", { rounds: 0 }), /hostOnly/);
  g = action(g, g.host, "options", { rounds: 0, timer: 15 });
  g = action(g, g.host, "start"); assert.deepEqual(g.options, { rounds: 0, timer: 15 });
  assert.throws(() => action(g, g.host, "options", { timer: 30 }), /alreadyStarted/);
  assert.throws(() => joinGame(g, { name: "QA Late" }, "x", at), /alreadyStarted/);
  assert.equal(start().phase, "playing");
});
test("Blackjack: all bets are confirmed before the deal; invalid or repeated stakes cannot spend chips", () => {
  let g = start(2); const id = g.players[0].id, before = JSON.stringify(g);
  for (const amount of [-10, 0, 5, 15, 201, 210, 1.5, NaN, "20"]) assert.throws(() => action(g, id, "bet", { amount }), /invalidAmount/);
  assert.equal(JSON.stringify(g), before);
  g = action(g, id, "bet", { amount: 200 }); assert.equal(g.step, "betting"); assert.equal(g.players[0].bank, 800);
  assert.throws(() => action(g, id, "bet", { amount: 20 }), /alreadyBet/);
  g = action(g, g.players[1].id, "skip"); assert.equal(g.step, "dealing"); assert.equal(g.round, 1);
  assert.equal(g.players[1].hands.length, 0); assert.equal(g.dealer.length, 2);
});
test("Blackjack: skipping all bets consumes neither cards nor one of the twenty hands", () => {
  let g = start(2); g = action(g, g.players[0].id, "skip"); g = action(g, g.players[1].id, "skip");
  assert.equal(g.step, "betting"); assert.equal(g.round, 0); assert.equal(g.shoe.length, 312);
  g = tick(g); assert.equal(g.round, 0); assert.ok(g.players.every((p) => p.bank === 1000));
});
test("Blackjack: house hole card, shoe, hashes and requests never leave the server", () => {
  let g = rigDeal(["s10 h7", "d9 c8"], "s6 h10");
  g.requests = { [g.host]: ["secret-request"] };
  const view = publicGame(g, g.host), json = JSON.stringify(view);
  assert.equal(view.dealer.length, 2); assert.equal(view.dealer[1], null);
  assert.ok(!json.includes(g.dealer[1].id) && !json.includes("private-hash") && !json.includes("secret-request"));
  for (const k of ["shoe", "discard", "requests", "tokenHash"]) assert.ok(!(k in view));
  assert.ok(view.players.every((p) => p.hands[0].cards.length === 2), "casino player hands are open");
  g = resolve(g); assert.ok(publicGame(g, g.host).dealer.every(Boolean));
});
test("Blackjack: dealer peeks before a player can double or split", () => {
  let g = rigDeal(["s8 h8"], "d14 c13");
  assert.equal(g.step, "dealer"); assert.ok(g.dealerRevealed); assert.equal(publicGame(g, g.host).legal, null);
  assert.throws(() => action(g, g.host, "split"), /invalidPhase/);
  g = resolve(g); assert.equal(g.players[0].bank, 980); assert.equal(g.players[0].hands.length, 1);
});
test("Blackjack: natural pays 3:2; wins 1:1; ties return stake; split 21 is not a natural", () => {
  const cases = [
    ["s14 h13", "d10 c9", {}, 1030, "blackjack"],
    ["s14 h13", "d14 c12", {}, 1000, "push"],
    ["s10 h10", "d10 c8", {}, 1020, "win"],
    ["s10 h8", "d10 c8", {}, 1000, "push"],
    ["s10 h7", "d10 c8", {}, 980, "loss"],
    ["s13 h12 d2", "d10 c10 h2", { status: "bust" }, 980, "loss"],
    ["s10 h7", "d10 c10 h2", {}, 1020, "win"],
    ["s14 h13", "d10 c9", { split: true }, 1020, "win"],
    ["s7 h7 d7", "d14 c12", {}, 980, "loss"],
    ["s14 h13", "d14 c12", { split: true }, 980, "loss"],
    ["s14 h13", "d10 c9", { status: "forfeit" }, 980, "loss"],
  ] as const;
  for (const [pc, dc, opts, bank, outcome] of cases) { const g = showdown(pc, dc, opts); assert.equal(g.players[0].bank, bank, pc + dc); assert.equal(g.players[0].hands[0].outcome, outcome); }
});
test("Blackjack: dealer stands on soft 17 and draws one visible card per server deadline", () => {
  let g = showdown("s10 h9", "d14 c6"); assert.equal(g.step, "result"); assert.equal(g.dealer.length, 2);
  g = start(); g.round = 1; g.step = "dealer"; g.dealerRevealed = true; g.dealer = cards("s2 h3");
  g.players[0].bank = 980; g.players[0].hands = [hand("s10 h10")];
  g.shoe = [...g.shoe, ...cards("d4 c5 s6").toReversed()]; g.deadline = g.updated + DEALER_MS;
  for (const length of [3, 4, 5]) { g = tick(g); assert.equal(g.step, "dealer"); assert.equal(g.dealer.length, length); assert.equal(g.result, null); }
  g = tick(g); assert.equal(g.step, "result");
});
test("Blackjack: double spends another stake, gives exactly one card and ends the hand", () => {
  let g = rigDeal(["s5 h6"], "d10 c7", "s10");
  assert.ok(publicGame(g, g.host).legal?.double);
  g = action(g, g.active, "double"); assert.equal(g.players[0].bank, 960); assert.equal(g.players[0].hands[0].wager, 40);
  assert.equal(g.players[0].hands[0].cards.length, 3); assert.equal(g.step, "dealer");
  g = resolve(g); assert.equal(g.players[0].bank, 1040);
  g = rigDeal(["s5 h6"], "d10 c7", "s2"); g = action(g, g.active, "hit"); assert.equal(publicGame(g, g.host).legal?.double, false);
  assert.throws(() => action(g, g.active, "double"), /cannotDouble/);
  g.players[0].bank = 19; assert.equal(publicGame(g, g.host).legal?.double, false);
});
test("Blackjack: pair splitting is sequential, may double after splitting, and caps at four hands", () => {
  let g = rigDeal(["s8 h8"], "d10 c7", "d8 c8 s8 h2 d10 c3 s4");
  for (let count = 2; count <= 4; count++) { assert.ok(publicGame(g, g.host).legal?.split); g = action(g, g.active, "split"); assert.equal(g.players[0].hands.length, count); }
  assert.equal(publicGame(g, g.host).legal?.split, false);
  assert.throws(() => action(g, g.active, "split"), /cannotSplit/);
  assert.ok(publicGame(g, g.host).legal?.double);
  g = action(g, g.active, "double"); assert.ok(g.players[0].hands[0].doubled);
  assert.ok(g.players[0].hands.every((h) => h.split));
  g = resolve(g); assert.equal(g.players[0].hands.length, 4);
  g = rigDeal(["s10 h13"], "d10 c7", "s2 h3"); assert.ok(publicGame(g, g.host).legal?.split, "ten-value cards may split");
  g.players[0].bank = 19; assert.equal(publicGame(g, g.host).legal?.split, false);
});
test("Blackjack: split aces each get one card, no resplit/double, and no 3:2 bonus", () => {
  let g = rigDeal(["s14 h14"], "d10 c7", "d13 c14");
  g = action(g, g.active, "split"); assert.equal(g.step, "dealer");
  assert.ok(g.players[0].hands.every((h) => h.cards.length === 2 && h.status === "stood" && h.splitAces));
  g = resolve(g); assert.equal(g.players[0].hands[0].outcome, "win"); assert.equal(g.players[0].hands[0].returned, 40);
});
test("Blackjack: timeout skips an unconfirmed bet and stands after cards; explicit choices survive heartbeats", () => {
  let g = start(2); g = action(g, g.players[0].id, "bet", { amount: 30 }); g = tick(g);
  assert.equal(g.players[0].wager, 30); assert.equal(g.players[1].wager, 0);
  g = tick(g); if (g.step === "players") { const id = g.active; g = tick(g); assert.ok(g.players.find((p) => p.id === id)!.hands.every((h) => h.status !== "playing")); }
});
test("Blackjack: pause preserves deadlines; everyone absent resumes without forcing a decision and transfers host", () => {
  let g = rigDeal(["s10 h7", "d9 c8"], "s6 h10"), deadline = g.deadline!;
  g = action(g, g.host, "pause"); const pausedAt = g.updated;
  assert.equal(g.deadline, null);
  assert.throws(() => action(g, g.active, "hit"), /paused/);
  g = applyAction(g, g.host, { type: "pause" }, rng(), pausedAt + 500000);
  assert.equal(g.deadline, deadline + 500000);
  g = rigDeal(["s10 h7", "d9 c8"], "s6 h10"); const active = g.active, handId = g.activeHand;
  g.players.forEach((p) => { p.lastSeen = g.updated; }); const returning = g.players[1].id;
  g = applyAction(g, returning, { type: "heartbeat" }, rng(), g.updated + 600000);
  assert.equal(g.active, active); assert.equal(g.activeHand, handId); assert.equal(g.step, "players"); assert.ok(g.deadline! > g.updated); assert.equal(g.host, returning);
});
test("Blackjack: out-of-turn resignation preserves clock, forfeits committed hands, retains spectator seat", () => {
  let g = rigDeal(["s10 h7", "d9 c8"], "s6 h10"); const id = g.players[1].id, deadline = g.deadline;
  g = action(g, id, "resign"); assert.equal(g.deadline, deadline); assert.equal(g.players[1].bank, 0); assert.ok(!g.players[1].left);
  assert.equal(g.players[1].hands[0].status, "forfeit");
  g = resolve(g); assert.equal(g.players[1].hands[0].outcome, "loss"); assert.equal(publicGame(g, id).me, id);
});
test("Blackjack: resigning while paused cannot start a running dealer or dealing clock", () => {
  let g = start(2); g = action(g, g.players[0].id, "bet", { amount: 20 }); g = action(g, g.host, "pause");
  g = action(g, g.players[1].id, "resign"); assert.equal(g.step, "dealing"); assert.ok(g.paused); assert.equal(g.deadline, null);
});
test("Blackjack: twenty dealt rounds end the session and rematch restores all retained seats", () => {
  let g = start(2); const random = rng(182);
  let steps = 0;
  while (g.phase === "playing" && steps++ < 1000) {
    if (g.step === "betting") { for (const id of g.players.filter((p) => p.wager === null).map((p) => p.id)) g = action(g, id, "bet", { amount: 10 }); }
    else if (g.step === "players") g = action(g, g.active, "stand"); else g = tick(g);
  }
  assert.equal(g.phase, "finished"); assert.equal(g.round, 20); assert.equal(g.finishReason, "rounds");
  g = applyAction(g, g.host, { type: "again" }, random, g.updated + 1);
  assert.equal(g.round, 0); assert.ok(g.players.every((p) => p.bank === STARTING_BANK)); assert.equal(g.houseNet, 0);
});
test("Blackjack: free table runs beyond twenty rounds, host can finish after the current hand", () => {
  let g = start(); g.options.rounds = 0; g.round = 20;
  g = action(g, g.host, "bet", { amount: 10 }); assert.equal(g.round, 21);
  g = action(g, g.host, "finish"); assert.ok(g.finishRequested); assert.equal(g.phase, "playing");
  g = resolve(g); g = tick(g); assert.equal(g.phase, "finished"); assert.equal(g.finishReason, "host");
  g = start(); g = action(g, g.host, "finish"); assert.equal(g.phase, "finished"); assert.equal(g.round, 0);
});
test("Blackjack: players without the minimum watch, session ends when nobody can bet", () => {
  let g = start(); g.players[0].bank = 5; g.players[0].wager = 0;
  g = tick(g); assert.equal(g.phase, "finished"); assert.equal(g.finishReason, "funds");
});
test("Blackjack: simulated sessions conserve house/player accounting, unique cards and complete with seven players", () => {
  for (const count of [1, 3, 7]) for (let seed = 1; seed <= 8; seed++) {
    const random = rng(seed); let g = start(count), steps = 0;
    while (g.phase === "playing" && steps++ < 5000) {
      if (g.step === "betting") {
        for (const id of g.players.filter((p) => p.wager === null && p.bank >= 10 && !p.resigned).map((p) => p.id)) {
          const max = Math.min(20, Math.floor(g.players.find((p) => p.id === id)!.bank / 10));
          g = action(g, id, "bet", { amount: 10 * (1 + Math.floor(random() * max)) });
        }
      } else if (g.step === "players") {
        const legal = publicGame(g, g.active).legal!, total = handValue(g.players.find((p) => p.id === g.active)!.hands.find((h) => h.id === g.activeHand)!.cards).total;
        g = action(g, g.active, legal.split && random() < .7 ? "split" : legal.double && random() < .3 ? "double" : total < 17 ? "hit" : "stand");
      } else g = tick(g);
      const held = g.players.reduce((s, p) => s + p.bank + p.hands.filter((h) => h.outcome === null).reduce((v, h) => v + h.wager, 0), 0);
      assert.equal(held + g.houseNet + g.forfeited, count * STARTING_BANK, `accounting ${count}/${seed}/${steps}`);
      assert.ok(g.players.every((p) => Number.isSafeInteger(p.bank) && p.bank >= 0 && p.hands.length <= 4));
      const all = [...g.shoe, ...g.discard, ...g.dealer, ...g.players.flatMap((p) => p.hands.flatMap((h) => h.cards))];
      assert.equal(all.length, 312); assert.equal(new Set(all.map((c) => c.id)).size, 312);
      if (g.step === "players") assert.ok(publicGame(g, g.active).legal);
    }
    assert.equal(g.phase, "finished", `termination ${count}/${seed}`);
  }
});

test("Blackjack: last resignation or departure settles bets and finishes without a phantom host clock", () => {
  for (const type of ["resign", "leave"]) {
    let g = rigDeal(["s8 h8"], "d10 c7");
    g = action(g, g.host, type);
    assert.equal(g.phase, "finished"); assert.equal(g.deadline, null); assert.equal(g.finishReason, "resigned");
    assert.equal(g.players[0].bank, 0); assert.equal(g.players[0].hands[0].outcome, "loss");
    assert.equal(g.houseNet + g.forfeited, 1000);
  }
  let g = start(); g = action(g, g.host, "resign"); assert.equal(g.phase, "finished"); assert.equal(g.forfeited, 1000);
});
test("Blackjack: a ten-chip natural pays fifteen net with integer accounting", () => {
  const g = showdown("s14 h13", "d10 c9", { wager: 10 });
  assert.equal(g.players[0].bank, 1015); assert.equal(g.houseNet, -15);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  joinGame,
  owned,
  reinforcement,
  connected,
  findSet,
  validSet,
  maintenance,
  publicGame,
  type Game,
} from "../lib/game";
import { WORLD, BY_ID } from "../lib/world";
let seed = 12345;
function rand() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
function lobby(n = 3) {
  let g = createGame("ABC234", "Alice", 0, "a", 1000);
  for (let i = 1; i < n; i++)
    g = joinGame(g, "Player " + i, i, String(i), 1000);
  for (const p of g.players)
    g = applyAction(g, p.id, { type: "ready" }, rand, 1001);
  return g;
}
function started(n = 3) {
  let g = lobby(n);
  return applyAction(g, g.host, { type: "start" }, rand, 1002);
}
function deployed(n = 3) {
  let g = started(n);
  for (const p of g.players)
    g = applyAction(g, p.id, { type: "auto" }, rand, 1003);
  return g;
}
function attackFixture() {
  const g = deployed(),
    p = g.players.find((p) => p.id === g.active)!;
  g.phase = "attack";
  p.reserve = 0;
  for (const l of Object.values(g.lands)) {
    l.owner = g.players[1].id;
    l.troops = 1;
  }
  g.lands.alaska = { owner: p.id, troops: 15 };
  g.lands.alberta = { owner: p.id, troops: 2 };
  return g;
}
test("world has 42 territories, six continents, and reciprocal adjacency", () => {
  assert.equal(WORLD.length, 42);
  assert.equal(new Set(WORLD.map((t) => t.continent)).size, 6);
  for (const t of WORLD)
    for (const n of t.neighbors) {
      assert.ok(BY_ID[n], n);
      assert.ok(
        BY_ID[n].neighbors.includes(t.id),
        `${t.id} -> ${n} is asymmetric`,
      );
    }
});
for (const n of [3, 4, 5, 6])
  test(`${n} players receive correct starting armies and unique territories`, () => {
    let g = started(n);
    assert.equal(Object.keys(g.lands).length, 42);
    for (const p of g.players)
      assert.equal(
        owned(g, p.id).length + p.reserve,
        ({ 3: 35, 4: 30, 5: 25, 6: 20 } as Record<number, number>)[n],
      );
    for (const p of g.players)
      g = applyAction(g, p.id, { type: "auto" }, rand, 1003);
    assert.equal(g.phase, "reinforce");
    assert.equal(
      Object.values(g.lands).reduce((s, l) => s + l.troops, 0),
      ({ 3: 105, 4: 120, 5: 125, 6: 120 } as Record<number, number>)[n],
    );
  });
test("cannot start without enough humans or readiness", () => {
  const g = createGame("ABC234", "Alice", 0, "a", 1000);
  assert.throws(
    () => applyAction(g, g.host, { type: "start" }, rand, 1001),
    /playerCount/,
  );
  let h = joinGame(joinGame(g, "Bob", 1, "b", 1000), "Clara", 2, "c", 1000);
  assert.throws(
    () => applyAction(h, h.host, { type: "start" }, rand, 1001),
    /notReady/,
  );
});
test("valid and invalid card combinations, including wilds", () => {
  const c = (symbol: number, id = String(symbol)) => ({ symbol, id });
  assert.ok(validSet([c(0), c(0), c(3)]));
  assert.ok(validSet([c(0), c(1), c(2)]));
  assert.ok(!validSet([c(0), c(0), c(1)]));
  assert.ok(findSet([c(0, "1"), c(0, "2"), c(1, "3"), c(2, "4")]));
});
test("continental reinforcement and minimum armies", () => {
  const g = deployed(),
    p = g.active;
  for (const t of WORLD) g.lands[t.id].owner = null;
  g.lands.alaska.owner = p;
  assert.equal(reinforcement(g, p), 3);
  for (const t of WORLD.filter((t) => t.continent === "oc"))
    g.lands[t.id].owner = p;
  assert.equal(reinforcement(g, p), 5);
});
test("fortification follows own connected chain and cannot cross opponents", () => {
  const g = deployed(),
    p = g.active;
  for (const l of Object.values(g.lands)) l.owner = null;
  for (const id of ["alaska", "alberta", "westus", "central"])
    g.lands[id].owner = p;
  assert.ok(connected(g, "alaska", "central", p));
  g.lands.westus.owner = null;
  assert.ok(!connected(g, "alaska", "central", p));
});
test("blitz ties favour defender and leaves one attacking army", () => {
  const g = attackFixture();
  const n = applyAction(
    g,
    g.active,
    { type: "attack", from: "alaska", to: "nw" },
    () => 0.5,
    1004,
  );
  assert.equal(n.lands.alaska.troops, 1);
  assert.equal(n.lands.nw.troops, 1);
  assert.equal(n.lastBattle?.attackerLoss, 14);
  assert.equal(g.lands.alaska.troops, 15);
});
test("conquest requires legal minimum movement and preserves troop totals", () => {
  const g = attackFixture();
  let i = 0;
  const rng = () => {
    i++;
    return i % 4 === 0 ? 0 : 0.99;
  };
  let n = applyAction(
    g,
    g.active,
    { type: "attack", from: "alaska", to: "nw" },
    rng,
    1004,
  );
  if (!n.pending) {
    n = structuredClone(g);
    n.lands.nw.troops = 1;
    n = applyAction(
      n,
      n.active,
      { type: "attack", from: "alaska", to: "nw" },
      () => {
        i++;
        return i % 4 === 0 ? 0 : 0.99;
      },
      1004,
    );
  }
  assert.ok(n.pending);
  assert.throws(
    () => applyAction(n, n.active, { type: "next" }, rand, 1005),
    /mustMove/,
  );
  const before = n.lands.alaska.troops + n.lands.nw.troops;
  assert.throws(
    () => applyAction(n, n.active, { type: "move", amount: 0 }, rand, 1005),
    /invalidAmount/,
  );
  n = applyAction(
    n,
    n.active,
    { type: "move", amount: n.pending!.min },
    rand,
    1005,
  );
  assert.equal(n.lands.alaska.troops + n.lands.nw.troops, before);
  assert.ok(n.lands.nw.troops >= 1);
});
test("cannot attack own or nonadjacent lands, or play out of turn", () => {
  const g = attackFixture();
  assert.throws(
    () =>
      applyAction(
        g,
        g.active,
        { type: "attack", from: "alaska", to: "argentina" },
        rand,
        1004,
      ),
    /notAdjacent/,
  );
  assert.throws(
    () =>
      applyAction(
        g,
        g.active,
        { type: "attack", from: "alaska", to: "alberta" },
        rand,
        1004,
      ),
    /ownTarget/,
  );
  assert.throws(
    () =>
      applyAction(
        g,
        g.players.find((p) => p.id !== g.active)!.id,
        { type: "next" },
        rand,
        1004,
      ),
    /notYourTurn/,
  );
});
test("public state hides opponent cards, credentials, deck and private messages", () => {
  const g = deployed();
  const [a, b, c] = g.players;
  a.cards = [{ id: "alaska", symbol: 0 }];
  b.cards = [{ id: "brazil", symbol: 1 }];
  g.messages = [
    { id: "1", from: a.id, to: b.id, text: "secret", at: 1004 },
    { id: "2", from: a.id, to: null, text: "public", at: 1005 },
  ];
  const view = publicGame(g, c.id);
  assert.equal(view.messages.length, 1);
  assert.ok(view.players.every((p) => p.tokenHash === undefined));
  assert.equal(view.players[0].cards.length, 0);
  assert.equal(view.players[0].cardCount, 1);
  assert.equal(view.deck, undefined);
  assert.equal(publicGame(g, b.id).messages.length, 2);
});
test("disconnect pauses after 60 seconds and transfers host", () => {
  const g = deployed();
  g.host = g.active;
  const actor = g.players.find((p) => p.id !== g.active)!;
  actor.lastSeen = 70000;
  maintenance(g, 70001, rand);
  assert.ok(g.paused);
  assert.equal(g.pauseReason, "offline");
  assert.equal(g.host, actor.id);
});
test("timer deploys remaining armies, trades mandatory cards and advances", () => {
  const g = deployed();
  for (const p of g.players) p.lastSeen = 5000;
  g.timer = 2;
  g.deadline = 5001;
  const active = g.players.find((p) => p.id === g.active)!;
  active.cards = [0, 0, 0, 1, 2].map((symbol, i) => ({ symbol, id: "c" + i }));
  const before = g.active;
  maintenance(g, 5002, rand);
  assert.notEqual(g.active, before);
  assert.equal(active.cards.length, 2);
  assert.equal(active.reserve, 0);
  assert.equal(g.exchange, 1);
  assert.equal(g.phase, "reinforce");
});
test("exclusion preserves neutral armies and discards the player cards", () => {
  let g = deployed();
  const p = g.players.find((x) => x.id !== g.host)!;
  p.cards = [{ symbol: 1, id: "x" }];
  const lands = owned(g, p.id).map((t) => ({
    id: t.id,
    troops: g.lands[t.id].troops,
  }));
  g = applyAction(g, g.host, { type: "kick", player: p.id }, rand, 1004);
  for (const l of lands) {
    assert.equal(g.lands[l.id].owner, null);
    assert.equal(g.lands[l.id].troops, l.troops);
  }
  assert.ok(g.discard.some((c) => c.id === "x"));
  assert.ok(g.players.find((x) => x.id === p.id)!.eliminated);
});
test("single fortification ends turn and awards at most one card", () => {
  let g = deployed();
  const p = g.players.find((x) => x.id === g.active)!;
  p.reserve = 0;
  g.phase = "fortify";
  g.lands.alaska = { owner: p.id, troops: 9 };
  g.lands.alberta = { owner: p.id, troops: 1 };
  g.conquered = true;
  g = applyAction(
    g,
    p.id,
    { type: "fortify", from: "alaska", to: "alberta", amount: 4 },
    rand,
    1004,
  );
  assert.equal(g.lands.alaska.troops, 5);
  assert.equal(g.lands.alberta.troops, 5);
  assert.equal(g.players.find((x) => x.id === p.id)!.cards.length, 1);
  assert.notEqual(g.active, p.id);
});
test("full simulated games preserve invariants and reach world conquest", () => {
  for (const n of [3, 6]) {
    let g = deployed(n);
    let ticks = 1010;
    for (let steps = 0; steps < 20000 && g.phase !== "finished"; steps++) {
      ticks++;
      for (const p of g.players) p.lastSeen = ticks;
      const p = g.players.find((x) => x.id === g.active)!;
      let action;
      if (g.pending) action = { type: "move", amount: g.pending.max };
      else if (
        (g.phase === "reinforce" && p.cards.length >= 5) ||
        g.forcedTrade
      ) {
        const set = findSet(p.cards)!;
        assert.ok(set);
        action = { type: "trade", cards: set.map((c) => c.id) };
      } else if (p.reserve > 0) {
        const borders = owned(g, p.id)
          .filter((t) => t.neighbors.some((id) => g.lands[id].owner !== p.id))
          .sort((a, b) => g.lands[b.id].troops - g.lands[a.id].troops);
        action = {
          type: "deploy",
          territory: (borders[0] ?? owned(g, p.id)[0]).id,
          amount: p.reserve,
        };
      } else if (g.phase === "attack") {
        const from = owned(g, p.id)
          .filter(
            (t) =>
              g.lands[t.id].troops > 2 &&
              t.neighbors.some((id) => g.lands[id].owner !== p.id),
          )
          .sort((a, b) => g.lands[b.id].troops - g.lands[a.id].troops)[0];
        const to = from?.neighbors
          .filter((id) => g.lands[id].owner !== p.id)
          .sort((a, b) => g.lands[a].troops - g.lands[b].troops)[0];
        action =
          from && to ? { type: "attack", from: from.id, to } : { type: "next" };
      } else action = { type: "next" };
      g = applyAction(g, p.id, action, rand, ticks);
      for (const [id, l] of Object.entries(g.lands)) {
        assert.ok(Number.isInteger(l.troops) && l.troops >= 0, id);
        if (l.troops === 0) assert.equal(id, g.pending?.to);
      }
    }
    assert.equal(g.phase, "finished", `game with ${n} players did not finish`);
    assert.equal(owned(g, g.winner!).length, 42);
  }
});

test("reconnection after all clients were absent preserves the automatic pause", () => {
  const g = deployed();
  const active = g.active;
  const n = applyAction(g, active, { type: "heartbeat" }, rand, 70000);
  assert.ok(n.paused);
  assert.equal(n.pauseReason, "offline");
  assert.equal(n.players.find((p) => p.id === active)!.lastSeen, 70000);
});
test("exclusion of active player during pause resets next turn timer correctly", () => {
  let g = deployed();
  g.timer = 3;
  g.deadline = 180000;
  const host = g.players.find((p) => p.id !== g.active)!;
  g.host = host.id;
  g = applyAction(g, host.id, { type: "pause" }, rand, 2000);
  const oldActive = g.active;
  g = applyAction(g, host.id, { type: "kick", player: oldActive }, rand, 2001);
  assert.ok(g.paused);
  assert.equal(g.deadline, null);
  assert.equal(g.pausedRemaining, 180000);
  assert.equal(g.players.find((p) => p.id === oldActive)!.cards.length, 0);
});

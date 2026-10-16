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
import { eventText } from "../lib/i18n";
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

test("hosting transfers by arrival time rather than randomized turn order", () => {
  const g = deployed();
  g.players.forEach((p, i) => {
    p.joined = 10 + i;
    p.lastSeen = 70000;
  });
  g.host = g.players[0].id;
  g.players[0].lastSeen = 1000;
  const expected = g.players[1].id;
  g.players.reverse();
  maintenance(g, 70001, rand);
  assert.equal(g.host, expected);
});
test("alliances need the receiver's answer and stay secret from other players", () => {
  let g = attackFixture();
  const me = g.active,
    other = g.players[1].id,
    third = g.players[2].id;
  g = applyAction(g, me, { type: "ally", player: other }, rand, 2000);
  assert.deepEqual(g.alliances, []);
  assert.equal(g.proposals?.length, 1);
  // Only the two players involved see the pending proposal.
  assert.equal(publicGame(g, other).proposals.length, 1);
  assert.equal(publicGame(g, third).proposals.length, 0);
  assert.throws(
    () => applyAction(g, me, { type: "allyAnswer", player: other, accept: true }, rand, 2001),
    /noProposal/,
  );
  g = applyAction(g, other, { type: "allyAnswer", player: me, accept: true }, rand, 2002);
  assert.deepEqual(g.proposals, []);
  const sealed = g.logs.at(-1)!;
  assert.equal(sealed.key, "allied");
  for (const id of [me, other]) {
    assert.equal(publicGame(g, id).alliances.length, 1);
    assert.ok(publicGame(g, id).logs.some((entry) => entry.id === sealed.id));
  }
  assert.deepEqual(publicGame(g, third).alliances, []);
  assert.ok(!publicGame(g, third).logs.some((entry) => entry.id === sealed.id));
  g = applyAction(g, other, { type: "allyBreak", player: me }, rand, 2004);
  assert.deepEqual(g.alliances, []);
  assert.ok(!publicGame(g, third).logs.some((entry) => entry.key === "allyBroken"));
});
test("attacking an ally breaks the alliance as a private betrayal", () => {
  let g = attackFixture();
  const me = g.active,
    other = g.players[1].id,
    third = g.players[2].id;
  g = applyAction(g, me, { type: "ally", player: other }, rand, 2000);
  g = applyAction(g, other, { type: "allyAnswer", player: me, accept: true }, rand, 2001);
  g = applyAction(g, me, { type: "attack", from: "alaska", to: "kamchatka" }, rand, 2002);
  assert.ok(g.lastBattle);
  assert.deepEqual(g.alliances, []);
  const betrayal = g.logs.find((entry) => entry.key === "betrayed")!;
  assert.deepEqual(betrayal.args, [g.players[0].name, g.players[1].name]);
  assert.ok(publicGame(g, other).logs.some((entry) => entry.id === betrayal.id));
  assert.ok(!publicGame(g, third).logs.some((entry) => entry.id === betrayal.id));
});
test("refusal, cancellation and crossed proposals", () => {
  let g = attackFixture();
  const me = g.active,
    other = g.players[1].id;
  g = applyAction(g, me, { type: "ally", player: other }, rand, 2000);
  g = applyAction(g, other, { type: "allyAnswer", player: me, accept: false }, rand, 2001);
  assert.deepEqual(g.proposals, []);
  assert.deepEqual(g.alliances, []);
  g = applyAction(g, me, { type: "ally", player: other }, rand, 2002);
  g = applyAction(g, me, { type: "allyCancel", player: other }, rand, 2003);
  assert.deepEqual(g.proposals, []);
  g = applyAction(g, me, { type: "ally", player: other }, rand, 2004);
  g = applyAction(g, other, { type: "ally", player: me }, rand, 2005);
  assert.equal(g.alliances?.length, 1);
  assert.throws(() => applyAction(g, me, { type: "ally", player: other }, rand, 2006), /alreadyAllied/);
  assert.throws(() => applyAction(g, me, { type: "ally", player: me }, rand, 2007), /invalidRecipient/);
});
test("leaving the game ends that player's alliances and proposals", () => {
  let g = attackFixture();
  const me = g.active,
    other = g.players[1].id,
    third = g.players[2].id;
  g = applyAction(g, me, { type: "ally", player: other }, rand, 2000);
  g = applyAction(g, other, { type: "allyAnswer", player: me, accept: true }, rand, 2001);
  g = applyAction(g, third, { type: "ally", player: other }, rand, 2002);
  g = applyAction(g, other, { type: "leave" }, rand, 2003);
  assert.deepEqual(g.alliances, []);
  assert.deepEqual(g.proposals, []);
});
test("blitz odds are exact and agree with the engine's dice", async () => {
  const { blitzOdds } = await import("../lib/odds");
  // One die each: the attacker needs a strictly higher roll, 15/36.
  assert.ok(Math.abs(blitzOdds(2, 1).win - 15 / 36) < 1e-12);
  assert.equal(blitzOdds(1, 3).win, 0);
  assert.equal(blitzOdds(5, 0).win, 1);
  // Compare with the engine itself over many seeded battles.
  const runs = 4000;
  let wins = 0;
  for (let i = 0; i < runs; i++) {
    const g = attackFixture();
    g.lands.alaska.troops = 6;
    g.lands.kamchatka.troops = 4;
    const after = applyAction(g, g.active, { type: "attack", from: "alaska", to: "kamchatka" }, rand, 3000);
    if (after.lastBattle?.conquered) wins++;
  }
  assert.ok(Math.abs(wins / runs - blitzOdds(6, 4).win) < 0.03);
});

for (const phase of ["setup", "reinforce"] as const) {
  test(`manual ${phase} placement logs its player, territory and exact amount`, () => {
    const g = phase === "setup" ? started() : deployed();
    const p = g.players.find((p) => p.id === g.active)!;
    const territory = owned(g, p.id)[0].id;
    const before = g.lands[territory].troops;
    const next = applyAction(
      g,
      p.id,
      { type: "deploy", territory, amount: 2 },
      rand,
      1004,
    );
    const entries = next.logs.slice(g.logs.length);
    assert.deepEqual(
      entries.map(({ key, args }) => ({ key, args })),
      [{ key: "deployed", args: [p.name, territory, "2"] }],
    );
    assert.equal(next.lands[territory].troops, before + 2);
    assert.equal(
      next.players.find((nextPlayer) => nextPlayer.id === p.id)!.reserve,
      p.reserve - 2,
    );
    assert.ok(
      publicGame(
        next,
        g.players.find((other) => other.id !== p.id)!.id,
      ).logs.some((entry) => entry.id === entries[0].id),
    );
    assert.equal(g.lands[territory].troops, before);
  });
  test(`automatic ${phase} placement logs one exact total per reinforced territory`, () => {
    const g = phase === "setup" ? started() : deployed();
    const p = g.players.find((p) => p.id === g.active)!;
    const next = applyAction(g, p.id, { type: "auto" }, rand, 1004);
    const entries = next.logs
      .slice(g.logs.length)
      .filter((entry) => entry.key === "deployed");
    const changed = WORLD.filter(
      (t) => next.lands[t.id].troops > g.lands[t.id].troops,
    );
    assert.equal(entries.length, changed.length);
    assert.equal(
      new Set(entries.map((entry) => entry.args[1])).size,
      entries.length,
    );
    for (const territory of changed) {
      const entry = entries.find((entry) => entry.args[1] === territory.id)!;
      assert.deepEqual(entry.args, [
        p.name,
        territory.id,
        String(next.lands[territory.id].troops - g.lands[territory.id].troops),
      ]);
    }
    assert.equal(
      entries.reduce((sum, entry) => sum + Number(entry.args[2]), 0),
      p.reserve,
    );
  });
}
test("timer placements are journaled and omit territories receiving no troops", () => {
  const g = deployed();
  const p = g.players.find((p) => p.id === g.active)!;
  p.reserve = 1;
  g.deadline = 5001;
  for (const player of g.players) player.lastSeen = 5000;
  const count = g.logs.length;
  maintenance(g, 5002, rand);
  const entries = g.logs
    .slice(count)
    .filter((entry) => entry.key === "deployed");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].args[0], p.name);
  assert.equal(entries[0].args[2], "1");
});
test("a traded territory card logs its immediate two-army placement separately from reserve rewards", () => {
  const g = deployed();
  const p = g.players.find((p) => p.id === g.active)!;
  const territory = owned(g, p.id)[0].id;
  p.cards = [
    { id: "bonus", symbol: 0, territory },
    { id: "second", symbol: 0 },
    { id: "third", symbol: 0 },
  ];
  const next = applyAction(
    g,
    p.id,
    { type: "trade", cards: p.cards.map((card) => card.id) },
    rand,
    1004,
  );
  assert.deepEqual(
    next.logs.slice(g.logs.length).map(({ key, args }) => ({ key, args })),
    [
      { key: "trade", args: [p.name, "4"] },
      { key: "deployed", args: [p.name, territory, "2"] },
    ],
  );
  assert.equal(next.lands[territory].troops, g.lands[territory].troops + 2);
  assert.equal(
    next.players.find((player) => player.id === p.id)!.reserve,
    p.reserve + 4,
  );
});
test("placement journal entries translate territories and singular or plural troop counts", () => {
  assert.equal(
    eventText("deployed", ["Alice", "northafrica", "1"], "fr"),
    "Alice place 1 armée sur le territoire Afrique du Nord.",
  );
  assert.equal(
    eventText("deployed", ["Alice", "northafrica", "5"], "fr"),
    "Alice place 5 armées sur le territoire Afrique du Nord.",
  );
  assert.equal(
    eventText("deployed", ["Alice", "northafrica", "1"], "en"),
    "Alice deploys 1 army to North Africa.",
  );
  assert.equal(
    eventText("deployed", ["Alice", "northafrica", "5"], "en"),
    "Alice deploys 5 armies to North Africa.",
  );
});
test("resigning frees the player's lands but keeps them at the table as host", () => {
  let g = deployed(3);
  const host = g.host;
  g = applyAction(g, host, { type: "resign" }, rand, 2000);
  const p = g.players.find((x) => x.id === host)!;
  assert.ok(p.eliminated);
  assert.equal(g.host, host);
  assert.ok(Object.values(g.lands).every((l) => l.owner !== host));
  const l = lobby(2);
  assert.throws(() => applyAction(l, l.host, { type: "resign" }, rand, 2001), /invalidPhase/);
});

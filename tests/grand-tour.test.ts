import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUCTION_MS,
  JAIL_FINE,
  applyAction,
  createGame,
  joinGame,
  liquidity,
  publicGame,
  rent,
  type Game,
} from "../games/grand-tour/engine";
import { BOARD, GO_SALARY, JAIL } from "../games/grand-tour/board";

let seed = 777;
function rand() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
const NOW = 1000;
/** A random source whose next draws throw the given dice faces. */
const dice = (...faces: number[]) => {
  const q = faces.map((f) => (f - 1) / 6 + 0.01);
  return () => q.shift() ?? rand();
};
function table(n = 3, options: Partial<Game["options"]> = {}) {
  let g = createGame("GRAND", { name: "Alice", emblem: 0 }, "h0", NOW);
  for (let i = 1; i < n; i++) g = joinGame(g, { name: "Player " + i, emblem: i }, "h" + i, NOW);
  g = applyAction(g, g.host, { type: "options", ...options }, rand, NOW);
  return applyAction(g, g.host, { type: "start" }, rand, NOW);
}
const active = (g: Game) => g.players.find((p) => p.id === g.active)!;
const other = (g: Game, offset = 1) => {
  const i = g.players.findIndex((p) => p.id === g.active);
  return g.players[(i + offset) % g.players.length];
};
const act = (g: Game, who: string, action: Record<string, unknown>, r: () => number = rand, at = NOW) =>
  applyAction(g, who, action as { type: string }, r, at);

test("a game starts with the chosen cash, everyone on Start, and the first player to roll", () => {
  const g = table(4, { startCash: 2000 });
  assert.equal(g.phase, "playing");
  assert.equal(g.step, "roll");
  assert.ok(g.players.every((p) => p.cash === 2000 && p.pos === 0));
  assert.equal(g.decks.chance.length, 13);
  assert.equal(g.decks.chest.length, 12);
  assert.equal(BOARD.length, 40);
});

test("rolling walks the token, offers the square, and buying ends the turn", () => {
  let g = table();
  const a = active(g).id;
  g = act(g, a, { type: "roll" }, dice(1, 2)); // 3: Marrakech
  assert.equal(active(g).pos, 3);
  assert.equal(g.step, "buy");
  g = act(g, a, { type: "buy" });
  assert.equal(g.holdings["3"].owner, a);
  assert.equal(active(g).cash, 1500 - 60);
  assert.equal(g.step, "end");
  assert.throws(() => act(g, a, { type: "roll" }), /invalidStep/);
  g = act(g, a, { type: "end" });
  assert.notEqual(g.active, a);
});

test("rent doubles on a full group, climbs with houses, and building must stay even", () => {
  let g = table();
  const a = active(g), b = other(g);
  g.holdings = { "1": { owner: a.id, houses: 0, mortgaged: false } };
  assert.equal(rent(g, 1, 7), 2);
  g.holdings["3"] = { owner: a.id, houses: 0, mortgaged: false };
  assert.equal(rent(g, 1, 7), 4);
  g = act(g, a.id, { type: "build", square: 1 });
  assert.throws(() => act(g, a.id, { type: "build", square: 1 }), /buildEvenly/);
  g = act(g, a.id, { type: "build", square: 3 });
  g = act(g, a.id, { type: "build", square: 1 });
  assert.equal(rent(g, 1, 7), 30);
  assert.throws(() => act(g, a.id, { type: "mortgage", square: 3 }), /sellBuildingsFirst/);
  assert.throws(() => act(g, b.id, { type: "build", square: 1 }), /notOwner/);
  g = act(g, a.id, { type: "sell", square: 1 });
  assert.equal(g.holdings["1"].houses, 1);
});

test("landing on an owned square pays its owner", () => {
  let g = table();
  const a = active(g).id, b = other(g);
  g.holdings = { "5": { owner: b.id, houses: 0, mortgaged: false } };
  g = act(g, a, { type: "roll" }, dice(2, 3)); // airport
  assert.equal(g.players.find((p) => p.id === b.id)!.cash, 1500 + 25);
  assert.equal(active(g).cash, 1500 - 25);
  assert.equal(g.step, "end");
});

test("a double plays again; a third double in a row sends to jail", () => {
  let g = table();
  const a = active(g).id;
  g = act(g, a, { type: "roll" }, dice(2, 2)); // 4: income tax
  assert.equal(g.step, "roll");
  assert.equal(active(g).cash, 1500 - 200);
  g = act(g, a, { type: "roll" }, dice(3, 3)); // 10: just visiting
  assert.equal(g.step, "roll");
  g = act(g, a, { type: "roll" }, dice(1, 1));
  assert.equal(active(g).pos, JAIL);
  assert.ok(active(g).jailed);
  assert.equal(g.step, "end");
});

test("jail: a double frees the player, three misses cost the fine", () => {
  let g = table();
  const a = active(g);
  a.pos = JAIL;
  a.jailed = true;
  g = act(g, a.id, { type: "roll" }, dice(1, 2));
  assert.ok(active(g).jailed);
  assert.equal(g.step, "end");
  g.step = "roll";
  g = act(g, a.id, { type: "roll" }, dice(1, 2));
  g.step = "roll";
  g = act(g, a.id, { type: "roll" }, dice(1, 2)); // third miss: pays and walks 3
  assert.ok(!active(g).jailed);
  assert.equal(active(g).pos, 13);
  assert.equal(active(g).cash, 1500 - JAIL_FINE);

  let h = table();
  const c = active(h);
  c.pos = JAIL;
  c.jailed = true;
  h = act(h, c.id, { type: "roll" }, dice(4, 4));
  assert.ok(!active(h).jailed);
  assert.equal(active(h).pos, 18);
  // Leaving jail on a double does not give another roll.
  assert.notEqual(h.step, "roll");
});

test("passing Start pays the salary", () => {
  let g = table();
  const a = active(g);
  a.pos = 37;
  g = act(g, a.id, { type: "roll" }, dice(1, 3)); // 37 + 4 = 1: Le Caire
  assert.equal(active(g).pos, 1);
  assert.equal(active(g).cash, 1500 + GO_SALARY);
  assert.equal(g.step, "buy");
});

test("a declined square goes to auction and the best bid wins when the clock runs out", () => {
  let g = table(3);
  const a = active(g).id, b = other(g).id, c = other(g, 2).id;
  g = act(g, a, { type: "roll" }, dice(1, 2));
  g = act(g, a, { type: "decline" }, rand, NOW);
  assert.equal(g.step, "auction");
  g = act(g, b, { type: "bid", amount: 30 }, rand, NOW + 100);
  g = act(g, c, { type: "bid", amount: 45 }, rand, NOW + 200);
  assert.throws(() => act(g, b, { type: "bid", amount: 40 }, rand, NOW + 300), /invalidAmount/);
  g = act(g, b, { type: "heartbeat" }, rand, NOW + AUCTION_MS + 1);
  assert.equal(g.holdings["3"].owner, c);
  assert.equal(g.players.find((p) => p.id === c)!.cash, 1500 - 45);
  assert.equal(g.step, "end");
});

test("a debt can be settled by mortgaging, or ends in bankruptcy to the creditor", () => {
  let g = table(3);
  const a = active(g), b = other(g);
  a.cash = 10;
  g.holdings = {
    "39": { owner: b.id, houses: 5, mortgaged: false },
    "6": { owner: a.id, houses: 0, mortgaged: false },
  };
  a.pos = 35;
  g = act(g, a.id, { type: "roll" }, dice(1, 3)); // Paris with a hotel: 2000
  assert.equal(g.step, "debt");
  assert.equal(g.debt!.amount, 2000);
  assert.ok(liquidity(g, a.id) < 2000);
  assert.throws(() => act(g, a.id, { type: "payDebt" }), /notEnoughCash/);
  g = act(g, a.id, { type: "mortgage", square: 6 });
  g = act(g, a.id, { type: "bankrupt" });
  assert.ok(g.players.find((p) => p.id === a.id)!.bankrupt);
  assert.equal(g.holdings["6"].owner, b.id);
  assert.ok(g.holdings["6"].mortgaged);
  assert.equal(g.players.find((p) => p.id === b.id)!.cash, 1500 + 60);
  assert.notEqual(g.active, a.id);
});

test("the last player standing wins", () => {
  let g = table(2);
  const a = active(g).id, b = other(g).id;
  g = act(g, a, { type: "leave" });
  assert.equal(g.phase, "finished");
  assert.equal(g.winner, b);
});

test("trades move cash and squares, and stay private to the two players", () => {
  let g = table(3);
  const a = active(g).id, b = other(g).id, c = other(g, 2).id;
  g.holdings = { "1": { owner: a, houses: 0, mortgaged: false }, "3": { owner: b, houses: 0, mortgaged: false } };
  g = act(g, a, { type: "offer", to: b, give: { cash: 100, squares: [1] }, want: { squares: [3] } });
  assert.equal(publicGame(g, c).trades.length, 0);
  assert.equal(publicGame(g, b).trades.length, 1);
  assert.throws(() => act(g, c, { type: "tradeAnswer", id: g.trades[0].id, accept: true }), /noTrade/);
  g = act(g, b, { type: "tradeAnswer", id: g.trades[0].id, accept: true });
  assert.equal(g.holdings["1"].owner, b);
  assert.equal(g.holdings["3"].owner, a);
  assert.equal(g.players.find((p) => p.id === b)!.cash, 1600);
  assert.equal(g.trades.length, 0);
});

test("the public view hides token hashes and the card order", () => {
  const g = table();
  const v = publicGame(g, g.players[0].id);
  assert.equal(typeof v.decks.chance, "number");
  assert.ok(v.players.every((p) => !("tokenHash" in p)));
  assert.ok(!("requests" in v));
});

test("a host-only option cannot be changed by others, nor after the start", () => {
  let g = createGame("GRAND", { name: "Alice", emblem: 0 }, "h0", NOW);
  g = joinGame(g, { name: "Bob", emblem: 1 }, "h1", NOW);
  assert.throws(() => act(g, g.players[1].id, { type: "options", parkingPot: true }), /hostOnly/);
  g = act(g, g.host, { type: "options", parkingPot: true, startCash: 1000 });
  assert.equal(g.options.startCash, 1000);
  g = act(g, g.host, { type: "start" });
  assert.throws(() => act(g, g.host, { type: "options", auctions: false }), /alreadyStarted/);
});

test("random full games never break the books", () => {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  let finished = 0;
  for (let n = 0; n < 30; n++) {
    let g = table(2 + (n % 5), { parkingPot: n % 2 === 0, auctions: n % 3 !== 0, startCash: 1000 });
    let at = NOW;
    for (let step = 0; step < 6000 && g.phase === "playing"; step++) {
      at += 50;
      // Everyone stays connected: the offline pause is covered by the platform tests.
      for (const x of g.players) x.lastSeen = at;
      const p = active(g);
      const tryAct = (who: string, a: Record<string, unknown>) => {
        try {
          g = act(g, who, a, rand, at);
          return true;
        } catch (e) {
          // Only rule refusals are expected; a TypeError would be a real bug.
          assert.ok((e as Error).constructor.name === "GameError", String(e));
          return false;
        }
      };
      // Side moves by anyone: build, mortgage, trade.
      const someone = pick(g.players.filter((x) => !x.bankrupt && !x.left));
      const mine = Object.keys(g.holdings).filter((i) => g.holdings[i].owner === someone.id).map(Number);
      const r = rand();
      if (mine.length && r < 0.15) tryAct(someone.id, { type: "build", square: pick(mine) });
      else if (mine.length && r < 0.2) tryAct(someone.id, { type: pick(["mortgage", "unmortgage", "sell"]), square: pick(mine) });
      else if (mine.length && r < 0.23) {
        const to = pick(g.players.filter((x) => x.id !== someone.id && !x.bankrupt && !x.left));
        if (to && tryAct(someone.id, { type: "offer", to: to.id, give: { squares: [pick(mine)] }, want: { cash: 50 } }))
          tryAct(to.id, { type: "tradeAnswer", id: g.trades.at(-1)!.id, accept: rand() < 0.5 });
      }
      if (g.phase !== "playing") break;
      const q = active(g);
      if (g.step === "auction") {
        const bidder = pick(g.players.filter((x) => !x.bankrupt && !x.left));
        if (rand() < 0.5) tryAct(bidder.id, { type: "bid", amount: g.auction!.bid + 10 });
        else {
          at += 20000;
          for (const x of g.players) x.lastSeen = at;
          g = act(g, q.id, { type: "heartbeat" }, rand, at);
        }
      } else if (g.step === "roll") tryAct(q.id, q.jailed && rand() < 0.3 ? { type: "jailPay" } : { type: "roll" });
      else if (g.step === "buy") {
        if (!tryAct(q.id, { type: rand() < 0.7 ? "buy" : "decline" })) tryAct(q.id, { type: "decline" });
      } else if (g.step === "debt") {
        if (!tryAct(q.id, { type: "payDebt" })) {
          const owned = Object.keys(g.holdings).filter((i) => g.holdings[i].owner === q.id).map(Number);
          const raised = owned.some((i) => tryAct(q.id, { type: "sell", square: i }) || tryAct(q.id, { type: "mortgage", square: i }));
          if (!raised) tryAct(q.id, { type: "bankrupt" });
        }
      } else tryAct(q.id, { type: "end" });
      void p;
      for (const x of g.players) {
        assert.ok(x.cash >= 0, `negative cash for ${x.name}`);
        assert.ok(x.pos >= 0 && x.pos < 40);
      }
      for (const [i, h] of Object.entries(g.holdings)) {
        const owner = g.players.find((x) => x.id === h.owner);
        assert.ok(owner && !owner.bankrupt, `square ${i} held by a missing or bankrupt player`);
        assert.ok(h.houses >= 0 && h.houses <= 5);
        assert.ok(!(h.mortgaged && h.houses), "mortgaged square with houses");
      }
      if (g.phase === "playing" && g.step === "debt") assert.ok(g.debt && g.debt.player === g.active, JSON.stringify({ debt: g.debt, active: g.active, last: g.events.slice(-6).map((e) => e.key + ":" + e.args.join(",")) }));
    }
    if (g.phase === "finished") finished++;
  }
  // The random tables must actually reach bankruptcies and winners, not just wander.
  assert.ok(finished >= 15, `only ${finished} games finished`);
});

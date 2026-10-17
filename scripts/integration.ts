import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { WORLD, BY_ID } from "../lib/world";
const base = process.env.MAPPA_TEST_URL ?? "http://localhost:3000";
type Any = any;
async function req(path: string, token?: string, data?: Any) {
  const r = await fetch(base + path, {
    method: data ? "POST" : "GET",
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(data
        ? { "Content-Type": "application/json", Origin: new URL(base).origin }
        : {}),
    },
    ...(data
      ? {
          body: JSON.stringify({
            ...data,
            requestId: data.requestId ?? randomUUID(),
          }),
        }
      : {}),
    signal: AbortSignal.timeout(30000),
  });
  return { status: r.status, ...(await r.json()) };
}
for (const count of [3, 6]) {
  const create = await req("/api/rooms", undefined, {
    name: "QA Alice " + count,
    color: 0,
  });
  assert.equal(create.status, 200, JSON.stringify(create));
  const code = create.game.code;
  const members = new Map<string, string>([[create.game.me, create.token]]);
  let g = create.game;
  console.log("Created " + count + "-player test room " + code);
  const joined = await Promise.all(
    Array.from({ length: count - 1 }, (_, i) =>
      req("/api/rooms/" + code, undefined, {
        type: "join",
        name: "QA Player " + (i + 2),
        color: i + 1,
      }),
    ),
  );
  for (const j of joined) {
    assert.equal(j.status, 200, JSON.stringify(j));
    members.set(j.game.me, j.token);
  }
  const act = async (id: string, a: Any) => {
    const r = await req("/api/rooms/" + code, members.get(id), a);
    assert.equal(r.status, 200, JSON.stringify({ a, error: r.error }));
    g = r.game;
    return r;
  };
  let host = (await req("/api/rooms/" + code, create.token)).game.host;
  const ready = await Promise.all(
    [...members].map(([id, token]) =>
      req("/api/rooms/" + code, token, { type: "ready" }),
    ),
  );
  assert.ok(ready.every((r) => r.status === 200));
  await act(host, { type: "start" });
  assert.equal(g.phase, "setup");
  assert.equal(Object.keys(g.lands).length, 42);
  const forbidden = await req("/api/rooms/" + code, "0".repeat(64));
  assert.equal(forbidden.status, 403);
  const publicPreview = await req("/api/rooms/" + code);
  assert.ok(!JSON.stringify(publicPreview).includes("tokenHash"));
  assert.equal(publicPreview.players.length, count);
  const auto = await Promise.all(
    [...members].map(([id, token]) =>
      req("/api/rooms/" + code, token, { type: "auto" }),
    ),
  );
  assert.ok(
    auto.every((r) => r.status === 200),
    JSON.stringify(auto.map((r) => r.error)),
  );
  g = (await req("/api/rooms/" + code, create.token)).game;
  assert.equal(g.phase, "reinforce");
  const [a, b, c] = [...members.keys()];
  await act(a, { type: "message", text: "QA private only AB", to: b });
  const va = (await req("/api/rooms/" + code, members.get(a))).game,
    vb = (await req("/api/rooms/" + code, members.get(b))).game,
    vc = (await req("/api/rooms/" + code, members.get(c))).game;
  assert.ok(va.messages.some((m: Any) => m.text === "QA private only AB"));
  assert.ok(vb.messages.some((m: Any) => m.text === "QA private only AB"));
  assert.ok(!vc.messages.some((m: Any) => m.text === "QA private only AB"));
  assert.ok(vc.players.every((p: Any) => !p.tokenHash));
  assert.equal(vc.deck, undefined);
  console.log(
    "  Concurrent joins, readiness, deployment, privacy and authorization pass",
  );
  let active = g.active;
  g = (await req("/api/rooms/" + code, members.get(active))).game;
  const own = WORLD.filter((t) => g.lands[t.id].owner === active),
    border = own.find((t) =>
      t.neighbors.some((id) => g.lands[id].owner !== active),
    )!;
  const reserve = g.players.find((p: Any) => p.id === active).reserve;
  const rid = randomUUID();
  await act(active, {
    type: "deploy",
    territory: border.id,
    amount: reserve,
    requestId: rid,
  });
  const troops = g.lands[border.id].troops;
  await act(active, {
    type: "deploy",
    territory: border.id,
    amount: reserve,
    requestId: rid,
  });
  assert.equal(g.lands[border.id].troops, troops);
  const placements = g.logs.filter(
    (entry: Any) =>
      entry.key === "deployed" &&
      entry.args[0] === g.players.find((p: Any) => p.id === active).name &&
      entry.args[1] === border.id &&
      entry.args[2] === String(reserve),
  );
  assert.equal(
    placements.length,
    1,
    "Retried placement must not duplicate the journal event",
  );
  const observer = (
    await req(
      "/api/rooms/" + code,
      members.get([...members.keys()].find((id) => id !== active)!),
    )
  ).game;
  assert.ok(observer.logs.some((entry: Any) => entry.id === placements[0].id));
  await act(active, { type: "next" });
  const target = border.neighbors.find((id) => g.lands[id].owner !== active)!;
  await act(active, { type: "attack", from: border.id, to: target });
  assert.ok(g.lastBattle);
  if (g.pending) await act(active, { type: "move", amount: g.pending.max });
  await act(active, { type: "next" });
  await act(active, { type: "next" });
  assert.notEqual(g.active, active);
  const restored = (await req("/api/rooms/" + code, members.get(active))).game;
  assert.equal(restored.me, active);
  console.log(
    "  Blitz, movement, phase progression, idempotency and reconnect pass",
  );
  await act(host, { type: "pause" });
  assert.ok(g.paused);
  const blocked = await req("/api/rooms/" + code, members.get(g.active), {
    type: "next",
  });
  assert.equal(blocked.error, "paused");
  await act(host, { type: "pause" });
  assert.ok(!g.paused);
  const removed = g.players.find((p: Any) => p.id !== host && !p.eliminated)!;
  await act(host, { type: "kick", player: removed.id });
  assert.ok(g.players.find((p: Any) => p.id === removed.id).eliminated);
  assert.ok(Object.values(g.lands).some((l: Any) => l.owner === null));
  console.log("  Host pause/resume and neutral exclusion pass");
  console.log("PASS " + count + " players");
}
{
  // Pioche: the platform routes rooms to the right game and each view keeps hands private.
  const pioche = (path: string) => path + (path.includes("?") ? "&" : "?") + "game=pioche";
  const create = await req(pioche("/api/rooms"), undefined, { game: "pioche", name: "QA Pioche", emblem: 0 });
  assert.equal(create.status, 200, JSON.stringify(create));
  const code = create.game.code;
  console.log("Created Pioche test room " + code);
  const join = await req(pioche("/api/rooms/" + code), undefined, { type: "join", name: "QA Pioche 2", emblem: 0 });
  assert.equal(join.status, 200, JSON.stringify(join));
  assert.notEqual(join.game.players[1].emblem, join.game.players[0].emblem);
  assert.equal((await req("/api/rooms/" + code)).error, "roomNotFound");
  const started = await req(pioche("/api/rooms/" + code), create.token, { type: "start" });
  assert.equal(started.status, 200, JSON.stringify(started));
  const seen = (await req(pioche("/api/rooms/" + code), join.token)).game;
  for (const p of seen.players) assert.equal(p.hand.length, p.id === seen.me ? 7 : 0);
  assert.ok(!("deck" in seen) && !JSON.stringify(seen).includes("tokenHash"));
  const tokens = new Map([[create.game.me, create.token], [join.game.me, join.token]]);
  const drawn = await req(pioche("/api/rooms/" + code), tokens.get(seen.active), { type: "draw" });
  assert.equal(drawn.status, 200, JSON.stringify(drawn));
  console.log("PASS Pioche: routing, privacy, deal and draw");
}
{
  // Grand Tour: routing, the hidden card order, a roll, and a trade seen only by its two players.
  const gt = (path: string) => path + (path.includes("?") ? "&" : "?") + "game=grand-tour";
  const create = await req(gt("/api/rooms"), undefined, { game: "grand-tour", name: "QA Tour", emblem: 0 });
  assert.equal(create.status, 200, JSON.stringify(create));
  const code = create.game.code;
  console.log("Created Grand Tour test room " + code);
  const joins = [];
  for (const name of ["QA Tour 2", "QA Tour 3"]) {
    const j = await req(gt("/api/rooms/" + code), undefined, { type: "join", name, emblem: 0 });
    assert.equal(j.status, 200, JSON.stringify(j));
    joins.push(j);
  }
  assert.equal((await req("/api/rooms/" + code)).error, "roomNotFound");
  const started = await req(gt("/api/rooms/" + code), create.token, { type: "start" });
  assert.equal(started.status, 200, JSON.stringify(started));
  const tokens = new Map([[create.game.me, create.token], ...joins.map((j) => [j.game.me, j.token] as [string, string])]);
  const seen = (await req(gt("/api/rooms/" + code), joins[0].token)).game;
  assert.equal(typeof seen.decks.chance, "number");
  assert.ok(!JSON.stringify(seen).includes("tokenHash"));
  const rolled = await req(gt("/api/rooms/" + code), tokens.get(seen.active), { type: "roll" });
  assert.equal(rolled.status, 200, JSON.stringify(rolled));
  assert.ok(rolled.game.dice && rolled.game.lastMove);
  const [a, b, c] = [...tokens.keys()];
  const offer = await req(gt("/api/rooms/" + code), tokens.get(a), { type: "offer", to: b, give: { cash: 10 }, want: {} });
  assert.equal(offer.status, 200, JSON.stringify(offer));
  assert.equal((await req(gt("/api/rooms/" + code), tokens.get(b))).game.trades.length, 1);
  assert.equal((await req(gt("/api/rooms/" + code), tokens.get(c))).game.trades.length, 0);
  console.log("PASS Grand Tour: routing, privacy, roll and private trades");
}
for (const [game, opening, illegal] of [
  ["echecs", { from: 12, to: 28 }, { from: 12, to: 36 }],
  ["dames", { path: [31, 42] }, { path: [31, 51] }],
] as const) {
  // Chess and draughts: routing, a two-seat table, an illegal move refused and a legal one played.
  const q = (path: string) => path + "?game=" + game;
  const create = await req(q("/api/rooms"), undefined, { game, name: "QA Duel 1", emblem: 0 });
  assert.equal(create.status, 200, JSON.stringify(create));
  const code = create.game.code;
  console.log(`Created ${game} test room ${code}`);
  const join = await req(q("/api/rooms/" + code), undefined, { type: "join", name: "QA Duel 2", emblem: 1 });
  assert.equal(join.status, 200, JSON.stringify(join));
  const third = await req(q("/api/rooms/" + code), undefined, { type: "join", name: "QA Duel 3", emblem: 2 });
  assert.equal(third.error, "roomFull");
  assert.equal((await req("/api/rooms/" + code)).error, "roomNotFound");
  const started = await req(q("/api/rooms/" + code), create.token, { type: "start" });
  assert.equal(started.status, 200, JSON.stringify(started));
  assert.ok(!JSON.stringify(started.game).includes("tokenHash"));
  const white = started.game.players.find((p: Any) => p.side === "w").id === create.game.me ? create.token : join.token;
  const refused = await req(q("/api/rooms/" + code), white, { type: "move", ...illegal });
  assert.equal(refused.error, "illegalMove", JSON.stringify(refused));
  const moved = await req(q("/api/rooms/" + code), white, { type: "move", ...opening });
  assert.equal(moved.status, 200, JSON.stringify(moved));
  assert.equal(moved.game.moves.length, 1);
  console.log(`PASS ${game}: routing, two seats, move legality`);
}
{
  const q = (path: string) => path + "?game=poker";
  const create = await req(q("/api/rooms"), undefined, { game: "poker", name: "QA Poker 1", emblem: 0 });
  assert.equal(create.status, 200, JSON.stringify(create));
  const code = create.game.code, path = q("/api/rooms/" + code);
  console.log("Created Poker test room " + code);
  const joins = [];
  for (let i = 2; i <= 3; i++) {
    const j = await req(path, undefined, { type: "join", name: "QA Poker " + i, emblem: 0 });
    assert.equal(j.status, 200, JSON.stringify(j)); joins.push(j);
  }
  const tokens = new Map<string, string>([[create.game.me, create.token], ...joins.map((j) => [j.game.me, j.token] as [string, string])]);
  assert.equal((await req("/api/rooms/" + code)).error, "roomNotFound");
  const options = await req(path, create.token, { type: "options", timer: 60, levelMinutes: 2 });
  assert.equal(options.status, 200, JSON.stringify(options));
  const started = await req(path, create.token, { type: "start" });
  assert.equal(started.status, 200, JSON.stringify(started));
  let g = started.game;
  assert.equal(g.phase, "playing"); assert.equal(g.options.timer, 60);
  assert.equal(g.players.reduce((sum: number, p: Any) => sum + p.stack + p.contributed, 0), 4500);
  for (const [id, token] of tokens) {
    const view = (await req(path, token)).game;
    assert.equal(view.me, id);
    for (const p of view.players) assert.equal(p.hand.length, p.id === id ? 2 : 0);
    for (const field of ["deck", "burned", "requests", "acted", "pending"]) assert.ok(!(field in view));
    assert.ok(!JSON.stringify(view).includes("tokenHash"));
  }
  const preview = await req(path);
  assert.ok(!JSON.stringify(preview).includes("hand"));
  assert.equal((await req(path, undefined, { type: "join", name: "QA Late" })).error, "alreadyStarted");
  const invalid = await req(path, tokens.get(g.active), { type: "check" });
  assert.equal(invalid.error, "cannotCheck");
  const requestId = randomUUID(), actor = g.active;
  const call = await req(path, tokens.get(actor), { type: "call", requestId });
  assert.equal(call.status, 200, JSON.stringify(call));
  const retried = await req(path, tokens.get(actor), { type: "call", requestId });
  assert.equal(retried.status, 200, JSON.stringify(retried));
  assert.equal(retried.game.players.find((p: Any) => p.id === actor).stack, call.game.players.find((p: Any) => p.id === actor).stack);
  const folded = call.game.active;
  const fold = await req(path, tokens.get(folded), { type: "fold" });
  assert.equal(fold.status, 200, JSON.stringify(fold)); g = fold.game;
  // A spectator retains identity while folded cards stay hidden to other players.
  const observer = (await req(path, tokens.get(actor))).game;
  assert.equal(observer.players.find((p: Any) => p.id === folded).hand.length, 0);
  const resigned = await req(path, tokens.get(folded), { type: "resign" });
  assert.equal(resigned.status, 200, JSON.stringify(resigned));
  const restored = (await req(path, tokens.get(folded))).game;
  assert.equal(restored.me, folded);
  assert.ok(restored.players.find((p: Any) => p.id === folded).resigned);
  assert.ok(!restored.players.find((p: Any) => p.id === folded).left);
  console.log("PASS Poker: routing, private hands, settings, bets, idempotency and spectator reconnect");
}
{
  const q = (path: string) => path + "?game=blackjack";
  const create = await req(q("/api/rooms"), undefined, { game: "blackjack", name: "QA Blackjack 1", emblem: 0 });
  assert.equal(create.status, 200, JSON.stringify(create));
  const code = create.game.code, path = q("/api/rooms/" + code);
  console.log("Created Blackjack test room " + code);
  const join = await req(path, undefined, { type: "join", name: "QA Blackjack 2", emblem: 0 });
  assert.equal(join.status, 200, JSON.stringify(join));
  assert.notEqual(join.game.players[0].emblem, join.game.players[1].emblem);
  assert.equal((await req("/api/rooms/" + code)).error, "roomNotFound");
  const tokens = new Map<string, string>([[create.game.me, create.token], [join.game.me, join.token]]);
  const options = await req(path, create.token, { type: "options", timer: 60, rounds: 20 });
  assert.equal(options.status, 200, JSON.stringify(options));
  const start = await req(path, create.token, { type: "start" });
  assert.equal(start.status, 200, JSON.stringify(start)); assert.equal(start.game.step, "betting");
  assert.equal((await req(path, undefined, { type: "join", name: "QA Late" })).error, "alreadyStarted");
  assert.equal((await req(path, create.token, { type: "bet", amount: 15 })).error, "invalidAmount");
  const requestId = randomUUID();
  const firstBet = await req(path, create.token, { type: "bet", amount: 20, requestId });
  assert.equal(firstBet.status, 200, JSON.stringify(firstBet)); assert.equal(firstBet.game.step, "betting");
  const retry = await req(path, create.token, { type: "bet", amount: 20, requestId });
  assert.equal(retry.status, 200, JSON.stringify(retry)); assert.equal(retry.game.players[0].bank, 980);
  const secondBet = await req(path, join.token, { type: "bet", amount: 20 });
  assert.equal(secondBet.status, 200, JSON.stringify(secondBet));
  let g = secondBet.game;
  assert.equal(g.step, "dealing"); assert.equal(g.dealer[1], null);
  for (const token of tokens.values()) {
    const view = (await req(path, token)).game;
    assert.equal(view.dealer[1], null);
    assert.ok(view.players.every((p: Any) => p.hands[0].cards.length === 2));
    assert.ok(!("shoe" in view) && !("discard" in view) && !("requests" in view));
    assert.ok(!JSON.stringify(view).includes("tokenHash"));
  }
  for (let step = 0; g.step !== "result" && step < 30; step++) {
    if (g.step === "players") {
      const stood = await req(path, tokens.get(g.active), { type: "stand" });
      assert.equal(stood.status, 200, JSON.stringify(stood)); g = stood.game;
    } else {
      await new Promise((r) => setTimeout(r, 1550));
      const advanced = await req(path, create.token, { type: "heartbeat" });
      assert.equal(advanced.status, 200, JSON.stringify(advanced)); g = advanced.game;
    }
  }
  assert.equal(g.step, "result"); assert.ok(g.dealer.every(Boolean));
  assert.equal(g.players.reduce((sum: number, p: Any) => sum + p.bank, 0) + g.houseNet, 2000);
  const resign = await req(path, join.token, { type: "resign" });
  assert.equal(resign.status, 200, JSON.stringify(resign));
  const restored = (await req(path, join.token)).game;
  assert.equal(restored.me, join.game.me); assert.ok(restored.players[1].resigned && !restored.players[1].left);
  assert.equal((await req(path, create.token, { type: "finish" })).status, 200);
  const again = await req(path, create.token, { type: "again" });
  assert.equal(again.status, 200, JSON.stringify(again));
  assert.equal(again.game.round, 0); assert.ok(again.game.players.every((p: Any) => p.bank === 1000 && !p.resigned));
  await req(path, create.token, { type: "finish" });
  const solo = await req(q("/api/rooms"), undefined, { game: "blackjack", name: "QA Blackjack Solo" });
  assert.equal(solo.status, 200, JSON.stringify(solo));
  const soloPath = q("/api/rooms/" + solo.game.code);
  const soloStart = await req(soloPath, solo.token, { type: "start" });
  assert.equal(soloStart.status, 200, JSON.stringify(soloStart));
  assert.equal(soloStart.game.players.length, 1); assert.equal(soloStart.game.step, "betting");
  await req(soloPath, solo.token, { type: "finish" });
  console.log("PASS Blackjack: solo, routing, settings, betting, idempotency, hidden dealer card, payouts and rematch");
}
console.log("Integration suite passed against " + base);

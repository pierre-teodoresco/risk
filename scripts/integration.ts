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
console.log("Integration suite passed against " + base);

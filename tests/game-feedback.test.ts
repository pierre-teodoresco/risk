import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, publicGame, type Log } from "../lib/game";
import { gameFeedback } from "../lib/game-feedback";

const event = (id: string, key = "paused", args: string[] = []): Log => ({
  id,
  key,
  args,
  at: 1000,
});
function snapshot() {
  const g = createGame("ABC234", "Alice", 0, "a", 1000);
  g.revision = 10;
  g.lands = {
    alaska: { owner: g.host, troops: 8 },
    nw: { owner: "opponent", troops: 3 },
  };
  g.logs = [event("existing")];
  return publicGame(g, g.host);
}

test("feedback starts silently when opening a game or switching rooms or players", () => {
  const next = snapshot();
  assert.deepEqual(gameFeedback(null, next), { events: [], troops: [] });
  for (const key of ["code", "me"] as const) {
    const previous = { ...next, [key]: "another" };
    assert.deepEqual(gameFeedback(previous, next), { events: [], troops: [] });
  }
});
test("feedback ignores duplicate and stale responses", () => {
  const previous = snapshot();
  for (const revision of [9, 10]) {
    const next = structuredClone(previous);
    next.revision = revision;
    next.logs.push(event("new"));
    next.lands.alaska.troops += 5;
    assert.deepEqual(gameFeedback(previous, next), { events: [], troops: [] });
  }
});
test("all new journal events retain their chronological order across log retention", () => {
  const previous = snapshot(),
    next = structuredClone(previous);
  next.revision++;
  next.logs = [
    event("one", "conquered", ["Alice", "nw", "2", "3"]),
    event("two", "eliminated", ["Alice", "Bob"]),
    event("three", "victory", ["Alice"]),
  ];
  assert.deepEqual(
    gameFeedback(previous, next).events.map((e) => e.id),
    ["one", "two", "three"],
  );
  assert.deepEqual(
    gameFeedback(next, { ...next, revision: next.revision + 1 }).events,
    [],
  );
});
test("placement and combat report signed troop amounts without requiring a journal entry", () => {
  const previous = snapshot(),
    next = structuredClone(previous);
  next.revision++;
  next.lands.alaska.troops += 6;
  next.lands.nw.troops -= 2;
  const feedback = gameFeedback(previous, next);
  assert.deepEqual(feedback.events, []);
  assert.deepEqual(
    feedback.troops.map((c) => [c.territory, c.amount]),
    [
      ["alaska", 6],
      ["nw", -2],
    ],
  );
});
test("a movement reports both departure and arrival with equal troop amounts", () => {
  const previous = snapshot(),
    next = structuredClone(previous);
  next.revision++;
  next.lands.alaska.troops -= 4;
  next.lands.nw.troops += 4;
  assert.deepEqual(
    gameFeedback(previous, next).troops.map((c) => c.amount),
    [-4, 4],
  );
});
test("conquest and occupation show defenders lost and troops gained even with an unchanged total", () => {
  const previous = snapshot(),
    next = structuredClone(previous);
  next.revision++;
  next.lands.nw.owner = next.me;
  next.logs.push(event("capture", "conquered", ["Alice", "nw", "0", "3"]));
  const changes = gameFeedback(previous, next).troops;
  assert.deepEqual(
    changes.map((c) => [c.territory, c.amount]),
    [
      ["nw", -3],
      ["nw", 3],
    ],
  );
  assert.equal(new Set(changes.map((c) => c.id)).size, 2);
});
test("initial territory allocation and neutralization do not invent troop changes", () => {
  const previous = snapshot(),
    next = structuredClone(previous);
  next.revision++;
  next.lands.alaska.owner = null;
  next.lands.alberta = { owner: next.me, troops: 1 };
  assert.deepEqual(gameFeedback(previous, next).troops, []);
});

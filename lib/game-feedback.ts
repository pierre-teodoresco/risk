import type { Log, PublicGame } from "./game";

export type TroopChange = {
  id: string;
  territory: string;
  amount: number;
};

/** Compare accepted snapshots without replaying history on entry or reconnection. */
export function gameFeedback(
  previous: PublicGame | null,
  next: PublicGame,
): {
  events: Log[];
  troops: TroopChange[];
} {
  if (
    !previous ||
    previous.code !== next.code ||
    previous.me !== next.me ||
    next.revision <= previous.revision
  )
    return { events: [], troops: [] };

  const knownEvents = new Set(previous.logs.map((event) => event.id));
  const events = next.logs.filter((event) => !knownEvents.has(event.id));
  const conquered = new Set(
    events
      .filter((event) => event.key === "conquered")
      .map((event) => event.args[1]),
  );
  const troops: TroopChange[] = [];
  const add = (territory: string, amount: number) => {
    if (amount)
      troops.push({
        id: `${next.code}:${next.revision}:${territory}:${amount > 0 ? "gain" : "loss"}`,
        territory,
        amount,
      });
  };
  for (const [territory, land] of Object.entries(next.lands)) {
    const before = previous.lands[territory];
    if (!before) continue;
    // A conquest and its occupation can arrive together. Show the defenders'
    // losses and the incoming troops even when the final troop total is equal.
    if (before.owner !== land.owner && conquered.has(territory)) {
      add(territory, -before.troops);
      add(territory, land.troops);
    } else add(territory, land.troops - before.troops);
  }
  return { events, troops };
}

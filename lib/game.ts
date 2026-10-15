import { BY_ID, CONTINENTS, WORLD } from "./world";
export type Phase =
  "lobby" | "setup" | "reinforce" | "attack" | "fortify" | "finished";
export type Card = { id: string; symbol: number; territory?: string };
export type Player = {
  id: string;
  name: string;
  color: number;
  tokenHash: string;
  ready: boolean;
  eliminated: boolean;
  lastSeen: number;
  joined: number;
  reserve: number;
  cards: Card[];
};
export type Land = { owner: string | null; troops: number };
export type Log = { id: string; key: string; args: string[]; at: number };
export type Message = {
  id: string;
  from: string;
  to: string | null;
  text: string;
  at: number;
};
export type Game = {
  requests?: Record<string, string[]>;
  channel: string;
  code: string;
  revision: number;
  created: number;
  updated: number;
  host: string;
  players: Player[];
  lands: Record<string, Land>;
  phase: Phase;
  active: string;
  round: number;
  timer: number;
  deadline: number | null;
  paused: boolean;
  pauseReason: string | null;
  pausedRemaining: number | null;
  exchange: number;
  deck: Card[];
  discard: Card[];
  conquered: boolean;
  pending: { from: string; to: string; min: number; max: number } | null;
  forcedTrade: boolean;
  messages: Message[];
  logs: Log[];
  winner: string | null;
  lastBattle: {
    from: string;
    to: string;
    attackerLoss: number;
    defenderLoss: number;
    conquered: boolean;
    at: number;
  } | null;
};
export type Action = { type: string; [key: string]: unknown };
export class GameError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
function fail(code: string): never {
  throw new GameError(code);
}
const integer = (v: unknown, min = 0, max = 100000) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max
    ? v
    : fail("invalidAmount");
const tid = (v: unknown) =>
  typeof v === "string" && BY_ID[v] ? v : fail("invalidTerritory");
const name = (v: unknown) =>
  typeof v === "string" && v.trim().length >= 2 && v.trim().length <= 20
    ? v.trim()
    : fail("invalidName");
const uid = () => crypto.randomUUID();
function log(g: Game, key: string, ...args: string[]) {
  g.logs.push({ id: uid(), key, args, at: g.updated });
  g.logs = g.logs.slice(-120);
}
export function shuffle<T>(items: T[], random: () => number) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function makePlayer(
  n: unknown,
  color: number,
  hash: string,
  now: number,
): Player {
  return {
    id: uid(),
    name: name(n),
    color,
    tokenHash: hash,
    ready: false,
    eliminated: false,
    lastSeen: now,
    joined: now,
    reserve: 0,
    cards: [],
  };
}
export function createGame(
  code: string,
  n: unknown,
  color: number,
  hash: string,
  now = Date.now(),
): Game {
  const p = makePlayer(n, integer(color, 0, 5), hash, now);
  return {
    channel: uid(),
    code,
    revision: 0,
    created: now,
    updated: now,
    host: p.id,
    players: [p],
    lands: {},
    phase: "lobby",
    active: p.id,
    round: 1,
    timer: 0,
    deadline: null,
    paused: false,
    pauseReason: null,
    pausedRemaining: null,
    exchange: 0,
    deck: [],
    discard: [],
    conquered: false,
    pending: null,
    forcedTrade: false,
    messages: [],
    logs: [],
    winner: null,
    lastBattle: null,
  };
}
export function owned(g: Game, p: string) {
  return WORLD.filter((t) => g.lands[t.id]?.owner === p);
}
export function reinforcement(g: Game, p: string) {
  return (
    Math.max(3, Math.floor(owned(g, p).length / 3)) +
    CONTINENTS.reduce(
      (sum, c) =>
        sum +
        (WORLD.filter((t) => t.continent === c.id).every(
          (t) => g.lands[t.id]?.owner === p,
        )
          ? c.bonus
          : 0),
      0,
    )
  );
}
export function connected(
  g: Pick<Game, "lands">,
  a: string,
  b: string,
  p: string,
) {
  if (g.lands[a]?.owner !== p || g.lands[b]?.owner !== p) return false;
  const seen = new Set([a]),
    q = [a];
  while (q.length) {
    const id = q.shift()!;
    if (id === b) return true;
    for (const nb of BY_ID[id].neighbors)
      if (!seen.has(nb) && g.lands[nb].owner === p) {
        seen.add(nb);
        q.push(nb);
      }
  }
  return false;
}
export function validSet(cards: Card[]) {
  if (cards.length !== 3) return false;
  const v = cards.filter((c) => c.symbol !== 3).map((c) => c.symbol);
  return (
    new Set(v).size === 1 || new Set(v).size === v.length || v.length === 0
  );
}
export function findSet(cards: Card[]): Card[] | null {
  for (let a = 0; a < cards.length - 2; a++)
    for (let b = a + 1; b < cards.length - 1; b++)
      for (let c = b + 1; c < cards.length; c++) {
        const s = [cards[a], cards[b], cards[c]];
        if (validSet(s)) return s;
      }
  return null;
}
function exchangeValue(n: number) {
  return n < 5 ? 4 + 2 * n : n === 5 ? 15 : 15 + (n - 5) * 5;
}
function trade(g: Game, p: Player, ids: string[]) {
  if (ids.length !== 3 || new Set(ids).size !== 3) fail("invalidCards");
  const set = ids.map(
    (id) => p.cards.find((c) => c.id === id) ?? fail("invalidCards"),
  );
  if (!validSet(set)) fail("invalidCards");
  const value = exchangeValue(g.exchange++);
  p.reserve += value;
  const bonus = set.find(
    (c) => c.territory && g.lands[c.territory].owner === p.id,
  );
  if (bonus?.territory) g.lands[bonus.territory].troops += 2;
  p.cards = p.cards.filter((c) => !ids.includes(c.id));
  g.discard.push(...set);
  log(g, "trade", p.name, String(value));
  if (bonus?.territory) log(g, "deployed", p.name, bonus.territory, "2");
  if (g.forcedTrade && p.cards.length <= 4) g.forcedTrade = false;
}
function checkVictory(g: Game, p: string) {
  if (WORLD.every((t) => g.lands[t.id].owner === p)) {
    g.phase = "finished";
    g.winner = p;
    g.deadline = null;
    g.paused = false;
    log(g, "victory", g.players.find((x) => x.id === p)!.name);
  }
}
function nextTurn(g: Game, random: () => number, now: number) {
  const previous = g.players.find((p) => p.id === g.active)!;
  if (g.conquered && !previous.eliminated) {
    if (!g.deck.length) {
      g.deck = shuffle(g.discard, random);
      g.discard = [];
    }
    const c = g.deck.pop();
    if (c) previous.cards.push(c);
  }
  const i = g.players.findIndex((p) => p.id === g.active);
  let idx = i;
  do {
    idx = (idx + 1) % g.players.length;
  } while (g.players[idx].eliminated && idx !== i);
  if (idx <= i) g.round++;
  g.active = g.players[idx].id;
  const p = g.players[idx];
  p.reserve = reinforcement(g, p.id);
  g.phase = "reinforce";
  g.conquered = false;
  g.forcedTrade = false;
  g.pending = null;
  g.deadline = g.timer ? now + g.timer * 60000 : null;
  log(g, "turn", p.name, String(p.reserve));
}
function autoDeploy(g: Game, p: Player) {
  const lands = owned(g, p.id);
  if (!lands.length) {
    p.reserve = 0;
    return;
  }
  lands.sort((a, b) => g.lands[a.id].troops - g.lands[b.id].troops);
  const placements = new Map<string, number>();
  let i = 0;
  while (p.reserve > 0) {
    const id = lands[i++ % lands.length].id;
    g.lands[id].troops++;
    p.reserve--;
    placements.set(id, (placements.get(id) ?? 0) + 1);
  }
  for (const [id, amount] of placements)
    log(g, "deployed", p.name, id, String(amount));
}
function pause(g: Game, reason: string, now: number) {
  g.paused = true;
  g.pauseReason = reason;
  g.pausedRemaining = g.deadline ? Math.max(0, g.deadline - now) : null;
  g.deadline = null;
  log(g, "paused");
}
export function maintenance(
  g: Game,
  now: number,
  random: () => number,
): boolean {
  let changed = false;
  const online = g.players
    .toSorted((a, b) => a.joined - b.joined)
    .filter((p) => !p.eliminated && now - p.lastSeen < 60000);
  if (!online.some((p) => p.id === g.host) && online.length) {
    g.host = online[0].id;
    log(g, "host", online[0].name);
    changed = true;
  }
  if (g.phase === "lobby" || g.phase === "finished") return changed;
  const active = g.players.find((p) => p.id === g.active)!;
  if (!g.paused && now - active.lastSeen >= 60000) {
    pause(g, "offline", now);
    return true;
  }
  if (!g.paused && g.deadline && now >= g.deadline) {
    if (g.phase === "setup") {
      for (const p of g.players) autoDeploy(g, p);
      g.phase = "reinforce";
      g.active = g.players[0].id;
      g.players[0].reserve = reinforcement(g, g.active);
      g.deadline = g.timer ? now + g.timer * 60000 : null;
    } else {
      if (g.pending) {
        const m = g.pending;
        g.lands[m.from].troops -= m.min;
        g.lands[m.to].troops += m.min;
        g.pending = null;
      }
      while (
        (g.phase === "reinforce" && active.cards.length >= 5) ||
        (g.forcedTrade && active.cards.length >= 5)
      ) {
        const set = findSet(active.cards);
        if (!set) break;
        trade(
          g,
          active,
          set.map((c) => c.id),
        );
      }
      autoDeploy(g, active);
      nextTurn(g, random, now);
    }
    log(g, "timeout", active.name);
    changed = true;
  }
  return changed;
}
export function applyAction(
  input: Game,
  actor: string,
  action: Action,
  random: () => number = Math.random,
  now = Date.now(),
): Game {
  const g = structuredClone(input);
  g.updated = now;
  const p = g.players.find((x) => x.id === actor) ?? fail("notMember");
  const type = action.type;
  const isHost = () => {
    if (actor !== g.host) fail("hostOnly");
  };
  const turn = () => {
    if (g.paused) fail("paused");
    if (g.active !== actor) fail("notYourTurn");
    if (p.eliminated) fail("eliminated");
  };
  if (type === "heartbeat") {
    maintenance(g, now, random);
    p.lastSeen = now;
    return g;
  }
  maintenance(g, now, random);
  if (type === "join") fail("invalidAction");
  if (type === "message") {
    if (
      typeof action.text !== "string" ||
      !action.text.trim() ||
      action.text.trim().length > 500
    )
      fail("invalidMessage");
    const to =
      action.to === null
        ? null
        : typeof action.to === "string" &&
            g.players.some((x) => x.id === action.to) &&
            action.to !== actor
          ? action.to
          : fail("invalidRecipient");
    const last = g.messages.filter((m) => m.from === actor).at(-1);
    if (last && now - last.at < 600) fail("slowDown");
    g.messages.push({
      id: uid(),
      from: actor,
      to,
      text: action.text.trim(),
      at: now,
    });
    g.messages = g.messages.slice(-200);
    return g;
  }
  if (type === "ready") {
    if (g.phase !== "lobby") fail("alreadyStarted");
    p.ready = !p.ready;
    return g;
  }
  if (type === "profile") {
    if (g.phase !== "lobby") fail("alreadyStarted");
    if (action.name !== undefined) p.name = name(action.name);
    if (action.color !== undefined) {
      const c = integer(action.color, 0, 5);
      if (g.players.some((x) => x.id !== actor && x.color === c))
        fail("colorTaken");
      p.color = c;
    }
    return g;
  }
  if (type === "timer") {
    isHost();
    if (g.phase !== "lobby") fail("alreadyStarted");
    if (![0, 2, 3, 5].includes(Number(action.minutes))) fail("invalidAmount");
    g.timer = Number(action.minutes);
    return g;
  }
  if (type === "start") {
    isHost();
    if (g.phase !== "lobby") fail("alreadyStarted");
    if (g.players.length < 3 || g.players.length > 6) fail("playerCount");
    if (g.players.some((x) => !x.ready)) fail("notReady");
    g.players = shuffle(g.players, random);
    const ids = shuffle(
      WORLD.map((t) => t.id),
      random,
    );
    ids.forEach((id, i) => {
      g.lands[id] = { owner: g.players[i % g.players.length].id, troops: 1 };
    });
    for (const pl of g.players)
      pl.reserve =
        ({ 3: 35, 4: 30, 5: 25, 6: 20 } as Record<number, number>)[
          g.players.length
        ] - owned(g, pl.id).length;
    g.deck = shuffle(
      [
        ...WORLD.map((t, i) => ({ id: t.id, symbol: i % 3, territory: t.id })),
        { id: "wild1", symbol: 3 },
        { id: "wild2", symbol: 3 },
      ],
      random,
    );
    g.phase = "setup";
    g.active = g.players[0].id;
    g.deadline = g.timer ? now + g.timer * 60000 : null;
    log(g, "started");
    return g;
  }
  if (type === "pause") {
    isHost();
    if (g.phase === "lobby" || g.phase === "finished") fail("invalidPhase");
    if (g.paused) {
      g.paused = false;
      g.pauseReason = null;
      g.deadline = g.pausedRemaining !== null ? now + g.pausedRemaining : null;
      for (const pl of g.players)
        if (now - pl.lastSeen >= 60000) pl.lastSeen = now;
      log(g, "resumed");
    } else pause(g, "host", now);
    return g;
  }
  if (type === "kick" || type === "leave") {
    if (type === "kick") isHost();
    const target =
      type === "leave"
        ? p
        : (g.players.find((x) => x.id === action.player) ?? fail("notMember"));
    if (type === "kick" && target.id === actor) fail("invalidAction");
    if (g.phase === "lobby") {
      g.players = g.players.filter((x) => x.id !== target.id);
      if (g.host === target.id && g.players.length) g.host = g.players[0].id;
      return g;
    }
    if (target.eliminated) fail("eliminated");
    if (g.phase === "finished") fail("invalidPhase");
    for (const land of Object.values(g.lands))
      if (land.owner === target.id) land.owner = null;
    g.discard.push(...target.cards);
    target.cards = [];
    target.reserve = 0;
    target.eliminated = true;
    log(g, "left", target.name);
    if (
      g.pending &&
      (g.lands[g.pending.from].owner === null ||
        g.lands[g.pending.to].owner === null)
    ) {
      const m = g.pending;
      if (g.lands[m.to].troops === 0) {
        g.lands[m.from].troops -= m.min;
        g.lands[m.to].troops = m.min;
      }
      g.pending = null;
    }
    if (target.id === g.active) {
      if (g.phase === "setup") {
        const next = g.players
          .toSorted((a, b) => a.joined - b.joined)
          .find((x) => !x.eliminated);
        if (next) g.active = next.id;
      } else if (g.players.some((x) => !x.eliminated)) nextTurn(g, random, now);
    }
    if (target.id === g.host) {
      const next = g.players
        .toSorted((a, b) => a.joined - b.joined)
        .find((x) => !x.eliminated);
      if (next) g.host = next.id;
    }
    if (!g.players.some((x) => !x.eliminated)) {
      g.phase = "finished";
      g.deadline = null;
      g.paused = false;
    } else if (g.phase === "setup" && g.players.every((x) => x.reserve === 0)) {
      g.phase = "reinforce";
      const next = g.players.find((x) => !x.eliminated)!;
      g.active = next.id;
      next.reserve = reinforcement(g, next.id);
      g.deadline = g.timer ? now + g.timer * 60000 : null;
    }
    if (g.paused && target.id === input.active) {
      g.pausedRemaining = g.timer ? g.timer * 60000 : null;
      g.deadline = null;
    }
    return g;
  }
  if (g.phase === "setup") {
    if (g.paused) fail("paused");
    if (p.reserve <= 0) fail("noReserve");
    if (type === "deploy") {
      const t = tid(action.territory);
      if (g.lands[t].owner !== actor) fail("notOwned");
      const n = integer(action.amount, 1, p.reserve);
      g.lands[t].troops += n;
      p.reserve -= n;
      log(g, "deployed", p.name, t, String(n));
    } else if (type === "auto") autoDeploy(g, p);
    else fail("invalidPhase");
    if (g.players.every((x) => x.reserve === 0)) {
      g.phase = "reinforce";
      g.active = g.players[0].id;
      g.players[0].reserve = reinforcement(g, g.active);
      g.deadline = g.timer ? now + g.timer * 60000 : null;
      log(g, "turn", g.players[0].name, String(g.players[0].reserve));
    }
    return g;
  }
  turn();
  if (g.pending && type !== "move") fail("mustMove");
  if (type === "trade") {
    if (g.phase !== "reinforce" && !g.forcedTrade) fail("invalidPhase");
    if (
      !Array.isArray(action.cards) ||
      !action.cards.every((x) => typeof x === "string")
    )
      fail("invalidCards");
    trade(g, p, action.cards as string[]);
    return g;
  }
  if (g.forcedTrade && p.cards.length >= 5 && type !== "move")
    fail("mustTrade");
  if (type === "deploy" || type === "auto") {
    if (g.phase !== "reinforce" && !(g.phase === "attack" && p.reserve > 0))
      fail("invalidPhase");
    if ((g.phase === "reinforce" && p.cards.length >= 5) || g.forcedTrade)
      fail("mustTrade");
    if (type === "auto") autoDeploy(g, p);
    else {
      const id = tid(action.territory);
      if (g.lands[id].owner !== actor) fail("notOwned");
      const n = integer(action.amount, 1, p.reserve);
      g.lands[id].troops += n;
      p.reserve -= n;
      log(g, "deployed", p.name, id, String(n));
    }
    return g;
  }
  if (type === "next") {
    if (g.pending) fail("mustMove");
    if (p.reserve > 0) fail("mustDeploy");
    if (g.phase === "reinforce") {
      if (p.cards.length >= 5) fail("mustTrade");
      g.phase = "attack";
    } else if (g.phase === "attack") g.phase = "fortify";
    else if (g.phase === "fortify") nextTurn(g, random, now);
    else fail("invalidPhase");
    return g;
  }
  if (type === "attack") {
    if (g.phase !== "attack") fail("invalidPhase");
    if (g.pending) fail("mustMove");
    if (p.reserve > 0) fail("mustDeploy");
    const from = tid(action.from),
      to = tid(action.to);
    const a = g.lands[from],
      d = g.lands[to];
    if (a.owner !== actor) fail("notOwned");
    if (d.owner === actor) fail("ownTarget");
    if (!BY_ID[from].neighbors.includes(to)) fail("notAdjacent");
    if (a.troops < 2) fail("notEnoughTroops");
    let al = 0,
      dl = 0,
      nd = 1;
    const previous = d.owner;
    while (a.troops > 1 && d.troops > 0) {
      nd = Math.min(3, a.troops - 1);
      const attack = Array.from(
        { length: nd },
        () => 1 + Math.floor(random() * 6),
      ).sort((a, b) => b - a);
      const defend = Array.from(
        { length: Math.min(2, d.troops) },
        () => 1 + Math.floor(random() * 6),
      ).sort((a, b) => b - a);
      for (let i = 0; i < Math.min(attack.length, defend.length); i++) {
        if (attack[i] > defend[i]) {
          d.troops--;
          dl++;
        } else {
          a.troops--;
          al++;
        }
      }
    }
    const won = d.troops === 0;
    g.lastBattle = {
      from,
      to,
      attackerLoss: al,
      defenderLoss: dl,
      conquered: won,
      at: now,
    };
    if (won) {
      d.owner = actor;
      g.conquered = true;
      g.pending = { from, to, min: nd, max: a.troops - 1 };
      if (previous && owned(g, previous).length === 0) {
        const dead = g.players.find((x) => x.id === previous)!;
        dead.eliminated = true;
        p.cards.push(...dead.cards);
        dead.cards = [];
        g.forcedTrade = p.cards.length >= 6;
        log(g, "eliminated", p.name, dead.name);
      }
      log(g, "conquered", p.name, to, String(al), String(dl));
    } else log(g, "repelled", p.name, to, String(al), String(dl));
    return g;
  }
  if (type === "move") {
    if (!g.pending) fail("invalidPhase");
    const m = g.pending;
    const n = integer(action.amount, m.min, m.max);
    g.lands[m.from].troops -= n;
    g.lands[m.to].troops += n;
    g.pending = null;
    checkVictory(g, actor);
    return g;
  }
  if (type === "fortify") {
    if (g.phase !== "fortify") fail("invalidPhase");
    const from = tid(action.from),
      to = tid(action.to);
    if (from === to || !connected(g, from, to, actor)) fail("notConnected");
    const n = integer(action.amount, 1, g.lands[from].troops - 1);
    g.lands[from].troops -= n;
    g.lands[to].troops += n;
    log(g, "fortified", p.name, from, to);
    nextTurn(g, random, now);
    return g;
  }
  fail("invalidAction");
}
export function joinGame(
  input: Game,
  n: unknown,
  color: unknown,
  hash: string,
  now = Date.now(),
): Game {
  const g = structuredClone(input);
  if (g.phase !== "lobby") fail("alreadyStarted");
  if (g.players.length >= 6) fail("roomFull");
  const c = integer(color, 0, 5);
  if (g.players.some((x) => x.color === c)) fail("colorTaken");
  const pl = makePlayer(n, c, hash, now);
  g.players.push(pl);
  g.updated = now;
  log(g, "joined", pl.name);
  return g;
}
export function publicGame(g: Game, actor: string) {
  const { requests: _requests, ...visible } = g;
  return {
    ...visible,
    deck: undefined,
    discard: undefined,
    players: g.players.map((p) => ({
      ...p,
      tokenHash: undefined,
      cards: p.id === actor ? p.cards : [],
      cardCount: p.cards.length,
    })),
    messages: g.messages.filter(
      (m) => m.to === null || m.from === actor || m.to === actor,
    ),
    me: actor,
    serverTime: Date.now(),
  };
}
export type PublicGame = Omit<Game, "deck" | "discard" | "players"> & {
  players: (Omit<Player, "tokenHash"> & { cardCount: number })[];
  me: string;
  serverTime: number;
};

import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Action, RoomState } from "./contract";
import { GameError } from "./errors";
import { gameOf, moduleFor } from "./modules";
const random = () => randomInt(0, 0x1000000) / 0x1000000;
export const tokenHash = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export async function rpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_PUBLISHABLE_KEY,
    secret = process.env.MAPPA_STORE_SECRET;
  if (!url || !key || !secret) throw new GameError("notConfigured");
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ p_secret: secret, ...args }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    console.error("Storage request failed", fn, r.status);
    throw new GameError("storageUnavailable");
  }
  return r.json();
}
export async function quota(req: Request, kind: string, limit: number) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const key = tokenHash(kind + ip);
  if (!(await rpc<boolean>("mappa_quota", { p_key: key, p_limit: limit })))
    throw new GameError("slowDown");
}
/** Loads a room of the expected game; another game's room reads as missing. */
export async function load(code: string, game: string) {
  if (!/^[A-Z2-9]{6}$/.test(code)) throw new GameError("roomNotFound");
  const g = await rpc<RoomState | null>("mappa_read", { p_code: code });
  if (!g || gameOf(g) !== game) throw new GameError("roomNotFound");
  return g;
}
export function actor(g: RoomState, token: string) {
  const hash = tokenHash(token);
  const p = g.players.find((p) => p.tokenHash === hash);
  if (!p) throw new GameError("notMember");
  return p.id;
}
async function cas(previous: RoomState, next: RoomState, notify = true) {
  next.revision = previous.revision + 1;
  return rpc<boolean>("mappa_cas", {
    p_code: previous.code,
    p_revision: previous.revision,
    p_state: next,
    p_notify: notify,
  });
}
export async function preview(code: string, game: string) {
  const g = await load(code, game);
  return moduleFor(game).preview(g);
}
export async function create(game: string, input: Record<string, unknown>) {
  const m = moduleFor(game);
  const token = randomBytes(32).toString("hex");
  for (let retry = 0; retry < 4; retry++) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from(
      { length: 6 },
      () => alphabet[randomInt(alphabet.length)],
    ).join("");
    const g = m.create(code, input, tokenHash(token), Date.now());
    if (await rpc<boolean>("mappa_insert", { p_state: g }))
      return { game: m.view(g, g.players[0].id), token };
  }
  throw new GameError("tryAgain");
}
export async function join(
  code: string,
  game: string,
  input: Record<string, unknown>,
) {
  const m = moduleFor(game);
  const token = randomBytes(32).toString("hex"),
    hash = tokenHash(token);
  for (let retry = 0; retry < 8; retry++) {
    const g = await load(code, game);
    const next = m.join(g, input, hash, Date.now());
    if (await cas(g, next))
      return { game: m.view(next, next.players.at(-1)!.id), token };
  }
  throw new GameError("tryAgain");
}
export async function read(code: string, game: string, token: string) {
  const g = await load(code, game);
  return moduleFor(game).view(g, actor(g, token));
}
export async function perform(
  code: string,
  game: string,
  token: string,
  action: Action,
) {
  const m = moduleFor(game);
  for (let retry = 0; retry < 10; retry++) {
    const g = await load(code, game);
    const id = actor(g, token);
    const requestId =
      typeof action.requestId === "string" &&
      /^[a-f0-9-]{36}$/.test(action.requestId)
        ? action.requestId
        : null;
    const seen = g.requests ?? {};
    if (requestId && seen[id]?.includes(requestId)) return m.view(g, id);
    const next = m.apply(g, id, action, random, Date.now());
    if (requestId)
      next.requests = {
        ...seen,
        [id]: [...(seen[id] ?? []), requestId].slice(-40),
      };
    if (await cas(g, next, m.notify(g, next, action))) return m.view(next, id);
  }
  throw new GameError("tryAgain");
}
export function errorResponse(e: unknown) {
  const known = e instanceof GameError;
  const code = known ? e.code : "serverError";
  if (!known) console.error(e);
  return Response.json(
    { error: code },
    {
      status:
        code === "roomNotFound"
          ? 404
          : code === "notMember"
            ? 403
            : code === "slowDown"
              ? 429
              : code === "notConfigured" || code === "storageUnavailable"
                ? 503
                : known
                  ? 400
                  : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export function bearer(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) throw new GameError("notMember");
  return token;
}
export async function body(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 8192)
    throw new GameError("invalidAction");
  const raw = await req.text();
  if (raw.length > 8192) throw new GameError("invalidAction");
  let b;
  try {
    b = JSON.parse(raw);
  } catch {
    throw new GameError("invalidAction");
  }
  if (!b || typeof b !== "object" || Array.isArray(b))
    throw new GameError("invalidAction");
  return b;
}
export function originCheck(req: Request) {
  const origin = req.headers.get("origin");
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    new URL(req.url).host;
  if (origin && new URL(origin).host !== host) throw new GameError("notMember");
}

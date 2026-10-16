// What a game brick gives the platform. The platform owns rooms, identity, quotas,
// atomic saves and Realtime notifications; the brick owns its rules and what each player sees.
export type Action = { type: string; [key: string]: unknown };
export type RoomPlayer = { id: string; tokenHash: string };
export type RoomState = {
  /** Brick id from games/registry.ts; rooms saved before the hub have none and are Mappa rooms. */
  game?: string;
  code: string;
  /** Random Realtime channel suffix, so a room code alone cannot follow a game. */
  channel: string;
  revision: number;
  players: RoomPlayer[];
  /** Recent requestIds per player, to ignore a command sent twice. */
  requests?: Record<string, string[]>;
};
export type GameModule<S extends RoomState = RoomState> = {
  id: string;
  /** Builds a room whose only player is its creator. */
  create(code: string, input: Record<string, unknown>, tokenHash: string, now: number): S;
  /** Adds a player as the last entry of `players`. */
  join(state: S, input: Record<string, unknown>, tokenHash: string, now: number): S;
  apply(state: S, actor: string, action: Action, random: () => number, now: number): S;
  /** The state as `actor` may see it: never other players' secrets or token hashes. */
  view(state: S, actor: string): unknown;
  /** What anyone holding the room code may see before joining. */
  preview(state: S): unknown;
  /** Whether other players must refetch; quiet heartbeats save Realtime messages. */
  notify(previous: S, next: S, action: Action): boolean;
};

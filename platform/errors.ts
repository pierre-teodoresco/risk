/** A refusal the player can understand: `code` is translated by each game's i18n. */
export class GameError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function fail(code: string): never {
  throw new GameError(code);
}
